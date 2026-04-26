// Jupiter Swap Action — swap tokens via Jupiter Aggregator.

import React, { memo } from "react";
import { ArrowRightLeft } from "lucide-react";
import type { CloudNodeDefinition, CloudFlowNodeData } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";

// ─── Visual Component ──────────────────────────────────────────────────────

export const JupiterSwapNode = memo(function JupiterSwapNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  const nodeData = data.data ?? {};
  const inputMint = (nodeData.inputMint as string) || "";
  const outputMint = (nodeData.outputMint as string) || "";
  const amount = (nodeData.amount as string) || "";

  return (
    <CloudBaseNode data={data} selected={selected}>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground/70">in</span>
          <span className="truncate max-w-[120px] text-right font-mono text-[10px]">
            {inputMint ? `${inputMint.slice(0, 6)}...` : "SOL"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground/70">out</span>
          <span className="truncate max-w-[120px] text-right font-mono text-[10px]">
            {outputMint ? `${outputMint.slice(0, 6)}...` : "USDC"}
          </span>
        </div>
        {amount && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground/70">amt</span>
            <span className="truncate max-w-[120px] text-right font-mono text-[10px]">
              {amount}
            </span>
          </div>
        )}
      </div>
    </CloudBaseNode>
  );
});

// ─── Node Definition ───────────────────────────────────────────────────────

export const jupiterSwapDef: CloudNodeDefinition = {
  type: "action:jupiter-swap",
  label: "Jupiter Swap",
  category: "action",
  description: "Swap tokens using Jupiter Aggregator for best prices across DEXes.",
  icon: "ArrowRightLeft",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "inputMint",
      label: "Input Token",
      type: "pubkey",
      required: true,
      description: "Token mint to swap from (SOL native: So11111...)",
      placeholder: "So11111111111111111111111111111111111111112",
      supportsExpressions: true,
    },
    {
      key: "outputMint",
      label: "Output Token",
      type: "pubkey",
      required: true,
      description: "Token mint to swap to",
      placeholder: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      supportsExpressions: true,
    },
    {
      key: "amount",
      label: "Amount",
      type: "number",
      required: true,
      description: "Amount in smallest units (lamports for SOL)",
      supportsExpressions: true,
    },
    {
      key: "slippageBps",
      label: "Slippage (bps)",
      type: "number",
      required: false,
      default: 50,
      description: "Max slippage in basis points (50 = 0.5%)",
    },
    {
      key: "walletId",
      label: "Wallet",
      type: "wallet-select",
      required: true,
      description: "Cloud wallet to sign the swap transaction",
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "output" }],
  defaultData: {
    inputMint: "So11111111111111111111111111111111111111112",
    outputMint: "",
    amount: "",
    slippageBps: 50,
  },
  component: JupiterSwapNode,
  async execute(ctx) {
    const inputMint = ctx.params.inputMint as string;
    const outputMint = ctx.params.outputMint as string;
    const amount = Number(ctx.params.amount);
    const slippageBps = Number(ctx.params.slippageBps) || 50;

    if (!inputMint || !outputMint || !amount) {
      throw new Error("inputMint, outputMint, and amount are required");
    }

    // TODO: Wire to JupiterAdapter via cloud-defi
    // For now return a mock swap result for development
    const inputItems = ctx.inputs?.[0] ?? [];
    const swapResult = {
      inputMint,
      outputMint,
      inAmount: String(amount),
      outAmount: String(Math.floor(amount * 0.99)),
      signature: "mock_" + crypto.randomUUID().slice(0, 16),
      slippageBps,
      timestamp: new Date().toISOString(),
    };

    return inputItems.length > 0
      ? inputItems.map((item) => ({
          ...item,
          json: { ...item.json, swap: swapResult },
        }))
      : [{ json: { swap: swapResult } }];
  },
};
