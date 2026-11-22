"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  Connection,
  Transaction,
  SystemProgram,
  PublicKey,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from "@solana/web3.js";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Loader2, Wallet, GitFork } from "lucide-react";

interface PaymentButtonProps {
  listingId: string;
  priceSOL: number;
  alreadyPurchased?: boolean;
}

export function PaymentButton({
  listingId,
  priceSOL,
  alreadyPurchased = false,
}: PaymentButtonProps) {
  const router = useRouter();
  const { publicKey, sendTransaction, connected } = useWallet();
  // Treasury + cluster come from the server, which verifies against the same
  // values. The payment cluster can differ from the editor's (devnet) wallet
  // connection, so build a connection for it.
  const paymentConfig = trpc.marketplace.paymentConfig.useQuery();
  const cluster = paymentConfig.data?.cluster;
  const connection = useMemo(
    () => (cluster ? new Connection(clusterApiUrl(cluster), "confirmed") : null),
    [cluster],
  );
  const { setVisible } = useWalletModal();
  const [step, setStep] = useState<
    "idle" | "sending" | "verifying" | "forking"
  >("idle");

  const fork = trpc.marketplace.fork.useMutation({
    onSuccess: (data) => {
      toast.success("Template forked! Opening editor…");
      router.push(`/editor/${data.projectId}?templateForked=1`);
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
      toast.error(
        `Payment verification failed: ${err.message}. If SOL left your wallet, keep the transaction signature and contact support.`,
      );
      setStep("idle");
    },
  });

  const isPending =
    step !== "idle" || fork.isPending || verifyPayment.isPending;

  if (alreadyPurchased) {
    return (
      <button
        onClick={() => {
          setStep("forking");
          fork.mutate({ listingId });
        }}
        disabled={isPending}
        className="flex h-9 w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-[filter,transform] duration-150 ease-out hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GitFork className="h-4 w-4" />
        )}
        {isPending ? "Opening editor…" : "Open in editor"}
      </button>
    );
  }

  if (!connected || !publicKey) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="flex h-9 w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-[filter,transform] duration-150 ease-out hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Wallet className="h-4 w-4" />
        Connect wallet to buy
      </button>
    );
  }

  const handlePurchase = async () => {
    const treasuryAddress = paymentConfig.data?.treasury;
    if (!connection || !treasuryAddress) {
      toast.error(
        paymentConfig.isLoading
          ? "Loading payment settings. Try again in a moment."
          : "Payments are not configured on this instance.",
      );
      return;
    }

    setStep("sending");
    try {
      const lamports = Math.round(priceSOL * LAMPORTS_PER_SOL);
      const treasury = new PublicKey(treasuryAddress);

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

      const txSignature = await sendTransaction(transaction, connection);

      await connection.confirmTransaction(
        { signature: txSignature, blockhash, lastValidBlockHeight },
        "confirmed",
      );

      toast.success("Payment confirmed! Verifying on-chain…");

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
    idle: `Pay ${priceSOL} SOL${cluster === "devnet" ? " (devnet)" : ""} and fork`,
    sending: "Sending transaction…",
    verifying: "Verifying on-chain…",
    forking: "Forking template…",
  };

  return (
    <button
      onClick={handlePurchase}
      disabled={isPending}
      className="flex h-9 w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-[filter,transform] duration-150 ease-out hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
