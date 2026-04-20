// apps/web/src/app/api/solana-rpc/route.ts
// POST — server-side proxy for Solana JSON-RPC calls (avoids CORS in browser).

import { NextRequest, NextResponse } from "next/server";

const RPC_URLS: Record<string, string> = {
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
  localnet: "http://127.0.0.1:8899",
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    network?: string;
    rpcUrl?: string;
    method?: string;
    params?: unknown[];
  };

  const { network, rpcUrl: customRpcUrl, method, params } = body;

  if (!method) {
    return NextResponse.json(
      { error: "Missing method" },
      { status: 400 },
    );
  }

  // Allow custom RPC URL, fall back to built-in network, then devnet
  const rpcUrl = customRpcUrl || (network ? (RPC_URLS[network] ?? RPC_URLS.devnet) : RPC_URLS.devnet);

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
