// Helius Webhook nodes - manage Helius realtime event sources.

import React, { memo } from "react";
import { Radio } from "lucide-react";
import type { CloudFlowNodeData, CloudNodeDefinition, CredentialOperations, WorkflowItem } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";
import { assertSafeOutboundUrl, redactUrlSecrets } from "../security/outbound-url";

const HELIUS_WEBHOOK_BASE_URL = "https://api-mainnet.helius-rpc.com";
const MAX_RESPONSE_CHARS = 20_000;

function getEnv(name: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[name];
}

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

function parseObject(value: unknown, label: string): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return undefined;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not-object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`${label} must be a JSON object`);
  }
}

async function credentialData(
  credentials: CredentialOperations | undefined,
  credentialId: unknown,
): Promise<Record<string, unknown>> {
  if (typeof credentialId !== "string" || !credentialId) return {};
  const credential = await credentials?.get(credentialId, ["helius"]);
  if (!credential) {
    throw new Error("Credential runtime is not available for this Helius webhook node");
  }
  return credential.data;
}

function credentialString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function heliusApiKey(credential: Record<string, unknown>): string {
  const apiKey = credentialString(credential, "apiKey") ?? getEnv("HELIUS_API_KEY");
  if (!apiKey) throw new Error("Helius webhook nodes require a Helius credential or HELIUS_API_KEY");
  return apiKey;
}

function heliusBaseUrl(params: Record<string, unknown>, credential: Record<string, unknown>): URL {
  const raw =
    optionalString(params, "apiUrl") ??
    credentialString(credential, "apiUrl") ??
    credentialString(credential, "baseUrl") ??
    HELIUS_WEBHOOK_BASE_URL;
  return assertSafeOutboundUrl(raw, { allowHttp: false });
}

function webhookUrl(baseUrl: URL, apiKey: string, path = "/v0/webhooks"): string {
  const url = new URL(path, baseUrl);
  url.searchParams.set("api-key", apiKey);
  return url.toString();
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
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

export const HeliusWebhookNode = memo(function HeliusWebhookNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  const operation = String(data.data?.operation ?? data.label);
  return (
    <CloudBaseNode data={data} selected={selected}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground/70">
          <Radio size={12} />
        </span>
        <span className="max-w-[120px] truncate text-right font-mono text-[10px]">
          {operation}
        </span>
      </div>
    </CloudBaseNode>
  );
});

export const heliusWebhookCreateDef: CloudNodeDefinition = {
  type: "action:helius-webhook-create",
  label: "Helius Webhook Create",
  category: "action",
  description: "Create a Helius webhook for realtime wallet, swap, transfer, or NFT events.",
  icon: "Radio",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "webhookUrl",
      label: "Webhook URL",
      type: "text",
      required: true,
      description: "HTTPS endpoint that Helius should POST events to.",
      supportsExpressions: true,
    },
    {
      key: "webhookType",
      label: "Webhook Type",
      type: "select",
      required: true,
      default: "enhanced",
      options: [
        { label: "Enhanced", value: "enhanced" },
        { label: "Raw", value: "raw" },
        { label: "Discord", value: "discord" },
        { label: "Enhanced Devnet", value: "enhancedDevnet" },
        { label: "Raw Devnet", value: "rawDevnet" },
        { label: "Discord Devnet", value: "discordDevnet" },
      ],
    },
    {
      key: "accountAddresses",
      label: "Account Addresses",
      type: "json",
      required: false,
      default: [],
      description: "JSON array of addresses to monitor.",
      supportsExpressions: true,
    },
    {
      key: "transactionTypes",
      label: "Transaction Types",
      type: "json",
      required: false,
      default: [],
      description: "JSON array such as [\"SWAP\", \"TRANSFER\", \"NFT_SALE\"]. Empty means all supported events.",
    },
    {
      key: "authHeader",
      label: "Outbound Auth Header",
      type: "text",
      required: false,
      description: "Optional Authorization header Helius sends to your webhook endpoint.",
    },
    {
      key: "encoding",
      label: "Encoding",
      type: "select",
      required: false,
      default: "",
      options: [
        { label: "Default", value: "" },
        { label: "JSON Parsed", value: "jsonParsed" },
        { label: "Base64", value: "base64" },
      ],
    },
    {
      key: "txnStatus",
      label: "Transaction Status",
      type: "select",
      required: false,
      default: "",
      options: [
        { label: "Default", value: "" },
        { label: "All", value: "all" },
        { label: "Success", value: "success" },
        { label: "Failed", value: "failed" },
      ],
    },
    { key: "extraBody", label: "Extra Body JSON", type: "json", required: false, default: {} },
    {
      key: "credentialId",
      label: "Helius Credential",
      type: "credential",
      required: false,
      credentialType: "helius",
      description: "Credential with apiKey.",
    },
    { key: "apiUrl", label: "API URL Override", type: "text", required: false },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "webhook" }],
  defaultData: {
    operation: "create",
    webhookUrl: "",
    webhookType: "enhanced",
    accountAddresses: [],
    transactionTypes: [],
    authHeader: "",
    encoding: "",
    txnStatus: "",
    extraBody: {},
    credentialId: "",
    apiUrl: "",
  },
  component: HeliusWebhookNode,
  async execute(ctx) {
    const credential = await credentialData(ctx.credentials, ctx.params.credentialId);
    const url = webhookUrl(heliusBaseUrl(ctx.params, credential), heliusApiKey(credential));
    const targetUrl = optionalString(ctx.params, "webhookUrl");
    if (!targetUrl) throw new Error("Webhook URL is required");
    assertSafeOutboundUrl(targetUrl, { allowHttp: false });

    const body: Record<string, unknown> = {
      ...(parseObject(ctx.params.extraBody, "Extra Body JSON") ?? {}),
      webhookURL: targetUrl,
      webhookType: String(ctx.params.webhookType || "enhanced"),
    };
    const accountAddresses = parseArray(ctx.params.accountAddresses, "Account Addresses");
    const transactionTypes = parseArray(ctx.params.transactionTypes, "Transaction Types");
    if (accountAddresses.length) body.accountAddresses = accountAddresses;
    if (transactionTypes.length) body.transactionTypes = transactionTypes;
    const authHeader = optionalString(ctx.params, "authHeader");
    const encoding = optionalString(ctx.params, "encoding");
    const txnStatus = optionalString(ctx.params, "txnStatus");
    if (authHeader) body.authHeader = authHeader;
    if (encoding) body.encoding = encoding;
    if (txnStatus) body.txnStatus = txnStatus;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctx.signal,
    });
    if (!response.ok) {
      throw new Error(`Helius webhook create failed ${response.status} ${response.statusText}: ${await readErrorBody(response)}`);
    }
    const payload = await readJson(response);
    return inputItems(ctx).map((item) => ({
      ...item,
      json: {
        ...item.json,
        heliusWebhook: {
          operation: "create",
          endpoint: redactUrlSecrets(url),
          webhookUrl: redactUrlSecrets(targetUrl),
          response: payload,
          createdAt: new Date().toISOString(),
        },
      },
    }));
  },
};

export const heliusWebhookListDef: CloudNodeDefinition = {
  type: "action:helius-webhook-list",
  label: "Helius Webhook List",
  category: "action",
  description: "List webhooks configured for a Helius API key.",
  icon: "Radio",
  color: CATEGORY_COLORS.action,
  properties: [
    { key: "credentialId", label: "Helius Credential", type: "credential", required: false, credentialType: "helius" },
    { key: "apiUrl", label: "API URL Override", type: "text", required: false },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "webhooks" }],
  defaultData: { operation: "list", credentialId: "", apiUrl: "" },
  component: HeliusWebhookNode,
  async execute(ctx) {
    const credential = await credentialData(ctx.credentials, ctx.params.credentialId);
    const url = webhookUrl(heliusBaseUrl(ctx.params, credential), heliusApiKey(credential));
    const response = await fetch(url, { signal: ctx.signal });
    if (!response.ok) {
      throw new Error(`Helius webhook list failed ${response.status} ${response.statusText}: ${await readErrorBody(response)}`);
    }
    const payload = await readJson(response);
    return inputItems(ctx).map((item) => ({
      ...item,
      json: {
        ...item.json,
        heliusWebhook: {
          operation: "list",
          endpoint: redactUrlSecrets(url),
          count: Array.isArray(payload) ? payload.length : null,
          webhooks: payload,
          fetchedAt: new Date().toISOString(),
        },
      },
    }));
  },
};

export const heliusWebhookDeleteDef: CloudNodeDefinition = {
  type: "action:helius-webhook-delete",
  label: "Helius Webhook Delete",
  category: "action",
  description: "Delete a Helius webhook by ID.",
  icon: "Radio",
  color: CATEGORY_COLORS.action,
  properties: [
    { key: "webhookId", label: "Webhook ID", type: "text", required: true, supportsExpressions: true },
    { key: "credentialId", label: "Helius Credential", type: "credential", required: false, credentialType: "helius" },
    { key: "apiUrl", label: "API URL Override", type: "text", required: false },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "delete" }],
  defaultData: { operation: "delete", webhookId: "", credentialId: "", apiUrl: "" },
  component: HeliusWebhookNode,
  async execute(ctx) {
    const webhookId = optionalString(ctx.params, "webhookId");
    if (!webhookId) throw new Error("Webhook ID is required");
    const credential = await credentialData(ctx.credentials, ctx.params.credentialId);
    const url = webhookUrl(heliusBaseUrl(ctx.params, credential), heliusApiKey(credential), `/v0/webhooks/${encodeURIComponent(webhookId)}`);
    const response = await fetch(url, { method: "DELETE", signal: ctx.signal });
    if (!response.ok) {
      throw new Error(`Helius webhook delete failed ${response.status} ${response.statusText}: ${await readErrorBody(response)}`);
    }
    const payload = await readJson(response);
    return inputItems(ctx).map((item) => ({
      ...item,
      json: {
        ...item.json,
        heliusWebhook: {
          operation: "delete",
          webhookId,
          endpoint: redactUrlSecrets(url),
          response: payload,
          deletedAt: new Date().toISOString(),
        },
      },
    }));
  },
};
