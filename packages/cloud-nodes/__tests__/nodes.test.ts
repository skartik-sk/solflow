import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { cloudNodeRegistry } from "../src/registry";
import { registerBuiltinNodes } from "../src/index";

registerBuiltinNodes();

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.BIRDEYE_API_KEY;
  delete process.env.JUPITER_API_BASE;
  delete process.env.SOLFLOW_ALLOW_PRIVATE_OUTBOUND;
});

// ─── All nodes must be registered ──────────────────────────────────────────

const ALL_NODE_TYPES = [
  "trigger:manual",
  "trigger:cron",
  "trigger:webhook",
  "action:price-fetch",
  "action:jupiter-swap",
  "action:token-transfer",
  "action:ai-agent",
  "action:oracle-price",
  "action:helius-rpc",
  "action:token-account-query",
  "action:metaplex-asset",
  "action:squads-proposal",
  "transform:filter",
  "logic:if-else",
  "logic:wait",
  "output:webhook",
];

describe("All nodes registered", () => {
  it.each(ALL_NODE_TYPES)("%s is registered", (type) => {
    expect(cloudNodeRegistry.has(type)).toBe(true);
    const def = cloudNodeRegistry.get(type);
    expect(def).toBeDefined();
    expect(def!.type).toBe(type);
  });

  it("has exactly 16 nodes", () => {
    expect(cloudNodeRegistry.getAll()).toHaveLength(16);
  });
});

// ─── Node definition shape ─────────────────────────────────────────────────

describe.each(ALL_NODE_TYPES)("Node %s shape", (type) => {
  const def = cloudNodeRegistry.get(type)!;

  it("has a non-empty label", () => {
    expect(def.label.length).toBeGreaterThan(0);
  });

  it("has a description", () => {
    expect(def.description.length).toBeGreaterThan(0);
  });

  it("has a valid icon name", () => {
    expect(def.icon.length).toBeGreaterThan(0);
  });

  it("has a valid category", () => {
    expect(["trigger", "action", "transform", "logic", "ai", "output"]).toContain(
      def.category,
    );
  });

  it("has a color string", () => {
    expect(def.color).toBeTruthy();
  });

  it("has a component", () => {
    expect(def.component).toBeDefined();
  });

  it("has valid properties array", () => {
    expect(Array.isArray(def.properties)).toBe(true);
    for (const prop of def.properties) {
      expect(prop.key).toBeTruthy();
      expect(prop.label).toBeTruthy();
      expect(["text", "number", "boolean", "select", "json", "pubkey", "address", "expression", "credential", "wallet-select", "code", "date", "duration"]).toContain(prop.type);
    }
  });

  it("has valid inputs", () => {
    expect(Array.isArray(def.inputs)).toBe(true);
    for (const input of def.inputs) {
      expect(input.type).toBe("main");
      expect(input.label).toBeTruthy();
    }
  });

  it("has valid outputs", () => {
    expect(Array.isArray(def.outputs)).toBe(true);
    expect(def.outputs.length).toBeGreaterThan(0);
    for (const output of def.outputs) {
      expect(["main", "ai", "trigger"]).toContain(output.type);
      expect(output.label).toBeTruthy();
    }
  });

  it("has defaultData as an object", () => {
    expect(typeof def.defaultData).toBe("object");
  });

  it("has execute or trigger or webhook function", () => {
    expect(
      def.execute !== undefined ||
      def.trigger !== undefined ||
      def.webhook !== undefined,
    ).toBe(true);
  });
});

// ─── Trigger-specific rules ────────────────────────────────────────────────

describe("Trigger nodes", () => {
  const triggers = ["trigger:manual", "trigger:cron", "trigger:webhook"];

  it.each(triggers)("%s has no inputs", (type) => {
    const def = cloudNodeRegistry.get(type)!;
    expect(def.inputs).toHaveLength(0);
  });

  it.each(triggers)("%s has at least one output", (type) => {
    const def = cloudNodeRegistry.get(type)!;
    expect(def.outputs.length).toBeGreaterThan(0);
  });

  it("trigger:cron has cronExpression property", () => {
    const def = cloudNodeRegistry.get("trigger:cron")!;
    const prop = def.properties.find((p) => p.key === "cronExpression");
    expect(prop).toBeDefined();
    expect(prop!.required).toBe(true);
  });

  it("trigger:cron has timezone property with options", () => {
    const def = cloudNodeRegistry.get("trigger:cron")!;
    const prop = def.properties.find((p) => p.key === "timezone");
    expect(prop).toBeDefined();
    expect(prop!.options!.length).toBeGreaterThan(0);
  });

  it("trigger:webhook has httpMethod property", () => {
    const def = cloudNodeRegistry.get("trigger:webhook")!;
    const prop = def.properties.find((p) => p.key === "httpMethod");
    expect(prop).toBeDefined();
    expect(prop!.options!.map((o) => o.value)).toContain("POST");
  });

  it("trigger:webhook has webhook handler", () => {
    const def = cloudNodeRegistry.get("trigger:webhook")!;
    expect(def.webhook).toBeDefined();
  });
});

// ─── Action node properties ────────────────────────────────────────────────

describe("Action nodes", () => {
  it("action:jupiter-swap has walletId property", () => {
    const def = cloudNodeRegistry.get("action:jupiter-swap")!;
    const prop = def.properties.find((p) => p.key === "walletId");
    expect(prop).toBeDefined();
    expect(prop!.type).toBe("wallet-select");
  });

  it("action:token-transfer has walletId property", () => {
    const def = cloudNodeRegistry.get("action:token-transfer")!;
    const prop = def.properties.find((p) => p.key === "walletId");
    expect(prop).toBeDefined();
    expect(prop!.type).toBe("wallet-select");
  });

  it("action:ai-agent has provider and model properties", () => {
    const def = cloudNodeRegistry.get("action:ai-agent")!;
    const provider = def.properties.find((p) => p.key === "provider");
    const model = def.properties.find((p) => p.key === "model");
    expect(provider).toBeDefined();
    expect(model).toBeDefined();
    expect(provider!.options!.length).toBeGreaterThan(0);
    expect(model!.options!.length).toBeGreaterThan(0);
  });

  it("action:ai-agent category is ai", () => {
    const def = cloudNodeRegistry.get("action:ai-agent")!;
    expect(def.category).toBe("ai");
  });
});

// ─── Logic node properties ─────────────────────────────────────────────────

describe("Logic nodes", () => {
  it("logic:if-else has two outputs (true + false)", () => {
    const def = cloudNodeRegistry.get("logic:if-else")!;
    expect(def.outputs).toHaveLength(2);
    expect(def.outputs[0].label).toBe("true");
    expect(def.outputs[1].label).toBe("false");
  });

  it("logic:wait has duration and unit properties", () => {
    const def = cloudNodeRegistry.get("logic:wait")!;
    const duration = def.properties.find((p) => p.key === "duration");
    const unit = def.properties.find((p) => p.key === "unit");
    expect(duration).toBeDefined();
    expect(unit).toBeDefined();
    expect(duration!.type).toBe("number");
    expect(unit!.options!.map((o) => o.value)).toEqual(
      expect.arrayContaining(["seconds", "minutes", "hours"]),
    );
  });
});

// ─── Output node properties ────────────────────────────────────────────────

describe("Output nodes", () => {
  it("output:webhook has url, method, headers, body", () => {
    const def = cloudNodeRegistry.get("output:webhook")!;
    const keys = def.properties.map((p) => p.key);
    expect(keys).toContain("url");
    expect(keys).toContain("method");
    expect(keys).toContain("headers");
    expect(keys).toContain("body");
  });

  it("output:webhook has url as required", () => {
    const def = cloudNodeRegistry.get("output:webhook")!;
    const url = def.properties.find((p) => p.key === "url")!;
    expect(url.required).toBe(true);
  });
});

// ─── Execute functions work ─────────────────────────────────────────────────

describe("Execute functions", () => {
  const makeSerializedSwapTransaction = () => {
    const payer = new PublicKey("11111111111111111111111111111111");
    const message = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: "11111111111111111111111111111111",
      instructions: [],
    }).compileToV0Message();
    return Buffer.from(new VersionedTransaction(message).serialize()).toString("base64");
  };

  const makeCtx = (params: Record<string, unknown> = {}) => ({
    inputs: [],
    params,
    executionId: "test-exec",
    nodeId: "test-node",
    wallet: {
      signAndSend: async () => "sig",
      getPublicKey: async () => "pk",
      getBalance: async () => 0,
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    signal: new AbortController().signal,
  });

  it("trigger:manual returns triggered item", async () => {
    const def = cloudNodeRegistry.get("trigger:manual")!;
    const result = await def.execute!(makeCtx());
    expect(result).toHaveLength(1);
    expect(result[0].json.triggered).toBe(true);
    expect(result[0].json.timestamp).toBeDefined();
  });

  it("trigger:cron returns cron metadata", async () => {
    const def = cloudNodeRegistry.get("trigger:cron")!;
    const result = await def.execute!(makeCtx({ cronExpression: "*/5 * * * *", timezone: "UTC" }));
    expect(result[0].json.triggerType).toBe("cron");
    expect(result[0].json.cronExpression).toBe("*/5 * * * *");
  });

  it("action:price-fetch fetches DexScreener price data", async () => {
    const def = cloudNodeRegistry.get("action:price-fetch")!;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify([
        { pairAddress: "low", priceUsd: "99", liquidity: { usd: 10 } },
        { pairAddress: "best", priceUsd: "123.45", liquidity: { usd: 1000 } },
      ]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await def.execute!(makeCtx({
      token: "So11111111111111111111111111111111111111112",
      source: "dexscreener",
    }));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.dexscreener.com/tokens/v1/solana/So11111111111111111111111111111111111111112",
    );
    expect(result[0].json.price).toBe(123.45);
    expect((result[0].json.priceData as any).pairAddress).toBe("best");
  });

  it("action:price-fetch fetches Birdeye price data with API key", async () => {
    process.env.BIRDEYE_API_KEY = "test-key";
    const def = cloudNodeRegistry.get("action:price-fetch")!;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: { value: 42.5 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await def.execute!(makeCtx({
      token: "SOL",
      source: "birdeye",
    }));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://public-api.birdeye.so/defi/price?address=So11111111111111111111111111111111111111112",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-API-KEY": "test-key",
          "x-chain": "solana",
        }),
      }),
    );
    expect(result[0].json.price).toBe(42.5);
    delete process.env.BIRDEYE_API_KEY;
  });

  it("action:price-fetch uses selected Birdeye credential", async () => {
    const def = cloudNodeRegistry.get("action:price-fetch")!;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: { value: 12.25 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const getCredential = vi.fn(async () => ({
      id: "cred-1",
      label: "Birdeye",
      type: "birdeye",
      data: { apiKey: "credential-key" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await def.execute!({
      ...makeCtx({
        token: "SOL",
        source: "birdeye",
        credentialId: "cred-1",
      }),
      credentials: { get: getCredential },
    });

    expect(getCredential).toHaveBeenCalledWith("cred-1", ["birdeye"]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-API-KEY": "credential-key" }),
      }),
    );
    expect(result[0].json.price).toBe(12.25);
  });

  it("action:ai-agent calls OpenAI Responses API", async () => {
    process.env.OPENAI_API_KEY = "test-openai";
    const def = cloudNodeRegistry.get("action:ai-agent")!;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        output_text: "{\"decision\":\"approve\"}",
        usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await def.execute!(makeCtx({
      provider: "openai",
      model: "gpt-4o-mini",
      systemPrompt: "You classify swaps.",
      prompt: "test prompt",
      responseFormat: "json",
    }));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-openai",
          "Content-Type": "application/json",
        }),
      }),
    );

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.input).toBe("test prompt");
    expect(body.text.format.type).toBe("json_object");
    expect((result[0].json as any).ai.content).toBe("{\"decision\":\"approve\"}");
    expect((result[0].json as any).ai.json).toEqual({ decision: "approve" });
    expect((result[0].json as any).ai.usage.total_tokens).toBe(8);
  });

  it("action:ai-agent calls Anthropic Messages API", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    const def = cloudNodeRegistry.get("action:ai-agent")!;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        content: [{ type: "text", text: "analysis complete" }],
        usage: { input_tokens: 7, output_tokens: 2 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await def.execute!(makeCtx({
      provider: "anthropic",
      model: "claude-3-5-haiku-20241022",
      prompt: "test prompt",
    }));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "test-anthropic",
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        }),
      }),
    );

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("claude-3-5-haiku-20241022");
    expect(body.messages[0].content).toBe("test prompt");
    expect((result[0].json as any).ai.content).toBe("analysis complete");
    expect((result[0].json as any).ai.usage.output_tokens).toBe(2);
  });

  it("action:ai-agent uses selected provider credential", async () => {
    const def = cloudNodeRegistry.get("action:ai-agent")!;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ output_text: "credential response" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const getCredential = vi.fn(async () => ({
      id: "cred-1",
      label: "OpenAI",
      type: "openai",
      data: { apiKey: "credential-openai" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await def.execute!({
      ...makeCtx({
        provider: "openai",
        model: "gpt-4o-mini",
        prompt: "test prompt",
        credentialId: "cred-1",
      }),
      credentials: { get: getCredential },
    });

    expect(getCredential).toHaveBeenCalledWith("cred-1", ["openai"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer credential-openai" }),
      }),
    );
    expect((result[0].json as any).ai.content).toBe("credential response");
  });

  it("action:ai-agent throws without prompt", async () => {
    const def = cloudNodeRegistry.get("action:ai-agent")!;
    await expect(def.execute!(makeCtx({ provider: "openai" }))).rejects.toThrow("Prompt is required");
  });

  it("logic:wait has execute function defined", () => {
    const def = cloudNodeRegistry.get("logic:wait")!;
    expect(def.execute).toBeDefined();
  });

  it("output:webhook sends a real HTTP request through fetch", async () => {
    const def = cloudNodeRegistry.get("output:webhook")!;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        statusText: "Created",
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await def.execute!(makeCtx({
      url: "https://example.com",
      method: "POST",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
      body: { hello: "world" },
    }));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ hello: "world" }),
      }),
    );
    expect((result[0].json as any).httpResponse.status).toBe(201);
    expect((result[0].json as any).httpResponse.body).toEqual({ ok: true });
    expect((result[0].json as any).httpResponse.headers.Authorization).toBe("[redacted]");
  });

  it("output:webhook throws without url", async () => {
    const def = cloudNodeRegistry.get("output:webhook")!;
    await expect(def.execute!(makeCtx({ url: "" }))).rejects.toThrow("URL is required");
  });

  it("output:webhook blocks private network targets by default", async () => {
    const def = cloudNodeRegistry.get("output:webhook")!;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(def.execute!(makeCtx({
      url: "http://169.254.169.254/latest/meta-data",
      method: "GET",
    }))).rejects.toThrow("private or local network");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("action:oracle-price fetches and normalizes Pyth price data", async () => {
    const def = cloudNodeRegistry.get("action:oracle-price")!;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        parsed: [
          {
            id: "feed-1",
            price: {
              price: "20250000000",
              conf: "1200",
              expo: -8,
              publish_time: 1710000000,
            },
          },
        ],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await def.execute!(makeCtx({
      provider: "pyth",
      feedId: "feed-1",
    }));

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "https://hermes.pyth.network/v2/updates/price/latest",
    );
    expect((result[0].json as any).oracle).toMatchObject({
      provider: "pyth",
      feedId: "feed-1",
      price: 202.5,
      rawPrice: "20250000000",
      confidence: "1200",
      exponent: -8,
    });
  });

  it("action:helius-rpc calls JSON-RPC with a selected Helius credential", async () => {
    const def = cloudNodeRegistry.get("action:helius-rpc")!;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", result: { id: "asset-1" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const getCredential = vi.fn(async () => ({
      id: "cred-helius",
      label: "Helius",
      type: "helius",
      data: { apiKey: "helius-key" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await def.execute!({
      ...makeCtx({
        method: "getAsset",
        params: [{ id: "asset-1" }],
        credentialId: "cred-helius",
      }),
      credentials: { get: getCredential },
    });

    expect(getCredential).toHaveBeenCalledWith("cred-helius", ["helius"]);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://mainnet.helius-rpc.com/?api-key=helius-key",
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      method: "getAsset",
      params: [{ id: "asset-1" }],
    });
    expect((result[0].json as any).helius).toEqual({
      method: "getAsset",
      result: { id: "asset-1" },
    });
  });

  it("action:token-account-query filters token accounts by mint", async () => {
    const def = cloudNodeRegistry.get("action:token-account-query")!;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        jsonrpc: "2.0",
        result: {
          value: [
            {
              pubkey: "match",
              account: { data: { parsed: { info: { mint: "MintA" } } } },
            },
            {
              pubkey: "skip",
              account: { data: { parsed: { info: { mint: "MintB" } } } },
            },
          ],
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await def.execute!(makeCtx({
      owner: "Owner111111111111111111111111111111111111111",
      mint: "MintA",
      tokenProgram: "spl",
      rpcUrl: "https://rpc.example.com",
    }));

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.method).toBe("getParsedTokenAccountsByOwner");
    expect(body.params[1]).toEqual({
      programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    });
    expect((result[0].json as any).tokenAccounts.count).toBe(1);
    expect((result[0].json as any).tokenAccounts.accounts[0].pubkey).toBe("match");
  });

  it("action:squads-proposal posts proposal payloads with credential headers", async () => {
    const def = cloudNodeRegistry.get("action:squads-proposal")!;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ proposalId: "proposal-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const getCredential = vi.fn(async () => ({
      id: "cred-squads",
      label: "Squads",
      type: "squads",
      data: { apiKey: "squads-key" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await def.execute!({
      ...makeCtx({
        apiUrl: "https://example.com/squads/proposals",
        multisig: "Squads1111111111111111111111111111111111111",
        title: "Review treasury report",
        description: "Generated by SolStudio",
        payload: { tokenAccounts: "{{ $json.tokenAccounts }}" },
        credentialId: "cred-squads",
      }),
      inputs: [[{ json: { tokenAccounts: { count: 2 } } }]],
      credentials: { get: getCredential },
    });

    expect(getCredential).toHaveBeenCalledWith("cred-squads", ["squads", "webhook"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/squads/proposals",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-API-Key": "squads-key" }),
      }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      multisig: "Squads1111111111111111111111111111111111111",
      title: "Review treasury report",
      inputs: [{ tokenAccounts: { count: 2 } }],
    });
    expect((result[0].json as any).squadsProposal).toEqual({
      proposalId: "proposal-1",
    });
  });

  it("action:token-transfer builds and sends a SOL transfer", async () => {
    const def = cloudNodeRegistry.get("action:token-transfer")!;
    const simulate = vi.fn(async () => ({ err: null, logs: ["ok"] }));
    const signAndSend = vi.fn(async () => "transfer-sig");

    const result = await def.execute!({
      ...makeCtx({
        to: "BQ72nSv9f3PRyRKCBnHLVrerrv37CYTHm5h3s9VSGQDV",
        amount: "1000000",
        token: "SOL",
        walletId: "wallet-1",
      }),
      wallet: {
        signAndSend,
        simulate,
        getPublicKey: async () => "8Hj6ScMnKvz8wzco9BT2h8MpbqbnvTdTUVDCeJaUE6kW",
        getBalance: async () => 0,
      },
    });

    const transaction = signAndSend.mock.calls[0][0] as Transaction;
    expect(transaction).toBeInstanceOf(Transaction);
    expect(transaction.instructions).toHaveLength(1);
    expect(transaction.instructions[0].programId.equals(SystemProgram.programId)).toBe(true);
    expect(simulate).toHaveBeenCalledWith(expect.any(Transaction), "wallet-1");
    expect((result[0].json as any).transfer.signature).toBe("transfer-sig");
    expect((result[0].json as any).transfer.type).toBe("sol");
  });

  it("action:token-transfer builds SPL transfer with destination ATA creation", async () => {
    const def = cloudNodeRegistry.get("action:token-transfer")!;
    const signAndSend = vi.fn(async () => "spl-transfer-sig");

    const result = await def.execute!({
      ...makeCtx({
        to: "BQ72nSv9f3PRyRKCBnHLVrerrv37CYTHm5h3s9VSGQDV",
        amount: "42",
        token: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        walletId: "wallet-1",
      }),
      wallet: {
        signAndSend,
        getPublicKey: async () => "8Hj6ScMnKvz8wzco9BT2h8MpbqbnvTdTUVDCeJaUE6kW",
        getBalance: async () => 0,
      },
    });

    const transaction = signAndSend.mock.calls[0][0] as Transaction;
    expect(transaction).toBeInstanceOf(Transaction);
    expect(transaction.instructions).toHaveLength(2);
    expect((result[0].json as any).transfer.signature).toBe("spl-transfer-sig");
    expect((result[0].json as any).transfer.type).toBe("spl");
  });

  it("transform:filter filters items", async () => {
    const def = cloudNodeRegistry.get("transform:filter")!;
    const ctx = {
      ...makeCtx({ field: "price", condition: "gt", value: "100" }),
      inputs: [[
        { json: { price: 150 } },
        { json: { price: 50 } },
        { json: { price: 200 } },
      ]],
    };
    const result = await def.execute!(ctx);
    expect(result).toHaveLength(2);
    expect(result[0].json.price).toBe(150);
    expect(result[1].json.price).toBe(200);
  });

  it("logic:if-else splits into true/false", async () => {
    const def = cloudNodeRegistry.get("logic:if-else")!;
    const ctx = {
      ...makeCtx({ field: "price", operator: "gt", value: "100" }),
      inputs: [[
        { json: { price: 150 } },
        { json: { price: 50 } },
      ]],
    };
    const result = await def.execute!(ctx) as unknown as [any[], any[]];
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json.price).toBe(150);
    expect(result[1]).toHaveLength(1);
    expect(result[1][0].json.price).toBe(50);
  });

  it("action:jupiter-swap quotes, builds, simulates, and sends a Jupiter swap", async () => {
    const def = cloudNodeRegistry.get("action:jupiter-swap")!;
    const quote = {
      inputMint: "So11111111111111111111111111111111111111112",
      inAmount: "1000000",
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      outAmount: "150000",
      otherAmountThreshold: "149000",
      priceImpactPct: "0.01",
      routePlan: [{ swapInfo: { label: "Test AMM" } }],
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/quote?")) {
        return new Response(JSON.stringify(quote), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        swapTransaction: makeSerializedSwapTransaction(),
        lastValidBlockHeight: 123,
        prioritizationFeeLamports: 999,
        dynamicSlippageReport: { slippageBps: 50 },
        simulationError: null,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const simulate = vi.fn(async () => ({ err: null, logs: ["ok"] }));
    const signAndSend = vi.fn(async () => "swap-sig");
    vi.stubGlobal("fetch", fetchMock);

    const result = await def.execute!({
      ...makeCtx({
        inputMint: quote.inputMint,
        outputMint: quote.outputMint,
        amount: 1000000,
        slippageBps: 50,
        walletId: "wallet-1",
      }),
      wallet: {
        signAndSend,
        simulate,
        getPublicKey: async () => "BQ72nSv9f3PRyRKCBnHLVrerrv37CYTHm5h3s9VSGQDV",
        getBalance: async () => 0,
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000&slippageBps=50",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.jup.ag/swap/v1/swap",
      expect.objectContaining({ method: "POST" }),
    );
    const swapBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(swapBody.quoteResponse).toEqual(quote);
    expect(swapBody.userPublicKey).toBe("BQ72nSv9f3PRyRKCBnHLVrerrv37CYTHm5h3s9VSGQDV");
    expect(simulate).toHaveBeenCalledWith(expect.any(VersionedTransaction), "wallet-1");
    expect(signAndSend).toHaveBeenCalledWith(expect.any(VersionedTransaction), "wallet-1");
    expect((result[0].json as any).swap.signature).toBe("swap-sig");
    expect((result[0].json as any).swap.outAmount).toBe("150000");
  });

  it("action:jupiter-swap throws when Jupiter simulation reports an error", async () => {
    const def = cloudNodeRegistry.get("action:jupiter-swap")!;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/quote?")) {
        return new Response(JSON.stringify({
          inputMint: "So11111111111111111111111111111111111111112",
          inAmount: "1000000",
          outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          outAmount: "150000",
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        swapTransaction: makeSerializedSwapTransaction(),
        simulationError: { InstructionError: [0, "Custom"] },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(def.execute!({
      ...makeCtx({
        inputMint: "So11111111111111111111111111111111111111112",
        outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        amount: 1000000,
        walletId: "wallet-1",
      }),
      wallet: {
        signAndSend: async () => "sig",
        getPublicKey: async () => "BQ72nSv9f3PRyRKCBnHLVrerrv37CYTHm5h3s9VSGQDV",
        getBalance: async () => 0,
      },
    })).rejects.toThrow("Jupiter swap simulation failed");
  });

  it("action:jupiter-swap rejects private provider base URLs from credentials", async () => {
    const def = cloudNodeRegistry.get("action:jupiter-swap")!;
    const fetchMock = vi.fn();
    const getCredential = vi.fn(async () => ({
      id: "cred-1",
      label: "Jupiter",
      type: "jupiter",
      data: { baseUrl: "http://127.0.0.1:8899", apiKey: "test-key" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(def.execute!({
      ...makeCtx({
        inputMint: "So11111111111111111111111111111111111111112",
        outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        amount: 1000000,
        walletId: "wallet-1",
        credentialId: "cred-1",
      }),
      credentials: { get: getCredential },
      wallet: {
        signAndSend: async () => "sig",
        getPublicKey: async () => "BQ72nSv9f3PRyRKCBnHLVrerrv37CYTHm5h3s9VSGQDV",
        getBalance: async () => 0,
      },
    })).rejects.toThrow("Provider URL must use https");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("action:jupiter-swap throws without required fields", async () => {
    const def = cloudNodeRegistry.get("action:jupiter-swap")!;
    await expect(def.execute!(makeCtx({}))).rejects.toThrow("required");
  });
});

// ─── Webhook handler ───────────────────────────────────────────────────────

describe("Webhook handler", () => {
  it("trigger:webhook returns webhook metadata", async () => {
    const def = cloudNodeRegistry.get("trigger:webhook")!;
    const result = await def.webhook!({
      request: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: { test: true },
        query: {},
      },
      params: {},
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    expect(result[0].json.triggerType).toBe("webhook");
    expect(result[0].json.method).toBe("POST");
    expect(result[0].json.body).toEqual({ test: true });
  });
});
