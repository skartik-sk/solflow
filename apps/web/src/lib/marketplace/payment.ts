// apps/web/src/lib/marketplace/payment.ts
// Marketplace SOL payment config + on-chain transaction checks.
// Kept free of Prisma/tRPC so the rules can be unit tested.

import { clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";

export type PaymentCluster = "mainnet-beta" | "devnet";

export interface PaymentConfig {
  /** Treasury that must receive the SOL. null = payments disabled (fail closed). */
  treasury: string | null;
  cluster: PaymentCluster;
  /** Server-side RPC; may carry an API key, never send it to the client. */
  rpcUrl: string;
}

const BASE58_PUBKEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Payment settings, read from env on each call (so tests can vary them).
 *   SOLFLOW_TREASURY_WALLET   treasury pubkey (required, else purchases are refused)
 *   SOLFLOW_PAYMENT_CLUSTER   "mainnet-beta" (default) or "devnet" for testing
 *   SOLFLOW_PAYMENT_RPC_URL   optional RPC override for that cluster
 * The client gets treasury + cluster from marketplace.paymentConfig, so there is
 * no separate NEXT_PUBLIC_ copy to drift out of sync.
 */
export function getPaymentConfig(env: NodeJS.ProcessEnv = process.env): PaymentConfig {
  const rawTreasury = env.SOLFLOW_TREASURY_WALLET?.trim();
  const treasury = rawTreasury && BASE58_PUBKEY.test(rawTreasury) ? rawTreasury : null;
  const cluster: PaymentCluster =
    env.SOLFLOW_PAYMENT_CLUSTER?.trim() === "devnet" ? "devnet" : "mainnet-beta";
  const rpcUrl = env.SOLFLOW_PAYMENT_RPC_URL?.trim() || clusterApiUrl(cluster);
  return { treasury, cluster, rpcUrl };
}

/** Minimum lamports a purchase must pay, or null when the listing can't be bought. */
export function requiredLamports(listing: {
  pricingModel: string;
  priceSOL: number | null;
}): number | null {
  if (listing.pricingModel === "FREE") return null;
  if (listing.priceSOL != null && listing.priceSOL > 0) {
    return Math.round(listing.priceSOL * LAMPORTS_PER_SOL);
  }
  // PAY_WHAT_YOU_WANT without a floor: any non-zero payment.
  if (listing.pricingModel === "PAY_WHAT_YOU_WANT") return 1;
  // PAID without a price is misconfigured: refuse rather than accept anything.
  return null;
}

// Structural subset of web3.js ParsedTransactionWithMeta.
interface ParsedIx {
  program?: string;
  programId?: { toString(): string };
  parsed?: unknown;
}
export interface PaymentTx {
  meta: { err: unknown } | null;
  transaction: {
    message: {
      instructions: ParsedIx[];
    };
  };
}

export type PaymentCheck =
  | { ok: true; lamports: number }
  | { ok: false; reason: string };

const SYSTEM_PROGRAM = "11111111111111111111111111111111";

/**
 * A payment counts only when the tx succeeded and top-level System transfers
 * from the buyer's linked wallet to the treasury add up to at least minLamports.
 */
export function checkPaymentTransaction(
  tx: PaymentTx | null,
  opts: { buyerWallet: string; treasury: string; minLamports: number },
): PaymentCheck {
  if (!tx) return { ok: false, reason: "Transaction not found or not confirmed" };
  if (!tx.meta) return { ok: false, reason: "Transaction has no status metadata" };
  if (tx.meta.err) return { ok: false, reason: "Transaction failed on-chain" };

  // Only transfers whose source is the buyer's wallet count. A System transfer
  // source must sign, so this proves the buyer sent the SOL (a sponsored fee
  // payer is fine).
  let lamports = 0;
  for (const ix of tx.transaction.message.instructions) {
    const isSystem = ix.program === "system" || ix.programId?.toString() === SYSTEM_PROGRAM;
    if (!isSystem || !ix.parsed || typeof ix.parsed !== "object") continue;
    const parsed = ix.parsed as {
      type?: string;
      info?: { source?: string; destination?: string; lamports?: number };
    };
    if (parsed.type !== "transfer" || !parsed.info) continue;
    if (parsed.info.source !== opts.buyerWallet) continue;
    if (parsed.info.destination !== opts.treasury) continue;
    if (typeof parsed.info.lamports === "number") lamports += parsed.info.lamports;
  }

  if (lamports === 0) {
    return {
      ok: false,
      reason: "No SOL transfer from your linked wallet to the treasury was found in this transaction",
    };
  }
  if (lamports < opts.minLamports) {
    return {
      ok: false,
      reason: `Insufficient payment: expected at least ${opts.minLamports / LAMPORTS_PER_SOL} SOL`,
    };
  }
  return { ok: true, lamports };
}
