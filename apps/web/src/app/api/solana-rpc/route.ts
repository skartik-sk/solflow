// apps/web/src/app/api/solana-rpc/route.ts
// POST — server-side proxy for Solana JSON-RPC calls (avoids CORS in browser).

import { NextRequest, NextResponse } from "next/server";

const RPC_URLS: Record<string, string> = {
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  localnet: "http://127.0.0.1:8899",
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    network?: string;
    method?: string;
    params?: unknown[];
  };

  const { network, method, params } = body;

  if (!network || !method) {
    return NextResponse.json(
      { error: "Missing network or method" },
      { status: 400 },
    );
  }

  const rpcUrl = RPC_URLS[network] ?? RPC_URLS.devnet;

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params: params ?? [],
      }),
    });

    const json = await response.json();
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json(
      { error: { message: e instanceof Error ? e.message : "RPC fetch failed" } },
      { status: 502 },
    );
  }
}
