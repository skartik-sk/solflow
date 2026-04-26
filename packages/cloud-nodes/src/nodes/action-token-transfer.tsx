// Token Transfer Action — send SOL or SPL tokens to a destination.

import React, { memo } from "react";
import { Send } from "lucide-react";
import type { CloudNodeDefinition, CloudFlowNodeData } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";

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
    const amount = Number(ctx.params.amount);
    const token = (ctx.params.token as string) || "So11111111111111111111111111111111111111112";

    if (!to || !amount) {
      throw new Error("to and amount are required");
    }

    // TODO: Wire to WalletSigner via cloud-wallet
    // For now return a mock transfer result
    const inputItems = ctx.inputs?.[0] ?? [];
    const transferResult = {
      to,
      amount,
      token,
      isSol: token === "So11111111111111111111111111111111111111112",
      signature: "mock_" + crypto.randomUUID().slice(0, 16),
      timestamp: new Date().toISOString(),
    };

    return inputItems.length > 0
      ? inputItems.map((item) => ({
          ...item,
          json: { ...item.json, transfer: transferResult },
        }))
      : [{ json: { transfer: transferResult } }];
  },
};
