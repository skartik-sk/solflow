// Webhook Route Handler — receives incoming webhook requests and triggers workflows.

import { NextRequest, NextResponse } from "next/server";
import { getTriggerManager } from "@/server/trigger-manager";

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
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else if (contentType.includes("text/")) {
      body = await request.text();
    } else if (contentType.includes("form-data") || contentType.includes("urlencoded")) {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
    }
  } catch {
    // Empty body or unparseable
  }

  const triggerManager = getTriggerManager();
  const result = await triggerManager.handleWebhook(path, method, headers, body, query);

  return NextResponse.json(result.body, { status: result.status });
}
