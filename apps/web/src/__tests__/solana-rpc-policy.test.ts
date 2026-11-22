import { describe, expect, it } from "vitest";
import { checkRpcProxyRequest } from "../app/api/solana-rpc/policy";

const env = { NODE_ENV: "production" };

describe("/api/solana-rpc policy", () => {
  it("accepts the editor's shape and maps the network server-side", () => {
    const res = checkRpcProxyRequest({ network: "devnet", method: "getAccountInfo", params: ["x"] }, env);
    expect(res).toEqual({ ok: true, rpcUrl: "https://api.devnet.solana.com", method: "getAccountInfo", params: ["x"] });
    const main = checkRpcProxyRequest({ network: "mainnet", method: "getBalance" }, { ...env, MAINNET_RPC_URL: "https://rpc.example" });
    expect(main.ok && main.rpcUrl).toBe("https://rpc.example");
  });

  it("ignores a client-supplied rpcUrl (no open proxy)", () => {
    const res = checkRpcProxyRequest(
      { network: "devnet", method: "getAccountInfo", rpcUrl: "http://169.254.169.254/latest" },
      env,
    );
    expect(res.ok && res.rpcUrl).toBe("https://api.devnet.solana.com");
  });

  it("rejects unknown networks and write/abuse methods", () => {
    expect(checkRpcProxyRequest({ network: "http://evil", method: "getAccountInfo" }, env).ok).toBe(false);
    for (const method of ["sendTransaction", "requestAirdrop", "getProgramAccounts", "anything"]) {
      expect(checkRpcProxyRequest({ network: "devnet", method }, env)).toEqual({ ok: false, error: "RPC method not allowed" });
    }
  });

  it("blocks localnet on the hosted app but allows it in dev", () => {
    expect(checkRpcProxyRequest({ network: "localnet", method: "getSlot" }, env).ok).toBe(false);
    expect(checkRpcProxyRequest({ network: "localnet", method: "getSlot" }, { NODE_ENV: "development" }).ok).toBe(true);
  });

  it("bounds params", () => {
    expect(checkRpcProxyRequest({ network: "devnet", method: "getSlot", params: new Array(11).fill(0) }, env).ok).toBe(false);
    expect(checkRpcProxyRequest({ network: "devnet", method: "getAccountInfo", params: ["x".repeat(30_000)] }, env).ok).toBe(false);
  });
});
