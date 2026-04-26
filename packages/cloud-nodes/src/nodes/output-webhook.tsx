// Webhook Output Node — sends HTTP requests to external URLs.

import React, { memo } from "react";
import { Send } from "lucide-react";
import type { CloudNodeDefinition, CloudFlowNodeData } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";

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
  description: "Send an HTTP request to an external URL with data from previous nodes.",
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
      description: 'HTTP headers as JSON object (e.g. {"Authorization": "Bearer ..."})',
      default: { "Content-Type": "application/json" },
    },
    {
      key: "body",
      label: "Body",
      type: "expression",
      required: false,
      description: "Request body. Use {{ $json }} to pass data from previous nodes.",
      supportsExpressions: true,
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "response" }],
  defaultData: {
    url: "",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "",
  },
  component: WebhookOutputNode,
  async execute(ctx) {
    const url = ctx.params.url as string;
    const method = (ctx.params.method as string) || "POST";
    const headers = (ctx.params.headers as Record<string, string>) || {
      "Content-Type": "application/json",
    };
    const body = ctx.params.body as string;

    if (!url) {
      throw new Error("URL is required");
    }

    // TODO: Wire to actual fetch with proper timeout and error handling
    // For now return a mock response for development
    const inputItems = ctx.inputs?.[0] ?? [];
    const mockResponse = {
      status: 200,
      statusText: "OK",
      url,
      method,
      timestamp: new Date().toISOString(),
    };

    return inputItems.length > 0
      ? inputItems.map((item) => ({
          ...item,
          json: { ...item.json, httpResponse: mockResponse },
        }))
      : [{ json: { httpResponse: mockResponse } }];
  },
};
