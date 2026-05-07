import Credentials from "next-auth/providers/credentials";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { prisma } from "@solflow/db";

// In-memory nonce store (replace with Redis in production)
import { createHmac } from "crypto";

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const usedNonces = new Map<string, number>();

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

function pruneUsedNonces(now = Date.now()): void {
  for (const [nonce, expiresAt] of usedNonces) {
    if (expiresAt <= now) usedNonces.delete(nonce);
  }
}

export async function verifyNonce(nonce: string): Promise<boolean> {
  try {
    const now = Date.now();
    pruneUsedNonces(now);
    if (usedNonces.has(nonce)) return false;

    const [timestamp, hmac] = nonce.split(".");
    if (!timestamp || !hmac) return false;

    const issuedAt = parseInt(timestamp, 10);
    if (!Number.isFinite(issuedAt) || now - issuedAt > NONCE_TTL_MS) return false;

    const secret = getAuthSecret();
    const expectedHmac = createHmac("sha256", secret).update(timestamp).digest("hex");

    // Timing-safe comparison
    if (hmac.length !== expectedHmac.length) return false;
    let mismatch = 0;
    for (let i = 0; i < hmac.length; i++) {
      mismatch |= hmac.charCodeAt(i) ^ expectedHmac.charCodeAt(i);
    }
    return mismatch === 0;
  } catch {
    return false;
  }
}

export async function consumeNonce(nonce: string): Promise<boolean> {
  if (!(await verifyNonce(nonce))) return false;
  const issuedAt = parseInt(nonce.split(".")[0] ?? "", 10);
  usedNonces.set(nonce, issuedAt + NONCE_TTL_MS);
  return true;
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

  async authorize(credentials) {
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

    // 4. Consume nonce to prevent replay attacks in the current runtime
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
