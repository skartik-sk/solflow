// packages/db/prisma/cloud-seed.ts
// Seed cloud workflow templates.
// Run with: bun run prisma/cloud-seed.ts

import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient | undefined;

function getPrisma(): PrismaClient {
  prisma ??= new PrismaClient();
  return prisma;
}

function makeDefinition(
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }>,
  edges: Array<{ id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }>,
) {
  return { nodes, edges };
}

// ─── Template definitions ───────────────────────────────────────────────────

export const CLOUD_TEMPLATES = [
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. PRICE ALERT BOT
  // ═══════════════════════════════════════════════════════════════════════════
  {
    title: "Price Alert Bot",
    description: "Check a token price on a schedule and write an alert into the run output.",
    longDescription:
      "A cron-triggered workflow that fetches a Solana token price through DexScreener, branches on a configured threshold, and writes the alert into the Cloud run log for review or later routing.",
    category: "DEFI",
    tags: ["price", "alert", "monitoring", "defi"],
    nodeTypes: ["trigger:cron", "action:price-fetch", "logic:if-else", "output:log"],
    featured: true,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:cron",
          position: { x: 50, y: 200 },
          data: { cronExpression: "*/5 * * * *", timezone: "UTC" },
        },
        {
          id: "n2",
          type: "action:price-fetch",
          position: { x: 300, y: 200 },
          data: {
            token: "So11111111111111111111111111111111111111112",
            source: "dexscreener",
          },
        },
        {
          id: "n3",
          type: "logic:if-else",
          position: { x: 550, y: 200 },
          data: { field: "price", operator: "gt", value: "200" },
        },
        {
          id: "n4",
          type: "output:log",
          position: { x: 800, y: 120 },
          data: {
            level: "info",
            message: "SOL price alert: {{ $json.price }} USD",
            includeInput: true,
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
        { id: "e3", source: "n3", target: "n4", sourceHandle: "true" },
      ],
    ),
    settings: { timeout: 60, retryPolicy: { maxAttempts: 2, delayMs: 5000 }, onError: "stop" },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. DCA STRATEGY
  // ═══════════════════════════════════════════════════════════════════════════
  {
    title: "DCA Strategy",
    description: "Run scheduled Jupiter swaps from an encrypted Cloud wallet and capture the result.",
    longDescription:
      "Dollar-cost average into USDC or any SPL token by setting up a scheduled cron trigger that prepares and signs a Jupiter swap through a selected Cloud wallet, then stores the swap response in the run output.",
    category: "DEFI",
    tags: ["dca", "swap", "jupiter", "defi", "automation"],
    nodeTypes: ["trigger:cron", "action:jupiter-swap", "output:result"],
    featured: true,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:cron",
          position: { x: 50, y: 200 },
          data: { cronExpression: "0 9 * * 1", timezone: "UTC" },
        },
        {
          id: "n2",
          type: "action:jupiter-swap",
          position: { x: 350, y: 200 },
          data: {
            operation: "swap-direct-send",
            inputMint: "So11111111111111111111111111111111111111112",
            outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            amount: "100000000",
            slippageBps: 50,
            walletId: "",
            credentialId: "",
          },
        },
        {
          id: "n3",
          type: "output:result",
          position: { x: 650, y: 200 },
          data: {
            name: "DCA swap result",
            status: "success",
            value: "{{ $json.jupiter }}",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3", sourceHandle: "swap" },
      ],
    ),
    settings: { timeout: 120, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Landing template: DCA Trader
  // ═══════════════════════════════════════════════════════════════════════════
  {
    title: "DCA Trader",
    description: "Dollar-cost average into any token on a schedule.",
    longDescription:
      "A production-ready DCA blueprint that checks market conditions, branches on a configured price guard, executes a Jupiter swap from a Cloud wallet, and captures the execution summary in the run output.",
    category: "DEFI",
    tags: ["jupiter", "cron", "dca", "trader", "automation"],
    nodeTypes: ["trigger:cron", "action:price-fetch", "logic:if-else", "action:jupiter-swap", "output:result"],
    featured: true,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:cron",
          position: { x: 50, y: 220 },
          data: { cronExpression: "0 */6 * * *", timezone: "UTC" },
        },
        {
          id: "n2",
          type: "action:price-fetch",
          position: { x: 290, y: 220 },
          data: {
            token: "So11111111111111111111111111111111111111112",
            source: "dexscreener",
          },
        },
        {
          id: "n3",
          type: "logic:if-else",
          position: { x: 530, y: 220 },
          data: { field: "price", operator: "lt", value: "180" },
        },
        {
          id: "n4",
          type: "action:jupiter-swap",
          position: { x: 770, y: 140 },
          data: {
            operation: "swap-direct-send",
            inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            outputMint: "So11111111111111111111111111111111111111112",
            amount: "25000000",
            slippageBps: 50,
            walletId: "",
            credentialId: "",
          },
        },
        {
          id: "n5",
          type: "output:result",
          position: { x: 1010, y: 140 },
          data: {
            name: "DCA execution summary",
            status: "success",
            value: "{{ $json }}",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
        { id: "e3", source: "n3", target: "n4", sourceHandle: "true" },
        { id: "e4", source: "n4", target: "n5", sourceHandle: "swap" },
      ],
    ),
    settings: { timeout: 180, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Landing template: Liquidation Guard
  // ═══════════════════════════════════════════════════════════════════════════
  {
    title: "Liquidation Guard",
    description: "Monitor lending positions and auto-deleverage before risk spikes.",
    longDescription:
      "A liquidation-risk workflow that polls market data, checks a health-factor threshold, routes risky positions into a defensive Jupiter swap branch, and captures an incident summary in the run output.",
    category: "DEFI",
    tags: ["marginfi", "alert", "liquidation", "risk", "deleverage"],
    nodeTypes: ["trigger:cron", "action:price-fetch", "logic:if-else", "action:jupiter-swap", "output:result"],
    featured: true,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:cron",
          position: { x: 50, y: 230 },
          data: { cronExpression: "*/10 * * * *", timezone: "UTC" },
        },
        {
          id: "n2",
          type: "action:price-fetch",
          position: { x: 290, y: 230 },
          data: {
            token: "So11111111111111111111111111111111111111112",
            source: "dexscreener",
          },
        },
        {
          id: "n3",
          type: "logic:if-else",
          position: { x: 530, y: 230 },
          data: { field: "healthFactor", operator: "lt", value: "1.25" },
        },
        {
          id: "n4",
          type: "action:jupiter-swap",
          position: { x: 770, y: 150 },
          data: {
            operation: "swap-direct-send",
            inputMint: "So11111111111111111111111111111111111111112",
            outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            amount: "{{ $json.deleverageLamports }}",
            slippageBps: 75,
            walletId: "",
            credentialId: "",
          },
        },
        {
          id: "n5",
          type: "output:result",
          position: { x: 1010, y: 150 },
          data: {
            name: "Liquidation guard action",
            status: "warning",
            value: "{{ $json }}",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
        { id: "e3", source: "n3", target: "n4", sourceHandle: "true" },
        { id: "e4", source: "n4", target: "n5", sourceHandle: "swap" },
      ],
    ),
    settings: { timeout: 180, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Landing template: Yield Harvester
  // ═══════════════════════════════════════════════════════════════════════════
  {
    title: "Yield Harvester",
    description: "Auto-compound rewards across DeFi protocols.",
    longDescription:
      "A yield-ops workflow that wakes on a schedule, checks a reward or APY threshold, swaps harvested rewards through Jupiter, and captures a compounding summary for Raydium, Kamino, or other strategy dashboards.",
    category: "DEFI",
    tags: ["raydium", "kamino", "yield", "harvest", "compound"],
    nodeTypes: ["trigger:cron", "action:price-fetch", "logic:if-else", "action:jupiter-swap", "output:result"],
    featured: true,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:cron",
          position: { x: 50, y: 230 },
          data: { cronExpression: "0 */8 * * *", timezone: "UTC" },
        },
        {
          id: "n2",
          type: "action:price-fetch",
          position: { x: 290, y: 230 },
          data: {
            token: "So11111111111111111111111111111111111111112",
            source: "dexscreener",
          },
        },
        {
          id: "n3",
          type: "logic:if-else",
          position: { x: 530, y: 230 },
          data: { field: "claimableRewardsUsd", operator: "gt", value: "25" },
        },
        {
          id: "n4",
          type: "action:jupiter-swap",
          position: { x: 770, y: 150 },
          data: {
            operation: "swap-direct-send",
            inputMint: "{{ $json.rewardMint }}",
            outputMint: "So11111111111111111111111111111111111111112",
            amount: "{{ $json.rewardAmount }}",
            slippageBps: 50,
            walletId: "",
            credentialId: "",
          },
        },
        {
          id: "n5",
          type: "output:result",
          position: { x: 1010, y: 150 },
          data: {
            name: "Yield harvest result",
            status: "success",
            value: "{{ $json }}",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
        { id: "e3", source: "n3", target: "n4", sourceHandle: "true" },
        { id: "e4", source: "n4", target: "n5", sourceHandle: "swap" },
      ],
    ),
    settings: { timeout: 180, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. PORTFOLIO MONITOR
  // ═══════════════════════════════════════════════════════════════════════════
  {
    title: "Portfolio Monitor",
    description: "Show a recurring portfolio price summary in the run output.",
    longDescription:
      "Fetch SOL market data on a recurring schedule and display a structured summary in Cloud. Use it as the starting point for richer wallet monitoring or add a webhook output when you are ready to notify a team.",
    category: "DEFI",
    tags: ["portfolio", "monitor", "wallet", "balance"],
    nodeTypes: ["trigger:cron", "action:price-fetch", "output:display"],
    featured: true,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:cron",
          position: { x: 50, y: 200 },
          data: { cronExpression: "0 */6 * * *", timezone: "UTC" },
        },
        {
          id: "n2",
          type: "action:price-fetch",
          position: { x: 300, y: 200 },
          data: {
            token: "So11111111111111111111111111111111111111112",
            source: "dexscreener",
          },
        },
        {
          id: "n3",
          type: "output:display",
          position: { x: 550, y: 200 },
          data: {
            title: "Portfolio price summary",
            value: "{{ $json.priceData }}",
            format: "json",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ],
    ),
    settings: { timeout: 60, retryPolicy: { maxAttempts: 2, delayMs: 5000 }, onError: "continue" },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. AUTO TRANSFER
  // ═══════════════════════════════════════════════════════════════════════════
  {
    title: "Auto Transfer",
    description: "Schedule recurring SOL or SPL token transfers from a Cloud wallet.",
    longDescription:
      "Set up recurring token transfers for payouts, distributions, or internal treasury moves. The workflow uses a configured Cloud wallet, then stores the transfer result in the run output.",
    category: "UTILITY",
    tags: ["transfer", "schedule", "token", "payroll"],
    nodeTypes: ["trigger:cron", "action:token-transfer", "output:result"],
    featured: false,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:cron",
          position: { x: 50, y: 200 },
          data: { cronExpression: "0 0 1 * *", timezone: "UTC" },
        },
        {
          id: "n2",
          type: "action:token-transfer",
          position: { x: 350, y: 200 },
          data: {
            to: "",
            amount: "1000000",
            token: "So11111111111111111111111111111111111111112",
          },
        },
        {
          id: "n3",
          type: "output:result",
          position: { x: 650, y: 200 },
          data: {
            name: "Transfer result",
            status: "success",
            value: "{{ $json.transfer }}",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ],
    ),
    settings: { timeout: 120, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. WEBHOOK PROCESSOR
  // ═══════════════════════════════════════════════════════════════════════════
  {
    title: "Webhook Processor",
    description: "Receive webhook data, summarize it with AI, and show the result.",
    longDescription:
      "Accept incoming webhook data from your indexer, RPC provider, or backend service, ask an AI node to summarize the payload, and keep the result in Cloud output for review.",
    category: "UTILITY",
    tags: ["webhook", "ai", "processor", "automation"],
    nodeTypes: ["trigger:webhook", "action:ai-agent", "output:result"],
    featured: false,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:webhook",
          position: { x: 50, y: 200 },
          data: { httpMethod: "POST", authentication: "none" },
        },
        {
          id: "n2",
          type: "action:ai-agent",
          position: { x: 300, y: 200 },
          data: {
            provider: "openai",
            model: "gpt-4o-mini",
            systemPrompt: "You are a Solana transaction analyst. Summarize the key details.",
            prompt: "Analyze this transaction: {{ $json.body }}",
            temperature: 0.3,
            maxTokens: 512,
          },
        },
        {
          id: "n3",
          type: "output:result",
          position: { x: 550, y: 200 },
          data: {
            name: "AI webhook summary",
            status: "success",
            value: "{{ $json.ai }}",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ],
    ),
    settings: { timeout: 60, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. PRICE-GUARDED DCA
  // ═══════════════════════════════════════════════════════════════════════════
  {
    title: "Price-Guarded DCA",
    description: "Only run a Jupiter DCA swap when the current price is inside your range.",
    longDescription:
      "Fetches a token price on a schedule, checks the result with an if/else node, then runs a Jupiter swap only when the configured price guard passes. Captures a run result after the swap branch.",
    category: "DEFI",
    tags: ["dca", "price", "jupiter", "risk-control"],
    nodeTypes: ["trigger:cron", "action:price-fetch", "logic:if-else", "action:jupiter-swap", "output:result"],
    featured: true,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:cron",
          position: { x: 50, y: 220 },
          data: { cronExpression: "0 */4 * * *", timezone: "UTC" },
        },
        {
          id: "n2",
          type: "action:price-fetch",
          position: { x: 290, y: 220 },
          data: {
            token: "So11111111111111111111111111111111111111112",
            source: "dexscreener",
          },
        },
        {
          id: "n3",
          type: "logic:if-else",
          position: { x: 530, y: 220 },
          data: { field: "price", operator: "lt", value: "180" },
        },
        {
          id: "n4",
          type: "action:jupiter-swap",
          position: { x: 770, y: 140 },
          data: {
            operation: "swap-direct-send",
            inputMint: "So11111111111111111111111111111111111111112",
            outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            amount: "100000000",
            slippageBps: 50,
            walletId: "",
            credentialId: "",
          },
        },
        {
          id: "n5",
          type: "output:result",
          position: { x: 1010, y: 140 },
          data: {
            name: "Price-guarded DCA result",
            status: "success",
            value: "{{ $json }}",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
        { id: "e3", source: "n3", target: "n4", sourceHandle: "true" },
        { id: "e4", source: "n4", target: "n5", sourceHandle: "swap" },
      ],
    ),
    settings: { timeout: 180, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. AI TRANSACTION CLASSIFIER
  // ═══════════════════════════════════════════════════════════════════════════
  {
    title: "AI Transaction Classifier",
    description: "Turn incoming transaction webhook payloads into structured AI summaries.",
    longDescription:
      "Receives webhook payloads from your own indexer or RPC event source, asks an AI provider to classify the event as JSON, and saves the structured result in Cloud output.",
    category: "AI",
    tags: ["ai", "webhook", "monitoring", "json"],
    nodeTypes: ["trigger:webhook", "action:ai-agent", "output:result"],
    featured: false,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:webhook",
          position: { x: 50, y: 220 },
          data: {
            httpMethod: "POST",
            webhookPath: "tx-classifier",
            authentication: "header",
            authHeaderName: "X-Webhook-Secret",
            replayProtection: true,
            maxBodyKb: 256,
            responseCode: 202,
          },
        },
        {
          id: "n2",
          type: "action:ai-agent",
          position: { x: 330, y: 220 },
          data: {
            provider: "openai",
            model: "gpt-4o-mini",
            systemPrompt: "You classify Solana transaction webhook payloads for an operations team.",
            prompt: "Classify this event as JSON with severity, summary, and next_action: {{ $json.body }}",
            temperature: 0.2,
            maxTokens: 512,
            responseFormat: "json",
            credentialId: "",
          },
        },
        {
          id: "n3",
          type: "output:result",
          position: { x: 610, y: 220 },
          data: {
            name: "Transaction classification",
            status: "success",
            value: "{{ $json.ai }}",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ],
    ),
    settings: { timeout: 90, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. WEBHOOK PAYMENT RUNNER
  // ═══════════════════════════════════════════════════════════════════════════
  {
    title: "Webhook Payment Runner",
    description: "Accept approved payout requests and execute token transfers through a Cloud wallet.",
    longDescription:
      "Receives payout payloads from your backend, filters for approved requests, sends SOL or SPL tokens from a configured Cloud wallet, and records the transfer result in Cloud output. Keep webhook authentication enabled before production use.",
    category: "UTILITY",
    tags: ["payment", "webhook", "transfer", "treasury"],
    nodeTypes: ["trigger:webhook", "transform:filter", "action:token-transfer", "output:result"],
    featured: false,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:webhook",
          position: { x: 50, y: 220 },
          data: {
            httpMethod: "POST",
            webhookPath: "approved-payment",
            authentication: "header",
            authHeaderName: "X-Webhook-Secret",
            replayProtection: true,
            maxBodyKb: 128,
            responseCode: 202,
          },
        },
        {
          id: "n2",
          type: "transform:filter",
          position: { x: 310, y: 220 },
          data: { field: "body.approved", condition: "equals", value: "true" },
        },
        {
          id: "n3",
          type: "action:token-transfer",
          position: { x: 570, y: 220 },
          data: {
            to: "{{ $json.body.destination }}",
            amount: "{{ $json.body.amount }}",
            token: "{{ $json.body.token }}",
            walletId: "",
          },
        },
        {
          id: "n4",
          type: "output:result",
          position: { x: 830, y: 220 },
          data: {
            name: "Payment runner result",
            status: "success",
            value: "{{ $json.transfer }}",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
        { id: "e3", source: "n3", target: "n4" },
      ],
    ),
    settings: { timeout: 120, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
  },

  {
    title: "Jupiter Token Discovery",
    description: "Pull top Jupiter token lists without a wallet and show the result.",
    longDescription:
      "A no-wallet starter that calls Jupiter Tokens V2 category data and keeps token metadata plus market signals in the run output for dashboards, alerts, or manual review.",
    category: "DEFI",
    tags: ["jupiter", "tokens", "discovery", "market", "no-wallet"],
    nodeTypes: ["trigger:manual", "action:jupiter-token-category", "output:display"],
    featured: true,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:manual",
          position: { x: 50, y: 220 },
          data: {},
        },
        {
          id: "n2",
          type: "action:jupiter-token-category",
          position: { x: 320, y: 220 },
          data: {
            tokenCategory: "toptraded",
            tokenInterval: "24h",
            tokenLimit: 25,
            credentialId: "",
          },
        },
        {
          id: "n3",
          type: "output:display",
          position: { x: 610, y: 220 },
          data: {
            title: "Jupiter token discovery",
            value: "{{ $json.jupiter }}",
            format: "json",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ],
    ),
    settings: { timeout: 90, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
  },

  {
    title: "Pyth Feed Finder",
    description: "Search public Pyth feed IDs before wiring an oracle guard.",
    longDescription:
      "A no-key utility template that searches the Pyth Hermes feed catalog by symbol or pair, returns matching feed IDs, and displays the result so operators can pick the exact feed for production workflows.",
    category: "DEFI",
    tags: ["pyth", "oracle", "feed-search", "no-wallet", "utility"],
    nodeTypes: ["trigger:manual", "action:pyth-feed-search", "output:display"],
    featured: false,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:manual",
          position: { x: 50, y: 220 },
          data: {},
        },
        {
          id: "n2",
          type: "action:pyth-feed-search",
          position: { x: 320, y: 220 },
          data: {
            query: "SOL",
            assetType: "crypto",
          },
        },
        {
          id: "n3",
          type: "output:display",
          position: { x: 610, y: 220 },
          data: {
            title: "Pyth feed search",
            value: "{{ $json.oracle }}",
            format: "json",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ],
    ),
    settings: { timeout: 90, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
  },

  {
    title: "Oracle Guard",
    description: "Gate a workflow with Pyth or Switchboard price data before logging an alert.",
    longDescription:
      "A ready integration-pack template that reads an oracle price, checks a deterministic threshold, and writes an execution summary to the Cloud run log. Swap the provider to Switchboard when you have a compatible API URL.",
    category: "DEFI",
    tags: ["pyth", "switchboard", "oracle", "risk", "automation"],
    nodeTypes: ["trigger:cron", "action:pyth-price", "logic:if-else", "output:log"],
    featured: true,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:cron",
          position: { x: 50, y: 220 },
          data: { cronExpression: "*/10 * * * *", timezone: "UTC" },
        },
        {
          id: "n2",
          type: "action:pyth-price",
          position: { x: 300, y: 220 },
          data: {
            feedId: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
          },
        },
        {
          id: "n3",
          type: "logic:if-else",
          position: { x: 560, y: 220 },
          data: { field: "oracle.price", operator: "gt", value: "200" },
        },
        {
          id: "n4",
          type: "output:log",
          position: { x: 830, y: 160 },
          data: {
            level: "warn",
            message: "Oracle alert for {{ $json.oracle.feedId }} at {{ $json.oracle.price }}",
            includeInput: true,
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
        { id: "e3", source: "n3", target: "n4", sourceHandle: "true" },
      ],
    ),
    settings: { timeout: 90, retryPolicy: { maxAttempts: 2, delayMs: 3000 }, onError: "stop" },
  },

  {
    title: "NFT Asset Watch",
    description: "Read Metaplex asset metadata through Helius and show the asset result.",
    longDescription:
      "Fetches a DAS-compatible asset record with the Metaplex Get Asset node, keeps the raw Helius result in the execution timeline, and stores the normalized asset payload in Cloud output for review or indexing.",
    category: "NFT",
    tags: ["helius", "metaplex", "nft", "das", "output"],
    nodeTypes: ["trigger:manual", "action:metaplex-get-asset", "output:result"],
    featured: false,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:manual",
          position: { x: 50, y: 220 },
          data: {},
        },
        {
          id: "n2",
          type: "action:metaplex-get-asset",
          position: { x: 320, y: 220 },
          data: { assetId: "YOUR_ASSET_ID", credentialId: "" },
        },
        {
          id: "n3",
          type: "output:result",
          position: { x: 610, y: 220 },
          data: {
            name: "NFT asset result",
            status: "success",
            value: "{{ $json.metaplexAsset }}",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ],
    ),
    settings: { timeout: 90, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
  },

  {
    title: "Token Treasury Report",
    description: "Query SPL or Token-2022 accounts and prepare a review payload.",
    longDescription:
      "A treasury operations template that reads token accounts for an owner, supports SPL Token and Token-2022, then captures a review payload that can be copied into a Squads approval flow.",
    category: "UTILITY",
    tags: ["spl-token", "token-2022", "squads", "treasury", "report"],
    nodeTypes: ["trigger:manual", "action:token-account-query", "output:result"],
    featured: false,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:manual",
          position: { x: 50, y: 220 },
          data: {},
        },
        {
          id: "n2",
          type: "action:token-account-query",
          position: { x: 320, y: 220 },
          data: {
            owner: "So11111111111111111111111111111111111111112",
            tokenProgram: "spl",
            credentialId: "",
            rpcUrl: "",
          },
        },
        {
          id: "n3",
          type: "output:result",
          position: { x: 610, y: 220 },
          data: {
            name: "Treasury token account report",
            status: "success",
            value: "{{ $json.tokenAccounts }}",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ],
    ),
    settings: { timeout: 120, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
  },

  {
    title: "Wallet Activity Alert",
    description: "Poll recent wallet signatures and display activity in Cloud.",
    longDescription:
      "A lightweight wallet monitoring workflow that checks recent signatures for an address through JSON-RPC or Helius, then displays the result in Cloud output.",
    category: "UTILITY",
    tags: ["wallet", "activity", "helius", "alert", "monitoring"],
    nodeTypes: ["trigger:cron", "action:helius-wallet-activity", "output:display"],
    featured: true,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:cron",
          position: { x: 50, y: 220 },
          data: { cronExpression: "*/5 * * * *", timezone: "UTC" },
        },
        {
          id: "n2",
          type: "action:helius-wallet-activity",
          position: { x: 320, y: 220 },
          data: {
            address: "So11111111111111111111111111111111111111112",
            limit: 10,
            credentialId: "",
            rpcUrl: "",
          },
        },
        {
          id: "n3",
          type: "output:display",
          position: { x: 610, y: 220 },
          data: {
            title: "Wallet activity",
            value: "{{ $json.helius }}",
            format: "json",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ],
    ),
    settings: { timeout: 90, retryPolicy: { maxAttempts: 2, delayMs: 3000 }, onError: "stop" },
  },

  {
    title: "Enhanced Wallet Swap History",
    description: "Fetch human-readable swap history for a wallet through Helius Enhanced Transactions.",
    longDescription:
      "Uses Helius Address Transactions to return parsed transaction descriptions, transfer data, fees, and swap events for a wallet. Add a Helius credential, choose filters, and view the enhanced history in Cloud output.",
    category: "UTILITY",
    tags: ["helius", "transactions", "wallet", "swap", "history"],
    nodeTypes: ["trigger:manual", "action:helius-address-transactions", "output:result"],
    featured: false,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:manual",
          position: { x: 50, y: 220 },
          data: {},
        },
        {
          id: "n2",
          type: "action:helius-address-transactions",
          position: { x: 320, y: 220 },
          data: {
            address: "So11111111111111111111111111111111111111112",
            limit: 10,
            transactionType: "SWAP",
            source: "JUPITER",
            tokenAccounts: "balanceChanged",
            sortOrder: "desc",
            commitment: "finalized",
            credentialId: "",
          },
        },
        {
          id: "n3",
          type: "output:result",
          position: { x: 640, y: 220 },
          data: {
            name: "Enhanced wallet history",
            status: "success",
            value: "{{ $json.helius }}",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ],
    ),
    settings: { timeout: 90, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
  },

  {
    title: "Token Account Watcher",
    description: "Watch SPL Token or Token-2022 accounts for an owner and display the result.",
    longDescription:
      "A token account monitoring workflow that periodically reads parsed token accounts for the configured owner and optional mint, then displays a compact account payload in Cloud output.",
    category: "UTILITY",
    tags: ["spl-token", "token-2022", "watcher", "monitoring"],
    nodeTypes: ["trigger:cron", "action:token-account-query", "output:display"],
    featured: true,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:cron",
          position: { x: 50, y: 220 },
          data: { cronExpression: "*/15 * * * *", timezone: "UTC" },
        },
        {
          id: "n2",
          type: "action:token-account-query",
          position: { x: 320, y: 220 },
          data: {
            owner: "So11111111111111111111111111111111111111112",
            mint: "",
            tokenProgram: "spl",
            credentialId: "",
            rpcUrl: "",
          },
        },
        {
          id: "n3",
          type: "output:display",
          position: { x: 610, y: 220 },
          data: {
            title: "Token accounts",
            value: "{{ $json.tokenAccounts }}",
            format: "json",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ],
    ),
    settings: { timeout: 90, retryPolicy: { maxAttempts: 2, delayMs: 3000 }, onError: "stop" },
  },

  {
    title: "Umbra Private Transfer Plan",
    description: "Check Umbra relayer support and prepare a private transfer handoff.",
    longDescription:
      "A privacy workflow starter that reads Umbra relayer capabilities, prepares the wallet/ZK/indexer/relayer handoff required for a private transfer, and saves the plan in the run output for operator review before execution.",
    category: "DEFI",
    tags: ["umbra", "privacy", "utxo", "private-transfer", "defi"],
    nodeTypes: ["trigger:manual", "action:umbra-relayer-info", "action:umbra-transfer", "output:result"],
    featured: true,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:manual",
          position: { x: 50, y: 220 },
          data: {},
        },
        {
          id: "n2",
          type: "action:umbra-relayer-info",
          position: { x: 320, y: 220 },
          data: { network: "mainnet", relayerEndpoint: "" },
        },
        {
          id: "n3",
          type: "action:umbra-transfer",
          position: { x: 610, y: 220 },
          data: {
            network: "mainnet",
            transferMode: "public-to-receiver-utxo",
            senderWalletId: "",
            recipientAddress: "So11111111111111111111111111111111111111112",
            mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            amountBaseUnits: "1000000",
            validateRelayer: true,
            indexerEndpoint: "",
            relayerEndpoint: "",
            rpcUrl: "",
            rpcSubscriptionsUrl: "",
          },
        },
        {
          id: "n4",
          type: "output:result",
          position: { x: 900, y: 220 },
          data: {
            name: "Umbra transfer plan",
            status: "success",
            value: "{{ $json.umbraTransfer }}",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3", sourceHandle: "relayer" },
        { id: "e3", source: "n3", target: "n4", sourceHandle: "plan" },
      ],
    ),
    settings: { timeout: 90, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
  },

  {
    title: "Solana RPC Health Check",
    description: "Run a Solana JSON-RPC method through public RPC, RPCFast, or a custom endpoint.",
    longDescription:
      "A simple infrastructure workflow that calls a Solana JSON-RPC method, then displays the response in Cloud. Switch the provider to RPCFast and paste the HTTPS endpoint from the RPCFast dashboard when you want low-latency production RPC.",
    category: "UTILITY",
    tags: ["rpc", "rpcfast", "solana", "infra", "monitoring"],
    nodeTypes: ["trigger:manual", "action:solana-rpc", "output:display"],
    featured: true,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:manual",
          position: { x: 50, y: 220 },
          data: {},
        },
        {
          id: "n2",
          type: "action:solana-rpc",
          position: { x: 320, y: 220 },
          data: {
            provider: "public-mainnet",
            rpcUrl: "",
            credentialId: "",
            method: "getHealth",
            customMethod: "",
            params: [],
          },
        },
        {
          id: "n3",
          type: "output:display",
          position: { x: 610, y: 220 },
          data: {
            title: "Solana RPC response",
            value: "{{ $json.solanaRpc }}",
            format: "json",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3", sourceHandle: "result" },
      ],
    ),
    settings: { timeout: 60, retryPolicy: { maxAttempts: 2, delayMs: 3000 }, onError: "stop" },
  },

  {
    title: "Helius Realtime Source",
    description: "Create a Helius webhook that points at your Cloud workflow endpoint for realtime Solana events.",
    longDescription:
      "Use a manual setup workflow to create a Helius webhook aimed at your Cloud webhook trigger. This is the recommended starting point when you want realtime swaps, transfers, NFT events, or wallet activity to enter Cloud without polling.",
    category: "UTILITY",
    tags: ["helius", "webhook", "realtime", "trigger"],
    nodeTypes: ["trigger:manual", "action:helius-webhook-create", "output:result"],
    featured: true,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:manual",
          position: { x: 50, y: 220 },
          data: {},
        },
        {
          id: "n2",
          type: "action:helius-webhook-create",
          position: { x: 330, y: 220 },
          data: {
            webhookUrl: "https://cloud.solstudio.fun/api/webhooks/YOUR_WORKFLOW_PATH",
            webhookType: "enhanced",
            accountAddresses: ["YOUR_WALLET_ADDRESS"],
            transactionTypes: ["SWAP", "TRANSFER"],
            authHeader: "",
            credentialId: "",
            apiUrl: "",
          },
        },
        {
          id: "n3",
          type: "output:result",
          position: { x: 650, y: 220 },
          data: {
            name: "Helius webhook",
            status: "success",
            value: "{{ $json.heliusWebhook }}",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3", sourceHandle: "webhook" },
      ],
    ),
    settings: { timeout: 60, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
  },

  {
    title: "Jito Bundle Readiness",
    description: "Check Jito tip floor and tip accounts before submitting signed bundles.",
    longDescription:
      "A production-readiness helper for priority transaction workflows. It reads the current Jito tip floor, fetches current tip accounts, and displays both in Cloud output before you submit a signed bundle.",
    category: "UTILITY",
    tags: ["jito", "bundle", "priority", "infra"],
    nodeTypes: ["trigger:manual", "action:jito-tip-floor", "action:jito-tip-accounts", "output:display"],
    featured: true,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:manual",
          position: { x: 50, y: 220 },
          data: {},
        },
        {
          id: "n2",
          type: "action:jito-tip-floor",
          position: { x: 310, y: 220 },
          data: {},
        },
        {
          id: "n3",
          type: "action:jito-tip-accounts",
          position: { x: 570, y: 220 },
          data: {
            region: "mainnet",
            blockEngineUrl: "",
            credentialId: "",
          },
        },
        {
          id: "n4",
          type: "output:display",
          position: { x: 860, y: 220 },
          data: {
            title: "Jito readiness",
            value: "{{ $json.jito }}",
            format: "json",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3", sourceHandle: "tip floor" },
        { id: "e3", source: "n3", target: "n4", sourceHandle: "tip accounts" },
      ],
    ),
    settings: { timeout: 60, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
  },

  {
    title: "Discord Workflow Alert",
    description: "Send a workflow summary to Discord without hand-writing raw webhook JSON.",
    longDescription:
      "A notification starter that posts a workflow summary to a Discord incoming webhook and still keeps the notification response visible in Cloud output.",
    category: "UTILITY",
    tags: ["discord", "notification", "ops", "alert"],
    nodeTypes: ["trigger:manual", "action:discord-message", "output:result"],
    featured: true,
    definition: makeDefinition(
      [
        {
          id: "n1",
          type: "trigger:manual",
          position: { x: 50, y: 220 },
          data: {},
        },
        {
          id: "n2",
          type: "action:discord-message",
          position: { x: 330, y: 220 },
          data: {
            webhookUrl: "",
            credentialId: "",
            content: "SolStudio Cloud run complete: {{ $json }}",
            username: "SolStudio Cloud",
            embeds: [],
            wait: true,
          },
        },
        {
          id: "n3",
          type: "output:result",
          position: { x: 640, y: 220 },
          data: {
            name: "Discord notification",
            status: "success",
            value: "{{ $json.notification }}",
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3", sourceHandle: "notification" },
      ],
    ),
    settings: { timeout: 45, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
  },
];

// ─── Seed ───────────────────────────────────────────────────────────────────

export async function seedCloudWorkflowTemplates() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed cloud workflow templates.");
  }

  const prisma = getPrisma();

  console.log("Seeding cloud workflow templates...\n");

  for (const tmpl of CLOUD_TEMPLATES) {
    const existing = await prisma.workflowTemplate.findFirst({
      where: { title: tmpl.title },
    });

    if (existing) {
      await prisma.workflowTemplate.update({
        where: { id: existing.id },
        data: {
          description: tmpl.description,
          longDescription: tmpl.longDescription,
          category: tmpl.category,
          tags: tmpl.tags,
          definition: tmpl.definition as any,
          settings: tmpl.settings as any,
          nodeTypes: tmpl.nodeTypes,
          featured: tmpl.featured,
          status: "PUBLISHED",
        },
      });
      console.log(`  [updated] "${tmpl.title}"`);
      continue;
    }

    await prisma.workflowTemplate.create({
      data: {
        title: tmpl.title,
        description: tmpl.description,
        longDescription: tmpl.longDescription,
        category: tmpl.category,
        tags: tmpl.tags,
        definition: tmpl.definition as any,
        settings: tmpl.settings as any,
        nodeTypes: tmpl.nodeTypes,
        featured: tmpl.featured,
        status: "PUBLISHED",
      },
    });

    console.log(`  [created] "${tmpl.title}"`);
  }

  console.log("\nDone. Seeded cloud workflow templates.");
}

async function main() {
  await seedCloudWorkflowTemplates();
}

// Only run main() when executed directly (not when imported by tests)
const seedPath = (import.meta as ImportMeta & { path?: string }).path ?? "";
const bunMain = (globalThis as typeof globalThis & { Bun?: { main?: string } }).Bun?.main;
const isEntry = Boolean(seedPath && bunMain === seedPath);
if (isEntry) {
  main()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    })
    .finally(() => prisma?.$disconnect());
}
