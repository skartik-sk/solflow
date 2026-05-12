import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowExecutor, type WorkflowDefinition } from "@solflow/cloud-engine";
import {
  cloudNodeRegistry,
  registerBuiltinNodes,
  type CloudNodeDefinition,
  type WalletOperations,
} from "@solflow/cloud-nodes";
import { CLOUD_TEMPLATES } from "../../../../packages/db/prisma/cloud-seed";

registerBuiltinNodes();

afterEach(() => {
  vi.unstubAllGlobals();
});

type SeedTemplate = (typeof CLOUD_TEMPLATES)[number];

const NO_KEY_SMOKE_TEMPLATES = new Set([
  "Price Alert Bot",
  "Portfolio Monitor",
  "Jupiter Token Discovery",
  "Pyth Feed Finder",
  "Oracle Guard",
  "Token Treasury Report",
  "Wallet Activity Alert",
  "Token Account Watcher",
  "Umbra Private Transfer Plan",
  "Solana RPC Health Check",
  "Jito Bundle Readiness",
]);

const SKIPPED_LIVE_INTEGRATION_TEMPLATES: Record<string, string> = {
  "DCA Strategy": "requires a Cloud wallet for Jupiter signing",
  "DCA Trader": "requires a Cloud wallet for Jupiter signing",
  "Liquidation Guard": "requires a Cloud wallet for Jupiter signing",
  "Yield Harvester": "requires a Cloud wallet for Jupiter signing",
  "Auto Transfer": "requires a Cloud wallet for token signing",
  "Webhook Processor": "requires an AI provider API key",
  "Price-Guarded DCA": "requires a Cloud wallet for Jupiter signing",
  "AI Transaction Classifier": "requires an AI provider API key",
  "Webhook Payment Runner": "requires a Cloud wallet for token signing",
  "NFT Asset Watch": "requires a Helius or DAS-compatible RPC credential",
  "Enhanced Wallet Swap History": "requires a Helius Enhanced Transactions API key",
  "Helius Realtime Source": "requires a Helius API key to create the webhook",
  "Discord Workflow Alert": "requires a Discord webhook URL or credential",
};

const mockWallet: WalletOperations = {
  signAndSend: vi.fn(),
  getPublicKey: vi.fn(async () => "Wallet111111111111111111111111111111111111"),
  getBalance: vi.fn(async () => 0),
};

function toWorkflowDefinition(template: SeedTemplate): WorkflowDefinition {
  return {
    id: template.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    version: 1,
    nodes: template.definition.nodes,
    edges: template.definition.edges,
    settings: template.settings as WorkflowDefinition["settings"],
  };
}

function mockNoKeyFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.startsWith("https://api.dexscreener.com/")) {
      return jsonResponse([
        { pairAddress: "low-liquidity", priceUsd: "199", liquidity: { usd: 5 } },
        { pairAddress: "sol-usdc", priceUsd: "250", liquidity: { usd: 1_000_000 } },
      ]);
    }

    if (url.startsWith("https://hermes.pyth.network/")) {
      if (url.includes("/v2/price_feeds")) {
        return jsonResponse([
          {
            id: "sol-usd",
            attributes: {
              asset_type: "Crypto",
              display_symbol: "SOL/USD",
            },
          },
        ]);
      }
      return jsonResponse({
        parsed: [
          {
            id: "sol-usd",
            price: {
              price: "25000000000",
              conf: "1000",
              expo: -8,
              publish_time: 1_710_000_000,
            },
          },
        ],
      });
    }

    if (url === "https://relayer.api.umbraprivacy.com/v1/relayer/info") {
      return jsonResponse({
        address: "Relayer111111111111111111111111111111111111",
        supported_mints: [
          "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          "So11111111111111111111111111111111111111112",
        ],
        active_stealth_pool_indices: [],
      });
    }

    if (url === "https://utxo-indexer.api.umbraprivacy.com/health") {
      return jsonResponse({ status: "ok" });
    }

    const method = String(init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? safeJson(init.body) : null;
    if (method === "POST" && isRecord(body) && body.jsonrpc === "2.0") {
      return jsonResponse({
        jsonrpc: "2.0",
        result: {
          value: [
            {
              pubkey: "token-account-1",
              account: {
                data: {
                  parsed: {
                    info: {
                      mint: "Mint111111111111111111111111111111111111111",
                    },
                  },
                },
              },
            },
          ],
        },
      });
    }

    return jsonResponse({
      ok: true,
      received: body,
      url,
    });
  });
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

describe("cloud workflow seed templates", () => {
  it("only uses registered node types and valid graph edges", () => {
    for (const template of CLOUD_TEMPLATES) {
      const nodeIds = new Set(template.definition.nodes.map((node) => node.id));
      const actualNodeTypes = new Set(template.definition.nodes.map((node) => node.type));
      expect(new Set(template.nodeTypes), template.title).toEqual(actualNodeTypes);

      for (const node of template.definition.nodes) {
        expect(cloudNodeRegistry.has(node.type), `${template.title}: ${node.type}`).toBe(true);
      }

      for (const edge of template.definition.edges) {
        expect(nodeIds.has(edge.source), `${template.title}: missing source ${edge.source}`).toBe(true);
        expect(nodeIds.has(edge.target), `${template.title}: missing target ${edge.target}`).toBe(true);

        const sourceNode = template.definition.nodes.find((node) => node.id === edge.source);
        const sourceDef = sourceNode ? cloudNodeRegistry.get(sourceNode.type) : undefined;
        expectSourceHandle(template.title, edge.sourceHandle, sourceDef);
      }
    }
  });

  it("executes no-key starter templates with mocked external calls", async () => {
    const fetchMock = mockNoKeyFetch();
    vi.stubGlobal("fetch", fetchMock);

    for (const template of CLOUD_TEMPLATES.filter((item) => NO_KEY_SMOKE_TEMPLATES.has(item.title))) {
      const executor = new WorkflowExecutor(cloudNodeRegistry, mockWallet);
      const result = await executor.execute(toWorkflowDefinition(template), `smoke-${template.title}`);

      expect(result.status, template.title).toBe("success");
      for (const node of template.definition.nodes) {
        expect(result.nodeResults.get(node.id)?.status, `${template.title}: ${node.type}`).toBe("success");
      }
    }
  });

  it("documents why live-key templates are skipped by the no-key smoke test", () => {
    const skipped = CLOUD_TEMPLATES
      .filter((template) => !NO_KEY_SMOKE_TEMPLATES.has(template.title))
      .map((template) => template.title);

    expect(skipped.sort()).toEqual(Object.keys(SKIPPED_LIVE_INTEGRATION_TEMPLATES).sort());
    for (const title of skipped) {
      expect(SKIPPED_LIVE_INTEGRATION_TEMPLATES[title]).toBeTruthy();
    }
  });
});

function expectSourceHandle(
  templateTitle: string,
  sourceHandle: string | undefined,
  sourceDef: CloudNodeDefinition | undefined,
) {
  if (!sourceHandle || !sourceDef) return;
  const labels = new Set(sourceDef.outputs.map((output) => output.label));
  expect(labels.has(sourceHandle), `${templateTitle}: invalid sourceHandle ${sourceHandle}`).toBe(true);
}
