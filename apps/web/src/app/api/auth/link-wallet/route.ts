// apps/web/src/app/api/auth/link-wallet/route.ts
// POST — link a Solana wallet to the currently signed-in OAuth account.
// Verifies wallet ownership via SIWS signature before linking.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@solflow/auth";
import { prisma } from "@solflow/db";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

export async function POST(req: NextRequest) {
  // 1. Must be signed in already (OAuth session)
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    publicKey?: string;
    signature?: string;
    message?: string;
    nonce?: string;
  };
  const { publicKey, signature, message, nonce } = body;

  if (!publicKey || !signature || !message || !nonce) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // 2. Validate the message contains the nonce (basic replay guard)
  if (!message.includes(nonce)) {
    return NextResponse.json({ error: "Nonce mismatch" }, { status: 400 });
  }

  // 3. Verify Ed25519 signature
  try {
    const pubkey = new PublicKey(publicKey);
    const msgBytes = new TextEncoder().encode(message);
    const sigBytes = bs58.decode(signature);
    const verified = nacl.sign.detached.verify(
      msgBytes,
      sigBytes,
      pubkey.toBytes(),
    );
    if (!verified) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid public key or signature" },
      { status: 400 },
    );
  }

  // 4. Check the wallet isn't already linked to a DIFFERENT account
  const existing = await prisma.user.findUnique({
    where: { walletAddress: publicKey },
    select: { id: true },
  });

  if (existing && existing.id !== session.user.id) {
    return NextResponse.json(
      { error: "Wallet already linked to another account" },
      { status: 409 },
    );
  }

  // 5. Link the wallet to the current user
  await prisma.user.update({
    where: { id: session.user.id },
    data: { walletAddress: publicKey },
  });

  return NextResponse.json({ success: true });
}
