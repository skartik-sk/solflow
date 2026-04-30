export type WorkflowNodeInput = {
  id: string;
  type: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
};

export type WorkflowEdgeInput = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
};

export type WorkflowDefinitionInput = {
  nodes?: WorkflowNodeInput[];
  edges?: WorkflowEdgeInput[];
};

export type WorkflowSafetyInput = {
  simulationRequired?: boolean;
  manualApprovalRequired?: boolean;
  walletAutomationAllowed?: boolean;
  spendLimitLamports?: number;
  maxSlippageBps?: number;
  allowedMints?: string[];
  webhookAllowlist?: string[];
};

export type WorkflowSettingsInput = {
  timeout?: number;
  retryPolicy?: { maxAttempts?: number; delayMs?: number };
  onError?: string;
  safety?: WorkflowSafetyInput;
};

export type WorkflowSimulationReport = {
  riskLevel: "low" | "medium" | "high";
  blocked: boolean;
  estimatedFeeLamports: number;
  estimatedFeeSol: string;
  nodeCount: number;
  edgeCount: number;
  walletActions: number;
  externalCalls: number;
  triggerTypes: string[];
  route: string[];
  requiredCredentials: string[];
  walletDeltas: Array<{ asset: string; change: string; reason: string }>;
  transactionPlan: Array<{ nodeId: string; type: string; label: string; effect: string }>;
  warnings: string[];
  blockers: string[];
};

export type AssistantWorkflowDraft = {
  name: string;
  description: string;
  tags: string[];
  definition: { nodes: WorkflowNodeInput[]; edges: WorkflowEdgeInput[] };
  settings: WorkflowSettingsInput;
  matchedIntent: string;
};

export type CloudTemplateCertification = {
  certified: boolean;
  badges: Array<{
    label: "Verified" | "Audited" | "Works with Devnet" | "Mainnet Ready";
    passed: boolean;
    detail: string;
  }>;
  missing: string[];
};

type TemplateLike = {
  title?: string;
  status?: string;
  nodeTypes?: string[];
  definition?: WorkflowDefinitionInput;
  settings?: WorkflowSettingsInput;
};

const WALLET_ACTIONS = new Set([
  "action:jupiter-swap",
  "action:token-transfer",
]);

const EXTERNAL_ACTIONS = new Set([
  "action:price-fetch",
  "action:ai-agent",
  "action:oracle-price",
  "action:helius-rpc",
  "action:metaplex-asset",
  "action:squads-proposal",
  "output:webhook",
]);

const CREDENTIAL_NODE_TYPES = new Set([
  "action:ai-agent",
  "action:helius-rpc",
  "action:metaplex-asset",
  "action:squads-proposal",
  "output:webhook",
]);

const NODE_LABELS: Record<string, string> = {
  "trigger:manual": "Manual Trigger",
  "trigger:cron": "Cron Trigger",
  "trigger:webhook": "Webhook Trigger",
  "action:price-fetch": "Price Fetch",
  "action:jupiter-swap": "Jupiter Swap",
  "action:token-transfer": "Token Transfer",
  "action:ai-agent": "AI Agent",
  "action:oracle-price": "Oracle Price",
  "action:helius-rpc": "Helius RPC",
  "action:token-account-query": "Token Account Query",
  "action:metaplex-asset": "Metaplex Asset",
  "action:squads-proposal": "Squads Proposal",
  "transform:filter": "Filter",
  "logic:if-else": "If / Else",
  "logic:wait": "Wait",
  "output:webhook": "Webhook Output",
};

function nodeConfig(node: WorkflowNodeInput): Record<string, unknown> {
  const raw = node.data ?? {};
  const nested = raw.data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return raw;
}

function nodeLabel(type: string): string {
  return NODE_LABELS[type] ?? type;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return Boolean(trimmed) && !trimmed.startsWith("YOUR_");
  }
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function buildRoute(nodes: WorkflowNodeInput[], edges: WorkflowEdgeInput[]): string[] {
  if (nodes.length === 0) return [];
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }

  const queue = nodes
    .filter((node) => (incoming.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const route: string[] = [];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (node) route.push(nodeLabel(node.type));

    for (const edge of edges.filter((item) => item.source === id)) {
      const nextCount = (incoming.get(edge.target) ?? 1) - 1;
      incoming.set(edge.target, nextCount);
      if (nextCount <= 0) queue.push(edge.target);
    }
  }

  for (const node of nodes) {
    if (!seen.has(node.id)) route.push(nodeLabel(node.type));
  }

  return route;
}

function requiredCredentialLabels(nodes: WorkflowNodeInput[]): string[] {
  return uniqueSorted(
    nodes
      .filter((node) => CREDENTIAL_NODE_TYPES.has(node.type))
      .flatMap((node) => {
        const data = nodeConfig(node);
        if (hasMeaningfulValue(data.credentialId)) return [];
        if (node.type === "output:webhook") return ["webhook endpoint"];
        if (node.type === "action:ai-agent") return ["AI provider key"];
        if (node.type === "action:helius-rpc" || node.type === "action:metaplex-asset") {
          return ["Helius or DAS RPC"];
        }
        if (node.type === "action:squads-proposal") return ["Squads API"];
        return [];
      }),
  );
}

function walletDeltasFor(nodes: WorkflowNodeInput[]): WorkflowSimulationReport["walletDeltas"] {
  return nodes.flatMap((node) => {
    const data = nodeConfig(node);
    if (node.type === "action:jupiter-swap") {
      return [{
        asset: String(data.inputMint || "input mint"),
        change: `-${String(data.amount || "configured amount")}`,
        reason: "Jupiter swap input",
      }, {
        asset: String(data.outputMint || "output mint"),
        change: "+quoted output",
        reason: "Jupiter swap output",
      }];
    }
    if (node.type === "action:token-transfer") {
      return [{
        asset: String(data.mint || "SOL / token mint"),
        change: `-${String(data.amount || "configured amount")}`,
        reason: "Token transfer",
      }];
    }
    return [];
  });
}

function transactionPlanFor(nodes: WorkflowNodeInput[]): WorkflowSimulationReport["transactionPlan"] {
  return nodes
    .filter((node) => WALLET_ACTIONS.has(node.type) || EXTERNAL_ACTIONS.has(node.type))
    .map((node) => {
      const data = nodeConfig(node);
      let effect = "Calls an external service";
      if (node.type === "action:jupiter-swap") {
        effect = `Simulates and signs a Jupiter swap for ${String(data.amount || "configured amount")}`;
      } else if (node.type === "action:token-transfer") {
        effect = `Simulates and signs a transfer to ${String(data.recipient || "configured recipient")}`;
      } else if (node.type === "output:webhook") {
        effect = `Sends execution payload to ${String(data.url || "configured webhook")}`;
      } else if (node.type === "action:oracle-price") {
        effect = `Reads ${String(data.provider || "oracle")} price feed`;
      } else if (node.type === "action:helius-rpc") {
        effect = `Runs ${String(data.method || "configured RPC method")}`;
      } else if (node.type === "action:metaplex-asset") {
        effect = "Reads DAS asset metadata";
      } else if (node.type === "action:squads-proposal") {
        effect = "Creates an approval proposal payload";
      }
      return { nodeId: node.id, type: node.type, label: nodeLabel(node.type), effect };
    });
}

export function createSimulationReport(
  definition: WorkflowDefinitionInput,
  settings: WorkflowSettingsInput = {},
): WorkflowSimulationReport {
  const nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
  const edges = Array.isArray(definition.edges) ? definition.edges : [];
  const safety = settings.safety ?? {};
  const walletActions = nodes.filter((node) => WALLET_ACTIONS.has(node.type)).length;
  const externalCalls = nodes.filter((node) => EXTERNAL_ACTIONS.has(node.type)).length;
  const triggerTypes = uniqueSorted(nodes.filter((node) => node.type.startsWith("trigger:")).map((node) => node.type));
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (nodes.length === 0) blockers.push("Add at least one trigger and one action before running.");
  if (nodes.length > 0 && triggerTypes.length === 0) warnings.push("No trigger node found. Manual runs may not emit initial input.");
  if (nodes.length > 1 && edges.length === 0) warnings.push("Nodes are not connected, so only root nodes may run.");
  if (walletActions > 0 && safety.simulationRequired === false) {
    blockers.push("Wallet actions require transaction simulation before signing.");
  }
  if (walletActions > 0 && safety.manualApprovalRequired === false && safety.walletAutomationAllowed !== true) {
    warnings.push("Manual approval is disabled, but wallet automation is not explicitly allowed.");
  }
  if (walletActions > 0 && safety.walletAutomationAllowed === true && !hasMeaningfulValue(safety.spendLimitLamports)) {
    warnings.push("Automated wallet actions should define a native SOL spend limit.");
  }
  if (externalCalls > 0 && !(safety.webhookAllowlist?.length)) {
    warnings.push("Consider adding an allowlist for webhook and API destinations.");
  }

  const requiredCredentials = requiredCredentialLabels(nodes);
  if (requiredCredentials.length > 0) {
    warnings.push(`Configure credentials or endpoints for: ${requiredCredentials.join(", ")}.`);
  }

  let riskLevel: WorkflowSimulationReport["riskLevel"] = "low";
  if (walletActions > 0 || warnings.length > 2) riskLevel = "medium";
  if (blockers.length > 0 || (walletActions > 1 && safety.walletAutomationAllowed === true)) riskLevel = "high";

  const estimatedFeeLamports = walletActions * 5_000;
  return {
    riskLevel,
    blocked: blockers.length > 0,
    estimatedFeeLamports,
    estimatedFeeSol: (estimatedFeeLamports / 1_000_000_000).toFixed(9),
    nodeCount: nodes.length,
    edgeCount: edges.length,
    walletActions,
    externalCalls,
    triggerTypes,
    route: buildRoute(nodes, edges),
    requiredCredentials,
    walletDeltas: walletDeltasFor(nodes),
    transactionPlan: transactionPlanFor(nodes),
    warnings,
    blockers,
  };
}

function baseSettings(): WorkflowSettingsInput {
  return {
    timeout: 120,
    retryPolicy: { maxAttempts: 1, delayMs: 0 },
    onError: "stop",
    safety: {
      simulationRequired: true,
      manualApprovalRequired: true,
      walletAutomationAllowed: false,
      maxSlippageBps: 100,
      webhookAllowlist: [],
      allowedMints: [],
    },
  };
}

function edge(id: string, source: string, target: string, sourceHandle?: string): WorkflowEdgeInput {
  return { id, source, target, sourceHandle };
}

function workflowDraft(
  matchedIntent: string,
  name: string,
  description: string,
  tags: string[],
  nodes: WorkflowNodeInput[],
  edges: WorkflowEdgeInput[],
): AssistantWorkflowDraft {
  return {
    matchedIntent,
    name,
    description,
    tags,
    definition: { nodes, edges },
    settings: baseSettings(),
  };
}

export function buildAssistantWorkflowDraft(prompt: string): AssistantWorkflowDraft {
  const text = prompt.toLowerCase();

  if (text.includes("nft") || text.includes("metadata") || text.includes("asset")) {
    return workflowDraft(
      "nft-asset-watch",
      "NFT Asset Watch",
      "Read Metaplex asset metadata through DAS-compatible RPC and send notable changes to a webhook.",
      ["nft", "metaplex", "helius", "watch"],
      [
        { id: "trigger", type: "trigger:manual", position: { x: 80, y: 180 }, data: {} },
        { id: "asset", type: "action:metaplex-asset", position: { x: 340, y: 180 }, data: { assetId: "YOUR_ASSET_ID", credentialId: "" } },
        { id: "notify", type: "output:webhook", position: { x: 620, y: 180 }, data: { url: "https://example.com/ops/nft-asset", method: "POST", body: "{{ $json.metaplexAsset }}" } },
      ],
      [edge("e1", "trigger", "asset"), edge("e2", "asset", "notify")],
    );
  }

  if (text.includes("wallet activity") || text.includes("wallet alert") || text.includes("signature")) {
    return workflowDraft(
      "wallet-activity-alert",
      "Wallet Activity Alert",
      "Poll recent wallet signatures and notify an operations webhook when activity is detected.",
      ["wallet", "activity", "helius", "alert"],
      [
        { id: "trigger", type: "trigger:cron", position: { x: 80, y: 180 }, data: { cronExpression: "*/5 * * * *", timezone: "UTC" } },
        { id: "activity", type: "action:helius-rpc", position: { x: 340, y: 180 }, data: { method: "getSignaturesForAddress", params: ["YOUR_WALLET_ADDRESS", { limit: 10 }], credentialId: "", rpcUrl: "" } },
        { id: "notify", type: "output:webhook", position: { x: 620, y: 180 }, data: { url: "https://example.com/ops/wallet-activity", method: "POST", body: "{{ $json.helius }}" } },
      ],
      [edge("e1", "trigger", "activity"), edge("e2", "activity", "notify")],
    );
  }

  if (text.includes("treasury") || text.includes("squads") || text.includes("approval")) {
    return workflowDraft(
      "treasury-approval",
      "Treasury Approval Flow",
      "Query treasury token accounts and prepare a Squads-compatible approval handoff.",
      ["treasury", "squads", "token", "approval"],
      [
        { id: "trigger", type: "trigger:manual", position: { x: 80, y: 180 }, data: {} },
        { id: "accounts", type: "action:token-account-query", position: { x: 340, y: 180 }, data: { owner: "YOUR_TREASURY_OWNER", tokenProgram: "spl", credentialId: "", rpcUrl: "" } },
        { id: "proposal", type: "action:squads-proposal", position: { x: 620, y: 180 }, data: { apiUrl: "https://example.com/squads/proposals", multisig: "YOUR_SQUADS_MULTISIG", title: "Review treasury token accounts", payload: { tokenAccounts: "{{ $json.tokenAccounts }}" }, credentialId: "" } },
      ],
      [edge("e1", "trigger", "accounts"), edge("e2", "accounts", "proposal")],
    );
  }

  if (text.includes("token account") || text.includes("token watcher")) {
    return workflowDraft(
      "token-account-watcher",
      "Token Account Watcher",
      "Watch SPL Token or Token-2022 accounts for an owner and notify when balances are present.",
      ["spl-token", "token-2022", "watcher"],
      [
        { id: "trigger", type: "trigger:cron", position: { x: 80, y: 180 }, data: { cronExpression: "*/15 * * * *", timezone: "UTC" } },
        { id: "accounts", type: "action:token-account-query", position: { x: 340, y: 180 }, data: { owner: "YOUR_OWNER_ADDRESS", tokenProgram: "spl", credentialId: "", rpcUrl: "" } },
        { id: "branch", type: "logic:if-else", position: { x: 600, y: 180 }, data: { field: "tokenAccounts.count", operator: "gt", value: "0" } },
        { id: "notify", type: "output:webhook", position: { x: 860, y: 120 }, data: { url: "https://example.com/ops/token-accounts", method: "POST", body: "{{ $json.tokenAccounts }}" } },
      ],
      [edge("e1", "trigger", "accounts"), edge("e2", "accounts", "branch"), edge("e3", "branch", "notify", "true")],
    );
  }

  if (text.includes("swap") || text.includes("dca") || text.includes("buy")) {
    return workflowDraft(
      "price-guarded-auto-swap",
      "Price-Guarded Auto Swap",
      "Fetch market price, check a guard condition, then prepare a simulated Jupiter swap and webhook summary.",
      ["jupiter", "swap", "dca", "price"],
      [
        { id: "trigger", type: "trigger:cron", position: { x: 80, y: 200 }, data: { cronExpression: "0 */6 * * *", timezone: "UTC" } },
        { id: "price", type: "action:price-fetch", position: { x: 330, y: 200 }, data: { token: "So11111111111111111111111111111111111111112", source: "dexscreener" } },
        { id: "guard", type: "logic:if-else", position: { x: 580, y: 200 }, data: { field: "price", operator: "lt", value: "180" } },
        { id: "swap", type: "action:jupiter-swap", position: { x: 830, y: 120 }, data: { inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", outputMint: "So11111111111111111111111111111111111111112", amount: "1000000", slippageBps: 50 } },
        { id: "notify", type: "output:webhook", position: { x: 1080, y: 120 }, data: { url: "https://example.com/ops/swap-summary", method: "POST", body: "{{ $json }}" } },
      ],
      [edge("e1", "trigger", "price"), edge("e2", "price", "guard"), edge("e3", "guard", "swap", "true"), edge("e4", "swap", "notify")],
    );
  }

  return workflowDraft(
    "price-alert",
    "Price Alert Workflow",
    "Fetch a token price on a schedule, branch on a threshold, and notify an operations webhook.",
    ["price", "alert", "monitoring"],
    [
      { id: "trigger", type: "trigger:cron", position: { x: 80, y: 180 }, data: { cronExpression: "*/5 * * * *", timezone: "UTC" } },
      { id: "price", type: "action:price-fetch", position: { x: 340, y: 180 }, data: { token: "So11111111111111111111111111111111111111112", source: "dexscreener" } },
      { id: "branch", type: "logic:if-else", position: { x: 600, y: 180 }, data: { field: "price", operator: "gt", value: "200" } },
      { id: "notify", type: "output:webhook", position: { x: 860, y: 120 }, data: { url: "https://example.com/ops/price-alert", method: "POST", body: '{"text":"SOL price alert: {{ $json.price }}"}' } },
    ],
    [edge("e1", "trigger", "price"), edge("e2", "price", "branch"), edge("e3", "branch", "notify", "true")],
  );
}

export function evaluateCloudTemplateCertification(template: TemplateLike): CloudTemplateCertification {
  const nodeTypes = template.nodeTypes ?? template.definition?.nodes?.map((node) => node.type) ?? [];
  const settings = template.settings ?? {};
  const safety = settings.safety ?? {};
  const hasTrigger = nodeTypes.some((type) => type.startsWith("trigger:"));
  const hasAction = nodeTypes.some((type) => type.startsWith("action:"));
  const hasOutput = nodeTypes.some((type) => type.startsWith("output:") || type === "action:squads-proposal");
  const walletAction = nodeTypes.some((type) => WALLET_ACTIONS.has(type));
  const protocolNode = nodeTypes.some((type) =>
    [
      "action:jupiter-swap",
      "action:oracle-price",
      "action:helius-rpc",
      "action:metaplex-asset",
      "action:token-account-query",
      "action:squads-proposal",
    ].includes(type),
  );

  const badges: CloudTemplateCertification["badges"] = [
    {
      label: "Verified",
      passed: hasTrigger && hasAction && nodeTypes.length >= 2,
      detail: "Has a trigger, action, and valid editable graph structure.",
    },
    {
      label: "Audited",
      passed: safety.simulationRequired !== false && safety.manualApprovalRequired !== false,
      detail: "Keeps simulation and manual approval enabled by default.",
    },
    {
      label: "Works with Devnet",
      passed: !walletAction || safety.simulationRequired !== false,
      detail: "Can be tested safely before production use.",
    },
    {
      label: "Mainnet Ready",
      passed: hasTrigger && hasAction && hasOutput && protocolNode,
      detail: "Uses production protocol nodes with an observable output path.",
    },
  ];

  const missing = badges.filter((badge) => !badge.passed).map((badge) => badge.label);
  return {
    certified: missing.length === 0,
    badges,
    missing,
  };
}

export function redactPreviewValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPreviewValue);
  if (!value || typeof value !== "object") return value ?? null;
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, child]) => {
    const lower = key.toLowerCase();
    if (
      lower.includes("credential") ||
      lower.includes("secret") ||
      lower.includes("apikey") ||
      lower.includes("api_key") ||
      lower.includes("password") ||
      lower === "bearertoken" ||
      lower === "authorization"
    ) {
      acc[key] = child ? "[redacted]" : child;
    } else {
      acc[key] = redactPreviewValue(child);
    }
    return acc;
  }, {});
}
