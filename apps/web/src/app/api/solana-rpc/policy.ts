// Request policy for /api/solana-rpc (kept separate from the route for unit tests).
import { z } from "zod";

/** Read-only methods the editor (Account Inspector, Transaction Builder) needs. */
export const ALLOWED_RPC_METHODS = [
  "getAccountInfo",
  "getMultipleAccounts",
  "getBalance",
  "getLatestBlockhash",
  "getMinimumBalanceForRentExemption",
  "getSignatureStatuses",
  "getSignaturesForAddress",
  "getTransaction",
  "getTokenAccountBalance",
  "getTokenAccountsByOwner",
  "getSlot",
  "getBlockHeight",
  "getEpochInfo",
  "getFeeForMessage",
  "getHealth",
  "getVersion",
  "simulateTransaction",
] as const;

const BodySchema = z.object({
  network: z.enum(["devnet", "mainnet", "mainnet-beta", "localnet"]),
  method: z.enum(ALLOWED_RPC_METHODS),
  params: z.array(z.unknown()).max(10).default([]),
});

type Env = Record<string, string | undefined>;

export function rpcUrlFor(network: "devnet" | "mainnet" | "mainnet-beta" | "localnet", env: Env): string | null {
  switch (network) {
    case "devnet":
      return env.DEVNET_RPC_URL ?? "https://api.devnet.solana.com";
    case "mainnet":
    case "mainnet-beta":
      return env.MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com";
    case "localnet":
      // A server-side localhost request is only meaningful (and safe) in local dev.
      return env.NODE_ENV === "production" ? null : "http://127.0.0.1:8899";
  }
}

export type RpcProxyCheck =
  | { ok: true; rpcUrl: string; method: string; params: unknown[] }
  | { ok: false; error: string };

export function checkRpcProxyRequest(body: unknown, env: Env): RpcProxyCheck {
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === "method") return { ok: false, error: "RPC method not allowed" };
    if (issue?.path[0] === "network") return { ok: false, error: "network must be devnet, mainnet or localnet" };
    return { ok: false, error: "Invalid RPC request" };
  }
  const rpcUrl = rpcUrlFor(parsed.data.network, env);
  if (!rpcUrl) return { ok: false, error: "localnet is not available on the hosted app" };
  if (JSON.stringify(parsed.data.params).length > 20_000) return { ok: false, error: "RPC params too large" };
  return { ok: true, rpcUrl, method: parsed.data.method, params: parsed.data.params };
}
