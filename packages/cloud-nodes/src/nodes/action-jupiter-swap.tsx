// Jupiter API Action — read Jupiter data and prepare or send swaps.

import React, { memo } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import type { CloudNodeDefinition, CloudFlowNodeData } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";
import { assertSafeOutboundUrl } from "../security/outbound-url";
import { assertWalletSafety } from "../security/safety";

const DEFAULT_JUPITER_API_BASE = "https://api.jup.ag";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

type JupiterOperation =
  | "price"
  | "token-search"
  | "token-tag"
  | "token-category"
  | "token-recent"
  | "portfolio-positions"
  | "swap-order"
  | "swap-build"
  | "swap-execute"
  | "swap-direct-send";

type JupiterOrderResponse = {
  transaction?: string | null;
  requestId?: string;
  outAmount?: string;
  inAmount?: string;
  router?: string;
  mode?: string;
  feeBps?: number;
  feeMint?: string;
  platformFee?: unknown;
  lastValidBlockHeight?: number;
  [key: string]: unknown;
};

type JupiterExecuteResponse = {
  status?: "Success" | "Failed" | string;
  signature?: string;
  code?: number;
  inputAmountResult?: string;
  outputAmountResult?: string;
  error?: string;
  [key: string]: unknown;
};

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

function positiveIntegerWithDefault(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function normalizeOperation(value: unknown): JupiterOperation {
  const operation = typeof value === "string" ? value : "price";
  if (
    operation === "price" ||
    operation === "token-search" ||
    operation === "token-tag" ||
    operation === "token-category" ||
    operation === "token-recent" ||
    operation === "portfolio-positions" ||
    operation === "swap-order" ||
    operation === "swap-build" ||
    operation === "swap-execute" ||
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

function bytesToBase64(value: Uint8Array): string {
  const globalWithBuffer = globalThis as {
    Buffer?: { from(input: Uint8Array): { toString(encoding: "base64"): string } };
  };

  if (globalWithBuffer.Buffer) {
    return globalWithBuffer.Buffer.from(value).toString("base64");
  }

  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function serializedTransactionBase64(tx: unknown): string {
  if (typeof tx === "string" && tx.trim()) return tx.trim();

  if (tx instanceof VersionedTransaction || tx instanceof Transaction) {
    return bytesToBase64(tx.serialize());
  }

  const candidate = tx as { serialize?: () => Uint8Array };
  if (candidate && typeof candidate.serialize === "function") {
    return bytesToBase64(candidate.serialize());
  }

  throw new Error("Wallet did not return a serializable signed transaction");
}

function versionedTransactionFromBase64(value: string): VersionedTransaction {
  try {
    return VersionedTransaction.deserialize(base64ToBytes(value));
  } catch (error) {
    throw new Error(`Invalid Jupiter transaction payload: ${(error as Error).message}`);
  }
}

function optionalPositiveInteger(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key];
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive number`);
  }
  return Math.trunc(parsed);
}

function addOptionalQueryParams(target: Record<string, unknown>, params: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = optionalString(params, key);
    if (value) target[key] = value;
  }
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

function buildSwapV2Params(ctxParams: Record<string, unknown>, taker: string): Record<string, unknown> {
  const params: Record<string, unknown> = {
    inputMint: stringParam(ctxParams, "inputMint", "Input Token"),
    outputMint: stringParam(ctxParams, "outputMint", "Output Token"),
    amount: positiveIntegerParam(ctxParams, "amount", "Amount"),
    taker,
  };

  const slippageBps = ctxParams.slippageBps;
  if (typeof slippageBps === "number" && Number.isFinite(slippageBps) && slippageBps > 0) {
    params.slippageBps = Math.trunc(slippageBps);
  } else {
    const slippageBpsText = optionalString(ctxParams, "slippageBps");
    if (slippageBpsText) params.slippageBps = slippageBpsText;
  }

  addOptionalQueryParams(params, ctxParams, [
    "receiver",
    "payer",
    "referralAccount",
    "referralFee",
    "excludeRouters",
    "mode",
    "computeUnitPricePercentile",
  ]);

  const maxAccounts = optionalPositiveInteger(ctxParams, "maxAccounts");
  if (maxAccounts !== undefined) params.maxAccounts = maxAccounts;

  const platformFeeBps = optionalPositiveInteger(ctxParams, "platformFeeBps");
  if (platformFeeBps !== undefined) params.platformFeeBps = platformFeeBps;

  const tipAmount = optionalPositiveInteger(ctxParams, "tipAmount");
  if (tipAmount !== undefined) params.tipAmount = tipAmount;

  return params;
}

async function fetchJupiterSwapOrder(ctx: JupiterExecuteContext, config: { apiKey?: string; baseUrl?: string }) {
  const walletId = optionalString(ctx.params, "walletId");
  const taker = optionalString(ctx.params, "walletAddress") ?? (walletId ? await ctx.wallet.getPublicKey(walletId) : undefined);
  if (!taker) throw new Error("Taker Address or Wallet is required for Jupiter Swap API V2");

  const params = buildSwapV2Params(ctx.params, taker);
  ctx.logger.info("Jupiter Swap API V2 order request", {
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
    taker,
  });

  const payload = await fetchJupiterJson<JupiterOrderResponse>(
    `/swap/v2/order?${queryString(params)}`,
    { method: "GET", signal: ctx.signal },
    config,
  );

  ctx.logger.info("Jupiter Swap API V2 order complete", {
    router: payload.router,
    mode: payload.mode,
    hasTransaction: typeof payload.transaction === "string" && payload.transaction.length > 0,
  });

  return { payload, params, taker };
}

async function fetchJupiterSwapBuild(ctx: JupiterExecuteContext, config: { apiKey?: string; baseUrl?: string }) {
  const walletId = optionalString(ctx.params, "walletId");
  const taker = optionalString(ctx.params, "walletAddress") ?? (walletId ? await ctx.wallet.getPublicKey(walletId) : undefined);
  if (!taker) throw new Error("Taker Address or Wallet is required for Jupiter Swap API V2");

  const params = buildSwapV2Params(ctx.params, taker);
  ctx.logger.info("Jupiter Swap API V2 build request", {
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
    taker,
  });

  const payload = await fetchJupiterJson<Record<string, unknown>>(
    `/swap/v2/build?${queryString(params)}`,
    { method: "GET", signal: ctx.signal },
    config,
  );

  ctx.logger.info("Jupiter Swap API V2 build complete");
  return { payload, params, taker };
}

async function signAndExecuteJupiterOrder(ctx: JupiterExecuteContext, config: { apiKey?: string; baseUrl?: string }, order: JupiterOrderResponse) {
  const walletId = stringParam(ctx.params, "walletId", "Wallet");
  if (!ctx.wallet.signTransaction) {
    throw new Error("Jupiter Swap API V2 execute requires wallet signTransaction support");
  }

  const transactionBase64 =
    optionalString(ctx.params, "transactionBase64") ??
    (typeof order.transaction === "string" ? order.transaction : undefined);
  const requestId =
    optionalString(ctx.params, "requestId") ??
    (typeof order.requestId === "string" ? order.requestId : undefined);

  if (!transactionBase64) throw new Error("Jupiter order transaction is required for execute");
  if (!requestId) throw new Error("Jupiter requestId is required for execute");

  let simulation: { err: unknown; logs?: string[] | null } | undefined;
  if (ctx.wallet.simulate) {
    const simulationTx = versionedTransactionFromBase64(transactionBase64);
    simulation = await ctx.wallet.simulate(simulationTx, walletId);
    if (simulation?.err) {
      throw new Error(`Jupiter Swap API V2 transaction simulation failed: ${JSON.stringify(simulation.err)}`);
    }
  }

  const transaction = versionedTransactionFromBase64(transactionBase64);
  const signed = await ctx.wallet.signTransaction(transaction, walletId);
  const signedTransaction = serializedTransactionBase64(signed);
  const lastValidBlockHeight =
    optionalPositiveInteger(ctx.params, "lastValidBlockHeight") ??
    (typeof order.lastValidBlockHeight === "number" ? order.lastValidBlockHeight : undefined);

  ctx.logger.info("Jupiter Swap API V2 execute request", { requestId });
  const execute = await fetchJupiterJson<JupiterExecuteResponse>(
    "/swap/v2/execute",
    {
      method: "POST",
      signal: ctx.signal,
      body: JSON.stringify({
        signedTransaction,
        requestId,
        ...(lastValidBlockHeight ? { lastValidBlockHeight } : {}),
      }),
    },
    config,
  );

  if (execute.status && execute.status !== "Success") {
    throw new Error(
      `Jupiter Swap API V2 execute failed${execute.code !== undefined ? ` (${execute.code})` : ""}: ${execute.error ?? execute.status}`,
    );
  }

  ctx.logger.info("Jupiter Swap API V2 execute complete", {
    status: execute.status,
    signature: execute.signature,
  });

  return { execute, simulation, requestId, lastValidBlockHeight };
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
  const tokenTag = (nodeData.tokenTag as string) || "";
  const tokenCategory = (nodeData.tokenCategory as string) || "";
  const tokenInterval = (nodeData.tokenInterval as string) || "";
  const walletAddress = (nodeData.walletAddress as string) || "";
  const inputMint = (nodeData.inputMint as string) || "";
  const outputMint = (nodeData.outputMint as string) || "";
  const amount = (nodeData.amount as string) || "";
  const requestId = (nodeData.requestId as string) || "";

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
        {operation === "token-tag" && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground/70">tag</span>
            <span className="truncate max-w-[120px] text-right font-mono text-[10px]">
              {tokenTag || "verified"}
            </span>
          </div>
        )}
        {operation === "token-category" && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground/70">cat</span>
            <span className="truncate max-w-[120px] text-right font-mono text-[10px]">
              {tokenCategory || "toptraded"}:{tokenInterval || "24h"}
            </span>
          </div>
        )}
        {operation === "token-recent" && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground/70">tokens</span>
            <span className="truncate max-w-[120px] text-right font-mono text-[10px]">
              recent
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
        {operation === "swap-execute" && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground/70">req</span>
            <span className="truncate max-w-[120px] text-right font-mono text-[10px]">
              {requestId || "from order"}
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
  label: "Jupiter Direct Swap",
  category: "action",
  description: "Create a Jupiter Swap API V2 order, sign it, and execute it with a Cloud wallet.",
  icon: "ArrowRightLeft",
  color: CATEGORY_COLORS.action,
  properties: [
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
      description: "Optional fixed slippage. Leaving advanced fields blank keeps more routers eligible.",
    },
    {
      key: "receiver",
      label: "Receiver",
      type: "pubkey",
      required: false,
      description: "Optional output receiver. Jupiter docs note this may affect routing.",
      supportsExpressions: true,
    },
    {
      key: "payer",
      label: "Gasless Payer",
      type: "pubkey",
      required: false,
      description: "Optional integrator payer for gasless mode. This restricts routing.",
      supportsExpressions: true,
    },
    {
      key: "walletId",
      label: "Wallet",
      type: "wallet-select",
      required: false,
      description: "Cloud wallet used as taker and signer. Required for direct swap execution.",
    },
    {
      key: "credentialId",
      label: "Credential",
      type: "credential",
      required: false,
      credentialType: "jupiter",
      description: "Optional Jupiter credential. Falls back to JUPITER_API_KEY/JUPITER_API_BASE.",
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "swap" }],
  defaultData: {
    operation: "swap-direct-send",
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    amount: "1000000",
    slippageBps: 50,
    walletId: "",
    receiver: "",
    payer: "",
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

    if (operation === "token-tag") {
      const tag = optionalString(ctx.params, "tokenTag") ?? "verified";
      ctx.logger.info("Jupiter Tokens tag request", { tag });
      const payload = await fetchJupiterJson<any>(`/tokens/v2/tag?${queryString({ query: tag })}`, {
        method: "GET",
        signal: ctx.signal,
      }, jupiterConfig);
      ctx.logger.info("Jupiter Tokens tag complete");
      return attachJupiterOutput(inputItems, operation, payload, { tag });
    }

    if (operation === "token-category") {
      const category = optionalString(ctx.params, "tokenCategory") ?? "toptraded";
      const interval = optionalString(ctx.params, "tokenInterval") ?? "24h";
      const limit = positiveIntegerWithDefault(ctx.params.tokenLimit, 30);
      ctx.logger.info("Jupiter Tokens category request", { category, interval, limit });
      const payload = await fetchJupiterJson<any>(
        `/tokens/v2/${encodeURIComponent(category)}/${encodeURIComponent(interval)}?${queryString({ limit })}`,
        {
          method: "GET",
          signal: ctx.signal,
        },
        jupiterConfig,
      );
      ctx.logger.info("Jupiter Tokens category complete");
      return attachJupiterOutput(inputItems, operation, payload, { category, interval, limit });
    }

    if (operation === "token-recent") {
      ctx.logger.info("Jupiter recent tokens request");
      const payload = await fetchJupiterJson<any>("/tokens/v2/recent", {
        method: "GET",
        signal: ctx.signal,
      }, jupiterConfig);
      ctx.logger.info("Jupiter recent tokens complete");
      return attachJupiterOutput(inputItems, operation, payload);
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

    if (operation === "swap-order") {
      const { payload, params, taker } = await fetchJupiterSwapOrder(ctx, jupiterConfig);
      return attachJupiterOutput(inputItems, operation, payload, {
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        amount: params.amount,
        taker,
        slippageBps: params.slippageBps,
      });
    }

    if (operation === "swap-build") {
      const { payload, params, taker } = await fetchJupiterSwapBuild(ctx, jupiterConfig);
      return attachJupiterOutput(inputItems, operation, payload, {
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        amount: params.amount,
        taker,
        slippageBps: params.slippageBps,
      });
    }

    if (operation === "swap-execute") {
      const order: JupiterOrderResponse = {
        transaction: optionalString(ctx.params, "transactionBase64"),
        requestId: optionalString(ctx.params, "requestId"),
        lastValidBlockHeight: optionalPositiveInteger(ctx.params, "lastValidBlockHeight"),
      };
      const { execute, simulation, requestId, lastValidBlockHeight } =
        await signAndExecuteJupiterOrder(ctx, jupiterConfig, order);
      return attachJupiterOutput(inputItems, operation, execute, {
        requestId,
        signature: execute.signature,
        status: execute.status,
        lastValidBlockHeight,
        simulation,
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

    const { payload: order, params, taker } = await fetchJupiterSwapOrder(ctx, jupiterConfig);
    const { execute, simulation, requestId, lastValidBlockHeight } =
      await signAndExecuteJupiterOrder(ctx, jupiterConfig, order);
    const swap = {
      provider: "jupiter",
      operation,
      signature: execute.signature,
      inputMint,
      outputMint,
      inAmount: order.inAmount,
      outAmount: order.outAmount,
      inputAmountResult: execute.inputAmountResult,
      outputAmountResult: execute.outputAmountResult,
      status: execute.status,
      code: execute.code,
      error: execute.error,
      slippageBps,
      routePlan: order.routePlan,
      router: order.router,
      mode: order.mode,
      feeBps: order.feeBps,
      feeMint: order.feeMint,
      platformFee: order.platformFee,
      requestId,
      lastValidBlockHeight,
      simulation,
      taker,
      orderParams: params,
      timestamp: new Date().toISOString(),
    };

    ctx.logger.info("Jupiter Swap API V2 direct swap executed", { signature: execute.signature });
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

type JupiterExecuteContext = Parameters<NonNullable<CloudNodeDefinition["execute"]>>[0];

function runJupiterOperation(ctx: JupiterExecuteContext, operation: JupiterOperation) {
  return jupiterSwapDef.execute!({
    ...ctx,
    params: { ...ctx.params, operation },
  });
}

const jupiterCredentialProperty = {
  key: "credentialId",
  label: "Jupiter Credential",
  type: "credential" as const,
  required: false,
  credentialType: "jupiter",
  description: "Optional Jupiter credential. Falls back to JUPITER_API_KEY/JUPITER_API_BASE.",
};

export const jupiterPriceDef: CloudNodeDefinition = {
  type: "action:jupiter-price",
  label: "Jupiter Price",
  category: "action",
  description: "Fetch token prices from Jupiter Price API v3.",
  icon: "ArrowRightLeft",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "tokenIds",
      label: "Token IDs",
      type: "text",
      required: true,
      description: "Comma-separated mint addresses.",
      placeholder: SOL_MINT,
      supportsExpressions: true,
    },
    jupiterCredentialProperty,
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "price" }],
  defaultData: { operation: "price", tokenIds: SOL_MINT, credentialId: "" },
  component: JupiterSwapNode,
  execute: (ctx) => runJupiterOperation(ctx, "price"),
};

export const jupiterTokenSearchDef: CloudNodeDefinition = {
  type: "action:jupiter-token-search",
  label: "Jupiter Token Search",
  category: "action",
  description: "Search Jupiter token metadata by symbol, name, or mint.",
  icon: "ArrowRightLeft",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "query",
      label: "Search",
      type: "text",
      required: true,
      description: "Token name, symbol, or mint address.",
      placeholder: "SOL",
      supportsExpressions: true,
    },
    jupiterCredentialProperty,
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "tokens" }],
  defaultData: { operation: "token-search", query: "SOL", credentialId: "" },
  component: JupiterSwapNode,
  execute: (ctx) => runJupiterOperation(ctx, "token-search"),
};

export const jupiterTokenTagDef: CloudNodeDefinition = {
  type: "action:jupiter-token-tag",
  label: "Jupiter Token Tag",
  category: "action",
  description: "Fetch Jupiter tokens by tag, such as verified, LST, or stocks.",
  icon: "ArrowRightLeft",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "tokenTag",
      label: "Tag",
      type: "select",
      required: true,
      default: "verified",
      options: [
        { label: "Verified", value: "verified" },
        { label: "Liquid Staking Tokens", value: "lst" },
        { label: "Stocks", value: "stocks" },
      ],
    },
    jupiterCredentialProperty,
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "tokens" }],
  defaultData: { operation: "token-tag", tokenTag: "verified", credentialId: "" },
  component: JupiterSwapNode,
  execute: (ctx) => runJupiterOperation(ctx, "token-tag"),
};

export const jupiterTokenCategoryDef: CloudNodeDefinition = {
  type: "action:jupiter-token-category",
  label: "Jupiter Token Category",
  category: "action",
  description: "Fetch top traded, trending, or organic-score Jupiter token lists.",
  icon: "ArrowRightLeft",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "tokenCategory",
      label: "Category",
      type: "select",
      required: true,
      default: "toptraded",
      options: [
        { label: "Top Traded", value: "toptraded" },
        { label: "Top Trending", value: "toptrending" },
        { label: "Top Organic Score", value: "toporganicscore" },
      ],
    },
    {
      key: "tokenInterval",
      label: "Interval",
      type: "select",
      required: true,
      default: "24h",
      options: [
        { label: "5 minutes", value: "5m" },
        { label: "1 hour", value: "1h" },
        { label: "6 hours", value: "6h" },
        { label: "24 hours", value: "24h" },
      ],
    },
    {
      key: "tokenLimit",
      label: "Limit",
      type: "number",
      required: false,
      default: 30,
      description: "Number of tokens to return.",
    },
    jupiterCredentialProperty,
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "tokens" }],
  defaultData: {
    operation: "token-category",
    tokenCategory: "toptraded",
    tokenInterval: "24h",
    tokenLimit: 30,
    credentialId: "",
  },
  component: JupiterSwapNode,
  execute: (ctx) => runJupiterOperation(ctx, "token-category"),
};

export const jupiterRecentTokensDef: CloudNodeDefinition = {
  type: "action:jupiter-recent-tokens",
  label: "Jupiter Recent Tokens",
  category: "action",
  description: "Fetch Jupiter's default recent token list.",
  icon: "ArrowRightLeft",
  color: CATEGORY_COLORS.action,
  properties: [jupiterCredentialProperty],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "tokens" }],
  defaultData: { operation: "token-recent", credentialId: "" },
  component: JupiterSwapNode,
  execute: (ctx) => runJupiterOperation(ctx, "token-recent"),
};

export const jupiterPortfolioDef: CloudNodeDefinition = {
  type: "action:jupiter-portfolio",
  label: "Jupiter Portfolio",
  category: "action",
  description: "Fetch Jupiter portfolio positions for a wallet address.",
  icon: "ArrowRightLeft",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "walletAddress",
      label: "Wallet Address",
      type: "pubkey",
      required: false,
      description: "Wallet address. If blank, the selected Cloud wallet public key is used.",
      supportsExpressions: true,
    },
    {
      key: "walletId",
      label: "Wallet",
      type: "wallet-select",
      required: false,
      description: "Optional Cloud wallet used to resolve the public key.",
    },
    jupiterCredentialProperty,
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "positions" }],
  defaultData: { operation: "portfolio-positions", walletAddress: "", walletId: "", credentialId: "" },
  component: JupiterSwapNode,
  execute: (ctx) => runJupiterOperation(ctx, "portfolio-positions"),
};

const jupiterSwapQuoteProperties = [
  {
    key: "inputMint",
    label: "Input Token",
    type: "pubkey" as const,
    required: true,
    description: "Token mint to swap from.",
    placeholder: SOL_MINT,
    supportsExpressions: true,
  },
  {
    key: "outputMint",
    label: "Output Token",
    type: "pubkey" as const,
    required: true,
    description: "Token mint to swap to.",
    placeholder: USDC_MINT,
    supportsExpressions: true,
  },
  {
    key: "amount",
    label: "Amount",
    type: "number" as const,
    required: true,
    description: "Swap amount in smallest units.",
    supportsExpressions: true,
  },
  {
    key: "walletAddress",
    label: "Taker Address",
    type: "pubkey" as const,
    required: false,
    description: "Taker address. If blank, the selected Cloud wallet public key is used.",
    supportsExpressions: true,
  },
  {
    key: "walletId",
    label: "Wallet",
    type: "wallet-select" as const,
    required: false,
    description: "Optional Cloud wallet used to resolve the taker public key.",
  },
  {
    key: "slippageBps",
    label: "Slippage (bps)",
    type: "number" as const,
    required: false,
    default: 50,
    description: "Optional fixed slippage. Jupiter RTSE is applied automatically on /order when possible.",
  },
  {
    key: "receiver",
    label: "Receiver",
    type: "pubkey" as const,
    required: false,
    description: "Optional output receiver. This may restrict routing.",
    supportsExpressions: true,
  },
  {
    key: "payer",
    label: "Gasless Payer",
    type: "pubkey" as const,
    required: false,
    description: "Optional gasless payer. This restricts routing.",
    supportsExpressions: true,
  },
  {
    key: "referralAccount",
    label: "Referral Account",
    type: "pubkey" as const,
    required: false,
    description: "Optional Jupiter referral account.",
    supportsExpressions: true,
  },
  {
    key: "referralFee",
    label: "Referral Fee (bps)",
    type: "number" as const,
    required: false,
    description: "Optional referral fee in basis points.",
  },
  {
    key: "excludeRouters",
    label: "Exclude Routers",
    type: "text" as const,
    required: false,
    description: "Optional comma-separated routers to exclude, such as jupiterz.",
    supportsExpressions: true,
  },
  jupiterCredentialProperty,
];

const jupiterSwapBuildOnlyProperties = [
  {
    key: "mode",
    label: "Mode",
    type: "select" as const,
    required: false,
    default: "",
    description: "Router build mode. Fast reduces latency for known pairs.",
    options: [
      { label: "Default", value: "" },
      { label: "Fast", value: "fast" },
    ],
  },
  {
    key: "maxAccounts",
    label: "Max Accounts",
    type: "number" as const,
    required: false,
    description: "Optional account limit for reducing transaction size.",
  },
  {
    key: "platformFeeBps",
    label: "Platform Fee (bps)",
    type: "number" as const,
    required: false,
    description: "Optional platform fee basis points.",
  },
  {
    key: "tipAmount",
    label: "Tip Amount",
    type: "number" as const,
    required: false,
    description: "Optional lamport tip for Jupiter transaction submission.",
  },
  {
    key: "computeUnitPricePercentile",
    label: "CU Price Percentile",
    type: "text" as const,
    required: false,
    description: "Optional CU price percentile, such as medium, high, veryHigh, or 0-10000.",
    supportsExpressions: true,
  },
];

export const jupiterSwapOrderDef: CloudNodeDefinition = {
  type: "action:jupiter-swap-order",
  label: "Jupiter Swap Order",
  category: "action",
  description: "Prepare a Jupiter Swap API V2 order without signing.",
  icon: "ArrowRightLeft",
  color: CATEGORY_COLORS.action,
  properties: jupiterSwapQuoteProperties,
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "order" }],
  defaultData: {
    operation: "swap-order",
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    amount: "1000000",
    walletAddress: "",
    walletId: "",
    slippageBps: 50,
    credentialId: "",
  },
  component: JupiterSwapNode,
  execute: (ctx) => runJupiterOperation(ctx, "swap-order"),
};

export const jupiterSwapBuildDef: CloudNodeDefinition = {
  type: "action:jupiter-swap-build",
  label: "Jupiter Swap Build",
  category: "action",
  description: "Build Jupiter swap instructions without signing.",
  icon: "ArrowRightLeft",
  color: CATEGORY_COLORS.action,
  properties: [
    ...jupiterSwapQuoteProperties,
    ...jupiterSwapBuildOnlyProperties,
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "build" }],
  defaultData: {
    operation: "swap-build",
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    amount: "1000000",
    walletAddress: "",
    walletId: "",
    slippageBps: 50,
    credentialId: "",
  },
  component: JupiterSwapNode,
  execute: (ctx) => runJupiterOperation(ctx, "swap-build"),
};

export const jupiterSwapExecuteDef: CloudNodeDefinition = {
  type: "action:jupiter-swap-execute",
  label: "Jupiter Swap Execute",
  category: "action",
  description: "Sign a Jupiter Swap API V2 order transaction and execute it through Jupiter.",
  icon: "ArrowRightLeft",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "transactionBase64",
      label: "Order Transaction",
      type: "text",
      required: true,
      description: "Base64 transaction from Jupiter Swap Order. Supports expressions from a prior node.",
      placeholder: "{{ $json.jupiter.payload.transaction }}",
      supportsExpressions: true,
    },
    {
      key: "requestId",
      label: "Request ID",
      type: "text",
      required: true,
      description: "requestId from Jupiter Swap Order.",
      placeholder: "{{ $json.jupiter.payload.requestId }}",
      supportsExpressions: true,
    },
    {
      key: "lastValidBlockHeight",
      label: "Last Valid Block Height",
      type: "number",
      required: false,
      description: "Optional nonce validation height from the order response.",
      supportsExpressions: true,
    },
    {
      key: "walletId",
      label: "Wallet",
      type: "wallet-select",
      required: true,
      description: "Cloud wallet that signs the order transaction.",
    },
    jupiterCredentialProperty,
  ],
  inputs: [{ type: "main", label: "order" }],
  outputs: [{ type: "main", label: "execute" }],
  defaultData: {
    operation: "swap-execute",
    transactionBase64: "{{ $json.jupiter.payload.transaction }}",
    requestId: "{{ $json.jupiter.payload.requestId }}",
    lastValidBlockHeight: "",
    walletId: "",
    credentialId: "",
  },
  component: JupiterSwapNode,
  execute: (ctx) => runJupiterOperation(ctx, "swap-execute"),
};
