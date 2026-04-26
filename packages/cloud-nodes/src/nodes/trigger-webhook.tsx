// Webhook Trigger Node — receives HTTP requests to start the workflow.

import React, { memo } from "react";
import { Webhook } from "lucide-react";
import type { CloudNodeDefinition, CloudFlowNodeData } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";

// ─── Visual Component ──────────────────────────────────────────────────────

export const WebhookTriggerNode = memo(function WebhookTriggerNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  const method = (data.data?.httpMethod as string) || "POST";
  const path = (data.data?.webhookPath as string) || "";

  return (
    <CloudBaseNode data={data} selected={selected}>
      <div className="flex flex-col gap-0.5 text-muted-foreground/70">
        <div className="flex items-center gap-1.5">
          <Webhook size={9} />
          <code className="text-[10px] font-mono">{method}</code>
        </div>
        {path && (
          <code className="text-[10px] font-mono text-emerald-400/70 truncate max-w-[120px]">
            /{path}
          </code>
        )}
      </div>
    </CloudBaseNode>
  );
});

// ─── Node Definition ───────────────────────────────────────────────────────

export const webhookTriggerDef: CloudNodeDefinition = {
  type: "trigger:webhook",
  label: "Webhook Trigger",
  category: "trigger",
  description: "Start the workflow when an HTTP request is received at the webhook URL.",
  icon: "Webhook",
  color: CATEGORY_COLORS.trigger,
  properties: [
    {
      key: "httpMethod",
      label: "HTTP Method",
      type: "select",
      required: true,
      description: "HTTP method to listen for",
      default: "POST",
      options: [
        { label: "GET", value: "GET" },
        { label: "POST", value: "POST" },
        { label: "PUT", value: "PUT" },
        { label: "ANY", value: "ANY" },
      ],
    },
    {
      key: "webhookPath",
      label: "Custom Path (optional)",
      type: "text",
      required: false,
      description: "Custom path suffix for the webhook URL. Auto-generated if empty.",
      placeholder: "my-webhook",
    },
    {
      key: "authentication",
      label: "Authentication",
      type: "select",
      required: false,
      description: "How to authenticate incoming webhook requests",
      default: "none",
      options: [
        { label: "None", value: "none" },
        { label: "Header Auth", value: "header" },
      ],
    },
    {
      key: "authHeaderName",
      label: "Auth Header Name",
      type: "text",
      required: false,
      description: "Header name to check for authentication (e.g. X-API-Key)",
      placeholder: "X-Webhook-Secret",
      default: "X-Webhook-Secret",
    },
    {
      key: "replayProtection",
      label: "Replay Protection",
      type: "boolean",
      required: false,
      description: "Require X-Webhook-Timestamp and X-Webhook-Signature HMAC headers",
      default: false,
    },
    {
      key: "maxBodyKb",
      label: "Max Body KB",
      type: "number",
      required: false,
      description: "Reject requests with bodies larger than this limit",
      default: 256,
    },
    {
      key: "responseCode",
      label: "Response Code",
      type: "number",
      required: false,
      description: "HTTP status code to return immediately",
      default: 200,
    },
  ],
  inputs: [],
  outputs: [{ type: "main", label: "output", max: 1 }],
  defaultData: {
    httpMethod: "POST",
    authentication: "none",
    replayProtection: false,
    maxBodyKb: 256,
    responseCode: 200,
  },
  component: WebhookTriggerNode,
  webhook: async (ctx) => {
    return [
      {
        json: {
          triggered: true,
          triggerType: "webhook",
          method: ctx.request.method,
          headers: ctx.request.headers,
          body: ctx.request.body,
          query: ctx.request.query,
          timestamp: Date.now(),
        },
      },
    ];
  },
  async execute(ctx) {
    return [
      {
        json: {
          triggered: true,
          triggerType: "webhook",
          timestamp: Date.now(),
        },
      },
    ];
  },
};
