// Integration Pack Nodes — provider adapters for common Solana operations.

import React, { memo } from "react";
import { Database, FileJson, Satellite, ShieldCheck, Users } from "lucide-react";
import type { CloudFlowNodeData, CloudNodeDefinition, CredentialOperations } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";
import { assertSafeOutboundUrl } from "../security/outbound-url";

const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";
const PYTH_HERMES_BASE_URL = "https://hermes.pyth.network";
const PYTH_HERMES_PRICE_URL = `${PYTH_HERMES_BASE_URL}/v2/updates/price/latest`;
const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VE1xmCGdUFtYBXTc6JBAiN4LqfVq3";
const HELIUS_DAS_METHODS = new Set([
  "getAsset",
  "getAssetBatch",
  "getAssetProof",
  "getAssetProofBatch",
  "getAssetsByAuthority",
  "getAssetsByCreator",
  "getAssetsByGroup",
  "getAssetsByOwner",
  "getNftEditions",
  "getSignaturesForAsset",
  "getTokenAccounts",
  "searchAssets",
]);

type MetaplexAssetOperation =
  | "getAsset"
  | "getAssetProof"
  | "getAssetsByOwner"
  | "getAssetsByGroup"
  | "getAssetsByCreator"
  | "getAssetsByAuthority"
  | "searchAssets";

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

async function readErrorBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "";
  }
}

async function getCredentialData(
  credentials: CredentialOperations | undefined,
  credentialId: unknown,
  allowedTypes: string[],
): Promise<Record<string, unknown>> {
  if (typeof credentialId !== "string" || !credentialId) return {};
  const credential = await credentials?.get(credentialId, allowedTypes);
  if (!credential) {
    throw new Error(`Credential runtime is not available for ${allowedTypes.join("/")} integration`);
  }
  return credential.data;
}

function credentialHeaders(data: Record<string, unknown>): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof data.bearerToken === "string" && data.bearerToken) {
    headers.Authorization = `Bearer ${data.bearerToken}`;
  }
  if (typeof data.apiKey === "string" && data.apiKey) {
    const headerName =
      typeof data.apiKeyHeader === "string" && data.apiKeyHeader
        ? data.apiKeyHeader
        : "X-API-Key";
    headers[headerName] = data.apiKey;
  }
  if (data.headers && typeof data.headers === "object" && !Array.isArray(data.headers)) {
    for (const [key, value] of Object.entries(data.headers)) {
      if (value !== undefined && value !== null) headers[key] = String(value);
    }
  }
  return headers;
}

function resolveRpcUrl(params: Record<string, unknown>, credential: Record<string, unknown>): string {
  if (typeof params.rpcUrl === "string" && params.rpcUrl) return params.rpcUrl;
  if (typeof credential.rpcUrl === "string" && credential.rpcUrl) return credential.rpcUrl;
  if (typeof credential.apiKey === "string" && credential.apiKey) {
    return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(credential.apiKey)}`;
  }
  return getEnv("MAINNET_RPC_URL") ?? getEnv("NEXT_PUBLIC_SOLANA_RPC_URL") ?? DEFAULT_RPC_URL;
}

function parseJsonMaybe(value: unknown, fallback: unknown): unknown {
  if (typeof value !== "string") return value ?? fallback;
  if (!value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredString(params: Record<string, unknown>, key: string, label: string): string {
  const value = optionalString(params, key);
  if (!value) throw new Error(`${label} is required`);
  return value;
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function booleanFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return undefined;
}

function addBooleanFlag(target: Record<string, unknown>, key: string, value: unknown) {
  const parsed = booleanFlag(value);
  if (parsed !== undefined) target[key] = parsed;
}

function buildDasDisplayOptions(params: Record<string, unknown>) {
  const options: Record<string, unknown> = {};
  addBooleanFlag(options, "showFungible", params.showFungible);
  addBooleanFlag(options, "showNativeBalance", params.showNativeBalance);
  addBooleanFlag(options, "showCollectionMetadata", params.showCollectionMetadata);
  addBooleanFlag(options, "showUnverifiedCollections", params.showUnverifiedCollections);
  addBooleanFlag(options, "showInscription", params.showInscription);
  addBooleanFlag(options, "showGrandTotal", params.showGrandTotal);
  addBooleanFlag(options, "showZeroBalance", params.showZeroBalance);
  return Object.keys(options).length ? options : undefined;
}

function normalizeMetaplexOperation(value: unknown): MetaplexAssetOperation {
  const operation = typeof value === "string" ? value : "getAsset";
  if (
    operation === "getAsset" ||
    operation === "getAssetProof" ||
    operation === "getAssetsByOwner" ||
    operation === "getAssetsByGroup" ||
    operation === "getAssetsByCreator" ||
    operation === "getAssetsByAuthority" ||
    operation === "searchAssets"
  ) {
    return operation;
  }
  return "getAsset";
}

function buildMetaplexDasParams(params: Record<string, unknown>): {
  method: MetaplexAssetOperation;
  rpcParams: [Record<string, unknown>];
} {
  const method = normalizeMetaplexOperation(params.operation);
  const page = positiveInteger(params.page, 1);
  const limit = positiveInteger(params.limit, 50);
  const displayOptions = buildDasDisplayOptions(params);

  if (method === "getAsset") {
    const request: Record<string, unknown> = {
      id: requiredString(params, "assetId", "Asset ID"),
    };
    if (displayOptions) request.options = displayOptions;
    return { method, rpcParams: [request] };
  }

  if (method === "getAssetProof") {
    return {
      method,
      rpcParams: [{ id: requiredString(params, "assetId", "Asset ID") }],
    };
  }

  if (method === "getAssetsByOwner") {
    const request: Record<string, unknown> = {
      ownerAddress: requiredString(params, "ownerAddress", "Owner Address"),
      page,
      limit,
    };
    if (displayOptions) request.displayOptions = displayOptions;
    return { method, rpcParams: [request] };
  }

  if (method === "getAssetsByGroup") {
    return {
      method,
      rpcParams: [{
        groupKey: optionalString(params, "groupKey") ?? "collection",
        groupValue: requiredString(params, "groupValue", "Group Value"),
        page,
        limit,
      }],
    };
  }

  if (method === "getAssetsByCreator") {
    const request: Record<string, unknown> = {
      creatorAddress: requiredString(params, "creatorAddress", "Creator Address"),
      page,
      limit,
    };
    addBooleanFlag(request, "onlyVerified", params.onlyVerified);
    return { method, rpcParams: [request] };
  }

  if (method === "getAssetsByAuthority") {
    return {
      method,
      rpcParams: [{
        authorityAddress: requiredString(params, "authorityAddress", "Authority Address"),
        page,
        limit,
      }],
    };
  }

  const searchParams = parseJsonMaybe(params.searchParams, {});
  const request: Record<string, unknown> =
    searchParams && typeof searchParams === "object" && !Array.isArray(searchParams)
      ? { ...(searchParams as Record<string, unknown>) }
      : {};
  if (optionalString(params, "ownerAddress")) request.ownerAddress = optionalString(params, "ownerAddress");
  if (optionalString(params, "creatorAddress")) request.creatorAddress = optionalString(params, "creatorAddress");
  if (optionalString(params, "authorityAddress")) request.authorityAddress = optionalString(params, "authorityAddress");
  if (optionalString(params, "tokenType")) request.tokenType = optionalString(params, "tokenType");
  if (optionalString(params, "groupValue")) {
    request.grouping = [optionalString(params, "groupKey") ?? "collection", optionalString(params, "groupValue")];
  }
  const sortBy = optionalString(params, "sortBy");
  const sortDirection = optionalString(params, "sortDirection");
  if (sortBy && sortBy !== "none") {
    request.sortBy = { sortBy, sortDirection: sortDirection ?? "desc" };
  }
  request.page ??= page;
  request.limit ??= limit;
  if (displayOptions) request.options = displayOptions;
  return { method, rpcParams: [request] };
}

async function rpcCall<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
  signal: AbortSignal,
): Promise<T> {
  const url = assertSafeOutboundUrl(rpcUrl, { allowHttp: rpcUrl.startsWith("http://127.0.0.1") });
  const response = await requireFetch()(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "solstudio-cloud",
      method,
      params,
    }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`RPC request failed ${response.status} ${response.statusText}: ${await readErrorBody(response)}`);
  }
  const json = await response.json() as { result?: T; error?: { message?: string } };
  if (json.error) {
    throw new Error(`RPC error: ${json.error.message ?? JSON.stringify(json.error)}`);
  }
  return json.result as T;
}

function IntegrationCard({
  data,
  selected,
  icon,
  meta,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
  icon: React.ReactNode;
  meta: string;
}) {
  return (
    <CloudBaseNode data={data} selected={selected}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground/70">{icon}</span>
        <span className="truncate max-w-[120px] text-right font-mono text-[10px]">
          {meta || "configure"}
        </span>
      </div>
    </CloudBaseNode>
  );
}

export const OraclePriceNode = memo(function OraclePriceNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  const nodeData = data.data ?? {};
  const operation = String(nodeData.operation ?? "latest-price");
  const meta =
    operation === "feed-search"
      ? `pyth:${String(nodeData.query ?? "search")}`
      : `${nodeData.provider ?? "pyth"}:${String(nodeData.feedId ?? "").slice(0, 8)}`;

  return (
    <IntegrationCard
      data={data}
      selected={selected}
      icon={<Satellite size={12} />}
      meta={meta}
    />
  );
});

export const oraclePriceDef: CloudNodeDefinition = {
  type: "action:oracle-price",
  label: "Oracle Price",
  category: "action",
  description: "Fetch a Pyth or Switchboard price feed for workflow decisions.",
  icon: "Satellite",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "operation",
      label: "Operation",
      type: "select",
      required: true,
      default: "latest-price",
      description: "Oracle operation to run.",
      options: [
        { label: "Latest Price", value: "latest-price" },
        { label: "Pyth Feed Search", value: "feed-search" },
      ],
    },
    {
      key: "provider",
      label: "Provider",
      type: "select",
      required: true,
      default: "pyth",
      options: [
        { label: "Pyth", value: "pyth" },
        { label: "Switchboard", value: "switchboard" },
      ],
    },
    {
      key: "feedId",
      label: "Feed ID",
      type: "text",
      required: true,
      description: "Pyth price feed ID or Switchboard feed address.",
      supportsExpressions: true,
    },
    {
      key: "query",
      label: "Feed Search Query",
      type: "text",
      required: false,
      description: "Pyth feed search query, such as SOL, BTC, MSOL, or Crypto.SOL/USD.",
      supportsExpressions: true,
    },
    {
      key: "assetType",
      label: "Asset Type",
      type: "select",
      required: false,
      default: "crypto",
      options: [
        { label: "Any", value: "any" },
        { label: "Crypto", value: "crypto" },
        { label: "Equity", value: "equity" },
        { label: "FX", value: "fx" },
        { label: "Metal", value: "metal" },
        { label: "Rates", value: "rates" },
      ],
    },
    {
      key: "apiUrl",
      label: "Switchboard API URL",
      type: "text",
      required: false,
      description: "Optional URL template. Use {feedId} where the feed address should be inserted.",
      supportsExpressions: true,
    },
    {
      key: "credentialId",
      label: "Credential",
      type: "credential",
      required: false,
      credentialTypes: ["switchboard", "webhook"],
      description: "Optional headers/API key for Switchboard-compatible APIs.",
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "price" }],
  defaultData: { operation: "latest-price", provider: "pyth", feedId: "", query: "SOL", assetType: "crypto", apiUrl: "", credentialId: "" },
  component: OraclePriceNode,
  async execute(ctx) {
    const operation = String(ctx.params.operation || "latest-price");
    const provider = String(ctx.params.provider || "pyth");

    let oracle: Record<string, unknown>;
    if (provider === "pyth") {
      if (operation === "feed-search") {
        const query = requiredString(ctx.params, "query", "Feed Search Query");
        const assetType = optionalString(ctx.params, "assetType");
        const search = new URLSearchParams({ query });
        if (assetType && assetType !== "any") search.set("asset_type", assetType);
        const url = assertSafeOutboundUrl(`${PYTH_HERMES_BASE_URL}/v2/price_feeds?${search.toString()}`);
        const response = await requireFetch()(url.toString(), { signal: ctx.signal });
        if (!response.ok) {
          throw new Error(`Pyth feed search failed ${response.status} ${response.statusText}: ${await readErrorBody(response)}`);
        }
        oracle = {
          provider,
          operation,
          query,
          assetType: assetType && assetType !== "any" ? assetType : undefined,
          feeds: await response.json().catch(() => []),
          fetchedAt: new Date().toISOString(),
        };
        const inputItems = ctx.inputs[0] ?? [{ json: {} }];
        return inputItems.map((item) => ({
          ...item,
          json: { ...item.json, oracle },
        }));
      }

      const feedId = String(ctx.params.feedId || "");
      if (!feedId) throw new Error("feedId is required");
      const url = assertSafeOutboundUrl(`${PYTH_HERMES_PRICE_URL}?ids[]=${encodeURIComponent(feedId)}`);
      const response = await requireFetch()(url.toString(), { signal: ctx.signal });
      if (!response.ok) {
        throw new Error(`Pyth price request failed ${response.status} ${response.statusText}: ${await readErrorBody(response)}`);
      }
      const json = await response.json() as {
        parsed?: Array<{ id: string; price?: { price?: string; conf?: string; expo?: number; publish_time?: number } }>;
      };
      const parsed = json.parsed?.[0];
      if (!parsed?.price) throw new Error("Pyth response did not include a parsed price");
      const price = Number(parsed.price.price);
      const expo = Number(parsed.price.expo ?? 0);
      oracle = {
        provider,
        feedId,
        price: Number.isFinite(price) ? price * 10 ** expo : null,
        rawPrice: parsed.price.price,
        confidence: parsed.price.conf,
        exponent: expo,
        publishTime: parsed.price.publish_time,
        fetchedAt: new Date().toISOString(),
      };
    } else {
      if (operation !== "latest-price") {
        throw new Error("Switchboard provider only supports Latest Price through a configured API URL");
      }
      const feedId = String(ctx.params.feedId || "");
      if (!feedId) throw new Error("feedId is required");
      const credential = await getCredentialData(ctx.credentials, ctx.params.credentialId, ["switchboard", "webhook"]);
      const apiTemplate =
        String(ctx.params.apiUrl || "") ||
        String(credential.apiUrl || "");
      if (!apiTemplate) {
        throw new Error("Switchboard provider requires apiUrl or a credential with apiUrl");
      }
      const url = assertSafeOutboundUrl(apiTemplate.replace("{feedId}", encodeURIComponent(feedId)));
      const response = await requireFetch()(url.toString(), {
        headers: credentialHeaders(credential),
        signal: ctx.signal,
      });
      if (!response.ok) {
        throw new Error(`Switchboard request failed ${response.status} ${response.statusText}: ${await readErrorBody(response)}`);
      }
      oracle = {
        provider,
        feedId,
        response: await response.json().catch(() => null),
        fetchedAt: new Date().toISOString(),
      };
    }

    const inputItems = ctx.inputs[0] ?? [{ json: {} }];
    return inputItems.map((item) => ({
      ...item,
      json: { ...item.json, oracle },
    }));
  },
};

export const HeliusRpcNode = memo(function HeliusRpcNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  return (
    <IntegrationCard
      data={data}
      selected={selected}
      icon={<Database size={12} />}
      meta={String(data.data?.method ?? "getAsset")}
    />
  );
});

export const heliusRpcDef: CloudNodeDefinition = {
  type: "action:helius-rpc",
  label: "Helius RPC",
  category: "action",
  description: "Call Helius DAS or Solana JSON-RPC methods from a workflow.",
  icon: "Database",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "method",
      label: "RPC Method",
      type: "select",
      required: true,
      default: "getAsset",
      options: [
        { label: "getAsset", value: "getAsset" },
        { label: "getAssetBatch", value: "getAssetBatch" },
        { label: "getAssetProof", value: "getAssetProof" },
        { label: "getAssetProofBatch", value: "getAssetProofBatch" },
        { label: "getAssetsByAuthority", value: "getAssetsByAuthority" },
        { label: "getAssetsByCreator", value: "getAssetsByCreator" },
        { label: "getAssetsByGroup", value: "getAssetsByGroup" },
        { label: "getAssetsByOwner", value: "getAssetsByOwner" },
        { label: "getNftEditions", value: "getNftEditions" },
        { label: "getSignaturesForAsset", value: "getSignaturesForAsset" },
        { label: "getSignaturesForAddress", value: "getSignaturesForAddress" },
        { label: "getTokenAccounts", value: "getTokenAccounts" },
        { label: "searchAssets", value: "searchAssets" },
        { label: "getTransaction", value: "getTransaction" },
        { label: "Custom", value: "custom" },
      ],
    },
    { key: "customMethod", label: "Custom Method", type: "text", required: false },
    { key: "params", label: "Params JSON", type: "json", required: false, default: [] },
    {
      key: "credentialId",
      label: "Helius Credential",
      type: "credential",
      required: false,
      credentialType: "helius",
      description: "Credential with apiKey or rpcUrl.",
    },
    { key: "rpcUrl", label: "RPC URL Override", type: "text", required: false },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "result" }],
  defaultData: { method: "getAsset", customMethod: "", params: [], credentialId: "", rpcUrl: "" },
  component: HeliusRpcNode,
  async execute(ctx) {
    const credential = await getCredentialData(ctx.credentials, ctx.params.credentialId, ["helius"]);
    const selectedMethod = String(ctx.params.method || "getAsset");
    const method = selectedMethod === "custom" ? String(ctx.params.customMethod || "") : selectedMethod;
    if (!method) throw new Error("RPC method is required");
    if (HELIUS_DAS_METHODS.has(method) && !ctx.params.rpcUrl && !credential.rpcUrl && !credential.apiKey) {
      throw new Error("Helius DAS methods require a Helius credential or RPC URL");
    }
    const rawParams = parseJsonMaybe(ctx.params.params, []);
    const params = Array.isArray(rawParams) ? rawParams : [rawParams ?? {}];
    const result = await rpcCall(resolveRpcUrl(ctx.params, credential), method, params, ctx.signal);
    const inputItems = ctx.inputs[0] ?? [{ json: {} }];
    return inputItems.map((item) => ({ ...item, json: { ...item.json, helius: { method, result } } }));
  },
};

export const TokenAccountQueryNode = memo(function TokenAccountQueryNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  return (
    <IntegrationCard
      data={data}
      selected={selected}
      icon={<ShieldCheck size={12} />}
      meta={String(data.data?.tokenProgram ?? "spl")}
    />
  );
});

export const tokenAccountQueryDef: CloudNodeDefinition = {
  type: "action:token-account-query",
  label: "Token Account Query",
  category: "action",
  description: "Read SPL Token or Token-2022 accounts for an owner.",
  icon: "ShieldCheck",
  color: CATEGORY_COLORS.action,
  properties: [
    { key: "owner", label: "Owner", type: "pubkey", required: true, supportsExpressions: true },
    { key: "mint", label: "Mint Filter", type: "pubkey", required: false, supportsExpressions: true },
    {
      key: "tokenProgram",
      label: "Token Program",
      type: "select",
      required: true,
      default: "spl",
      options: [
        { label: "SPL Token", value: "spl" },
        { label: "Token-2022", value: "token2022" },
      ],
    },
    {
      key: "credentialId",
      label: "RPC Credential",
      type: "credential",
      required: false,
      credentialTypes: ["helius", "webhook"],
    },
    { key: "rpcUrl", label: "RPC URL Override", type: "text", required: false },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "accounts" }],
  defaultData: { owner: "", mint: "", tokenProgram: "spl", credentialId: "", rpcUrl: "" },
  component: TokenAccountQueryNode,
  async execute(ctx) {
    const owner = String(ctx.params.owner || "");
    if (!owner) throw new Error("owner is required");
    const credential = await getCredentialData(ctx.credentials, ctx.params.credentialId, ["helius", "webhook"]);
    const programId = ctx.params.tokenProgram === "token2022" ? TOKEN_2022_PROGRAM : SPL_TOKEN_PROGRAM;
    const result = await rpcCall<any>(
      resolveRpcUrl(ctx.params, credential),
      "getParsedTokenAccountsByOwner",
      [owner, { programId }, { encoding: "jsonParsed" }],
      ctx.signal,
    );
    const mint = typeof ctx.params.mint === "string" && ctx.params.mint ? ctx.params.mint : null;
    const accounts = Array.isArray(result?.value)
      ? result.value.filter((account: any) => {
          if (!mint) return true;
          return account?.account?.data?.parsed?.info?.mint === mint;
        })
      : [];
    const inputItems = ctx.inputs[0] ?? [{ json: {} }];
    return inputItems.map((item) => ({
      ...item,
      json: { ...item.json, tokenAccounts: { owner, programId, mint, count: accounts.length, accounts } },
    }));
  },
};

export const MetaplexAssetNode = memo(function MetaplexAssetNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  const nodeData = data.data ?? {};
  const operation = String(nodeData.operation ?? "getAsset");
  const primary =
    operation === "getAssetsByOwner" || operation === "searchAssets"
      ? String(nodeData.ownerAddress ?? "")
      : operation === "getAssetsByGroup"
        ? String(nodeData.groupValue ?? "")
        : operation === "getAssetsByCreator"
          ? String(nodeData.creatorAddress ?? "")
          : operation === "getAssetsByAuthority"
            ? String(nodeData.authorityAddress ?? "")
            : String(nodeData.assetId ?? "");

  return (
    <IntegrationCard
      data={data}
      selected={selected}
      icon={<FileJson size={12} />}
      meta={`${operation}:${primary}`.slice(0, 18)}
    />
  );
});

export const metaplexAssetDef: CloudNodeDefinition = {
  type: "action:metaplex-asset",
  label: "Metaplex Asset",
  category: "action",
  description: "Fetch NFT or compressed asset metadata through DAS-compatible RPC.",
  icon: "FileJson",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "operation",
      label: "DAS Operation",
      type: "select",
      required: true,
      default: "getAsset",
      options: [
        { label: "Get Asset", value: "getAsset" },
        { label: "Get Asset Proof", value: "getAssetProof" },
        { label: "Assets by Owner", value: "getAssetsByOwner" },
        { label: "Assets by Collection/Group", value: "getAssetsByGroup" },
        { label: "Assets by Creator", value: "getAssetsByCreator" },
        { label: "Assets by Authority", value: "getAssetsByAuthority" },
        { label: "Search Assets", value: "searchAssets" },
      ],
      description: "DAS method to call through Helius or another DAS-compatible RPC.",
    },
    { key: "assetId", label: "Asset ID", type: "pubkey", required: false, supportsExpressions: true },
    { key: "ownerAddress", label: "Owner Address", type: "pubkey", required: false, supportsExpressions: true },
    { key: "groupKey", label: "Group Key", type: "text", required: false, default: "collection", supportsExpressions: true },
    { key: "groupValue", label: "Group Value", type: "pubkey", required: false, supportsExpressions: true },
    { key: "creatorAddress", label: "Creator Address", type: "pubkey", required: false, supportsExpressions: true },
    { key: "authorityAddress", label: "Authority Address", type: "pubkey", required: false, supportsExpressions: true },
    {
      key: "tokenType",
      label: "Token Type",
      type: "select",
      required: false,
      default: "all",
      options: [
        { label: "All", value: "all" },
        { label: "Fungible", value: "fungible" },
        { label: "Non-fungible", value: "nonFungible" },
        { label: "Regular NFT", value: "regularNft" },
        { label: "Compressed NFT", value: "compressedNft" },
      ],
    },
    { key: "page", label: "Page", type: "number", required: false, default: 1 },
    { key: "limit", label: "Limit", type: "number", required: false, default: 50 },
    {
      key: "sortBy",
      label: "Sort By",
      type: "select",
      required: false,
      default: "none",
      options: [
        { label: "None", value: "none" },
        { label: "Created", value: "created" },
        { label: "Recent Action", value: "recent_action" },
        { label: "Updated", value: "updated" },
      ],
    },
    {
      key: "sortDirection",
      label: "Sort Direction",
      type: "select",
      required: false,
      default: "desc",
      options: [
        { label: "Descending", value: "desc" },
        { label: "Ascending", value: "asc" },
      ],
    },
    { key: "showFungible", label: "Show Fungible", type: "boolean", required: false, default: true },
    { key: "showNativeBalance", label: "Show Native Balance", type: "boolean", required: false, default: false },
    { key: "showCollectionMetadata", label: "Show Collection Metadata", type: "boolean", required: false, default: false },
    { key: "showUnverifiedCollections", label: "Show Unverified Collections", type: "boolean", required: false, default: false },
    { key: "showInscription", label: "Show Inscription", type: "boolean", required: false, default: false },
    { key: "showGrandTotal", label: "Show Grand Total", type: "boolean", required: false, default: false },
    { key: "showZeroBalance", label: "Show Zero Balance", type: "boolean", required: false, default: false },
    {
      key: "searchParams",
      label: "Advanced Search JSON",
      type: "json",
      required: false,
      default: {},
      description: "Optional raw searchAssets params. Explicit fields above override matching keys.",
    },
    { key: "credentialId", label: "Helius Credential", type: "credential", required: false, credentialType: "helius" },
    { key: "rpcUrl", label: "RPC URL Override", type: "text", required: false },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "asset" }],
  defaultData: {
    operation: "getAsset",
    assetId: "",
    ownerAddress: "",
    groupKey: "collection",
    groupValue: "",
    creatorAddress: "",
    authorityAddress: "",
    tokenType: "all",
    page: 1,
    limit: 50,
    sortBy: "none",
    sortDirection: "desc",
    showFungible: true,
    showNativeBalance: false,
    showCollectionMetadata: false,
    showUnverifiedCollections: false,
    showInscription: false,
    showGrandTotal: false,
    showZeroBalance: false,
    searchParams: {},
    credentialId: "",
    rpcUrl: "",
  },
  component: MetaplexAssetNode,
  async execute(ctx) {
    const credential = await getCredentialData(ctx.credentials, ctx.params.credentialId, ["helius"]);
    if (!ctx.params.rpcUrl && !credential.rpcUrl && !credential.apiKey) {
      throw new Error("Metaplex asset lookup requires a Helius credential or DAS-compatible RPC URL");
    }
    const { method, rpcParams } = buildMetaplexDasParams(ctx.params);
    const asset = await rpcCall(resolveRpcUrl(ctx.params, credential), method, rpcParams, ctx.signal);
    const inputItems = ctx.inputs[0] ?? [{ json: {} }];
    return inputItems.map((item) => ({
      ...item,
      json: { ...item.json, metaplexAsset: { method, params: rpcParams[0], result: asset } },
    }));
  },
};

export const SquadsProposalNode = memo(function SquadsProposalNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  return (
    <IntegrationCard
      data={data}
      selected={selected}
      icon={<Users size={12} />}
      meta={String(data.data?.apiUrl ?? "").replace(/^https?:\/\//, "").slice(0, 18)}
    />
  );
});

export const squadsProposalDef: CloudNodeDefinition = {
  type: "action:squads-proposal",
  label: "Squads Proposal",
  category: "action",
  description: "Send a prepared transaction/proposal payload to a Squads-compatible API.",
  icon: "Users",
  color: CATEGORY_COLORS.action,
  properties: [
    { key: "apiUrl", label: "Proposal API URL", type: "text", required: true, supportsExpressions: true },
    { key: "multisig", label: "Multisig Address", type: "pubkey", required: true, supportsExpressions: true },
    { key: "title", label: "Title", type: "text", required: true, supportsExpressions: true },
    { key: "description", label: "Description", type: "text", required: false, supportsExpressions: true },
    { key: "payload", label: "Proposal Payload", type: "json", required: false, default: {} },
    {
      key: "credentialId",
      label: "Credential",
      type: "credential",
      required: false,
      credentialTypes: ["squads", "webhook"],
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "proposal" }],
  defaultData: { apiUrl: "", multisig: "", title: "", description: "", payload: {}, credentialId: "" },
  component: SquadsProposalNode,
  async execute(ctx) {
    const apiUrl = String(ctx.params.apiUrl || "");
    const multisig = String(ctx.params.multisig || "");
    const title = String(ctx.params.title || "");
    if (!apiUrl || !multisig || !title) {
      throw new Error("apiUrl, multisig, and title are required");
    }
    const credential = await getCredentialData(ctx.credentials, ctx.params.credentialId, ["squads", "webhook"]);
    const url = assertSafeOutboundUrl(apiUrl);
    const response = await requireFetch()(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...credentialHeaders(credential) },
      body: JSON.stringify({
        multisig,
        title,
        description: ctx.params.description ?? "",
        payload: parseJsonMaybe(ctx.params.payload, {}),
        inputs: ctx.inputs[0]?.map((item) => item.json) ?? [],
      }),
      signal: ctx.signal,
    });
    if (!response.ok) {
      throw new Error(`Squads proposal request failed ${response.status} ${response.statusText}: ${await readErrorBody(response)}`);
    }
    const proposal = await response.json().catch(() => ({ ok: true }));
    const inputItems = ctx.inputs[0] ?? [{ json: {} }];
    return inputItems.map((item) => ({ ...item, json: { ...item.json, squadsProposal: proposal } }));
  },
};
