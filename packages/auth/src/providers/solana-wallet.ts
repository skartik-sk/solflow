import Credentials from "next-auth/providers/credentials";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { prisma } from "@solflow/db";

// In-memory nonce store (replace with Redis in production)
const nonceStore = new Map<string, number>();
const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function generateNonce(): Promise<string> {
  const nonce = crypto.randomUUID();
  nonceStore.set(nonce, Date.now());
  return nonce;
}

async function verifyNonce(nonce: string): Promise<boolean> {
  const createdAt = nonceStore.get(nonce);
  if (!createdAt) return false;
  if (Date.now() - createdAt > NONCE_TTL_MS) {
    nonceStore.delete(nonce);
    return false;
  }
  return true;
}

async function invalidateNonce(nonce: string): Promise<void> {
  nonceStore.delete(nonce);
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

    // 1. Verify the nonce is valid and unexpired
    const nonceValid = await verifyNonce(nonce);
    if (!nonceValid) return null;

    // 2. Verify the signed message contains the nonce
    if (!message.includes(nonce)) return null;

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

    // 4. Invalidate nonce to prevent replay attacks
    await invalidateNonce(nonce);

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
