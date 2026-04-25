// Price Fetch Action — fetches token price from Birdeye/DexScreener.

import React, { memo } from "react";
import { TrendingUp } from "lucide-react";
import type { CloudNodeDefinition, CloudFlowNodeData } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";

// ─── Visual Component ──────────────────────────────────────────────────────

export const PriceFetchNode = memo(function PriceFetchNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  const token = (data.data?.token as string) || "";
  return (
    <CloudBaseNode data={data} selected={selected}>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground/70">token</span>
          <span className="truncate max-w-[120px] text-right font-mono">
            {token || "SOL"}
          </span>
        </div>
      </div>
    </CloudBaseNode>
  );
});

// ─── Node Definition ───────────────────────────────────────────────────────

export const priceFetchDef: CloudNodeDefinition = {
  type: "action:price-fetch",
  label: "Fetch Price",
  category: "action",
  description: "Fetch current token price from Birdeye or DexScreener.",
  icon: "TrendingUp",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "token",
      label: "Token Address",
      type: "pubkey",
      required: true,
      description: "SPL token mint address (or SOL for native)",
      placeholder: "So11111111111111111111111111111111111111112",
      supportsExpressions: true,
    },
    {
      key: "source",
      label: "Price Source",
      type: "select",
      required: true,
      default: "birdeye",
      options: [
        { label: "Birdeye", value: "birdeye" },
        { label: "DexScreener", value: "dexscreener" },
      ],
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "output" }],
  defaultData: { token: "", source: "birdeye" },
  component: PriceFetchNode,
  async execute(ctx) {
    const token = (ctx.params.token as string) || "So11111111111111111111111111111111111111112";
    const source = (ctx.params.source as string) || "birdeye";

    // TODO: Wire up real Birdeye/DexScreener API call via @solflow/cloud-defi
    // For now return mock price data for development
    const mockPrice = token === "So11111111111111111111111111111111111111112" ? 174.5 : 0.001;

    const inputItems = ctx.inputs?.[0] ?? [];
    return inputItems.length > 0
      ? inputItems.map((item) => ({
          ...item,
          json: {
            ...item.json,
            price: mockPrice,
            token,
            source,
            fetchedAt: new Date().toISOString(),
          },
        }))
      : [{ json: { price: mockPrice, token, source, fetchedAt: new Date().toISOString() } }];
  },
};
