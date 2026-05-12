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
  "action:umbra-transfer",
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
  "action:umbra-indexer-health",
  "action:umbra-relayer-info",
  "action:umbra-transfer",
  "action:solana-rpc",
  "action:custom-api",
  "action:helius-webhook-create",
  "action:helius-webhook-list",
  "action:helius-webhook-delete",
  "action:jito-tip-accounts",
  "action:jito-bundle-status",
  "action:jito-send-bundle",
  "action:jito-tip-floor",
  "action:discord-message",
  "action:telegram-message",
  "action:dialect-alert",
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
  "action:solana-rpc",
  "action:custom-api",
  "action:helius-webhook-create",
  "action:helius-webhook-list",
  "action:helius-webhook-delete",
  "action:jito-tip-accounts",
  "action:jito-bundle-status",
  "action:jito-send-bundle",
  "action:discord-message",
  "action:telegram-message",
  "action:dialect-alert",
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
  "action:umbra-indexer-health": "Umbra Indexer Health",
  "action:umbra-relayer-info": "Umbra Relayer Info",
  "action:umbra-transfer": "Umbra Transfer Plan",
  "action:solana-rpc": "Solana RPC",
  "action:custom-api": "Custom API Request",
  "action:helius-webhook-create": "Helius Webhook Create",
  "action:helius-webhook-list": "Helius Webhook List",
  "action:helius-webhook-delete": "Helius Webhook Delete",
  "action:jito-tip-accounts": "Jito Tip Accounts",
  "action:jito-bundle-status": "Jito Bundle Status",
  "action:jito-send-bundle": "Jito Send Bundle",
  "action:jito-tip-floor": "Jito Tip Floor",
  "action:discord-message": "Discord Message",
  "action:telegram-message": "Telegram Message",
  "action:dialect-alert": "Dialect Alert",
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

function redactPreviewString(value: string): string {
  if (!/^https?:\/\//i.test(value)) {
    return value.replace(
      /(api[-_ ]?key|secret|token|password|private[-_ ]?key|bearer)\s*[:=]\s*["']?[^"'\s,}]+/gi,
      "$1=[redacted]",
    );
  }

  try {
    const url = new URL(value);
    for (const key of Array.from(url.searchParams.keys())) {
      if (/key|token|secret|auth|password|credential|bearer|uuid|jwt|signature/i.test(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    url.pathname = url.pathname
      .split("/")
      .map((segment) => {
        if (!segment) return segment;
        let decoded = segment;
        try {
          decoded = decodeURIComponent(segment);
        } catch {
          decoded = segment;
        }
        if (
          /key|token|secret|auth|password|credential|bearer|uuid|jwt/i.test(decoded) ||
          /^(?=.{16,}$)(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9._~=-]+$/.test(decoded)
        ) {
          return "[redacted]";
        }
        return segment;
      })
      .join("/");
    return url.toString();
  } catch {
    return value;
  }
}

function previewText(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return redactPreviewString(value.trim());
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
        if (node.type === "action:solana-rpc") {
          const provider = String(data.provider || "");
          if (["rpcfast", "quicknode", "alchemy", "triton", "helius"].includes(provider)) {
            return [`${provider} RPC credential or endpoint`];
          }
        }
        if (node.type === "action:custom-api") {
          return ["Webhook/API credential when the target needs auth"];
        }
        if (
          node.type === "action:helius-webhook-create" ||
          node.type === "action:helius-webhook-list" ||
          node.type === "action:helius-webhook-delete"
        ) {
          return ["Helius API key"];
        }
        if (
          node.type === "action:jito-tip-accounts" ||
          node.type === "action:jito-bundle-status" ||
          node.type === "action:jito-send-bundle"
        ) {
          return ["Jito auth UUID for authenticated limits"];
        }
        if (node.type === "action:discord-message") return ["Discord webhook"];
        if (node.type === "action:telegram-message") return ["Telegram bot token"];
        if (node.type === "action:dialect-alert") return ["Dialect API key"];
        return [];
      }),
  );
}

function hasRunnableAddress(value: unknown): boolean {
  return hasMeaningfulValue(value);
}

function missingRuntimeConfigLabels(nodes: WorkflowNodeInput[]): string[] {
  return uniqueSorted(
    nodes.flatMap((node) => {
      const data = nodeConfig(node);
      if (node.type === "action:token-transfer") {
        const missing = [];
        if (!hasRunnableAddress(data.to)) missing.push("Token Transfer destination");
        if (!hasMeaningfulValue(data.amount)) missing.push("Token Transfer amount");
        if (!hasMeaningfulValue(data.walletId)) missing.push("Token Transfer source wallet");
        return missing;
      }
      if (
        node.type === "action:jupiter-swap" &&
        jupiterOperation(node) === "swap-direct-send" &&
        !hasMeaningfulValue(data.walletId)
      ) {
        return ["Jupiter Direct Swap source wallet"];
      }
      if (
        (node.type === "action:jupiter-swap-order" ||
          node.type === "action:jupiter-swap-build") &&
        !hasRunnableAddress(data.walletAddress) &&
        !hasMeaningfulValue(data.walletId)
      ) {
        return ["Jupiter Swap taker wallet"];
      }
      if (
        node.type === "action:jupiter-portfolio" &&
        !hasRunnableAddress(data.walletAddress) &&
        !hasMeaningfulValue(data.walletId)
      ) {
        return ["Jupiter Portfolio wallet"];
      }
      if (
        (node.type === "action:helius-wallet-activity" ||
          node.type === "action:helius-address-transactions") &&
        !hasRunnableAddress(data.address)
      ) {
        return ["Helius wallet address"];
      }
      if (node.type === "action:token-account-query" && !hasRunnableAddress(data.owner)) {
        return ["Token Account Query owner"];
      }
      if (node.type === "action:metaplex-get-asset" && !hasMeaningfulValue(data.assetId)) {
        return ["Metaplex asset id"];
      }
      if (node.type === "action:umbra-transfer") {
        const missing = [];
        if (!hasRunnableAddress(data.recipientAddress)) missing.push("Umbra Transfer recipient");
        if (!hasMeaningfulValue(data.amountBaseUnits)) missing.push("Umbra Transfer amount");
        if (!hasMeaningfulValue(data.senderWalletId)) missing.push("Umbra Transfer sender wallet");
        return missing;
      }
      if (
        node.type === "action:solana-rpc" &&
        ["rpcfast", "quicknode", "alchemy", "triton", "helius", "custom"].includes(String(data.provider || "")) &&
        !hasRunnableAddress(data.rpcUrl) &&
        !hasMeaningfulValue(data.credentialId)
      ) {
        return ["Solana RPC endpoint or credential"];
      }
      if (node.type === "action:custom-api" && !hasRunnableAddress(data.url)) {
        return ["Custom API URL"];
      }
      if (node.type === "action:helius-webhook-create") {
        const missing = [];
        if (!hasRunnableAddress(data.webhookUrl)) missing.push("Helius destination webhook URL");
        if (!hasMeaningfulValue(data.credentialId)) missing.push("Helius credential");
        return missing;
      }
      if (node.type === "action:helius-webhook-delete" && !hasRunnableAddress(data.webhookId)) {
        return ["Helius webhook ID"];
      }
      if (node.type === "action:jito-bundle-status" && !hasMeaningfulValue(data.bundleIds)) {
        return ["Jito bundle IDs"];
      }
      if (node.type === "action:jito-send-bundle" && !hasMeaningfulValue(data.transactions)) {
        return ["Jito signed transactions"];
      }
      if (node.type === "action:discord-message") {
        const missing = [];
        if (!hasRunnableAddress(data.webhookUrl) && !hasMeaningfulValue(data.credentialId)) missing.push("Discord webhook URL");
        if (!hasMeaningfulValue(data.content) && !hasMeaningfulValue(data.embeds)) missing.push("Discord message content");
        return missing;
      }
      if (node.type === "action:telegram-message") {
        const missing = [];
        if (!hasMeaningfulValue(data.credentialId)) missing.push("Telegram credential");
        if (!hasRunnableAddress(data.chatId)) missing.push("Telegram chat ID");
        if (!hasMeaningfulValue(data.text)) missing.push("Telegram message text");
        return missing;
      }
      if (node.type === "action:dialect-alert") {
        const missing = [];
        if (!hasMeaningfulValue(data.credentialId)) missing.push("Dialect credential");
        if (!hasRunnableAddress(data.appId)) missing.push("Dialect app ID");
        if (!hasMeaningfulValue(data.title)) missing.push("Dialect alert title");
        if (!hasMeaningfulValue(data.body)) missing.push("Dialect alert body");
        if (data.recipientType !== "all-subscribers" && !hasRunnableAddress(data.walletAddress) && !hasMeaningfulValue(data.walletAddresses)) {
          missing.push("Dialect recipient wallet");
        }
        return missing;
      }
      if (node.type === "output:webhook" && !hasRunnableAddress(data.url)) {
        return ["Webhook Output URL"];
      }
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
          asset: String(data.token || "SOL / token mint"),
          change: `-${String(data.amount || "configured amount")}`,
          reason: "Token transfer",
        },
      ];
    }
    if (node.type === "action:umbra-transfer") {
      return [
        {
          asset: String(data.mint || "Umbra-supported mint"),
          change: `-${String(data.amountBaseUnits || "configured amount")}`,
          reason: "Umbra private transfer plan",
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
        effect = `Simulates and signs a transfer to ${String(data.to || "configured recipient")}`;
      } else if (node.type === "output:webhook") {
        effect = `Sends execution payload to ${previewText(data.url, "configured webhook")}`;
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
      } else if (node.type === "action:umbra-indexer-health") {
        effect = "Checks the Umbra UTXO indexer health endpoint";
      } else if (node.type === "action:umbra-relayer-info") {
        effect = "Reads Umbra relayer identity, supported mints, and active stealth pools";
      } else if (node.type === "action:umbra-transfer") {
        effect = `Prepares an Umbra private transfer handoff for ${String(data.amountBaseUnits || "configured amount")} base units`;
      } else if (node.type === "action:solana-rpc") {
        effect = `Calls ${String(data.method || "getHealth")} on ${String(data.provider || "configured RPC")}`;
      } else if (node.type === "action:custom-api") {
        effect = `Calls custom API ${previewText(data.url, "configured URL")}`;
      } else if (node.type === "action:helius-webhook-create") {
        effect = `Creates a Helius ${String(data.webhookType || "enhanced")} webhook for ${previewText(data.webhookUrl, "configured URL")}`;
      } else if (node.type === "action:helius-webhook-list") {
        effect = "Lists Helius webhooks for the selected credential";
      } else if (node.type === "action:helius-webhook-delete") {
        effect = `Deletes Helius webhook ${String(data.webhookId || "configured ID")}`;
      } else if (node.type === "action:jito-tip-accounts") {
        effect = "Reads Jito bundle tip accounts";
      } else if (node.type === "action:jito-bundle-status") {
        effect = "Checks Jito bundle status";
      } else if (node.type === "action:jito-send-bundle") {
        effect = "Submits already-signed transactions to the Jito Block Engine";
      } else if (node.type === "action:jito-tip-floor") {
        effect = "Reads recent Jito landed tip percentiles";
      } else if (node.type === "action:discord-message") {
        effect = "Posts a message to Discord with mentions disabled by default";
      } else if (node.type === "action:telegram-message") {
        effect = `Sends a Telegram Bot API message to ${String(data.chatId || "configured chat")}`;
      } else if (node.type === "action:dialect-alert") {
        effect = `Sends a Dialect alert to ${String(data.recipientType || "subscriber")}`;
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
  const missingRuntimeConfig = missingRuntimeConfigLabels(nodes);
  if (missingRuntimeConfig.length > 0) {
    warnings.push(
      `Configure required run fields before execution: ${missingRuntimeConfig.join(", ")}.`,
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
    text.includes("umbra") ||
    text.includes("privacy") ||
    text.includes("private transfer") ||
    text.includes("shield")
  ) {
    return workflowDraft(
      "umbra-private-transfer-plan",
      "Umbra Private Transfer Plan",
      "Check Umbra relayer support, prepare a private transfer handoff, and show the plan in Cloud output.",
      ["umbra", "privacy", "defi", "transfer"],
      [
        {
          id: "trigger",
          type: "trigger:manual",
          position: { x: 80, y: 180 },
          data: {},
        },
        {
          id: "relayer",
          type: "action:umbra-relayer-info",
          position: { x: 330, y: 180 },
          data: { network: "mainnet", relayerEndpoint: "" },
        },
        {
          id: "transfer",
          type: "action:umbra-transfer",
          position: { x: 600, y: 180 },
          data: {
            network: "mainnet",
            transferMode: "public-to-receiver-utxo",
            senderWalletId: "",
            recipientAddress: "YOUR_RECIPIENT_ADDRESS",
            mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            amountBaseUnits: "1000000",
            validateRelayer: true,
          },
        },
        {
          id: "result",
          type: "output:result",
          position: { x: 880, y: 180 },
          data: {
            name: "Umbra transfer plan",
            status: "success",
            value: "{{ $json.umbraTransfer }}",
          },
        },
      ],
      [
        edge("e1", "trigger", "relayer"),
        edge("e2", "relayer", "transfer", "relayer"),
        edge("e3", "transfer", "result", "plan"),
      ],
    );
  }

  if (
    text.includes("rpcfast") ||
    text.includes("rpc") ||
    text.includes("gethealth") ||
    text.includes("get balance")
  ) {
    return workflowDraft(
      "solana-rpc-check",
      "Solana RPC Check",
      "Call a Solana JSON-RPC method through RPCFast, a custom endpoint, or public RPC and show the response.",
      ["rpc", "rpcfast", "solana", "infra"],
      [
        {
          id: "trigger",
          type: "trigger:manual",
          position: { x: 80, y: 180 },
          data: {},
        },
        {
          id: "rpc",
          type: "action:solana-rpc",
          position: { x: 340, y: 180 },
          data: {
            provider: text.includes("rpcfast") ? "rpcfast" : "public-mainnet",
            rpcUrl: "",
            credentialId: "",
            method: "getHealth",
            customMethod: "",
            params: [],
          },
        },
        {
          id: "display",
          type: "output:display",
          position: { x: 620, y: 180 },
          data: {
            title: "Solana RPC response",
            value: "{{ $json.solanaRpc }}",
            format: "json",
          },
        },
      ],
      [edge("e1", "trigger", "rpc"), edge("e2", "rpc", "display", "result")],
    );
  }

  if (
    text.includes("helius webhook") ||
    text.includes("webhook source") ||
    text.includes("real-time trigger") ||
    text.includes("realtime trigger")
  ) {
    return workflowDraft(
      "helius-webhook-source",
      "Helius Webhook Source",
      "Create a Helius webhook that points at your Cloud webhook trigger for realtime Solana events.",
      ["helius", "webhook", "realtime", "trigger"],
      [
        {
          id: "trigger",
          type: "trigger:manual",
          position: { x: 80, y: 180 },
          data: {},
        },
        {
          id: "create",
          type: "action:helius-webhook-create",
          position: { x: 340, y: 180 },
          data: {
            webhookUrl: "https://cloud.solstudio.fun/api/webhooks/YOUR_WORKFLOW_PATH",
            webhookType: "enhanced",
            accountAddresses: ["YOUR_WALLET_ADDRESS"],
            transactionTypes: ["SWAP", "TRANSFER"],
            credentialId: "",
          },
        },
        {
          id: "result",
          type: "output:result",
          position: { x: 640, y: 180 },
          data: {
            name: "Helius webhook",
            status: "success",
            value: "{{ $json.heliusWebhook }}",
          },
        },
      ],
      [edge("e1", "trigger", "create"), edge("e2", "create", "result", "webhook")],
    );
  }

  if (text.includes("jito") || text.includes("bundle") || text.includes("tip floor")) {
    return workflowDraft(
      "jito-tip-check",
      "Jito Tip Check",
      "Read Jito tip accounts and current tip floor before submitting a signed bundle.",
      ["jito", "bundle", "priority", "fees"],
      [
        { id: "trigger", type: "trigger:manual", position: { x: 80, y: 180 }, data: {} },
        {
          id: "tip",
          type: "action:jito-tip-floor",
          position: { x: 330, y: 180 },
          data: {},
        },
        {
          id: "accounts",
          type: "action:jito-tip-accounts",
          position: { x: 590, y: 180 },
          data: { region: "mainnet", blockEngineUrl: "", credentialId: "" },
        },
        {
          id: "display",
          type: "output:display",
          position: { x: 860, y: 180 },
          data: { title: "Jito readiness", value: "{{ $json.jito }}", format: "json" },
        },
      ],
      [
        edge("e1", "trigger", "tip"),
        edge("e2", "tip", "accounts", "tip floor"),
        edge("e3", "accounts", "display", "tip accounts"),
      ],
    );
  }

  if (
    text.includes("discord") ||
    text.includes("telegram") ||
    text.includes("dialect") ||
    text.includes("notification")
  ) {
    const useTelegram = text.includes("telegram");
    const useDialect = text.includes("dialect");
    return workflowDraft(
      "external-notification",
      useDialect ? "Dialect Alert" : useTelegram ? "Telegram Alert" : "Discord Alert",
      "Send run output to a configured notification channel.",
      ["notification", useDialect ? "dialect" : useTelegram ? "telegram" : "discord"],
      [
        { id: "trigger", type: "trigger:manual", position: { x: 80, y: 180 }, data: {} },
        {
          id: "notify",
          type: useDialect ? "action:dialect-alert" : useTelegram ? "action:telegram-message" : "action:discord-message",
          position: { x: 340, y: 180 },
          data: useDialect
            ? {
                credentialId: "",
                appId: "YOUR_DIALECT_APP_ID",
                recipientType: "subscriber",
                walletAddress: "YOUR_WALLET_ADDRESS",
                channels: ["IN_APP"],
                title: "SolStudio Cloud Alert",
                body: "Workflow finished: {{ $json }}",
              }
            : useTelegram
              ? {
                  credentialId: "",
                  chatId: "YOUR_CHAT_ID",
                  text: "SolStudio Cloud alert: {{ $json }}",
                  parseMode: "",
                  disableNotification: false,
                }
              : {
                  webhookUrl: "",
                  credentialId: "",
                  content: "SolStudio Cloud alert: {{ $json }}",
                  username: "SolStudio Cloud",
                  embeds: [],
                  wait: true,
                },
        },
        {
          id: "result",
          type: "output:result",
          position: { x: 640, y: 180 },
          data: { name: "Notification", status: "success", value: "{{ $json.notification }}" },
        },
      ],
      [edge("e1", "trigger", "notify"), edge("e2", "notify", "result", "notification")],
    );
  }

  if (
    text.includes("nft") ||
    text.includes("metadata") ||
    text.includes("asset")
  ) {
    return workflowDraft(
      "nft-asset-watch",
      "NFT Asset Watch",
      "Read Metaplex asset metadata through DAS-compatible RPC and show notable changes in the run output.",
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
          id: "result",
          type: "output:result",
          position: { x: 620, y: 180 },
          data: {
            name: "NFT asset result",
            status: "success",
            value: "{{ $json.metaplexAsset }}",
          },
        },
      ],
      [edge("e1", "trigger", "asset"), edge("e2", "asset", "result", "asset")],
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
      "Poll recent wallet signatures and show wallet activity in Cloud output.",
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
            address: "So11111111111111111111111111111111111111112",
            limit: 10,
            credentialId: "",
            rpcUrl: "",
          },
        },
        {
          id: "display",
          type: "output:display",
          position: { x: 620, y: 180 },
          data: {
            title: "Wallet activity",
            value: "{{ $json.helius }}",
            format: "json",
          },
        },
      ],
      [edge("e1", "trigger", "activity"), edge("e2", "activity", "display", "activity")],
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
            owner: "So11111111111111111111111111111111111111112",
            tokenProgram: "spl",
            credentialId: "",
            rpcUrl: "",
          },
        },
        {
          id: "result",
          type: "output:result",
          position: { x: 620, y: 180 },
          data: {
            name: "Treasury token account report",
            status: "success",
            value: "{{ $json.tokenAccounts }}",
          },
        },
      ],
      [edge("e1", "trigger", "accounts"), edge("e2", "accounts", "result", "accounts")],
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
      "Read Jupiter Tokens V2 category data and show top token metadata in Cloud output.",
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
          id: "display",
          type: "output:display",
          position: { x: 620, y: 180 },
          data: {
            title: "Jupiter token discovery",
            value: "{{ $json.jupiter }}",
            format: "json",
          },
        },
      ],
      [edge("e1", "trigger", "tokens"), edge("e2", "tokens", "display", "tokens")],
    );
  }

  if (text.includes("token account") || text.includes("token watcher")) {
    return workflowDraft(
      "token-account-watcher",
      "Token Account Watcher",
      "Watch SPL Token or Token-2022 accounts for an owner and display the result.",
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
            owner: "So11111111111111111111111111111111111111112",
            tokenProgram: "spl",
            credentialId: "",
            rpcUrl: "",
          },
        },
        {
          id: "display",
          type: "output:display",
          position: { x: 620, y: 180 },
          data: {
            title: "Token accounts",
            value: "{{ $json.tokenAccounts }}",
            format: "json",
          },
        },
      ],
      [
        edge("e1", "trigger", "accounts"),
        edge("e2", "accounts", "display", "accounts"),
      ],
    );
  }

  if (text.includes("swap") || text.includes("dca") || text.includes("buy")) {
    return workflowDraft(
      "price-guarded-auto-swap",
      "Price-Guarded Auto Swap",
      "Fetch market price, check a guard condition, then prepare a simulated Jupiter swap and capture a run result.",
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
          id: "result",
          type: "output:result",
          position: { x: 1080, y: 120 },
          data: {
            name: "Swap order result",
            status: "success",
            value: "{{ $json.jupiter }}",
          },
        },
      ],
      [
        edge("e1", "trigger", "price"),
        edge("e2", "price", "guard"),
        edge("e3", "guard", "swap", "true"),
        edge("e4", "swap", "result", "order"),
      ],
    );
  }

  return workflowDraft(
    "price-alert",
    "Price Alert Workflow",
    "Fetch a token price on a schedule, branch on a threshold, and write an alert into the run log.",
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
        id: "log",
        type: "output:log",
        position: { x: 860, y: 120 },
        data: {
          level: "info",
          message: "SOL price alert: {{ $json.price }}",
          includeInput: true,
        },
      },
    ],
    [
      edge("e1", "trigger", "price"),
      edge("e2", "price", "branch"),
      edge("e3", "branch", "log", "true"),
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
      "action:umbra-indexer-health",
      "action:umbra-relayer-info",
      "action:umbra-transfer",
      "action:solana-rpc",
      "action:custom-api",
      "action:helius-webhook-create",
      "action:helius-webhook-list",
      "action:helius-webhook-delete",
      "action:jito-tip-accounts",
      "action:jito-bundle-status",
      "action:jito-send-bundle",
      "action:jito-tip-floor",
      "action:discord-message",
      "action:telegram-message",
      "action:dialect-alert",
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
  if (typeof value === "string") return redactPreviewString(value);
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
