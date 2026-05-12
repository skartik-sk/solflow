// Webhook Output Node — sends HTTP requests to external URLs.

import React, { memo } from "react";
import { Send } from "lucide-react";
import type { CloudNodeDefinition, CloudFlowNodeData } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";
import { assertSafeOutboundUrl, redactUrlSecrets } from "../security/outbound-url";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_CHARS = 10_000;

function normalizeHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object" || Array.isArray(headers))
    return {};
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) continue;
    normalized[key] = String(value);
  }
  return normalized;
}

function redactHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/authorization|api[-_]?key|[-_]?key$|token|secret|cookie/i.test(key)) {
      redacted[key] = "[redacted]";
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function prepareRequestBody(
  body: unknown,
  headers: Record<string, string>,
): BodyInit | undefined {
  if (body === undefined || body === null || body === "") return undefined;
  if (typeof body === "string") return body;
  if (
    !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")
  ) {
    headers["Content-Type"] = "application/json";
  }
  return JSON.stringify(body);
}

function parseTimeout(value: unknown): number {
  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.floor(timeout), MAX_TIMEOUT_MS);
}

async function credentialHeaders(ctx: {
  params: Record<string, unknown>;
  credentials?: {
    get(
      id: string,
      allowedTypes?: string[],
    ): Promise<{ data: Record<string, unknown> }>;
  };
}): Promise<Record<string, string>> {
  const credentialId = ctx.params.credentialId as string | undefined;
  if (!credentialId) return {};

  const credential = await ctx.credentials?.get(credentialId, ["webhook"]);
  if (!credential) {
    throw new Error(
      "Credential runtime is not available for this webhook node",
    );
  }

  const headers = normalizeHeaders(credential.data.headers);
  const bearerToken = credential.data.bearerToken;
  if (typeof bearerToken === "string" && bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  const apiKey = credential.data.apiKey;
  const apiKeyHeader = credential.data.apiKeyHeader;
  if (typeof apiKey === "string" && apiKey) {
    headers[
      typeof apiKeyHeader === "string" && apiKeyHeader
        ? apiKeyHeader
        : "X-API-Key"
    ] = apiKey;
  }

  return headers;
}

// ─── Visual Component ──────────────────────────────────────────────────────

export const WebhookOutputNode = memo(function WebhookOutputNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  const method = (data.data?.method as string) || "POST";
  const url = (data.data?.url as string) || "";

  return (
    <CloudBaseNode data={data} selected={selected}>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground/70">{method}</span>
          <span className="truncate max-w-[120px] text-right font-mono text-[10px]">
            {url ? url.replace(/^https?:\/\//, "").slice(0, 20) : "—"}
          </span>
        </div>
      </div>
    </CloudBaseNode>
  );
});

// ─── Node Definition ───────────────────────────────────────────────────────

export const webhookOutputDef: CloudNodeDefinition = {
  type: "output:webhook",
  label: "HTTP Request",
  category: "output",
  description:
    "Send an HTTP request to an external URL with data from previous nodes.",
  icon: "Send",
  color: CATEGORY_COLORS.output,
  properties: [
    {
      key: "url",
      label: "URL",
      type: "text",
      required: true,
      description: "The URL to send the request to",
      placeholder: "https://hooks.slack.com/services/...",
      supportsExpressions: true,
    },
    {
      key: "method",
      label: "Method",
      type: "select",
      required: true,
      default: "POST",
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
      description:
        'HTTP headers as JSON object (e.g. {"Authorization": "Bearer ..."})',
      default: { "Content-Type": "application/json" },
    },
    {
      key: "credentialId",
      label: "Credential",
      type: "credential",
      required: false,
      credentialType: "webhook",
      description:
        "Optional webhook auth headers merged before request headers.",
    },
    {
      key: "body",
      label: "Body",
      type: "expression",
      required: false,
      description:
        "Request body. Use {{ $json }} to pass data from previous nodes.",
      supportsExpressions: true,
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
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentialId: "",
    body: "",
    timeoutMs: DEFAULT_TIMEOUT_MS,
  },
  component: WebhookOutputNode,
  async execute(ctx) {
    const url = ctx.params.url as string;
    const method = String(ctx.params.method || "POST").toUpperCase();
    const headers = {
      ...(await credentialHeaders(ctx)),
      ...normalizeHeaders(ctx.params.headers),
    };
    const body = ctx.params.body;
    const timeoutMs = parseTimeout(ctx.params.timeoutMs);

    if (!url) {
      throw new Error("URL is required");
    }

    assertSafeOutboundUrl(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    ctx.signal.addEventListener("abort", () => controller.abort(), {
      once: true,
    });

    const canHaveBody = !["GET", "HEAD"].includes(method);
    const response = await fetch(url, {
      method,
      headers,
      body: canHaveBody ? prepareRequestBody(body, headers) : undefined,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    let responseBody: unknown = text.slice(0, MAX_RESPONSE_CHARS);
    if (contentType.includes("application/json") && text) {
      try {
        responseBody = JSON.parse(text);
      } catch {
        responseBody = text.slice(0, MAX_RESPONSE_CHARS);
      }
    }

    if (!response.ok) {
      throw new Error(
        `HTTP request failed with ${response.status} ${response.statusText}`,
      );
    }

    const inputItems = ctx.inputs?.[0] ?? [];
    const httpResponse = {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      url: redactUrlSecrets(response.url || url),
      method,
      headers: redactHeaders(headers),
      body: responseBody,
      timestamp: new Date().toISOString(),
    };

    return inputItems.length > 0
      ? inputItems.map((item) => ({
          ...item,
          json: { ...item.json, httpResponse },
        }))
      : [{ json: { httpResponse } }];
  },
};
