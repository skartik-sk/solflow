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
  transactionPlan: Array<{
    nodeId: string;
    type: string;
    label: string;
    effect: string;
  }>;
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
  "action:token-transfer",
  "action:jupiter-swap",
  "action:jupiter-swap-execute",
]);

const EXTERNAL_ACTIONS = new Set([
  "action:price-fetch",
  "action:jupiter-price",
  "action:jupiter-token-search",
  "action:jupiter-token-tag",
  "action:jupiter-token-category",
  "action:jupiter-recent-tokens",
  "action:jupiter-portfolio",
  "action:jupiter-swap-order",
  "action:jupiter-swap-build",
  "action:jupiter-swap-execute",
  "action:jupiter-swap",
  "action:ai-agent",
  "action:pyth-price",
  "action:pyth-feed-search",
  "action:pyth-latest-prices",
  "action:switchboard-price",
  "action:oracle-price",
  "action:helius-wallet-activity",
  "action:helius-transaction",
  "action:helius-parse-transaction",
  "action:helius-address-transactions",
  "action:helius-rpc",
  "action:metaplex-asset",
  "action:metaplex-get-asset",
  "action:metaplex-asset-proof",
  "action:metaplex-assets-by-owner",
  "action:metaplex-assets-by-group",
  "action:metaplex-assets-by-creator",
  "action:metaplex-assets-by-authority",
  "action:metaplex-search-assets",
  "action:squads-proposal",
  "output:webhook",
]);

const RUN_OUTPUT_ACTIONS = new Set([
  "output:display",
  "output:log",
  "output:result",
]);

const CREDENTIAL_NODE_TYPES = new Set([
  "action:jupiter-price",
  "action:jupiter-token-search",
  "action:jupiter-token-tag",
  "action:jupiter-token-category",
  "action:jupiter-recent-tokens",
  "action:jupiter-portfolio",
  "action:jupiter-swap-order",
  "action:jupiter-swap-build",
  "action:jupiter-swap-execute",
  "action:jupiter-swap",
  "action:ai-agent",
  "action:switchboard-price",
  "action:helius-wallet-activity",
  "action:helius-transaction",
  "action:helius-parse-transaction",
  "action:helius-address-transactions",
  "action:helius-rpc",
  "action:metaplex-get-asset",
  "action:metaplex-asset-proof",
  "action:metaplex-assets-by-owner",
  "action:metaplex-assets-by-group",
  "action:metaplex-assets-by-creator",
  "action:metaplex-assets-by-authority",
  "action:metaplex-search-assets",
  "action:metaplex-asset",
  "action:squads-proposal",
  "output:webhook",
]);

const NODE_LABELS: Record<string, string> = {
  "trigger:manual": "Manual Trigger",
  "trigger:cron": "Cron Trigger",
  "trigger:webhook": "Webhook Trigger",
  "action:price-fetch": "Price Fetch",
  "action:jupiter-price": "Jupiter Price",
  "action:jupiter-token-search": "Jupiter Token Search",
  "action:jupiter-token-tag": "Jupiter Token Tag",
  "action:jupiter-token-category": "Jupiter Token Category",
  "action:jupiter-recent-tokens": "Jupiter Recent Tokens",
  "action:jupiter-portfolio": "Jupiter Portfolio",
  "action:jupiter-swap-order": "Jupiter Swap Order",
  "action:jupiter-swap-build": "Jupiter Swap Build",
  "action:jupiter-swap-execute": "Jupiter Swap Execute",
  "action:jupiter-swap": "Jupiter Direct Swap",
  "action:token-transfer": "Token Transfer",
  "action:ai-agent": "AI Agent",
  "action:pyth-price": "Pyth Price",
  "action:pyth-feed-search": "Pyth Feed Search",
  "action:pyth-latest-prices": "Pyth Latest Prices",
  "action:switchboard-price": "Switchboard Price",
  "action:oracle-price": "Oracle Price",
  "action:helius-wallet-activity": "Helius Wallet Activity",
  "action:helius-transaction": "Helius Transaction",
  "action:helius-parse-transaction": "Helius Parse Transaction",
  "action:helius-address-transactions": "Helius Address Transactions",
  "action:helius-rpc": "Helius RPC",
  "action:token-account-query": "Token Account Query",
  "action:metaplex-get-asset": "Metaplex Get Asset",
  "action:metaplex-asset-proof": "Metaplex Asset Proof",
  "action:metaplex-assets-by-owner": "Metaplex Assets by Owner",
  "action:metaplex-assets-by-group": "Metaplex Assets by Collection",
  "action:metaplex-assets-by-creator": "Metaplex Assets by Creator",
  "action:metaplex-assets-by-authority": "Metaplex Assets by Authority",
  "action:metaplex-search-assets": "Metaplex Search Assets",
  "action:metaplex-asset": "Metaplex Asset",
  "action:squads-proposal": "Squads Proposal",
  "transform:filter": "Filter",
  "logic:if-else": "If / Else",
  "logic:wait": "Wait",
  "output:webhook": "Webhook Output",
  "output:display": "Display Output",
  "output:log": "Run Log",
  "output:result": "Workflow Result",
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

function jupiterOperation(node: WorkflowNodeInput): string {
  const typeOperation: Record<string, string> = {
    "action:jupiter-price": "price",
    "action:jupiter-token-search": "token-search",
    "action:jupiter-token-tag": "token-tag",
    "action:jupiter-token-category": "token-category",
    "action:jupiter-recent-tokens": "token-recent",
    "action:jupiter-portfolio": "portfolio-positions",
    "action:jupiter-swap-order": "swap-order",
    "action:jupiter-swap-build": "swap-build",
    "action:jupiter-swap-execute": "swap-execute",
  };
  if (typeOperation[node.type]) return typeOperation[node.type];
  if (node.type === "action:jupiter-swap") {
    return String(nodeConfig(node).operation || "swap-direct-send");
  }
  return String(nodeConfig(node).operation || "");
}

function isWalletAction(node: WorkflowNodeInput): boolean {
  if (WALLET_ACTIONS.has(node.type)) return true;
  return (
    (node.type === "action:jupiter-swap" &&
      jupiterOperation(node) === "swap-direct-send") ||
    node.type === "action:jupiter-swap-execute"
  );
}

function buildRoute(
  nodes: WorkflowNodeInput[],
  edges: WorkflowEdgeInput[],
): string[] {
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
        if (
          node.type.startsWith("action:jupiter-") ||
          node.type === "action:jupiter-swap"
        ) {
          return ["Jupiter API key for production rate limits"];
        }
        if (node.type === "action:ai-agent") return ["AI provider key"];
        if (
          node.type === "action:helius-rpc" ||
          node.type === "action:helius-wallet-activity" ||
          node.type === "action:helius-transaction" ||
          node.type === "action:helius-parse-transaction" ||
          node.type === "action:helius-address-transactions" ||
          node.type === "action:metaplex-asset" ||
          node.type === "action:metaplex-get-asset" ||
          node.type === "action:metaplex-asset-proof" ||
          node.type === "action:metaplex-assets-by-owner" ||
          node.type === "action:metaplex-assets-by-group" ||
          node.type === "action:metaplex-assets-by-creator" ||
          node.type === "action:metaplex-assets-by-authority" ||
          node.type === "action:metaplex-search-assets"
        ) {
          return ["Helius or DAS RPC"];
        }
        if (node.type === "action:switchboard-price")
          return ["Switchboard API"];
        if (node.type === "action:squads-proposal") return ["Squads API"];
        return [];
      }),
  );
}

function walletDeltasFor(
  nodes: WorkflowNodeInput[],
): WorkflowSimulationReport["walletDeltas"] {
  return nodes.flatMap((node) => {
    const data = nodeConfig(node);
    if (node.type === "action:jupiter-swap") {
      const operation = jupiterOperation(node);
      if (operation !== "swap-direct-send") return [];
      return [
        {
          asset: String(data.inputMint || "input mint"),
          change: `-${String(data.amount || "configured amount")}`,
          reason: "Jupiter direct swap input",
        },
        {
          asset: String(data.outputMint || "output mint"),
          change: "+swap output",
          reason: "Jupiter direct swap output",
        },
      ];
    }
    if (
      node.type === "action:jupiter-swap-order" ||
      node.type === "action:jupiter-swap-build"
    ) {
      return [
        {
          asset: String(data.inputMint || "input mint"),
          change: `-${String(data.amount || "configured amount")}`,
          reason: "Jupiter quoted input",
        },
        {
          asset: String(data.outputMint || "output mint"),
          change: "+quoted output",
          reason: "Jupiter quoted output",
        },
      ];
    }
    if (node.type === "action:jupiter-swap-execute") {
      return [
        {
          asset: "order input",
          change: "-signed order input",
          reason: "Jupiter order execution",
        },
        {
          asset: "order output",
          change: "+executed order output",
          reason: "Jupiter order execution",
        },
      ];
    }
    if (node.type === "action:token-transfer") {
      return [
        {
          asset: String(data.mint || "SOL / token mint"),
          change: `-${String(data.amount || "configured amount")}`,
          reason: "Token transfer",
        },
      ];
    }
    return [];
  });
}

function transactionPlanFor(
  nodes: WorkflowNodeInput[],
): WorkflowSimulationReport["transactionPlan"] {
  return nodes
    .filter(
      (node) =>
        isWalletAction(node) ||
        EXTERNAL_ACTIONS.has(node.type) ||
        RUN_OUTPUT_ACTIONS.has(node.type),
    )
    .map((node) => {
      const data = nodeConfig(node);
      let effect = "Calls an external service";
      if (node.type === "action:jupiter-price") {
        effect = `Reads Jupiter Price API for ${String(data.tokenIds || "configured token ids")}`;
      } else if (node.type === "action:jupiter-token-search") {
        effect = `Searches Jupiter Tokens API for ${String(data.query || "configured query")}`;
      } else if (node.type === "action:jupiter-token-tag") {
        effect = `Reads Jupiter Tokens API tag ${String(data.tokenTag || "verified")}`;
      } else if (node.type === "action:jupiter-token-category") {
        effect = `Reads Jupiter Tokens API category ${String(data.tokenCategory || "toptraded")}`;
      } else if (node.type === "action:jupiter-recent-tokens") {
        effect = "Reads recent Jupiter token listings";
      } else if (node.type === "action:jupiter-portfolio") {
        effect = "Reads Jupiter Portfolio positions for the configured wallet";
      } else if (node.type === "action:jupiter-swap-order") {
        effect = `Builds a Jupiter Swap API V2 order for ${String(data.amount || "configured amount")}`;
      } else if (node.type === "action:jupiter-swap-build") {
        effect = `Builds Jupiter swap instructions for ${String(data.amount || "configured amount")}`;
      } else if (node.type === "action:jupiter-swap-execute") {
        effect = "Signs and executes a Jupiter Swap API V2 order transaction";
      } else if (node.type === "action:jupiter-swap") {
        const operation = jupiterOperation(node);
        if (operation === "price") {
          effect = `Reads Jupiter Price API for ${String(data.tokenIds || "configured token ids")}`;
        } else if (operation === "token-category") {
          effect = `Reads Jupiter Tokens API category ${String(data.tokenCategory || "toptraded")}`;
        } else {
          effect = `Creates, simulates, signs, and executes a Jupiter Swap API V2 order for ${String(data.amount || "configured amount")}`;
        }
      } else if (node.type === "action:token-transfer") {
        effect = `Simulates and signs a transfer to ${String(data.recipient || "configured recipient")}`;
      } else if (node.type === "output:webhook") {
        effect = `Sends execution payload to ${String(data.url || "configured webhook")}`;
      } else if (node.type === "output:display") {
        effect = `Displays ${String(data.title || "workflow output")} in run results`;
      } else if (node.type === "output:log") {
        effect = "Writes a message to the run logs";
      } else if (node.type === "output:result") {
        effect = `Captures ${String(data.name || "workflow result")} as final run output`;
      } else if (node.type === "action:pyth-price") {
        effect = `Reads Pyth price feed ${String(data.feedId || "configured feed")}`;
      } else if (node.type === "action:pyth-feed-search") {
        effect = `Searches Pyth feeds for ${String(data.query || "configured query")}`;
      } else if (node.type === "action:pyth-latest-prices") {
        effect = `Reads latest Pyth prices for ${String(data.feedIds || "configured feeds")}`;
      } else if (node.type === "action:switchboard-price") {
        effect = "Reads a Switchboard-compatible price endpoint";
      } else if (node.type === "action:oracle-price") {
        effect =
          data.operation === "feed-search"
            ? `Searches Pyth feeds for ${String(data.query || "configured query")}`
            : `Reads ${String(data.provider || "oracle")} price feed`;
      } else if (node.type === "action:helius-wallet-activity") {
        effect = `Reads recent signatures for ${String(data.address || "configured wallet")}`;
      } else if (node.type === "action:helius-transaction") {
        effect = "Reads Solana JSON-RPC transaction details";
      } else if (node.type === "action:helius-parse-transaction") {
        effect = "Parses a transaction with Helius Enhanced Transactions";
      } else if (node.type === "action:helius-address-transactions") {
        effect = `Reads enhanced transaction history for ${String(data.address || "configured address")}`;
      } else if (node.type === "action:helius-rpc") {
        effect = `Runs ${String(data.method || "configured RPC method")}`;
      } else if (node.type === "action:metaplex-get-asset") {
        effect = "Reads one Metaplex DAS asset";
      } else if (node.type === "action:metaplex-asset-proof") {
        effect = "Reads a DAS Merkle proof for one compressed asset";
      } else if (node.type === "action:metaplex-assets-by-owner") {
        effect = `Lists Metaplex DAS assets for ${String(data.ownerAddress || "configured owner")}`;
      } else if (node.type === "action:metaplex-assets-by-group") {
        effect = `Lists Metaplex DAS assets for collection/group ${String(data.groupValue || "configured group")}`;
      } else if (node.type === "action:metaplex-assets-by-creator") {
        effect = `Lists Metaplex DAS assets for creator ${String(data.creatorAddress || "configured creator")}`;
      } else if (node.type === "action:metaplex-assets-by-authority") {
        effect = `Lists Metaplex DAS assets for authority ${String(data.authorityAddress || "configured authority")}`;
      } else if (node.type === "action:metaplex-search-assets") {
        effect = "Searches Metaplex DAS assets";
      } else if (node.type === "action:metaplex-asset") {
        effect = `Runs DAS ${String(data.operation || "getAsset")} through Metaplex/Helius`;
      } else if (node.type === "action:squads-proposal") {
        effect = "Creates an approval proposal payload";
      }
      return {
        nodeId: node.id,
        type: node.type,
        label: nodeLabel(node.type),
        effect,
      };
    });
}

export function createSimulationReport(
  definition: WorkflowDefinitionInput,
  settings: WorkflowSettingsInput = {},
): WorkflowSimulationReport {
  const nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
  const edges = Array.isArray(definition.edges) ? definition.edges : [];
  const safety = settings.safety ?? {};
  const walletActions = nodes.filter(isWalletAction).length;
  const externalCalls = nodes.filter((node) =>
    EXTERNAL_ACTIONS.has(node.type),
  ).length;
  const triggerTypes = uniqueSorted(
    nodes
      .filter((node) => node.type.startsWith("trigger:"))
      .map((node) => node.type),
  );
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (nodes.length === 0)
    blockers.push("Add at least one trigger and one action before running.");
  if (nodes.length > 0 && triggerTypes.length === 0)
    warnings.push(
      "No trigger node found. Manual runs may not emit initial input.",
    );
  if (nodes.length > 1 && edges.length === 0)
    warnings.push("Nodes are not connected, so only root nodes may run.");
  if (walletActions > 0 && safety.simulationRequired === false) {
    blockers.push(
      "Wallet actions require transaction simulation before signing.",
    );
  }
  if (
    walletActions > 0 &&
    safety.manualApprovalRequired === false &&
    safety.walletAutomationAllowed !== true
  ) {
    warnings.push(
      "Manual approval is disabled, but wallet automation is not explicitly allowed.",
    );
  }
  if (
    walletActions > 0 &&
    safety.walletAutomationAllowed === true &&
    !hasMeaningfulValue(safety.spendLimitLamports)
  ) {
    warnings.push(
      "Automated wallet actions should define a native SOL spend limit.",
    );
  }
  if (externalCalls > 0 && !safety.webhookAllowlist?.length) {
    warnings.push(
      "Consider adding an allowlist for webhook and API destinations.",
    );
  }

  const requiredCredentials = requiredCredentialLabels(nodes);
  if (requiredCredentials.length > 0) {
    warnings.push(
      `Configure credentials or endpoints for: ${requiredCredentials.join(", ")}.`,
    );
  }

  let riskLevel: WorkflowSimulationReport["riskLevel"] = "low";
  if (walletActions > 0 || warnings.length > 2) riskLevel = "medium";
  if (
    blockers.length > 0 ||
    (walletActions > 1 && safety.walletAutomationAllowed === true)
  )
    riskLevel = "high";

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

function edge(
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
): WorkflowEdgeInput {
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

export function buildAssistantWorkflowDraft(
  prompt: string,
): AssistantWorkflowDraft {
  const text = prompt.toLowerCase();

  if (
    text.includes("nft") ||
    text.includes("metadata") ||
    text.includes("asset")
  ) {
    return workflowDraft(
      "nft-asset-watch",
      "NFT Asset Watch",
      "Read Metaplex asset metadata through DAS-compatible RPC and send notable changes to a webhook.",
      ["nft", "metaplex", "helius", "watch"],
      [
        {
          id: "trigger",
          type: "trigger:manual",
          position: { x: 80, y: 180 },
          data: {},
        },
        {
          id: "asset",
          type: "action:metaplex-get-asset",
          position: { x: 340, y: 180 },
          data: { assetId: "YOUR_ASSET_ID", credentialId: "" },
        },
        {
          id: "notify",
          type: "output:webhook",
          position: { x: 620, y: 180 },
          data: {
            url: "https://example.com/ops/nft-asset",
            method: "POST",
            body: "{{ $json.metaplexAsset }}",
          },
        },
      ],
      [edge("e1", "trigger", "asset"), edge("e2", "asset", "notify")],
    );
  }

  if (
    text.includes("wallet activity") ||
    text.includes("wallet alert") ||
    text.includes("signature")
  ) {
    return workflowDraft(
      "wallet-activity-alert",
      "Wallet Activity Alert",
      "Poll recent wallet signatures and notify an operations webhook when activity is detected.",
      ["wallet", "activity", "helius", "alert"],
      [
        {
          id: "trigger",
          type: "trigger:cron",
          position: { x: 80, y: 180 },
          data: { cronExpression: "*/5 * * * *", timezone: "UTC" },
        },
        {
          id: "activity",
          type: "action:helius-wallet-activity",
          position: { x: 340, y: 180 },
          data: {
            address: "YOUR_WALLET_ADDRESS",
            limit: 10,
            credentialId: "",
            rpcUrl: "",
          },
        },
        {
          id: "notify",
          type: "output:webhook",
          position: { x: 620, y: 180 },
          data: {
            url: "https://example.com/ops/wallet-activity",
            method: "POST",
            body: "{{ $json.helius }}",
          },
        },
      ],
      [edge("e1", "trigger", "activity"), edge("e2", "activity", "notify")],
    );
  }

  if (
    text.includes("treasury") ||
    text.includes("squads") ||
    text.includes("approval")
  ) {
    return workflowDraft(
      "treasury-approval",
      "Treasury Approval Flow",
      "Query treasury token accounts and prepare a Squads-compatible approval handoff.",
      ["treasury", "squads", "token", "approval"],
      [
        {
          id: "trigger",
          type: "trigger:manual",
          position: { x: 80, y: 180 },
          data: {},
        },
        {
          id: "accounts",
          type: "action:token-account-query",
          position: { x: 340, y: 180 },
          data: {
            owner: "YOUR_TREASURY_OWNER",
            tokenProgram: "spl",
            credentialId: "",
            rpcUrl: "",
          },
        },
        {
          id: "proposal",
          type: "action:squads-proposal",
          position: { x: 620, y: 180 },
          data: {
            apiUrl: "https://example.com/squads/proposals",
            multisig: "YOUR_SQUADS_MULTISIG",
            title: "Review treasury token accounts",
            payload: { tokenAccounts: "{{ $json.tokenAccounts }}" },
            credentialId: "",
          },
        },
      ],
      [edge("e1", "trigger", "accounts"), edge("e2", "accounts", "proposal")],
    );
  }

  if (
    text.includes("token discovery") ||
    text.includes("trending token") ||
    text.includes("top traded")
  ) {
    return workflowDraft(
      "jupiter-token-discovery",
      "Jupiter Token Discovery",
      "Read Jupiter Tokens V2 category data and send top token metadata to a webhook.",
      ["jupiter", "tokens", "discovery", "market"],
      [
        {
          id: "trigger",
          type: "trigger:manual",
          position: { x: 80, y: 180 },
          data: {},
        },
        {
          id: "tokens",
          type: "action:jupiter-token-category",
          position: { x: 340, y: 180 },
          data: {
            tokenCategory: "toptraded",
            tokenInterval: "24h",
            tokenLimit: 25,
            credentialId: "",
          },
        },
        {
          id: "notify",
          type: "output:webhook",
          position: { x: 620, y: 180 },
          data: {
            url: "https://example.com/ops/jupiter-token-discovery",
            method: "POST",
            body: "{{ $json.jupiter }}",
          },
        },
      ],
      [edge("e1", "trigger", "tokens"), edge("e2", "tokens", "notify")],
    );
  }

  if (text.includes("token account") || text.includes("token watcher")) {
    return workflowDraft(
      "token-account-watcher",
      "Token Account Watcher",
      "Watch SPL Token or Token-2022 accounts for an owner and notify when balances are present.",
      ["spl-token", "token-2022", "watcher"],
      [
        {
          id: "trigger",
          type: "trigger:cron",
          position: { x: 80, y: 180 },
          data: { cronExpression: "*/15 * * * *", timezone: "UTC" },
        },
        {
          id: "accounts",
          type: "action:token-account-query",
          position: { x: 340, y: 180 },
          data: {
            owner: "YOUR_OWNER_ADDRESS",
            tokenProgram: "spl",
            credentialId: "",
            rpcUrl: "",
          },
        },
        {
          id: "branch",
          type: "logic:if-else",
          position: { x: 600, y: 180 },
          data: { field: "tokenAccounts.count", operator: "gt", value: "0" },
        },
        {
          id: "notify",
          type: "output:webhook",
          position: { x: 860, y: 120 },
          data: {
            url: "https://example.com/ops/token-accounts",
            method: "POST",
            body: "{{ $json.tokenAccounts }}",
          },
        },
      ],
      [
        edge("e1", "trigger", "accounts"),
        edge("e2", "accounts", "branch"),
        edge("e3", "branch", "notify", "true"),
      ],
    );
  }

  if (text.includes("swap") || text.includes("dca") || text.includes("buy")) {
    return workflowDraft(
      "price-guarded-auto-swap",
      "Price-Guarded Auto Swap",
      "Fetch market price, check a guard condition, then prepare a simulated Jupiter swap and webhook summary.",
      ["jupiter", "swap", "dca", "price"],
      [
        {
          id: "trigger",
          type: "trigger:cron",
          position: { x: 80, y: 200 },
          data: { cronExpression: "0 */6 * * *", timezone: "UTC" },
        },
        {
          id: "price",
          type: "action:price-fetch",
          position: { x: 330, y: 200 },
          data: {
            token: "So11111111111111111111111111111111111111112",
            source: "dexscreener",
          },
        },
        {
          id: "guard",
          type: "logic:if-else",
          position: { x: 580, y: 200 },
          data: { field: "price", operator: "lt", value: "180" },
        },
        {
          id: "swap",
          type: "action:jupiter-swap-order",
          position: { x: 830, y: 120 },
          data: {
            inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            outputMint: "So11111111111111111111111111111111111111112",
            amount: "1000000",
            slippageBps: 50,
            walletAddress: "YOUR_TAKER_ADDRESS",
          },
        },
        {
          id: "notify",
          type: "output:webhook",
          position: { x: 1080, y: 120 },
          data: {
            url: "https://example.com/ops/swap-summary",
            method: "POST",
            body: "{{ $json }}",
          },
        },
      ],
      [
        edge("e1", "trigger", "price"),
        edge("e2", "price", "guard"),
        edge("e3", "guard", "swap", "true"),
        edge("e4", "swap", "notify"),
      ],
    );
  }

  return workflowDraft(
    "price-alert",
    "Price Alert Workflow",
    "Fetch a token price on a schedule, branch on a threshold, and notify an operations webhook.",
    ["price", "alert", "monitoring"],
    [
      {
        id: "trigger",
        type: "trigger:cron",
        position: { x: 80, y: 180 },
        data: { cronExpression: "*/5 * * * *", timezone: "UTC" },
      },
      {
        id: "price",
        type: "action:price-fetch",
        position: { x: 340, y: 180 },
        data: {
          token: "So11111111111111111111111111111111111111112",
          source: "dexscreener",
        },
      },
      {
        id: "branch",
        type: "logic:if-else",
        position: { x: 600, y: 180 },
        data: { field: "price", operator: "gt", value: "200" },
      },
      {
        id: "notify",
        type: "output:webhook",
        position: { x: 860, y: 120 },
        data: {
          url: "https://example.com/ops/price-alert",
          method: "POST",
          body: '{"text":"SOL price alert: {{ $json.price }}"}',
        },
      },
    ],
    [
      edge("e1", "trigger", "price"),
      edge("e2", "price", "branch"),
      edge("e3", "branch", "notify", "true"),
    ],
  );
}

export function evaluateCloudTemplateCertification(
  template: TemplateLike,
): CloudTemplateCertification {
  const nodeTypes =
    template.nodeTypes ??
    template.definition?.nodes?.map((node) => node.type) ??
    [];
  const settings = template.settings ?? {};
  const safety = settings.safety ?? {};
  const hasTrigger = nodeTypes.some((type) => type.startsWith("trigger:"));
  const hasAction = nodeTypes.some((type) => type.startsWith("action:"));
  const hasOutput = nodeTypes.some(
    (type) => type.startsWith("output:") || type === "action:squads-proposal",
  );
  const walletAction =
    template.definition?.nodes?.some(isWalletAction) ??
    nodeTypes.some((type) => WALLET_ACTIONS.has(type));
  const protocolNode = nodeTypes.some((type) =>
    [
      "action:jupiter-swap",
      "action:jupiter-price",
      "action:jupiter-token-search",
      "action:jupiter-token-tag",
      "action:jupiter-token-category",
      "action:jupiter-recent-tokens",
      "action:jupiter-portfolio",
      "action:jupiter-swap-order",
      "action:jupiter-swap-build",
      "action:jupiter-swap-execute",
      "action:oracle-price",
      "action:pyth-price",
      "action:pyth-feed-search",
      "action:pyth-latest-prices",
      "action:switchboard-price",
      "action:helius-rpc",
      "action:helius-wallet-activity",
      "action:helius-transaction",
      "action:helius-parse-transaction",
      "action:helius-address-transactions",
      "action:metaplex-asset",
      "action:metaplex-get-asset",
      "action:metaplex-asset-proof",
      "action:metaplex-assets-by-owner",
      "action:metaplex-assets-by-group",
      "action:metaplex-assets-by-creator",
      "action:metaplex-assets-by-authority",
      "action:metaplex-search-assets",
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
      passed:
        safety.simulationRequired !== false &&
        safety.manualApprovalRequired !== false,
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

  const missing = badges
    .filter((badge) => !badge.passed)
    .map((badge) => badge.label);
  return {
    certified: missing.length === 0,
    badges,
    missing,
  };
}

export function redactPreviewValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPreviewValue);
  if (!value || typeof value !== "object") return value ?? null;
  return Object.entries(value as Record<string, unknown>).reduce<
    Record<string, unknown>
  >((acc, [key, child]) => {
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
