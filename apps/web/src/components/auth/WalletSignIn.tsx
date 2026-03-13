"use client";

// apps/web/src/components/auth/WalletSignIn.tsx
// Real SIWS (Sign-In With Solana) flow using @solana/wallet-adapter-react.
// Follows the spec in docs/architecture/12-auth-system.md exactly.

import React, { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { signIn } from "next-auth/react";
import bs58 from "bs58";
import { toast } from "sonner";

// ─── SIWS Message Builder ─────────────────────────────────────────────────────

function createSignInMessage(publicKey: string, nonce: string): string {
  const domain =
    typeof window !== "undefined" ? window.location.host : "solflow.app";
  const uri =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://solflow.app";
  const issuedAt = new Date().toISOString();

  return `SolFlow wants you to sign in with your Solana account:
${publicKey}

Sign in to SolFlow

URI: ${uri}
Version: 1
Chain ID: mainnet
Nonce: ${nonce}
Issued At: ${issuedAt}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WalletSignIn() {
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [signing, setSigning] = useState(false);

  // Step 1 — wallet not connected yet: show "Connect Wallet" button
  if (!connected || !publicKey) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-primary/40 bg-primary/10 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
      >
        <WalletIcon />
        Connect Solana Wallet
      </button>
    );
  }

  // Step 2 — wallet connected: prompt to sign the SIWS message
  const shortKey = `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`;

  const handleSignIn = async () => {
    if (!signMessage) {
      toast.error("Your wallet does not support message signing.");
      return;
    }

    setSigning(true);
    try {
      // Fetch nonce from server
      const nonceRes = await fetch("/api/auth/nonce");
      if (!nonceRes.ok) throw new Error("Failed to fetch nonce");
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      // Build SIWS message
      const message = createSignInMessage(publicKey.toBase58(), nonce);

      // Sign with wallet
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(messageBytes);
      const signature = bs58.encode(signatureBytes);

      // Authenticate via NextAuth Solana-wallet credentials provider
      const result = await signIn("solana-wallet", {
        publicKey: publicKey.toBase58(),
        signature,
        message,
        nonce,
        redirect: false,
        callbackUrl: "/dashboard",
      });

      if (result?.error) {
        toast.error(`Sign-in failed: ${result.error}`);
      } else if (result?.url) {
        // Manually redirect after successful sign-in
        window.location.href = result.url;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Wallet sign-in failed";
      // User rejected the signature request — don't show an error toast
      if (msg.toLowerCase().includes("user rejected")) {
        toast.info("Signature request cancelled");
      } else {
        toast.error(msg);
      }
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleSignIn}
        disabled={signing}
        className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-primary/40 bg-primary/10 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
      >
        <WalletIcon />
        {signing ? "Signing…" : `Sign in as ${shortKey}`}
      </button>
      <button
        onClick={() => disconnect()}
        className="text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
      >
        Use a different wallet
      </button>
    </div>
  );
}

// ─── Wallet SVG Icon ──────────────────────────────────────────────────────────

function WalletIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M16 12a2 2 0 1 1 4 0 2 2 0 0 1-4 0z" />
    </svg>
  );
}
