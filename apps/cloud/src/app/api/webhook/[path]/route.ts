// Webhook Route Handler — receives incoming webhook requests and triggers workflows.

import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import {
  clientIpFromHeaders,
  rateLimitHeaders,
  webhookRateLimit,
} from "@/lib/rate-limit";
import { getTriggerManager } from "@/server/trigger-manager";

const DEFAULT_MAX_BODY_BYTES = 256 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string }> }
) {
  return handleWebhookRequest(request, await params);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string }> }
) {
  return handleWebhookRequest(request, await params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string }> }
) {
  return handleWebhookRequest(request, await params);
}

async function handleWebhookRequest(
  request: NextRequest,
  params: { path: string }
) {
  const { path } = params;
  const method = request.method;
  const rl = webhookRateLimit(path, clientIpFromHeaders(request.headers));

  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Webhook rate limit exceeded. Please retry later." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const maxBodyBytes = getMaxBodyBytes();
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBodyBytes) {
    return NextResponse.json(
      { error: "Webhook request body is too large." },
      { status: 413 },
    );
  }

  // Extract headers
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  // Extract query params
  const query: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  // Extract body
  let body: unknown = null;
  let rawBody = "";
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      rawBody = await readLimitedText(request, maxBodyBytes);
      body = rawBody ? JSON.parse(rawBody) : null;
    } else if (contentType.includes("text/")) {
      rawBody = await readLimitedText(request, maxBodyBytes);
      body = rawBody;
    } else if (contentType.includes("urlencoded")) {
      rawBody = await readLimitedText(request, maxBodyBytes);
      body = Object.fromEntries(new URLSearchParams(rawBody).entries());
    } else if (contentType.includes("form-data")) {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook body";
    return NextResponse.json({ error: message }, { status: message.includes("large") ? 413 : 400 });
  }

  const triggerManager = getTriggerManager();
  const result = await triggerManager.handleWebhook(path, method, headers, body, query, rawBody);

  return NextResponse.json(result.body, { status: result.status });
}

async function readLimitedText(request: NextRequest, maxBytes: number): Promise<string> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new Error("Webhook request body is too large.");
  }
  return text;
}

function getMaxBodyBytes(): number {
  const raw = process.env.CLOUD_WEBHOOK_MAX_BODY_KB;
  if (!raw) return DEFAULT_MAX_BODY_BYTES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_BODY_BYTES;
  return Math.min(parsed, 1024) * 1024;
}
