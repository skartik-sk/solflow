// Jupiter API Action — read Jupiter data and prepare or send swaps.

import React, { memo } from "react";
import { ArrowRightLeft } from "lucide-react";
import { VersionedTransaction } from "@solana/web3.js";
import type { CloudNodeDefinition, CloudFlowNodeData } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";
import { assertSafeOutboundUrl } from "../security/outbound-url";
import { assertWalletSafety } from "../security/safety";

const DEFAULT_JUPITER_API_BASE = "https://api.jup.ag";
const DEFAULT_JUPITER_LEGACY_SWAP_BASE = "https://quote-api.jup.ag/v6";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

type JupiterOperation =
  | "price"
  | "token-search"
  | "portfolio-positions"
  | "swap-order"
  | "swap-build"
  | "swap-direct-send";

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

function queryString(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  return query.toString();
}

function stringParam(
  params: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = params[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(`${label} is required`);
}

function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveIntegerParam(
  params: Record<string, unknown>,
  key: string,
  label: string,
): number {
  const amount = Number(params[key]);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} must be a positive number in smallest units`);
  }
  return Math.trunc(amount);
}

function normalizeOperation(value: unknown): JupiterOperation {
  const operation = typeof value === "string" ? value : "price";
  if (
    operation === "price" ||
    operation === "token-search" ||
    operation === "portfolio-positions" ||
    operation === "swap-order" ||
    operation === "swap-build" ||
    operation === "swap-direct-send"
  ) {
    return operation;
  }
  return "price";
}

function attachJupiterOutput(
  inputItems: Array<{ json: Record<string, unknown> }>,
  operation: JupiterOperation,
  payload: unknown,
  meta: Record<string, unknown> = {},
) {
  const jupiter = {
    provider: "jupiter",
    operation,
    ...meta,
    payload,
    timestamp: new Date().toISOString(),
  };

  return inputItems.map((item) => ({
    ...item,
    json: {
      ...item.json,
      jupiter,
    },
  }));
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
  const operation = (nodeData.operation as string) || "price";
  const tokenIds = (nodeData.tokenIds as string) || "";
  const query = (nodeData.query as string) || "";
  const walletAddress = (nodeData.walletAddress as string) || "";
  const inputMint = (nodeData.inputMint as string) || "";
  const outputMint = (nodeData.outputMint as string) || "";
  const amount = (nodeData.amount as string) || "";

  return (
    <CloudBaseNode data={data} selected={selected}>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground/70">op</span>
          <span className="truncate max-w-[120px] text-right font-mono text-[10px]">
            {operation}
          </span>
        </div>
        {operation === "price" && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground/70">ids</span>
            <span className="truncate max-w-[120px] text-right font-mono text-[10px]">
              {tokenIds || "SOL"}
            </span>
          </div>
        )}
        {operation === "token-search" && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground/70">query</span>
            <span className="truncate max-w-[120px] text-right font-mono text-[10px]">
              {query || "SOL"}
            </span>
          </div>
        )}
        {operation === "portfolio-positions" && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground/70">wallet</span>
            <span className="truncate max-w-[120px] text-right font-mono text-[10px]">
              {walletAddress ? `${walletAddress.slice(0, 6)}...` : "selected wallet"}
            </span>
          </div>
        )}
        {(operation === "swap-order" || operation === "swap-build" || operation === "swap-direct-send") && (
          <>
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
          </>
        )}
        {amount && (operation === "swap-order" || operation === "swap-build" || operation === "swap-direct-send") && (
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
  label: "Jupiter API",
  category: "action",
  description: "Read Jupiter Price/Tokens/Portfolio data, prepare Swap API V2 orders, or run a wallet-gated legacy direct swap.",
  icon: "ArrowRightLeft",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "operation",
      label: "Operation",
      type: "select",
      required: true,
      default: "price",
      description: "Jupiter API operation to run.",
      options: [
        { label: "Price API v3", value: "price" },
        { label: "Token Search v2", value: "token-search" },
        { label: "Portfolio Positions v1", value: "portfolio-positions" },
        { label: "Swap v2 Order", value: "swap-order" },
        { label: "Swap v2 Build", value: "swap-build" },
        { label: "Legacy Direct Swap Send", value: "swap-direct-send" },
      ],
    },
    {
      key: "tokenIds",
      label: "Token IDs",
      type: "text",
      required: false,
      description: "Comma-separated mint addresses for Price API v3.",
      placeholder: SOL_MINT,
      supportsExpressions: true,
    },
    {
      key: "query",
      label: "Token Search",
      type: "text",
      required: false,
      description: "Name, symbol, or mint to search with Tokens API v2.",
      placeholder: "SOL",
      supportsExpressions: true,
    },
    {
      key: "walletAddress",
      label: "Wallet Address",
      type: "pubkey",
      required: false,
      description: "Wallet/taker address for Portfolio or Swap API V2. If blank, the selected Cloud wallet public key is used.",
      supportsExpressions: true,
    },
    {
      key: "inputMint",
      label: "Input Token",
      type: "pubkey",
      required: false,
      description: "Token mint to swap from (SOL native: So11111...)",
      placeholder: SOL_MINT,
      supportsExpressions: true,
    },
    {
      key: "outputMint",
      label: "Output Token",
      type: "pubkey",
      required: false,
      description: "Token mint to swap to",
      placeholder: USDC_MINT,
      supportsExpressions: true,
    },
    {
      key: "amount",
      label: "Amount",
      type: "number",
      required: false,
      description: "Swap amount in smallest units (lamports for SOL)",
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
      required: false,
      description: "Cloud wallet used as taker or signer. Required for legacy direct swap send.",
    },
    {
      key: "credentialId",
      label: "Credential",
      type: "credential",
      required: false,
      credentialType: "jupiter",
      description: "Optional Jupiter credential. Falls back to JUPITER_API_KEY/JUPITER_API_BASE; keyless access works for lightweight reads.",
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "output" }],
  defaultData: {
    operation: "price",
    tokenIds: SOL_MINT,
    query: "SOL",
    walletAddress: "",
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    amount: "1000000",
    slippageBps: 50,
    walletId: "",
    credentialId: "",
  },
  component: JupiterSwapNode,
  async execute(ctx) {
    const operation = normalizeOperation(ctx.params.operation);
    const jupiterConfig = await resolveJupiterConfig(ctx);
    const inputItems = ctx.inputs[0] ?? [{ json: {} }];

    if (operation === "price") {
      const ids = stringParam(ctx.params, "tokenIds", "Token IDs");
      ctx.logger.info("Jupiter Price API request", { ids });
      const payload = await fetchJupiterJson<any>(`/price/v3?${queryString({ ids })}`, {
        method: "GET",
        signal: ctx.signal,
      }, jupiterConfig);
      ctx.logger.info("Jupiter Price API complete");
      return attachJupiterOutput(inputItems, operation, payload, { ids });
    }

    if (operation === "token-search") {
      const query = stringParam(ctx.params, "query", "Token Search");
      ctx.logger.info("Jupiter Tokens API request", { query });
      const payload = await fetchJupiterJson<any>(`/tokens/v2/search?${queryString({ query })}`, {
        method: "GET",
        signal: ctx.signal,
      }, jupiterConfig);
      ctx.logger.info("Jupiter Tokens API complete");
      return attachJupiterOutput(inputItems, operation, payload, { query });
    }

    if (operation === "portfolio-positions") {
      const walletAddress =
        optionalString(ctx.params, "walletAddress") ??
        (optionalString(ctx.params, "walletId")
          ? await ctx.wallet.getPublicKey(optionalString(ctx.params, "walletId")!)
          : undefined);
      if (!walletAddress) throw new Error("Wallet Address or Wallet is required");
      ctx.logger.info("Jupiter Portfolio API request", { walletAddress });
      const payload = await fetchJupiterJson<any>(`/portfolio/v1/positions?${queryString({ wallet: walletAddress })}`, {
        method: "GET",
        signal: ctx.signal,
      }, jupiterConfig);
      ctx.logger.info("Jupiter Portfolio API complete");
      return attachJupiterOutput(inputItems, operation, payload, { walletAddress });
    }

    if (operation === "swap-order" || operation === "swap-build") {
      const inputMint = stringParam(ctx.params, "inputMint", "Input Token");
      const outputMint = stringParam(ctx.params, "outputMint", "Output Token");
      const amount = positiveIntegerParam(ctx.params, "amount", "Amount");
      const walletId = optionalString(ctx.params, "walletId");
      const taker = optionalString(ctx.params, "walletAddress") ?? (walletId ? await ctx.wallet.getPublicKey(walletId) : undefined);
      if (!taker) throw new Error("Wallet Address or Wallet is required for Jupiter Swap API V2");

      const slippageBps = optionalString(ctx.params, "slippageBps") ?? "50";
      const endpoint = operation === "swap-order" ? "/swap/v2/order" : "/swap/v2/build";
      const query = queryString({
        inputMint,
        outputMint,
        amount,
        taker,
        slippageBps,
      });

      ctx.logger.info(`Jupiter ${operation === "swap-order" ? "Swap Order" : "Swap Build"} request`, {
        inputMint,
        outputMint,
        amount,
        taker,
      });
      const payload = await fetchJupiterJson<any>(`${endpoint}?${query}`, {
        method: "GET",
        signal: ctx.signal,
      }, jupiterConfig);
      ctx.logger.info(`Jupiter ${operation === "swap-order" ? "Swap Order" : "Swap Build"} complete`);
      return attachJupiterOutput(inputItems, operation, payload, {
        inputMint,
        outputMint,
        amount,
        taker,
        slippageBps,
      });
    }

    const inputMint = stringParam(ctx.params, "inputMint", "Input Token");
    const outputMint = stringParam(ctx.params, "outputMint", "Output Token");
    const amount = positiveIntegerParam(ctx.params, "amount", "Amount");
    const slippageBps = Number(ctx.params.slippageBps) || 50;
    const walletId = stringParam(ctx.params, "walletId", "Wallet");

    assertWalletSafety({
      safety: ctx.safety,
      action: "Jupiter swap",
      amountLamports:
        inputMint === SOL_MINT
          ? BigInt(amount)
          : undefined,
      tokenMints: [inputMint, outputMint],
      slippageBps,
      simulationAvailable: !!ctx.wallet.simulate,
    });

    const userPublicKey = await ctx.wallet.getPublicKey(walletId);
    const legacyConfig = {
      ...jupiterConfig,
      baseUrl: getEnv("JUPITER_LEGACY_SWAP_BASE") || DEFAULT_JUPITER_LEGACY_SWAP_BASE,
    };
    const quoteQuery = queryString({
      inputMint,
      outputMint,
      amount,
      slippageBps: Math.trunc(slippageBps),
    });

    ctx.logger.info("Jupiter legacy quote request", { inputMint, outputMint, amount });
    const quoteResponse = await fetchJupiterJson<any>(`/quote?${quoteQuery}`, {
      method: "GET",
      signal: ctx.signal,
    }, legacyConfig);

    ctx.logger.info("Jupiter legacy swap transaction request");
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
    }, legacyConfig);

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
      operation,
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

    ctx.logger.info("Jupiter legacy direct swap sent", { signature });
    return inputItems.map((item) => ({
      ...item,
      json: {
        ...item.json,
        jupiter: swap,
        swap,
      },
    }));
  },
};
