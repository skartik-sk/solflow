// apps/web/src/app/api/solana-rpc/route.ts
// POST — server-side proxy for the editor's read-only Solana JSON-RPC calls (avoids CORS).
// Signed-in users only, fixed networks mapped server-side (no client-supplied URL),
// an allowlist of read methods, and a per-user rate limit.

import { auth } from "@solflow/auth";
import { NextResponse } from "next/server";
import { checkRpcProxyRequest } from "./policy";
import { rpcProxyRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const maxDuration = 30;

const RPC_TIMEOUT_MS = 15_000;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: { message: "Sign in to use the RPC proxy" } }, { status: 401 });
  }

  const rl = rpcProxyRateLimit(session.user.id);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { message: "Too many RPC requests. Slow down." } },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const body = await req.json().catch(() => null);
  const checked = checkRpcProxyRequest(body, process.env);
  if (!checked.ok) {
    return NextResponse.json({ error: { message: checked.error } }, { status: 400 });
  }

  try {
    const response = await fetch(checked.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: checked.method, params: checked.params }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
    const json = await response.json();
    return NextResponse.json(json, { status: response.ok ? 200 : 502 });
  } catch {
    return NextResponse.json({ error: { message: "RPC request failed" } }, { status: 502 });
  }
}
