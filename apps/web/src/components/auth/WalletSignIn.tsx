"use client";

import React, { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { BaseWalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { signIn } from "next-auth/react";
import bs58 from "bs58";
import { toast } from "sonner";

// WalletMultiButton's own labels, with the sign-in wording on the first state.
// Same component and click handling as WalletMultiButton; only the labels differ.
const WALLET_LABELS = {
  "change-wallet": "Change wallet",
  connecting: "Connecting…",
  "copy-address": "Copy address",
  copied: "Copied",
  disconnect: "Disconnect",
  "has-wallet": "Connect wallet",
  "no-wallet": "Continue with a wallet",
} as const;

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
Domain: ${domain}
Version: 1
Chain ID: devnet
Nonce: ${nonce}
Issued At: ${issuedAt}`;
}

export function WalletSignIn({
  callbackUrl = "/dashboard",
}: {
  callbackUrl?: string;
}) {
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const [signing, setSigning] = useState(false);

  if (!connected || !publicKey) {
    return (
      <div className="w-full">
        <style>{`
          .wallet-adapter-dropdown {
            display: block !important;
            width: 100% !important;
          }
          .wallet-adapter-button-trigger,
          button.wallet-adapter-button.wallet-adapter-button-trigger {
            background-color: var(--color-card) !important;
            color: var(--color-foreground) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            border-radius: 10px !important;
            height: 2.5rem !important;
            width: 100% !important;
            max-width: 100% !important;
            display: flex !important;
            justify-content: center !important;
            font-size: 13px !important;
            font-weight: 500 !important;
            font-family: inherit !important;
            transition: background-color 150ms ease-out !important;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
            align-items: center !important;
            gap: 10px !important;
            color: var(--color-foreground) !important;
            line-height: 1 !important;
            padding: 0 16px !important;
          }
          .wallet-adapter-button-trigger:hover {
            background-color: var(--color-accent) !important;
          }
          .wallet-adapter-button-trigger:focus-visible {
            outline: 2px solid var(--color-primary) !important;
            outline-offset: 2px !important;
          }
          .wallet-adapter-button-trigger .wallet-adapter-button-start-icon {
            width: 16px !important;
            height: 16px !important;
            margin-right: 0 !important;
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
        <BaseWalletMultiButton labels={WALLET_LABELS} />
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
        callbackUrl,
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
        className="flex h-10 w-full items-center justify-center gap-2.5 rounded-[10px] bg-primary text-[13px] font-medium text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-[background-color,transform] duration-150 ease-out hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98] disabled:opacity-50"
      >
        <WalletIcon />
        {signing ? "Signing…" : `Sign in as ${shortKey}`}
      </button>
      <button
        onClick={() => disconnect()}
        className="self-center rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
