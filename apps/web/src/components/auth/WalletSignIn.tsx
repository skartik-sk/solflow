"use client";

import React, { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { signIn } from "next-auth/react";
import bs58 from "bs58";
import { toast } from "sonner";

function createSignInMessage(publicKey: string, nonce: string): string {
  const domain =
    typeof window !== "undefined" ? window.location.host : "solstudio.skartik.xyz";
  const uri =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://solstudio.skartik.xyz";
  const issuedAt = new Date().toISOString();

  return `SolStudio wants you to sign in with your Solana account:
${publicKey}

Sign in to SolStudio

URI: ${uri}
Version: 1
Chain ID: devnet
Nonce: ${nonce}
Issued At: ${issuedAt}`;
}

export function WalletSignIn() {
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const [signing, setSigning] = useState(false);

  if (!connected || !publicKey) {
    return (
      <div className="w-full [&>button]:w-full">
        <style>{`
          .wallet-adapter-button-trigger,
          button.wallet-adapter-button.wallet-adapter-button-trigger {
            background-color: var(--color-card) !important;
            color: var(--color-foreground) !important;
            border: 1px solid var(--color-border) !important;
            border-radius: var(--radius-lg) !important;
            height: 2.75rem !important;
            width: 100% !important;
            max-width: 100% !important;
            display: flex !important;
            justify-content: center !important;
            font-size: 0.875rem !important;
            font-weight: 500 !important;
            font-family: inherit !important;
            transition: background-color 0.2s !important;
          }
          .wallet-adapter-button-trigger:hover {
            background-color: var(--color-accent) !important;
          }
          .wallet-adapter-modal-wrapper,
          .wallet-adapter-modal-container {
            background-color: var(--color-card) !important;
            color: var(--color-foreground) !important;
          }
          .wallet-adapter-modal-title,
          .wallet-adapter-modal-button-close {
            color: var(--color-foreground) !important;
          }
          .wallet-adapter-modal-button-close svg {
            fill: var(--color-foreground) !important;
          }
          .wallet-adapter-button {
            background-color: var(--color-card) !important;
            color: var(--color-foreground) !important;
            border: 1px solid var(--color-border) !important;
          }
          .wallet-adapter-button:hover {
            background-color: var(--color-accent) !important;
          }
          .wallet-adapter-collapse-button {
            color: var(--color-muted-foreground) !important;
          }
        `}</style>
        <WalletMultiButton />
      </div>
    );
  }

  const shortKey = `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`;

  const handleSignIn = async () => {
    if (!signMessage) {
      toast.error("Your wallet does not support message signing.");
      return;
    }

    setSigning(true);
    try {
      const nonceRes = await fetch("/api/auth/nonce");
      if (!nonceRes.ok) throw new Error("Failed to fetch nonce");
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      const message = createSignInMessage(publicKey.toBase58(), nonce);

      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(messageBytes);
      const signature = bs58.encode(signatureBytes);

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
        window.location.href = result.url;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Wallet sign-in failed";
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
        className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-primary bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <WalletIcon />
        {signing ? "Signing…" : `Sign in as ${shortKey}`}
      </button>
      <button
        onClick={() => disconnect()}
        className="text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
      >
        Disconnect wallet
      </button>
    </div>
  );
}

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
