import { describe, expect, it, vi } from "vitest";
import { CloudApiError, CloudClient } from "../utils/cloud-client";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

describe("CloudClient", () => {
  it("sends bearer auth to the configured cloud endpoint", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, user: { id: "user_1", email: "dev@example.com" } }),
    );
    const client = new CloudClient({
      endpoint: "https://cloud.solstudio.fun/",
      token: "sst_test_token",
      fetchImpl,
    });

    const result = await client.whoami();

    expect(result.user.email).toBe("dev@example.com");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://cloud.solstudio.fun/api/cli/v1/whoami",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          authorization: "Bearer sst_test_token",
          accept: "application/json",
        }),
      }),
    );
  });

  it("serializes workflow creation payloads as JSON", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ workflow: { id: "wf_1", name: "Price Alert" } }),
    );
    const client = new CloudClient({
      endpoint: "http://localhost:3001",
      token: "sst_test_token",
      fetchImpl,
    });

    await client.createWorkflow({
      name: "Price Alert",
      description: "Watch SOL",
      definition: { nodes: [], edges: [] },
      tags: ["defi"],
    });

    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>;
    const [, init] = calls[0]!;
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({
        name: "Price Alert",
        description: "Watch SOL",
        definition: { nodes: [], edges: [] },
        tags: ["defi"],
      }),
    );
  });

  it("raises useful API errors with status code and message", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "Workflow not found" }, { status: 404 }),
    );
    const client = new CloudClient({
      endpoint: "http://localhost:3001",
      token: "sst_test_token",
      fetchImpl,
    });

    await expect(client.getWorkflow("missing")).rejects.toMatchObject({
      status: 404,
      message: "Workflow not found",
    } satisfies Partial<CloudApiError>);
  });

  it("can address wallet management endpoints", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ wallet: { id: "wallet_1", label: "ops" } }),
    );
    const client = new CloudClient({
      endpoint: "http://localhost:3001",
      token: "sst_test_token",
      fetchImpl,
    });

    await client.createWallet({ label: "ops", network: "devnet" });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:3001/api/cli/v1/wallets",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
