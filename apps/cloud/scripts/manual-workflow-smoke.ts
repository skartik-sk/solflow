import { WorkflowExecutor, type WorkflowDefinition } from "@solflow/cloud-engine";
import {
  cloudNodeRegistry,
  registerBuiltinNodes,
  type WalletOperations,
} from "@solflow/cloud-nodes";

registerBuiltinNodes();

const workflow: WorkflowDefinition = {
  id: "manual-smoke",
  version: 1,
  nodes: [
    {
      id: "manual",
      type: "trigger:manual",
      position: { x: 0, y: 0 },
      data: {},
    },
    {
      id: "price",
      type: "action:price-fetch",
      position: { x: 240, y: 0 },
      data: {
        token: "So11111111111111111111111111111111111111112",
        source: "dexscreener",
      },
    },
    {
      id: "branch",
      type: "logic:if-else",
      position: { x: 480, y: 0 },
      data: {
        field: "price",
        operator: "gt",
        value: "200",
      },
    },
    {
      id: "result",
      type: "output:result",
      position: { x: 720, y: 0 },
      data: {
        name: "Manual smoke result",
        status: "success",
        value: {
          source: "manual-smoke",
          price: "{{ $json.price }}",
          pair: "{{ $json.priceData.pairAddress }}",
        },
      },
    },
  ],
  edges: [
    { id: "e1", source: "manual", target: "price" },
    { id: "e2", source: "price", target: "branch" },
    { id: "e3", source: "branch", target: "result", sourceHandle: "true" },
  ],
  settings: {
    timeout: 30,
    retryPolicy: { maxAttempts: 1, delayMs: 0 },
    onError: "stop",
  },
};

const wallet: WalletOperations = {
  signAndSend: async () => {
    throw new Error("manual smoke workflow should not sign transactions");
  },
  getPublicKey: async () => "SmokeWallet111111111111111111111111111111111",
  getBalance: async () => 0,
};

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);

  if (url.startsWith("https://api.dexscreener.com/")) {
    return jsonResponse([
      { pairAddress: "low-liquidity", priceUsd: "125", liquidity: { usd: 5 } },
      { pairAddress: "sol-usdc-smoke", priceUsd: "250", liquidity: { usd: 1_000_000 } },
    ]);
  }

  return new Response(`Unexpected smoke fetch URL: ${url}`, { status: 500 });
};

const executor = new WorkflowExecutor(cloudNodeRegistry, wallet);
const result = await executor.execute(workflow, "manual-smoke-execution");

const summary = {
  status: result.status,
  durationMs: result.duration,
  nodes: Object.fromEntries(
    Array.from(result.nodeResults.entries()).map(([nodeId, nodeResult]) => [
      nodeId,
      {
        type: nodeResult.nodeType,
        status: nodeResult.status,
        error: nodeResult.error ?? null,
        output: nodeResult.outputSnapshot,
      },
    ]),
  ),
};

console.log(JSON.stringify(summary, null, 2));

if (result.status !== "success") {
  process.exitCode = 1;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
