// Notification nodes - Discord, Telegram, and Dialect outputs as workflow actions.

import React, { memo } from "react";
import { Bell } from "lucide-react";
import type { CloudFlowNodeData, CloudNodeDefinition, CredentialOperations, WorkflowItem } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";
import { assertSafeOutboundUrl } from "../security/outbound-url";

const DIALECT_API_URL = "https://alerts-api.dial.to";
const MAX_RESPONSE_CHARS = 20_000;

function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function credentialString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
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

async function getCredentialData(
  credentials: CredentialOperations | undefined,
  credentialId: unknown,
  allowedTypes: string[],
): Promise<Record<string, unknown>> {
  if (typeof credentialId !== "string" || !credentialId) return {};
  const credential = await credentials?.get(credentialId, allowedTypes);
  if (!credential) {
    throw new Error(`Credential runtime is not available for ${allowedTypes.join("/")} notification`);
  }
  return credential.data;
}

async function readBody(response: Response): Promise<unknown> {
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

function notificationPayload(provider: string, status: number, response: unknown, detail: Record<string, unknown>) {
  return {
    provider,
    status,
    ok: status >= 200 && status < 300,
    response,
    ...detail,
    sentAt: new Date().toISOString(),
  };
}

export const NotificationNode = memo(function NotificationNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  const meta = String(data.data?.provider ?? data.label);
  return (
    <CloudBaseNode data={data} selected={selected}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground/70">
          <Bell size={12} />
        </span>
        <span className="max-w-[120px] truncate text-right font-mono text-[10px]">
          {meta}
        </span>
      </div>
    </CloudBaseNode>
  );
});

export const discordMessageDef: CloudNodeDefinition = {
  type: "action:discord-message",
  label: "Discord Message",
  category: "action",
  description: "Post a workflow message to a Discord incoming webhook.",
  icon: "Bell",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "webhookUrl",
      label: "Webhook URL",
      type: "text",
      required: false,
      description: "Discord webhook URL. Prefer a Discord credential for production.",
      supportsExpressions: true,
    },
    {
      key: "credentialId",
      label: "Discord Credential",
      type: "credential",
      required: false,
      credentialType: "discord",
      description: "Credential with webhookUrl.",
    },
    { key: "content", label: "Content", type: "expression", required: true, supportsExpressions: true },
    { key: "username", label: "Username", type: "text", required: false },
    { key: "embeds", label: "Embeds JSON", type: "json", required: false, default: [] },
    { key: "wait", label: "Wait For Message", type: "boolean", required: false, default: true },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "notification" }],
  defaultData: {
    provider: "discord",
    webhookUrl: "",
    credentialId: "",
    content: "",
    username: "SolStudio Cloud",
    embeds: [],
    wait: true,
  },
  component: NotificationNode,
  async execute(ctx) {
    const credential = await getCredentialData(ctx.credentials, ctx.params.credentialId, ["discord"]);
    const rawUrl =
      optionalString(ctx.params, "webhookUrl") ??
      credentialString(credential, "webhookUrl") ??
      credentialString(credential, "url");
    if (!rawUrl) throw new Error("Discord Message requires a webhook URL or Discord credential");
    const url = assertSafeOutboundUrl(rawUrl, { allowHttp: false });
    if (ctx.params.wait !== false) url.searchParams.set("wait", "true");

    const content = optionalString(ctx.params, "content");
    const embeds = parseArray(ctx.params.embeds, "Embeds JSON");
    if (!content && !embeds.length) {
      throw new Error("Discord Message requires content or at least one embed");
    }
    const body: Record<string, unknown> = {
      content,
      embeds,
      allowed_mentions: { parse: [] },
    };
    const username = optionalString(ctx.params, "username");
    if (username) body.username = username;

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctx.signal,
    });
    const responseBody = await readBody(response);
    if (!response.ok) {
      throw new Error(`Discord message failed ${response.status} ${response.statusText}: ${typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody)}`);
    }
    return inputItems(ctx).map((item) => ({
      ...item,
      json: {
        ...item.json,
        notification: notificationPayload("discord", response.status, responseBody, {
          message: content ?? null,
        }),
      },
    }));
  },
};

export const telegramMessageDef: CloudNodeDefinition = {
  type: "action:telegram-message",
  label: "Telegram Message",
  category: "action",
  description: "Send a workflow message through the Telegram Bot API.",
  icon: "Bell",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "credentialId",
      label: "Telegram Credential",
      type: "credential",
      required: true,
      credentialType: "telegram",
      description: "Credential with botToken or apiKey.",
    },
    { key: "chatId", label: "Chat ID", type: "text", required: true, supportsExpressions: true },
    { key: "text", label: "Text", type: "expression", required: true, supportsExpressions: true },
    {
      key: "parseMode",
      label: "Parse Mode",
      type: "select",
      required: false,
      default: "",
      options: [
        { label: "None", value: "" },
        { label: "HTML", value: "HTML" },
        { label: "MarkdownV2", value: "MarkdownV2" },
      ],
    },
    { key: "disableNotification", label: "Silent", type: "boolean", required: false, default: false },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "notification" }],
  defaultData: {
    provider: "telegram",
    credentialId: "",
    chatId: "",
    text: "",
    parseMode: "",
    disableNotification: false,
  },
  component: NotificationNode,
  async execute(ctx) {
    const credential = await getCredentialData(ctx.credentials, ctx.params.credentialId, ["telegram"]);
    const botToken = credentialString(credential, "botToken") ?? credentialString(credential, "apiKey");
    if (!botToken) throw new Error("Telegram credential requires botToken or apiKey");
    if (botToken.includes("/")) throw new Error("Telegram bot token is invalid");
    const chatId = optionalString(ctx.params, "chatId");
    const text = optionalString(ctx.params, "text");
    if (!chatId) throw new Error("Telegram chat ID is required");
    if (!text) throw new Error("Telegram message text is required");

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(optionalString(ctx.params, "parseMode") ? { parse_mode: optionalString(ctx.params, "parseMode") } : {}),
        disable_notification: ctx.params.disableNotification === true,
      }),
      signal: ctx.signal,
    });
    const responseBody = await readBody(response);
    if (!response.ok) {
      throw new Error(`Telegram message failed ${response.status} ${response.statusText}: ${typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody)}`);
    }
    return inputItems(ctx).map((item) => ({
      ...item,
      json: {
        ...item.json,
        notification: notificationPayload("telegram", response.status, responseBody, { chatId }),
      },
    }));
  },
};

export const dialectAlertDef: CloudNodeDefinition = {
  type: "action:dialect-alert",
  label: "Dialect Alert",
  category: "action",
  description: "Send a Dialect REST API alert to subscribers, wallet recipients, or all subscribers.",
  icon: "Bell",
  color: CATEGORY_COLORS.action,
  properties: [
    {
      key: "credentialId",
      label: "Dialect Credential",
      type: "credential",
      required: true,
      credentialType: "dialect",
      description: "Credential with x-dialect-api-key as apiKey.",
    },
    { key: "appId", label: "App ID", type: "text", required: true, supportsExpressions: true },
    {
      key: "recipientType",
      label: "Recipient Type",
      type: "select",
      required: true,
      default: "subscriber",
      options: [
        { label: "Single Subscriber", value: "subscriber" },
        { label: "Multiple Subscribers", value: "subscribers" },
        { label: "All Subscribers", value: "all-subscribers" },
      ],
    },
    { key: "walletAddress", label: "Wallet Address", type: "pubkey", required: false, supportsExpressions: true },
    { key: "walletAddresses", label: "Wallet Addresses", type: "json", required: false, default: [] },
    { key: "channels", label: "Channels", type: "json", required: true, default: ["IN_APP"] },
    { key: "title", label: "Title", type: "text", required: true, supportsExpressions: true },
    { key: "body", label: "Body", type: "expression", required: true, supportsExpressions: true },
    { key: "actionLabel", label: "Action Label", type: "text", required: false },
    { key: "actionUrl", label: "Action URL", type: "text", required: false },
    { key: "topicId", label: "Topic ID", type: "text", required: false },
    { key: "data", label: "Extra Data JSON", type: "json", required: false, default: {} },
    { key: "apiUrl", label: "API URL Override", type: "text", required: false },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "notification" }],
  defaultData: {
    provider: "dialect",
    credentialId: "",
    appId: "",
    recipientType: "subscriber",
    walletAddress: "",
    walletAddresses: [],
    channels: ["IN_APP"],
    title: "",
    body: "",
    actionLabel: "",
    actionUrl: "",
    topicId: "",
    data: {},
    apiUrl: "",
  },
  component: NotificationNode,
  async execute(ctx) {
    const credential = await getCredentialData(ctx.credentials, ctx.params.credentialId, ["dialect"]);
    const apiKey = credentialString(credential, "apiKey");
    if (!apiKey) throw new Error("Dialect credential requires apiKey");
    const appId = optionalString(ctx.params, "appId");
    if (!appId) throw new Error("Dialect app ID is required");

    const recipientType = String(ctx.params.recipientType || "subscriber");
    let recipient: Record<string, unknown>;
    if (recipientType === "all-subscribers") {
      recipient = { type: "all-subscribers" };
    } else if (recipientType === "subscribers") {
      const walletAddresses = parseArray(ctx.params.walletAddresses, "Wallet Addresses").map(String).filter(Boolean);
      if (!walletAddresses.length) throw new Error("Dialect multiple-subscriber alerts require walletAddresses");
      recipient = { type: "subscribers", walletAddresses };
    } else {
      const walletAddress = optionalString(ctx.params, "walletAddress");
      if (!walletAddress) throw new Error("Dialect single-subscriber alerts require walletAddress");
      recipient = { type: "subscriber", walletAddress };
    }

    const title = optionalString(ctx.params, "title");
    const body = optionalString(ctx.params, "body");
    if (!title || !body) throw new Error("Dialect alert requires title and body");

    const actions: Array<{ type: "link"; label: string; url: string }> = [];
    const actionLabel = optionalString(ctx.params, "actionLabel");
    const actionUrl = optionalString(ctx.params, "actionUrl");
    if (actionLabel && actionUrl) {
      actions.push({ type: "link", label: actionLabel, url: assertSafeOutboundUrl(actionUrl, { allowHttp: false }).toString() });
    }
    const channels = parseArray(ctx.params.channels, "Channels").map(String).filter(Boolean);
    if (!channels.length) {
      throw new Error("Dialect alert requires at least one channel");
    }

    const requestBody: Record<string, unknown> = {
      recipient,
      channels,
      message: {
        title,
        body,
        ...(actions.length ? { actions } : {}),
      },
    };
    const topicId = optionalString(ctx.params, "topicId");
    if (topicId) requestBody.topicId = topicId;
    const extraData = parseObject(ctx.params.data, "Extra Data JSON");
    if (extraData) requestBody.data = extraData;

    const baseUrl = assertSafeOutboundUrl(
      optionalString(ctx.params, "apiUrl") ??
        credentialString(credential, "apiUrl") ??
        credentialString(credential, "baseUrl") ??
        DIALECT_API_URL,
      { allowHttp: false },
    );
    const url = new URL(`/v2/${encodeURIComponent(appId)}/send`, baseUrl);
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-dialect-api-key": apiKey,
      },
      body: JSON.stringify(requestBody),
      signal: ctx.signal,
    });
    const responseBody = await readBody(response);
    if (!response.ok) {
      throw new Error(`Dialect alert failed ${response.status} ${response.statusText}: ${typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody)}`);
    }
    return inputItems(ctx).map((item) => ({
      ...item,
      json: {
        ...item.json,
        notification: notificationPayload("dialect", response.status, responseBody, {
          recipient,
          channels: requestBody.channels,
        }),
      },
    }));
  },
};
