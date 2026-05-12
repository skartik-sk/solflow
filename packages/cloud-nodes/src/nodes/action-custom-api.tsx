// Custom API Request - generic HTTP action that can sit in the middle of a workflow.

import React, { memo } from "react";
import { Send } from "lucide-react";
import type { CloudFlowNodeData, CloudNodeDefinition, WorkflowItem } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";
import { assertSafeOutboundUrl, redactUrlSecrets } from "../security/outbound-url";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_CHARS = 20_000;

function normalizeHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return {};
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined && value !== null) normalized[key] = String(value);
  }
  return normalized;
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    redacted[key] = /authorization|api[-_]?key|[-_]?key$|token|secret|cookie/i.test(key)
      ? "[redacted]"
      : value;
  }
  return redacted;
}

function prepareRequestBody(body: unknown, headers: Record<string, string>): BodyInit | undefined {
  if (body === undefined || body === null || body === "") return undefined;
  if (typeof body === "string") return body;
  if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }
  return JSON.stringify(body);
}

function parseTimeout(value: unknown): number {
  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.floor(timeout), MAX_TIMEOUT_MS);
}

function safeOutputField(value: unknown): string {
  const field = typeof value === "string" && value.trim() ? value.trim() : "customApi";
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(field) ? field : "customApi";
}

async function credentialHeaders(ctx: {
  params: Record<string, unknown>;
  credentials?: {
    get(id: string, allowedTypes?: string[]): Promise<{ data: Record<string, unknown> }>;
  };
}): Promise<Record<string, string>> {
  const credentialId = ctx.params.credentialId as string | undefined;
  if (!credentialId) return {};

  const credential = await ctx.credentials?.get(credentialId, ["webhook"]);
  if (!credential) {
    throw new Error("Credential runtime is not available for this Custom API node");
  }

  const headers = normalizeHeaders(credential.data.headers);
  const bearerToken = credential.data.bearerToken;
  if (typeof bearerToken === "string" && bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

  const apiKey = credential.data.apiKey;
  const apiKeyHeader = credential.data.apiKeyHeader;
  if (typeof apiKey === "string" && apiKey) {
    headers[typeof apiKeyHeader === "string" && apiKeyHeader ? apiKeyHeader : "X-API-Key"] = apiKey;
  }

  return headers;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (!text) return null;
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text.slice(0, MAX_RESPONSE_CHARS);
    }
  }
  return text.slice(0, MAX_RESPONSE_CHARS);
}

function inputItems(ctx: Parameters<NonNullable<CloudNodeDefinition["execute"]>>[0]): WorkflowItem[] {
  return ctx.inputs?.[0] ?? [{ json: {} }];
}

export const CustomApiNode = memo(function CustomApiNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  const method = (data.data?.method as string) || "GET";
  const url = (data.data?.url as string) || "";
  return (
    <CloudBaseNode data={data} selected={selected}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground/70">{method}</span>
        <span className="max-w-[120px] truncate text-right font-mono text-[10px]">
          {url ? url.replace(/^https?:\/\//, "").slice(0, 22) : "custom"}
        </span>
      </div>
    </CloudBaseNode>
  );
});

export const customApiDef: CloudNodeDefinition = {
  type: "action:custom-api",
  label: "Custom API Request",
  category: "action",
  description: "Call any HTTPS API and pass the response to later workflow nodes.",
  icon: "Send",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "url",
      label: "URL",
      type: "text",
      required: true,
      placeholder: "https://api.example.com/endpoint",
      supportsExpressions: true,
    },
    {
      key: "method",
      label: "Method",
      type: "select",
      required: true,
      default: "GET",
      options: [
        { label: "GET", value: "GET" },
        { label: "POST", value: "POST" },
        { label: "PUT", value: "PUT" },
        { label: "PATCH", value: "PATCH" },
        { label: "DELETE", value: "DELETE" },
      ],
    },
    {
      key: "headers",
      label: "Headers (JSON)",
      type: "json",
      required: false,
      default: {},
      description: "Static request headers. Use credentials for secrets.",
    },
    {
      key: "credentialId",
      label: "Credential",
      type: "credential",
      required: false,
      credentialType: "webhook",
      description: "Optional bearer token, API key, or custom headers.",
    },
    {
      key: "body",
      label: "Body",
      type: "expression",
      required: false,
      supportsExpressions: true,
      description: "Request body. Use {{ $json }} to pass prior node data.",
    },
    {
      key: "outputField",
      label: "Output Field",
      type: "text",
      required: false,
      default: "customApi",
      description: "JSON field where the response is stored.",
    },
    {
      key: "timeoutMs",
      label: "Timeout",
      type: "duration",
      required: false,
      default: DEFAULT_TIMEOUT_MS,
      description: "Maximum request time in milliseconds. Capped at 60000ms.",
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "response" }],
  defaultData: {
    url: "",
    method: "GET",
    headers: {},
    credentialId: "",
    body: "",
    outputField: "customApi",
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  component: CustomApiNode,
  async execute(ctx) {
    const rawUrl = typeof ctx.params.url === "string" ? ctx.params.url.trim() : "";
    if (!rawUrl) throw new Error("URL is required");
    const url = assertSafeOutboundUrl(rawUrl, { allowHttp: false });
    const method = String(ctx.params.method || "GET").toUpperCase();
    const headers = {
      ...(await credentialHeaders(ctx)),
      ...normalizeHeaders(ctx.params.headers),
    };
    const timeoutMs = parseTimeout(ctx.params.timeoutMs);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    ctx.signal.addEventListener("abort", () => controller.abort(), { once: true });

    const canHaveBody = !["GET", "HEAD"].includes(method);
    const response = await fetch(url.toString(), {
      method,
      headers,
      body: canHaveBody ? prepareRequestBody(ctx.params.body, headers) : undefined,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const body = await readResponseBody(response);
    if (!response.ok) {
      throw new Error(`Custom API request failed ${response.status} ${response.statusText}`);
    }

    const output = {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      url: redactUrlSecrets(response.url || url.toString()),
      method,
      headers: redactHeaders(headers),
      body,
      fetchedAt: new Date().toISOString(),
    };
    const field = safeOutputField(ctx.params.outputField);
    return inputItems(ctx).map((item) => ({
      ...item,
      json: { ...item.json, [field]: output },
    }));
  },
};
