// Solana RPC action - standard JSON-RPC calls through public or private endpoints.

import React, { memo } from "react";
import { Database } from "lucide-react";
import type { CloudFlowNodeData, CloudNodeDefinition, CredentialOperations, WorkflowItem } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";
import { assertSafeOutboundUrl, redactUrlSecrets } from "../security/outbound-url";

const PUBLIC_MAINNET_RPC = "https://api.mainnet-beta.solana.com";
const PUBLIC_DEVNET_RPC = "https://api.devnet.solana.com";
const MAX_RESPONSE_CHARS = 50_000;

const COMMON_SOLANA_RPC_METHODS = [
  "getHealth",
  "getVersion",
  "getSlot",
  "getBlockHeight",
  "getLatestBlockhash",
  "getBalance",
  "getAccountInfo",
  "getMultipleAccounts",
  "getTransaction",
  "getSignatureStatuses",
  "getSignaturesForAddress",
  "getTokenAccountsByOwner",
  "getProgramAccounts",
  "simulateTransaction",
  "sendTransaction",
  "custom",
].map((method) => ({ label: method, value: method }));

type RpcProvider =
  | "public-mainnet"
  | "public-devnet"
  | "rpcfast"
  | "helius"
  | "quicknode"
  | "alchemy"
  | "triton"
  | "custom";

function providerParam(value: unknown): RpcProvider {
  if (
    value === "public-devnet" ||
    value === "rpcfast" ||
    value === "helius" ||
    value === "quicknode" ||
    value === "alchemy" ||
    value === "triton" ||
    value === "custom"
  ) {
    return value;
  }
  return "public-mainnet";
}

function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseParams(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  if (typeof value !== "string") return [value];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    throw new Error("Params JSON must be a JSON array");
  }
}

function getEnv(name: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[name];
}

async function getCredentialData(
  credentials: CredentialOperations | undefined,
  credentialId: unknown,
): Promise<Record<string, unknown>> {
  if (typeof credentialId !== "string" || !credentialId) return {};
  const credential = await credentials?.get(credentialId, [
    "rpcfast",
    "helius",
    "quicknode",
    "alchemy",
    "triton",
    "webhook",
  ]);
  if (!credential) {
    throw new Error("Credential runtime is not available for this Solana RPC node");
  }
  return credential.data;
}

function credentialString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveRpcUrl(
  params: Record<string, unknown>,
  credential: Record<string, unknown>,
): string {
  const provider = providerParam(params.provider);
  const apiKey = credentialString(credential, "apiKey");
  const explicit =
    optionalString(params, "rpcUrl") ??
    credentialString(credential, "rpcUrl") ??
    credentialString(credential, "apiUrl") ??
    credentialString(credential, "baseUrl") ??
    credentialString(credential, "url");

  if (explicit) return apiKey ? explicit.replace("{apiKey}", encodeURIComponent(apiKey)) : explicit;
  if (provider === "public-devnet") return PUBLIC_DEVNET_RPC;
  if (provider === "public-mainnet") return getEnv("MAINNET_RPC_URL") ?? getEnv("NEXT_PUBLIC_SOLANA_RPC_URL") ?? PUBLIC_MAINNET_RPC;
  if (provider === "helius") {
    const fromEnv = getEnv("HELIUS_RPC_URL");
    if (fromEnv) return apiKey ? fromEnv.replace("{apiKey}", encodeURIComponent(apiKey)) : fromEnv;
    if (apiKey) return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(apiKey)}`;
    throw new Error("Helius RPC requires a Helius API key, RPC URL, or HELIUS_RPC_URL");
  }
  if (provider === "rpcfast") {
    const fromEnv = getEnv("RPCFAST_RPC_URL");
    if (fromEnv) return apiKey ? fromEnv.replace("{apiKey}", encodeURIComponent(apiKey)) : fromEnv;
    throw new Error("RPCFast requires an HTTPS endpoint from the RPCFast dashboard or RPCFAST_RPC_URL");
  }
  if (provider === "quicknode") {
    const fromEnv = getEnv("QUICKNODE_SOLANA_RPC_URL") ?? getEnv("QUICKNODE_RPC_URL");
    if (fromEnv) return apiKey ? fromEnv.replace("{apiKey}", encodeURIComponent(apiKey)) : fromEnv;
    throw new Error("QuickNode requires the Solana endpoint URL from the dashboard or QUICKNODE_SOLANA_RPC_URL");
  }
  if (provider === "alchemy") {
    const fromEnv = getEnv("ALCHEMY_SOLANA_RPC_URL");
    if (fromEnv) return apiKey ? fromEnv.replace("{apiKey}", encodeURIComponent(apiKey)) : fromEnv;
    if (apiKey) return `https://solana-mainnet.g.alchemy.com/v2/${encodeURIComponent(apiKey)}`;
    throw new Error("Alchemy requires an API key, RPC URL, or ALCHEMY_SOLANA_RPC_URL");
  }
  if (provider === "triton") {
    const fromEnv = getEnv("TRITON_SOLANA_RPC_URL") ?? getEnv("TRITON_RPC_URL");
    if (fromEnv) return apiKey ? fromEnv.replace("{apiKey}", encodeURIComponent(apiKey)) : fromEnv;
    throw new Error("Triton requires the Solana endpoint URL or TRITON_SOLANA_RPC_URL");
  }
  throw new Error("Custom RPC requires an RPC URL");
}

function rpcHeaders(credential: Record<string, unknown>): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const bearerToken = credentialString(credential, "bearerToken");
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

  const apiKey = credentialString(credential, "apiKey");
  const apiKeyHeader = credentialString(credential, "apiKeyHeader");
  if (apiKey && apiKeyHeader) headers[apiKeyHeader] = apiKey;

  const customHeaders = credential.headers;
  if (customHeaders && typeof customHeaders === "object" && !Array.isArray(customHeaders)) {
    for (const [key, value] of Object.entries(customHeaders)) {
      if (value !== undefined && value !== null) headers[key] = String(value);
    }
  }

  return headers;
}

async function parseRpcResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, MAX_RESPONSE_CHARS);
  }
}

function inputItems(ctx: Parameters<NonNullable<CloudNodeDefinition["execute"]>>[0]): WorkflowItem[] {
  return ctx.inputs?.[0] ?? [{ json: {} }];
}

export const SolanaRpcNode = memo(function SolanaRpcNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  const provider = String(data.data?.provider ?? "public-mainnet");
  const method = String(data.data?.method ?? "getHealth");
  return (
    <CloudBaseNode data={data} selected={selected}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground/70">
          <Database size={12} />
        </span>
        <span className="max-w-[120px] truncate text-right font-mono text-[10px]">
          {provider}:{method}
        </span>
      </div>
    </CloudBaseNode>
  );
});

export const solanaRpcDef: CloudNodeDefinition = {
  type: "action:solana-rpc",
  label: "Solana RPC",
  category: "action",
  description: "Call standard Solana JSON-RPC through public RPC, Helius, RPCFast, QuickNode, Alchemy, Triton, or a custom endpoint.",
  icon: "Database",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "provider",
      label: "Provider",
      type: "select",
      required: true,
      default: "public-mainnet",
      options: [
        { label: "Public Mainnet", value: "public-mainnet" },
        { label: "Public Devnet", value: "public-devnet" },
        { label: "Helius", value: "helius" },
        { label: "RPCFast", value: "rpcfast" },
        { label: "QuickNode", value: "quicknode" },
        { label: "Alchemy", value: "alchemy" },
        { label: "Triton", value: "triton" },
        { label: "Custom RPC", value: "custom" },
      ],
    },
    {
      key: "rpcUrl",
      label: "RPC URL",
      type: "text",
      required: false,
      description: "HTTPS JSON-RPC endpoint. Paste the provider endpoint from the dashboard, optionally with {apiKey}.",
      supportsExpressions: true,
    },
    {
      key: "credentialId",
      label: "Credential",
      type: "credential",
      required: false,
      credentialTypes: ["rpcfast", "helius", "quicknode", "alchemy", "triton", "webhook"],
      description: "Optional provider credential or custom header credential.",
    },
    {
      key: "method",
      label: "Method",
      type: "select",
      required: true,
      default: "getHealth",
      options: COMMON_SOLANA_RPC_METHODS,
    },
    {
      key: "customMethod",
      label: "Custom Method",
      type: "text",
      required: false,
      description: "Used only when Method is custom.",
      supportsExpressions: true,
    },
    {
      key: "params",
      label: "Params JSON",
      type: "json",
      required: false,
      default: [],
      description: "JSON-RPC params array, for example [\"wallet\", {\"encoding\":\"jsonParsed\"}].",
      supportsExpressions: true,
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "result" }],
  defaultData: {
    provider: "public-mainnet",
    rpcUrl: "",
    credentialId: "",
    method: "getHealth",
    customMethod: "",
    params: [],
  },
  component: SolanaRpcNode,
  async execute(ctx) {
    const credential = await getCredentialData(ctx.credentials, ctx.params.credentialId);
    const rpcUrl = assertSafeOutboundUrl(resolveRpcUrl(ctx.params, credential), { allowHttp: false });
    const method = String(ctx.params.method || "getHealth") === "custom"
      ? optionalString(ctx.params, "customMethod")
      : String(ctx.params.method || "getHealth");
    if (!method) throw new Error("Custom RPC method is required");
    const params = parseParams(ctx.params.params);
    const response = await fetch(rpcUrl.toString(), {
      method: "POST",
      headers: rpcHeaders(credential),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ctx.executionId || "solstudio-cloud",
        method,
        params,
      }),
      signal: ctx.signal,
    });

    const payload = await parseRpcResponse(response) as {
      result?: unknown;
      error?: { message?: string; code?: number };
    } | string | null;
    if (!response.ok) {
      throw new Error(`Solana RPC request failed ${response.status} ${response.statusText}`);
    }
    if (payload && typeof payload === "object" && "error" in payload && payload.error) {
      throw new Error(`Solana RPC error: ${payload.error.message ?? JSON.stringify(payload.error)}`);
    }

    const solanaRpc = {
      provider: providerParam(ctx.params.provider),
      method,
      params,
      endpoint: redactUrlSecrets(rpcUrl),
      result: payload && typeof payload === "object" && "result" in payload ? payload.result : payload,
      raw: payload,
      fetchedAt: new Date().toISOString(),
    };

    return inputItems(ctx).map((item) => ({
      ...item,
      json: { ...item.json, solanaRpc },
    }));
  },
};
