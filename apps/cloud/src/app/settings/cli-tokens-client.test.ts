import { describe, expect, it, vi } from "vitest";
import { CliTokenError, cliLoginCommand, createCliToken, listCliTokens, revokeCliToken } from "./cli-tokens-client";

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("CLI tokens client", () => {
  it("lists the signed-in user's tokens", async () => {
    const fetcher = fakeFetch(200, { tokens: [{ id: "t1", name: "ci", lastUsedAt: null, expiresAt: null, createdAt: "2026-01-01" }] });
    const tokens = await listCliTokens(fetcher);
    expect(tokens).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith("/api/cli/token", expect.objectContaining({ credentials: "same-origin" }));
  });

  it("creates with a trimmed name and expiry, returning the one-time token", async () => {
    const fetcher = fakeFetch(201, { token: "sst_abc", tokenPreview: "sst_…abc", apiKey: { id: "t2", name: "laptop", expiresAt: null, createdAt: "x" } });
    const created = await createCliToken("  laptop  ", 30, fetcher);
    expect(created.token).toBe("sst_abc");
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ name: "laptop", expiresInDays: 30 });
  });

  it("revokes by id with DELETE and encodes the id", async () => {
    const fetcher = fakeFetch(200, { ok: true });
    await revokeCliToken("a/b", fetcher);
    expect(fetcher).toHaveBeenCalledWith("/api/cli/token?id=a%2Fb", expect.objectContaining({ method: "DELETE" }));
  });

  it("surfaces 401 so the page can ask the user to sign in", async () => {
    await expect(listCliTokens(fakeFetch(401, { error: "Unauthorized" }))).rejects.toMatchObject({ status: 401, message: "Unauthorized" });
    await expect(revokeCliToken("x", fakeFetch(404, { error: "Token not found" }))).rejects.toBeInstanceOf(CliTokenError);
  });

  it("builds the login command", () => {
    expect(cliLoginCommand("https://cloud.example.com", "sst_x")).toBe("solstudio cloud login --endpoint https://cloud.example.com --token sst_x");
  });
});
