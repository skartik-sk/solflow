// Token Transfer Action — send SOL or SPL tokens to a destination.

import React, { memo } from "react";
import { Send } from "lucide-react";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { CloudNodeDefinition, CloudFlowNodeData } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";
import { assertWalletSafety } from "../security/safety";

const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

function isNativeSol(token: string): boolean {
  return !token || token.toUpperCase() === "SOL" || token === NATIVE_SOL_MINT;
}

function parseAmount(value: unknown): bigint {
  const raw = typeof value === "number" ? String(Math.trunc(value)) : String(value ?? "");
  if (!/^\d+$/.test(raw)) {
    throw new Error("amount must be a positive integer in smallest units");
  }

  const amount = BigInt(raw);
  if (amount <= BigInt(0)) {
    throw new Error("amount must be a positive integer in smallest units");
  }
  return amount;
}

// ─── Visual Component ──────────────────────────────────────────────────────

export const TokenTransferNode = memo(function TokenTransferNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  const nodeData = data.data ?? {};
  const to = (nodeData.to as string) || "";
  const amount = (nodeData.amount as string) || "";
  const token = (nodeData.token as string) || "SOL";

  return (
    <CloudBaseNode data={data} selected={selected}>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground/70">to</span>
          <span className="truncate max-w-[120px] text-right font-mono text-[10px]">
            {to ? `${to.slice(0, 8)}...` : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground/70">amt</span>
          <span className="truncate max-w-[120px] text-right font-mono text-[10px]">
            {amount || "—"} {token === "So11111111111111111111111111111111111111112" ? "SOL" : "tokens"}
          </span>
        </div>
      </div>
    </CloudBaseNode>
  );
});

// ─── Node Definition ───────────────────────────────────────────────────────

export const tokenTransferDef: CloudNodeDefinition = {
  type: "action:token-transfer",
  label: "Token Transfer",
  category: "action",
  description: "Send SOL or SPL tokens to a wallet address.",
  icon: "Send",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "to",
      label: "Destination Address",
      type: "pubkey",
      required: true,
      description: "Recipient wallet address",
      placeholder: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      supportsExpressions: true,
    },
    {
      key: "amount",
      label: "Amount",
      type: "number",
      required: true,
      description: "Amount to transfer (in smallest units)",
      supportsExpressions: true,
    },
    {
      key: "token",
      label: "Token Mint",
      type: "pubkey",
      required: false,
      description: "SPL token mint address. Leave empty for SOL transfer.",
      placeholder: "So11111111111111111111111111111111111111112",
      supportsExpressions: true,
    },
    {
      key: "walletId",
      label: "Source Wallet",
      type: "wallet-select",
      required: true,
      description: "Cloud wallet to sign the transfer",
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "output" }],
  defaultData: {
    to: "",
    amount: "",
    token: "So11111111111111111111111111111111111111112",
  },
  component: TokenTransferNode,
  async execute(ctx) {
    const to = ctx.params.to as string;
    const amount = parseAmount(ctx.params.amount);
    const token = (ctx.params.token as string) || "So11111111111111111111111111111111111111112";
    const walletId = ctx.params.walletId as string;

    if (!to || !walletId) {
      throw new Error("to, amount, and walletId are required");
    }

    const sourcePublicKey = new PublicKey(await ctx.wallet.getPublicKey(walletId));
    const destinationPublicKey = new PublicKey(to);
    const transaction = new Transaction();
    const nativeSol = isNativeSol(token);

    assertWalletSafety({
      safety: ctx.safety,
      action: "Token transfer",
      amountLamports: nativeSol ? amount : undefined,
      tokenMints: nativeSol ? [NATIVE_SOL_MINT] : [token],
      simulationAvailable: !!ctx.wallet.simulate,
    });

    let transferType: "sol" | "spl";
    let tokenMint: string | undefined;

    if (nativeSol) {
      transferType = "sol";
      transaction.add(SystemProgram.transfer({
        fromPubkey: sourcePublicKey,
        toPubkey: destinationPublicKey,
        lamports: Number(amount),
      }));
    } else {
      transferType = "spl";
      const mintPublicKey = new PublicKey(token);
      const sourceTokenAccount = getAssociatedTokenAddressSync(
        mintPublicKey,
        sourcePublicKey,
        true,
      );
      const destinationTokenAccount = getAssociatedTokenAddressSync(
        mintPublicKey,
        destinationPublicKey,
        true,
      );

      transaction.add(
        createAssociatedTokenAccountIdempotentInstruction(
          sourcePublicKey,
          destinationTokenAccount,
          destinationPublicKey,
          mintPublicKey,
        ),
        createTransferInstruction(
          sourceTokenAccount,
          destinationTokenAccount,
          sourcePublicKey,
          amount,
        ),
      );
      tokenMint = token;
    }

    transaction.feePayer = sourcePublicKey;

    const simulation = ctx.wallet.simulate
      ? await ctx.wallet.simulate(transaction, walletId)
      : undefined;

    if (simulation?.err) {
      throw new Error(`Token transfer simulation failed: ${JSON.stringify(simulation.err)}`);
    }

    const signature = await ctx.wallet.signAndSend(transaction, walletId);
    const transfer = {
      type: transferType,
      signature,
      from: sourcePublicKey.toBase58(),
      to: destinationPublicKey.toBase58(),
      amount: amount.toString(),
      token: tokenMint ?? "SOL",
      simulation,
      timestamp: new Date().toISOString(),
    };

    const inputItems = ctx.inputs[0] ?? [{ json: {} }];
    return inputItems.map((item) => ({
      ...item,
      json: {
        ...item.json,
        transfer,
      },
    }));
  },
};
