import Credentials from "next-auth/providers/credentials";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { prisma } from "@solflow/db";

import { createHmac, timingSafeEqual } from "crypto";

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes
// Used nonces live in the VerificationToken table (shared by every serverless
// instance) under this identifier; the unique token column makes "consume" atomic.
const NONCE_IDENTIFIER = "siws-nonce";

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is required");
  }
  return secret;
}

export async function generateNonce(): Promise<string> {
  const timestamp = Date.now().toString();
  const secret = getAuthSecret();
  const hmac = createHmac("sha256", secret).update(timestamp).digest("hex");
  return `${timestamp}.${hmac}`;
}

/** HMAC + expiry check only (no storage). */
function nonceIsAuthentic(nonce: string, now = Date.now()): boolean {
  const [timestamp, hmac] = nonce.split(".");
  if (!timestamp || !hmac || !/^\d{1,16}$/.test(timestamp)) return false;
  const issuedAt = parseInt(timestamp, 10);
  if (!Number.isFinite(issuedAt) || now - issuedAt > NONCE_TTL_MS || issuedAt - now > 60_000) return false;
  const expected = createHmac("sha256", getAuthSecret()).update(timestamp).digest("hex");
  if (hmac.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(hmac), Buffer.from(expected));
}

export async function verifyNonce(nonce: string): Promise<boolean> {
  try {
    if (!nonceIsAuthentic(nonce)) return false;
    const used = await prisma.verificationToken.findUnique({ where: { token: nonce } });
    return !used;
  } catch {
    return false;
  }
}

export async function consumeNonce(nonce: string): Promise<boolean> {
  try {
    if (!nonceIsAuthentic(nonce)) return false;
    const issuedAt = parseInt(nonce.split(".")[0] ?? "", 10);
    // Insert fails on the unique token if this nonce was already used anywhere.
    await prisma.verificationToken.create({
      data: { identifier: NONCE_IDENTIFIER, token: nonce, expires: new Date(issuedAt + NONCE_TTL_MS) },
    });
    // Housekeeping: expired nonces can't verify anyway.
    await prisma.verificationToken
      .deleteMany({ where: { identifier: NONCE_IDENTIFIER, expires: { lt: new Date() } } })
      .catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Hosts a SIWS message may name in its "Domain:" line. SIWS_ALLOWED_DOMAINS
 * (comma-separated), when set, is the exact list. Otherwise: the app URL env
 * hosts plus the host this request was served on (set by the platform proxy).
 */
export function allowedSiwsDomains(
  env: Record<string, string | undefined>,
  requestHost?: string | null,
): string[] {
  const explicit = (env.SIWS_ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (explicit.length > 0) return [...new Set(explicit)];
  const hosts = [
    hostOf(env.AUTH_URL),
    hostOf(env.NEXTAUTH_URL),
    hostOf(env.NEXT_PUBLIC_APP_URL),
    requestHost?.toLowerCase() ?? null,
  ].filter((d): d is string => !!d);
  return [...new Set(hosts)];
}

/** True when the message has exactly one "Domain:" line and it names an allowed host. */
export function siwsDomainMatches(message: string, allowed: string[]): boolean {
  const domains = message
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("Domain:"))
    .map((l) => l.slice("Domain:".length).trim().toLowerCase());
  return domains.length === 1 && allowed.includes(domains[0]);
}

/** Request host as the client saw it (Vercel sets x-forwarded-host). */
export function requestHostFrom(headers: Headers | undefined | null): string | null {
  if (!headers) return null;
  return headers.get("x-forwarded-host")?.split(",")[0]?.trim() || headers.get("host");
}

function messageHasLine(message: string, expected: string): boolean {
  return message.split(/\r?\n/).some((line) => line.trim() === expected);
}

export const SolanaWalletProvider = Credentials({
  id: "solana-wallet",
  name: "Solana Wallet",
  credentials: {
    publicKey: { label: "Public Key", type: "text" },
    signature: { label: "Signature", type: "text" },
    message: { label: "Message", type: "text" },
    nonce: { label: "Nonce", type: "text" },
  },

  async authorize(credentials, request) {
    if (!credentials) return null;

    const { publicKey, signature, message, nonce } = credentials as Record<
      string,
      string
    >;

    if (!publicKey || !signature || !message || !nonce) return null;

    // 1. Verify the nonce is valid, unexpired, and unused
    const nonceValid = await verifyNonce(nonce);
    if (!nonceValid) return null;

    // 2. Verify the signed message binds both the wallet and the exact nonce line
    if (!messageHasLine(message, publicKey)) return null;
    if (!messageHasLine(message, `Nonce: ${nonce}`)) return null;
    // The signed message must be for THIS site, so a signature phished on another domain can't log in here.
    const allowed = allowedSiwsDomains(process.env, requestHostFrom(request?.headers));
    if (!siwsDomainMatches(message, allowed)) return null;

    // 3. Verify the Ed25519 signature
    try {
      const pubkey = new PublicKey(publicKey);
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = bs58.decode(signature);

      const verified = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        pubkey.toBytes(),
      );

      if (!verified) return null;
    } catch {
      return null;
    }

    // 4. Consume nonce (stored in the DB, so replay fails on every instance)
    if (!(await consumeNonce(nonce))) return null;

    // 5. Upsert user by wallet address
    const user = await prisma.user.upsert({
      where: { walletAddress: publicKey },
      update: { updatedAt: new Date() },
      create: {
        walletAddress: publicKey,
        authProvider: "WALLET",
      },
    });

    return {
      id: user.id,
      walletAddress: user.walletAddress,
      name: user.name,
      email: user.email,
      image: user.image,
    };
  },
});
