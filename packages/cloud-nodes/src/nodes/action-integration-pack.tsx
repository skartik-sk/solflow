// Integration Pack Nodes — provider adapters for common Solana operations.

import React, { memo } from "react";
import { Database, FileJson, Satellite, ShieldCheck, Users } from "lucide-react";
import type { CloudFlowNodeData, CloudNodeDefinition, CredentialOperations } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";
import { assertSafeOutboundUrl } from "../security/outbound-url";

const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";
const PYTH_HERMES_URL = "https://hermes.pyth.network/v2/updates/price/latest";
const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VE1xmCGdUFtYBXTc6JBAiN4LqfVq3";

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
  return (
    <IntegrationCard
      data={data}
      selected={selected}
      icon={<Satellite size={12} />}
      meta={`${data.data?.provider ?? "pyth"}:${String(data.data?.feedId ?? "").slice(0, 8)}`}
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
  defaultData: { provider: "pyth", feedId: "", apiUrl: "", credentialId: "" },
  component: OraclePriceNode,
  async execute(ctx) {
    const provider = String(ctx.params.provider || "pyth");
    const feedId = String(ctx.params.feedId || "");
    if (!feedId) throw new Error("feedId is required");

    let oracle: Record<string, unknown>;
    if (provider === "pyth") {
      const url = assertSafeOutboundUrl(`${PYTH_HERMES_URL}?ids[]=${encodeURIComponent(feedId)}`);
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
        { label: "getAssetsByOwner", value: "getAssetsByOwner" },
        { label: "getSignaturesForAddress", value: "getSignaturesForAddress" },
        { label: "getTokenAccounts", value: "getTokenAccounts" },
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
    if (
      ["getAsset", "getAssetsByOwner", "getTokenAccounts"].includes(method) &&
      !ctx.params.rpcUrl &&
      !credential.rpcUrl &&
      !credential.apiKey
    ) {
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
  return (
    <IntegrationCard
      data={data}
      selected={selected}
      icon={<FileJson size={12} />}
      meta={String(data.data?.assetId ?? "").slice(0, 10)}
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
    { key: "assetId", label: "Asset ID", type: "pubkey", required: true, supportsExpressions: true },
    { key: "credentialId", label: "Helius Credential", type: "credential", required: false, credentialType: "helius" },
    { key: "rpcUrl", label: "RPC URL Override", type: "text", required: false },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "asset" }],
  defaultData: { assetId: "", credentialId: "", rpcUrl: "" },
  component: MetaplexAssetNode,
  async execute(ctx) {
    const assetId = String(ctx.params.assetId || "");
    if (!assetId) throw new Error("assetId is required");
    const credential = await getCredentialData(ctx.credentials, ctx.params.credentialId, ["helius"]);
    if (!ctx.params.rpcUrl && !credential.rpcUrl && !credential.apiKey) {
      throw new Error("Metaplex asset lookup requires a Helius credential or DAS-compatible RPC URL");
    }
    const asset = await rpcCall(resolveRpcUrl(ctx.params, credential), "getAsset", [{ id: assetId }], ctx.signal);
    const inputItems = ctx.inputs[0] ?? [{ json: {} }];
    return inputItems.map((item) => ({ ...item, json: { ...item.json, metaplexAsset: asset } }));
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
