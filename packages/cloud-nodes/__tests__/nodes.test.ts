import { describe, it, expect } from "vitest";
import { cloudNodeRegistry } from "../src/registry";
import { registerBuiltinNodes } from "../src/index";

registerBuiltinNodes();

// ─── All nodes must be registered ──────────────────────────────────────────

const ALL_NODE_TYPES = [
  "trigger:manual",
  "trigger:cron",
  "trigger:webhook",
  "action:price-fetch",
  "action:jupiter-swap",
  "action:token-transfer",
  "action:ai-agent",
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

  it("has exactly 11 nodes", () => {
    expect(cloudNodeRegistry.getAll()).toHaveLength(11);
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

  it("action:ai-agent returns ai response", async () => {
    const def = cloudNodeRegistry.get("action:ai-agent")!;
    const result = await def.execute!(makeCtx({
      provider: "openai",
      model: "gpt-4o-mini",
      prompt: "test prompt",
    }));
    expect(result[0].json.ai).toBeDefined();
    expect((result[0].json.ai as any).provider).toBe("openai");
  });

  it("action:ai-agent throws without prompt", async () => {
    const def = cloudNodeRegistry.get("action:ai-agent")!;
    await expect(def.execute!(makeCtx({ provider: "openai" }))).rejects.toThrow("Prompt is required");
  });

  it("logic:wait has execute function defined", () => {
    const def = cloudNodeRegistry.get("logic:wait")!;
    expect(def.execute).toBeDefined();
  });

  it("output:webhook returns http response", async () => {
    const def = cloudNodeRegistry.get("output:webhook")!;
    const result = await def.execute!(makeCtx({
      url: "https://example.com",
      method: "POST",
    }));
    expect((result[0].json as any).httpResponse).toBeDefined();
    expect((result[0].json as any).httpResponse.status).toBe(200);
  });

  it("output:webhook throws without url", async () => {
    const def = cloudNodeRegistry.get("output:webhook")!;
    await expect(def.execute!(makeCtx({ url: "" }))).rejects.toThrow("URL is required");
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

  it("action:jupiter-swap returns swap result", async () => {
    const def = cloudNodeRegistry.get("action:jupiter-swap")!;
    const result = await def.execute!(makeCtx({
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amount: "100000000",
      slippageBps: 50,
    }));
    expect((result[0].json as any).swap).toBeDefined();
    expect((result[0].json as any).swap.inputMint).toBeTruthy();
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
