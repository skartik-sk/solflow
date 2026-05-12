// Jito nodes - bundle and tip helpers for priority Solana execution.

import React, { memo } from "react";
import { Zap } from "lucide-react";
import type { CloudFlowNodeData, CloudNodeDefinition, CredentialOperations, WorkflowItem } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";
import { assertSafeOutboundUrl, redactUrlSecrets } from "../security/outbound-url";

type JitoRegion =
  | "mainnet"
  | "amsterdam"
  | "dublin"
  | "frankfurt"
  | "london"
  | "ny"
  | "slc"
  | "singapore"
  | "tokyo"
  | "testnet";

const JITO_REGION_URLS: Record<JitoRegion, string> = {
  mainnet: "https://mainnet.block-engine.jito.wtf",
  amsterdam: "https://amsterdam.mainnet.block-engine.jito.wtf",
  dublin: "https://dublin.mainnet.block-engine.jito.wtf",
  frankfurt: "https://frankfurt.mainnet.block-engine.jito.wtf",
  london: "https://london.mainnet.block-engine.jito.wtf",
  ny: "https://ny.mainnet.block-engine.jito.wtf",
  slc: "https://slc.mainnet.block-engine.jito.wtf",
  singapore: "https://singapore.mainnet.block-engine.jito.wtf",
  tokyo: "https://tokyo.mainnet.block-engine.jito.wtf",
  testnet: "https://testnet.block-engine.jito.wtf",
};

const REGION_OPTIONS = Object.keys(JITO_REGION_URLS).map((region) => ({
  label: region,
  value: region,
}));
const JITO_TIP_FLOOR_URL = "https://bundles.jito.wtf/api/v1/bundles/tip_floor";
const MAX_RESPONSE_CHARS = 30_000;

function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseArray(value: unknown, label: string): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  if (typeof value !== "string") return [value];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error("not-array");
    return parsed;
  } catch {
    throw new Error(`${label} must be a JSON array`);
  }
}

async function getCredentialData(
  credentials: CredentialOperations | undefined,
  credentialId: unknown,
): Promise<Record<string, unknown>> {
  if (typeof credentialId !== "string" || !credentialId) return {};
  const credential = await credentials?.get(credentialId, ["jito"]);
  if (!credential) {
    throw new Error("Credential runtime is not available for this Jito node");
  }
  return credential.data;
}

function credentialString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function regionParam(value: unknown): JitoRegion {
  return typeof value === "string" && value in JITO_REGION_URLS
    ? (value as JitoRegion)
    : "mainnet";
}

function blockEngineUrl(params: Record<string, unknown>, credential: Record<string, unknown>, path: string): URL {
  const explicit =
    optionalString(params, "blockEngineUrl") ??
    credentialString(credential, "blockEngineUrl") ??
    credentialString(credential, "apiUrl") ??
    credentialString(credential, "baseUrl");
  const base = explicit ?? JITO_REGION_URLS[regionParam(params.region)];
  return assertSafeOutboundUrl(new URL(path, base).toString(), { allowHttp: false });
}

function jitoHeaders(credential: Record<string, unknown>): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const apiKey = credentialString(credential, "apiKey") ?? credentialString(credential, "uuid");
  if (apiKey) headers["x-jito-auth"] = apiKey;
  return headers;
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      /authorization|auth|api[-_]?key|token|secret/i.test(key) ? "[redacted]" : value,
    ]),
  );
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  return parseJsonText(text);
}

function parseJsonText(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, MAX_RESPONSE_CHARS);
  }
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "";
  }
}

function inputItems(ctx: Parameters<NonNullable<CloudNodeDefinition["execute"]>>[0]): WorkflowItem[] {
  return ctx.inputs?.[0] ?? [{ json: {} }];
}

async function jitoRpc(
  ctx: Parameters<NonNullable<CloudNodeDefinition["execute"]>>[0],
  method: string,
  params: unknown[],
  path = "/api/v1/bundles",
): Promise<{ url: URL; headers: Record<string, string>; payload: unknown }> {
  const credential = await getCredentialData(ctx.credentials, ctx.params.credentialId);
  const url = blockEngineUrl(ctx.params, credential, path);
  const headers = jitoHeaders(credential);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ctx.executionId || "solstudio-cloud",
      method,
      params,
    }),
    signal: ctx.signal,
  });
  const responseText = await response.text();
  const payload = parseJsonText(responseText) as { error?: { message?: string } } | null;
  if (!response.ok) {
    throw new Error(`Jito ${method} failed ${response.status} ${response.statusText}: ${responseText.slice(0, 500)}`);
  }
  if (payload && typeof payload === "object" && payload.error) {
    throw new Error(`Jito ${method} error: ${payload.error.message ?? JSON.stringify(payload.error)}`);
  }
  return { url, headers, payload };
}

function jitoResult(method: string, url: URL, headers: Record<string, string>, payload: unknown) {
  return {
    provider: "jito",
    method,
    endpoint: redactUrlSecrets(url),
    headers: redactHeaders(headers),
    result: payload && typeof payload === "object" && "result" in payload ? (payload as { result?: unknown }).result : payload,
    raw: payload,
    fetchedAt: new Date().toISOString(),
  };
}

export const JitoNode = memo(function JitoNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  const meta = String(data.data?.operation ?? data.label);
  return (
    <CloudBaseNode data={data} selected={selected}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground/70">
          <Zap size={12} />
        </span>
        <span className="max-w-[120px] truncate text-right font-mono text-[10px]">
          {meta}
        </span>
      </div>
    </CloudBaseNode>
  );
});

const jitoConnectionProperties = [
  {
    key: "region",
    label: "Region",
    type: "select" as const,
    required: false,
    default: "mainnet",
    options: REGION_OPTIONS,
  },
  {
    key: "blockEngineUrl",
    label: "Block Engine URL",
    type: "text" as const,
    required: false,
    description: "Optional full Jito Block Engine base URL override.",
  },
  {
    key: "credentialId",
    label: "Jito Credential",
    type: "credential" as const,
    required: false,
    credentialType: "jito",
    description: "Optional x-jito-auth UUID credential for authenticated limits.",
  },
];

export const jitoTipAccountsDef: CloudNodeDefinition = {
  type: "action:jito-tip-accounts",
  label: "Jito Tip Accounts",
  category: "action",
  description: "Fetch the Jito tip accounts that bundles should tip.",
  icon: "Zap",
  color: CATEGORY_COLORS.action,
  properties: jitoConnectionProperties,
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "tip accounts" }],
  defaultData: { operation: "getTipAccounts", region: "mainnet", blockEngineUrl: "", credentialId: "" },
  component: JitoNode,
  async execute(ctx) {
    const { url, headers, payload } = await jitoRpc(ctx, "getTipAccounts", [], "/api/v1/getTipAccounts");
    return inputItems(ctx).map((item) => ({ ...item, json: { ...item.json, jito: jitoResult("getTipAccounts", url, headers, payload) } }));
  },
};

export const jitoBundleStatusDef: CloudNodeDefinition = {
  type: "action:jito-bundle-status",
  label: "Jito Bundle Status",
  category: "action",
  description: "Check landed or in-flight statuses for Jito bundle IDs.",
  icon: "Zap",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "bundleIds",
      label: "Bundle IDs",
      type: "json",
      required: true,
      default: [],
      description: "JSON array of bundle IDs.",
      supportsExpressions: true,
    },
    {
      key: "statusMode",
      label: "Status Mode",
      type: "select",
      required: false,
      default: "landed",
      options: [
        { label: "Landed / Final", value: "landed" },
        { label: "In-flight", value: "inflight" },
      ],
    },
    ...jitoConnectionProperties,
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "status" }],
  defaultData: {
    operation: "bundle-status",
    bundleIds: [],
    statusMode: "landed",
    region: "mainnet",
    blockEngineUrl: "",
    credentialId: "",
  },
  component: JitoNode,
  async execute(ctx) {
    const bundleIds = parseArray(ctx.params.bundleIds, "Bundle IDs").map(String).filter(Boolean);
    if (!bundleIds.length) throw new Error("At least one bundle ID is required");
    const inflight = ctx.params.statusMode === "inflight";
    const method = inflight ? "getInflightBundleStatuses" : "getBundleStatuses";
    const { url, headers, payload } = await jitoRpc(ctx, method, [bundleIds]);
    return inputItems(ctx).map((item) => ({ ...item, json: { ...item.json, jito: jitoResult(method, url, headers, payload) } }));
  },
};

export const jitoSendBundleDef: CloudNodeDefinition = {
  type: "action:jito-send-bundle",
  label: "Jito Send Bundle",
  category: "action",
  description: "Submit up to five already-signed transactions to the Jito Block Engine.",
  icon: "Zap",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "transactions",
      label: "Signed Transactions",
      type: "json",
      required: true,
      default: [],
      description: "JSON array of base64/base58 signed transactions. The node does not sign transactions.",
      supportsExpressions: true,
    },
    {
      key: "encoding",
      label: "Encoding",
      type: "select",
      required: false,
      default: "base64",
      options: [
        { label: "Base64", value: "base64" },
        { label: "Base58", value: "base58" },
      ],
    },
    ...jitoConnectionProperties,
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "bundle" }],
  defaultData: {
    operation: "sendBundle",
    transactions: [],
    encoding: "base64",
    region: "mainnet",
    blockEngineUrl: "",
    credentialId: "",
  },
  component: JitoNode,
  async execute(ctx) {
    const transactions = parseArray(ctx.params.transactions, "Signed Transactions").map(String).filter(Boolean);
    if (!transactions.length || transactions.length > 5) {
      throw new Error("Jito Send Bundle requires 1 to 5 signed transactions");
    }
    const encoding = String(ctx.params.encoding || "base64");
    const { url, headers, payload } = await jitoRpc(ctx, "sendBundle", [transactions, { encoding }]);
    return inputItems(ctx).map((item) => ({ ...item, json: { ...item.json, jito: jitoResult("sendBundle", url, headers, payload) } }));
  },
};

export const jitoTipFloorDef: CloudNodeDefinition = {
  type: "action:jito-tip-floor",
  label: "Jito Tip Floor",
  category: "action",
  description: "Read recent Jito landed tip percentiles before building a bundle.",
  icon: "Zap",
  color: CATEGORY_COLORS.action,
  properties: [],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "tip floor" }],
  defaultData: { operation: "tip-floor" },
  component: JitoNode,
  async execute(ctx) {
    const url = assertSafeOutboundUrl(JITO_TIP_FLOOR_URL, { allowHttp: false });
    const response = await fetch(url.toString(), { signal: ctx.signal });
    if (!response.ok) {
      throw new Error(`Jito tip floor failed ${response.status} ${response.statusText}: ${await readErrorBody(response)}`);
    }
    const payload = await readJson(response);
    return inputItems(ctx).map((item) => ({
      ...item,
      json: {
        ...item.json,
        jito: {
          provider: "jito",
          method: "tip_floor",
          endpoint: url.toString(),
          result: payload,
          fetchedAt: new Date().toISOString(),
        },
      },
    }));
  },
};
