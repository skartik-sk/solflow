// Jupiter Swap Action — swap tokens via Jupiter Aggregator.

import React, { memo } from "react";
import { ArrowRightLeft } from "lucide-react";
import { VersionedTransaction } from "@solana/web3.js";
import type { CloudNodeDefinition, CloudFlowNodeData } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";
import { assertSafeOutboundUrl } from "../security/outbound-url";

const DEFAULT_JUPITER_API_BASE = "https://api.jup.ag/swap/v1";

function getEnv(name: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[name];
}

function requireFetch(): typeof fetch {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is not available in this runtime");
  }
  return fetch;
}

function jupiterHeaders(apiKey?: string): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(apiKey ? { "x-api-key": apiKey } : {}),
  };
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "";
  }
}

async function fetchJupiterJson<T>(
  path: string,
  init: RequestInit,
  config: { baseUrl?: string; apiKey?: string } = {},
): Promise<T> {
  const baseUrl = config.baseUrl || getEnv("JUPITER_API_BASE") || DEFAULT_JUPITER_API_BASE;
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const url = assertSafeOutboundUrl(`${normalizedBaseUrl}${path}`, { allowHttp: false });
  const response = await requireFetch()(url.toString(), {
    ...init,
    headers: {
      ...jupiterHeaders(config.apiKey ?? getEnv("JUPITER_API_KEY")),
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    throw new Error(
      `Jupiter API error ${response.status} ${response.statusText}: ${await readErrorBody(response)}`,
    );
  }

  const payload = await response.json() as T & { error?: string };
  if (payload && typeof payload.error === "string") {
    throw new Error(`Jupiter API error: ${payload.error}`);
  }
  return payload;
}

function base64ToBytes(value: string): Uint8Array {
  const globalWithBuffer = globalThis as {
    Buffer?: { from(input: string, encoding: "base64"): Uint8Array };
  };

  if (globalWithBuffer.Buffer) {
    return globalWithBuffer.Buffer.from(value, "base64");
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function resolveJupiterConfig(ctx: {
  params: Record<string, unknown>;
  credentials?: { get(id: string, allowedTypes?: string[]): Promise<{ data: Record<string, unknown> }> };
}): Promise<{ apiKey?: string; baseUrl?: string }> {
  const credentialId = ctx.params.credentialId as string | undefined;
  if (!credentialId) return {};

  const credential = await ctx.credentials?.get(credentialId, ["jupiter"]);
  if (!credential) {
    throw new Error("Credential runtime is not available for this Jupiter node");
  }

  const apiKey = credential.data.apiKey;
  const baseUrl = credential.data.baseUrl;
  return {
    apiKey: typeof apiKey === "string" && apiKey ? apiKey : undefined,
    baseUrl: typeof baseUrl === "string" && baseUrl ? baseUrl : undefined,
  };
}

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
    {
      key: "credentialId",
      label: "Credential",
      type: "credential",
      required: false,
      credentialType: "jupiter",
      description: "Optional Jupiter API credential. Falls back to JUPITER_API_KEY.",
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "output" }],
  defaultData: {
    inputMint: "So11111111111111111111111111111111111111112",
    outputMint: "",
    amount: "",
    slippageBps: 50,
    credentialId: "",
  },
  component: JupiterSwapNode,
  async execute(ctx) {
    const inputMint = ctx.params.inputMint as string;
    const outputMint = ctx.params.outputMint as string;
    const amount = Number(ctx.params.amount);
    const slippageBps = Number(ctx.params.slippageBps) || 50;
    const walletId = ctx.params.walletId as string;

    if (!inputMint || !outputMint || !amount || !walletId) {
      throw new Error("inputMint, outputMint, amount, and walletId are required");
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("amount must be a positive number in smallest units");
    }

    const userPublicKey = await ctx.wallet.getPublicKey(walletId);
    const jupiterConfig = await resolveJupiterConfig(ctx);
    const query = new URLSearchParams({
      inputMint,
      outputMint,
      amount: String(Math.trunc(amount)),
      slippageBps: String(Math.trunc(slippageBps)),
    });

    const quoteResponse = await fetchJupiterJson<any>(`/quote?${query.toString()}`, {
      method: "GET",
      signal: ctx.signal,
    }, jupiterConfig);

    const swapResponse = await fetchJupiterJson<any>("/swap", {
      method: "POST",
      signal: ctx.signal,
      body: JSON.stringify({
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        dynamicSlippage: true,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            priorityLevel: "veryHigh",
            maxLamports: 1_000_000,
          },
        },
      }),
    }, jupiterConfig);

    if (swapResponse.simulationError) {
      throw new Error(`Jupiter swap simulation failed: ${JSON.stringify(swapResponse.simulationError)}`);
    }

    if (typeof swapResponse.swapTransaction !== "string") {
      throw new Error("Jupiter swap response did not include a serialized swap transaction");
    }

    const transaction = VersionedTransaction.deserialize(
      base64ToBytes(swapResponse.swapTransaction),
    );

    const simulation = ctx.wallet.simulate
      ? await ctx.wallet.simulate(transaction, walletId)
      : undefined;

    if (simulation?.err) {
      throw new Error(`Swap transaction simulation failed: ${JSON.stringify(simulation.err)}`);
    }

    const signature = await ctx.wallet.signAndSend(transaction, walletId);
    const swap = {
      provider: "jupiter",
      signature,
      inputMint,
      outputMint,
      inAmount: quoteResponse.inAmount,
      outAmount: quoteResponse.outAmount,
      otherAmountThreshold: quoteResponse.otherAmountThreshold,
      priceImpactPct: quoteResponse.priceImpactPct,
      slippageBps,
      routePlan: quoteResponse.routePlan,
      lastValidBlockHeight: swapResponse.lastValidBlockHeight,
      prioritizationFeeLamports: swapResponse.prioritizationFeeLamports,
      dynamicSlippageReport: swapResponse.dynamicSlippageReport,
      simulation,
      userPublicKey,
      timestamp: new Date().toISOString(),
    };

    const inputItems = ctx.inputs[0] ?? [{ json: {} }];
    return inputItems.map((item) => ({
      ...item,
      json: {
        ...item.json,
        swap,
      },
    }));
  },
};
