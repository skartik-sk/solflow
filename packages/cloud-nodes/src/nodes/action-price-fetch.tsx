// Price Fetch Action — fetches token price from Birdeye/DexScreener.

import React, { memo } from "react";
import { TrendingUp } from "lucide-react";
import type { CloudNodeDefinition, CloudFlowNodeData } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const BIRDEYE_PRICE_URL = "https://public-api.birdeye.so/defi/price";
const DEXSCREENER_TOKEN_URL = "https://api.dexscreener.com/tokens/v1/solana";

interface PriceResult {
  price: number;
  token: string;
  source: "birdeye" | "dexscreener";
  fetchedAt: string;
  pairAddress?: string;
  liquidityUsd?: number;
}

function normalizeToken(token: string): string {
  return token === "SOL" || !token ? SOL_MINT : token;
}

function getEnv(name: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[name];
}

async function resolveBirdeyeApiKey(ctx: {
  params: Record<string, unknown>;
  credentials?: { get(id: string, allowedTypes?: string[]): Promise<{ data: Record<string, unknown> }> };
}): Promise<string | undefined> {
  const credentialId = ctx.params.credentialId as string | undefined;
  if (credentialId) {
    const credential = await ctx.credentials?.get(credentialId, ["birdeye"]);
    const apiKey = credential?.data.apiKey;
    if (typeof apiKey !== "string" || !apiKey) {
      throw new Error("Birdeye credential is missing apiKey");
    }
    return apiKey;
  }

  return getEnv("BIRDEYE_API_KEY");
}

async function fetchBirdeyePrice(token: string, apiKey?: string): Promise<PriceResult> {
  if (!apiKey) {
    throw new Error("Birdeye credential or BIRDEYE_API_KEY is required for Birdeye price fetch");
  }

  const url = `${BIRDEYE_PRICE_URL}?address=${encodeURIComponent(token)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-API-KEY": apiKey,
      "x-chain": "solana",
    },
  });
  if (!response.ok) {
    throw new Error(`Birdeye price error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json() as { data?: { value?: number } };
  const price = json.data?.value;
  if (typeof price !== "number") {
    throw new Error("Birdeye price response did not include data.value");
  }

  return {
    price,
    token,
    source: "birdeye",
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchDexScreenerPrice(token: string): Promise<PriceResult> {
  const response = await fetch(`${DEXSCREENER_TOKEN_URL}/${encodeURIComponent(token)}`);
  if (!response.ok) {
    throw new Error(`DexScreener price error: ${response.status} ${response.statusText}`);
  }

  const pairs = await response.json() as Array<{
    pairAddress?: string;
    priceUsd?: string;
    liquidity?: { usd?: number };
  }>;
  const bestPair = pairs
    .filter((pair) => pair.priceUsd !== undefined)
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];

  if (!bestPair?.priceUsd) {
    throw new Error("DexScreener response did not include a priced Solana pair");
  }

  return {
    price: Number(bestPair.priceUsd),
    token,
    source: "dexscreener",
    fetchedAt: new Date().toISOString(),
    pairAddress: bestPair.pairAddress,
    liquidityUsd: bestPair.liquidity?.usd,
  };
}

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
    {
      key: "credentialId",
      label: "Credential",
      type: "credential",
      required: false,
      credentialType: "birdeye",
      description: "Optional Birdeye credential. Falls back to BIRDEYE_API_KEY.",
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "output" }],
  defaultData: { token: "", source: "birdeye", credentialId: "" },
  component: PriceFetchNode,
  async execute(ctx) {
    const token = normalizeToken((ctx.params.token as string) || SOL_MINT);
    const source = (ctx.params.source as string) || "birdeye";

    const result = source === "dexscreener"
      ? await fetchDexScreenerPrice(token)
      : await fetchBirdeyePrice(token, await resolveBirdeyeApiKey(ctx));

    const inputItems = ctx.inputs?.[0] ?? [];
    return inputItems.length > 0
      ? inputItems.map((item) => ({
          ...item,
          json: { ...item.json, price: result.price, priceData: result },
        }))
      : [{ json: { price: result.price, priceData: result } }];
  },
};
