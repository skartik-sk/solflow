"use client";

// apps/web/src/components/marketplace/PaymentButton.tsx
// SOL payment flow for paid marketplace templates.
// 1. Connect wallet (if not connected)
// 2. Build + send SOL transfer to treasury
// 3. Call verifyPayment tRPC → creates MarketplacePurchase record
// 4. Fork the template into a new project

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  Transaction,
  SystemProgram,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Loader2, Wallet, GitFork } from "lucide-react";

const TREASURY_WALLET = process.env.NEXT_PUBLIC_SOLFLOW_TREASURY_WALLET ?? "";

interface PaymentButtonProps {
  listingId: string;
  priceSOL: number;
  /** Already purchased by current user */
  alreadyPurchased?: boolean;
}

export function PaymentButton({
  listingId,
  priceSOL,
  alreadyPurchased = false,
}: PaymentButtonProps) {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [step, setStep] = useState<
    "idle" | "sending" | "verifying" | "forking"
  >("idle");

  // If already purchased, go straight to fork
  const fork = trpc.marketplace.fork.useMutation({
    onSuccess: (data) => {
      toast.success("Template forked! Opening editor…");
      router.push(`/editor/${data.projectId}`);
    },
    onError: (err) => {
      toast.error(`Fork failed: ${err.message}`);
      setStep("idle");
    },
  });

  const verifyPayment = trpc.marketplace.verifyPayment.useMutation({
    onSuccess: () => {
      setStep("forking");
      fork.mutate({ listingId });
    },
    onError: (err) => {
      toast.error(`Payment verification failed: ${err.message}`);
      setStep("idle");
    },
  });

  const isPending =
    step !== "idle" || fork.isPending || verifyPayment.isPending;

  // ── Already purchased: just fork ─────────────────────────────────
  if (alreadyPurchased) {
    return (
      <button
        onClick={() => {
          setStep("forking");
          fork.mutate({ listingId });
        }}
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GitFork className="h-4 w-4" />
        )}
        {isPending ? "Opening editor…" : "Open in Editor"}
      </button>
    );
  }

  // ── Wallet not connected ──────────────────────────────────────────
  if (!connected || !publicKey) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Wallet className="h-4 w-4" />
        Connect Wallet to Purchase
      </button>
    );
  }

  // ── Main payment flow ─────────────────────────────────────────────
  const handlePurchase = async () => {
    if (!TREASURY_WALLET) {
      toast.error("Payments are not configured on this instance.");
      return;
    }

    setStep("sending");
    try {
      // Build SOL transfer transaction
      const lamports = Math.round(priceSOL * LAMPORTS_PER_SOL);
      const treasury = new PublicKey(TREASURY_WALLET);

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: treasury,
          lamports,
        }),
      );

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Send transaction via connected wallet
      const txSignature = await sendTransaction(transaction, connection);

      // Wait for confirmation
      await connection.confirmTransaction(
        { signature: txSignature, blockhash, lastValidBlockHeight },
        "confirmed",
      );

      toast.success("Payment confirmed! Verifying on-chain…");

      // Verify on server and create purchase record
      setStep("verifying");
      verifyPayment.mutate({ listingId, txSignature });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      if (msg.toLowerCase().includes("user rejected")) {
        toast.info("Transaction cancelled");
      } else {
        toast.error(msg);
      }
      setStep("idle");
    }
  };

  const stepLabels: Record<typeof step, string> = {
    idle: `Pay ${priceSOL} SOL & Fork`,
    sending: "Sending transaction…",
    verifying: "Verifying on-chain…",
    forking: "Forking template…",
  };

  return (
    <button
      onClick={handlePurchase}
      disabled={isPending}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <GitFork className="h-4 w-4" />
      )}
      {stepLabels[step]}
    </button>
  );
}
