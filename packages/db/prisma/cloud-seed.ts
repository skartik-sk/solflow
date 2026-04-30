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
    description: "Check a token price on a schedule and notify your team when a threshold is reached.",
    longDescription:
      "A cron-triggered workflow that fetches a Solana token price through Birdeye or DexScreener, branches on a configured threshold, and sends a webhook notification to Slack, Discord, or your own backend.",
    category: "DEFI",
    tags: ["price", "alert", "monitoring", "defi"],
    nodeTypes: ["trigger:cron", "action:price-fetch", "logic:if-else", "output:webhook"],
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
          type: "output:webhook",
          position: { x: 800, y: 120 },
          data: {
            url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"text":"SOL price alert: {{ $json.price }} USD"}',
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
    description: "Run scheduled Jupiter swaps from an encrypted Cloud wallet.",
    longDescription:
      "Dollar-cost average into USDC or any SPL token by setting up a scheduled cron trigger that prepares and signs a Jupiter swap through a selected Cloud wallet.",
    category: "DEFI",
    tags: ["dca", "swap", "jupiter", "defi", "automation"],
    nodeTypes: ["trigger:cron", "action:jupiter-swap"],
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
            inputMint: "So11111111111111111111111111111111111111112",
            outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            amount: "100000000",
            slippageBps: 50,
          },
        },
      ],
      [{ id: "e1", source: "n1", target: "n2" }],
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
      "A production-ready DCA blueprint that checks market conditions, branches on a configured price guard, executes a Jupiter swap from a Cloud wallet, and posts the execution summary to your operations channel.",
    category: "DEFI",
    tags: ["jupiter", "cron", "dca", "trader", "automation"],
    nodeTypes: ["trigger:cron", "action:price-fetch", "logic:if-else", "action:jupiter-swap", "output:webhook"],
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
          type: "output:webhook",
          position: { x: 1010, y: 140 },
          data: {
            url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"text":"DCA Trader executed at {{ $now }}. SOL price: {{ $json.price }}"}',
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
        { id: "e3", source: "n3", target: "n4", sourceHandle: "true" },
        { id: "e4", source: "n4", target: "n5" },
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
      "A liquidation-risk workflow that polls market data, checks a health-factor threshold, routes risky positions into a defensive Jupiter swap branch, and posts an alert to your incident channel.",
    category: "DEFI",
    tags: ["marginfi", "alert", "liquidation", "risk", "deleverage"],
    nodeTypes: ["trigger:cron", "action:price-fetch", "logic:if-else", "action:jupiter-swap", "output:webhook"],
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
          type: "output:webhook",
          position: { x: 1010, y: 150 },
          data: {
            url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"text":"Liquidation Guard triggered. Health factor: {{ $json.healthFactor }}"}',
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
        { id: "e3", source: "n3", target: "n4", sourceHandle: "true" },
        { id: "e4", source: "n4", target: "n5" },
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
      "A yield-ops workflow that wakes on a schedule, checks a reward or APY threshold, swaps harvested rewards through Jupiter, and posts a compounding summary for Raydium, Kamino, or other strategy dashboards.",
    category: "DEFI",
    tags: ["raydium", "kamino", "yield", "harvest", "compound"],
    nodeTypes: ["trigger:cron", "action:price-fetch", "logic:if-else", "action:jupiter-swap", "output:webhook"],
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
          type: "output:webhook",
          position: { x: 1010, y: 150 },
          data: {
            url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"text":"Yield Harvester compounded rewards at {{ $now }}"}',
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
        { id: "e3", source: "n3", target: "n4", sourceHandle: "true" },
        { id: "e4", source: "n4", target: "n5" },
      ],
    ),
    settings: { timeout: 180, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. PORTFOLIO MONITOR
  // ═══════════════════════════════════════════════════════════════════════════
  {
    title: "Portfolio Monitor",
    description: "Send a recurring portfolio price summary to a webhook endpoint.",
    longDescription:
      "Fetch SOL market data on a recurring schedule and forward a structured summary to Slack, Discord, or your operations backend. Use it as the starting point for richer wallet monitoring.",
    category: "DEFI",
    tags: ["portfolio", "monitor", "wallet", "balance"],
    nodeTypes: ["trigger:cron", "action:price-fetch", "output:webhook"],
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
          type: "output:webhook",
          position: { x: 550, y: 200 },
          data: {
            url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"text":"Portfolio check: SOL at {{ $json.price }} USD"}',
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
      "Set up recurring token transfers for payouts, distributions, or internal treasury moves. The workflow uses a configured Cloud wallet and should be reviewed carefully before activation.",
    category: "UTILITY",
    tags: ["transfer", "schedule", "token", "payroll"],
    nodeTypes: ["trigger:cron", "action:token-transfer"],
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
      ],
      [{ id: "e1", source: "n1", target: "n2" }],
    ),
    settings: { timeout: 120, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. WEBHOOK PROCESSOR
  // ═══════════════════════════════════════════════════════════════════════════
  {
    title: "Webhook Processor",
    description: "Receive webhook data, summarize it with AI, and forward the result.",
    longDescription:
      "Accept incoming webhook data from your indexer, RPC provider, or backend service, ask an AI node to summarize the payload, and send the result to a webhook output.",
    category: "UTILITY",
    tags: ["webhook", "ai", "processor", "automation"],
    nodeTypes: ["trigger:webhook", "action:ai-agent", "output:webhook"],
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
          type: "output:webhook",
          position: { x: 550, y: 200 },
          data: {
            url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"text":"{{ $json.ai.content }}"}',
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
      "Fetches a token price on a schedule, checks the result with an if/else node, then runs a Jupiter swap only when the configured price guard passes. Sends a webhook summary after the swap branch.",
    category: "DEFI",
    tags: ["dca", "price", "jupiter", "risk-control"],
    nodeTypes: ["trigger:cron", "action:price-fetch", "logic:if-else", "action:jupiter-swap", "output:webhook"],
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
          type: "output:webhook",
          position: { x: 1010, y: 140 },
          data: {
            url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"text":"Price-guarded DCA branch ran at {{ $now }}"}',
          },
        },
      ],
      [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
        { id: "e3", source: "n3", target: "n4", sourceHandle: "true" },
        { id: "e4", source: "n4", target: "n5" },
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
      "Receives webhook payloads from your own indexer or RPC event source, asks an AI provider to classify the event as JSON, and forwards the structured result to your operations endpoint.",
    category: "AI",
    tags: ["ai", "webhook", "monitoring", "json"],
    nodeTypes: ["trigger:webhook", "action:ai-agent", "output:webhook"],
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
          type: "output:webhook",
          position: { x: 610, y: 220 },
          data: {
            url: "https://example.com/ops/solana-events",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{{ $json.ai.content }}",
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
      "Receives payout payloads from your backend, filters for approved requests, and sends SOL or SPL tokens from a configured Cloud wallet. Keep webhook authentication enabled before production use.",
    category: "UTILITY",
    tags: ["payment", "webhook", "transfer", "treasury"],
    nodeTypes: ["trigger:webhook", "transform:filter", "action:token-transfer", "output:webhook"],
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
          type: "output:webhook",
          position: { x: 830, y: 220 },
          data: {
            url: "https://example.com/ops/payment-status",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"status":"submitted","signature":"{{ $json.transfer.signature }}"}',
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
    title: "Oracle Guard",
    description: "Gate a workflow with Pyth or Switchboard price data before notifying operators.",
    longDescription:
      "A ready integration-pack template that reads an oracle price, checks a deterministic threshold, and sends an execution summary to an operations webhook. Swap the provider to Switchboard when you have a compatible API URL.",
    category: "DEFI",
    tags: ["pyth", "switchboard", "oracle", "risk", "automation"],
    nodeTypes: ["trigger:cron", "action:oracle-price", "logic:if-else", "output:webhook"],
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
          type: "action:oracle-price",
          position: { x: 300, y: 220 },
          data: {
            provider: "pyth",
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
          type: "output:webhook",
          position: { x: 830, y: 160 },
          data: {
            url: "https://example.com/ops/oracle-alert",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"feed":"{{ $json.oracle.feedId }}","price":"{{ $json.oracle.price }}"}',
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
    description: "Read Metaplex asset metadata through Helius and route notable assets to a webhook.",
    longDescription:
      "Fetches a DAS-compatible asset record with the Metaplex Asset node, keeps the raw Helius result in the execution timeline, and sends the normalized asset payload to a webhook for review or indexing.",
    category: "NFT",
    tags: ["helius", "metaplex", "nft", "das", "webhook"],
    nodeTypes: ["trigger:manual", "action:metaplex-asset", "output:webhook"],
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
          type: "action:metaplex-asset",
          position: { x: 320, y: 220 },
          data: { assetId: "YOUR_ASSET_ID", credentialId: "" },
        },
        {
          id: "n3",
          type: "output:webhook",
          position: { x: 610, y: 220 },
          data: {
            url: "https://example.com/ops/nft-asset",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{{ $json.metaplexAsset }}",
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
    description: "Query SPL or Token-2022 accounts and prepare a Squads-compatible proposal payload.",
    longDescription:
      "A treasury operations template that reads token accounts for an owner, supports SPL Token and Token-2022, then posts a proposal payload to a Squads-compatible approval service.",
    category: "UTILITY",
    tags: ["spl-token", "token-2022", "squads", "treasury", "report"],
    nodeTypes: ["trigger:manual", "action:token-account-query", "action:squads-proposal"],
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
          data: { owner: "YOUR_TREASURY_OWNER", tokenProgram: "spl", credentialId: "" },
        },
        {
          id: "n3",
          type: "action:squads-proposal",
          position: { x: 610, y: 220 },
          data: {
            apiUrl: "https://example.com/squads/proposals",
            multisig: "YOUR_SQUADS_MULTISIG",
            title: "Review treasury token accounts",
            description: "Generated by SolStudio Cloud",
            payload: { tokenAccounts: "{{ $json.tokenAccounts }}" },
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
    description: "Poll recent wallet signatures and notify your team when activity appears.",
    longDescription:
      "A lightweight wallet monitoring workflow that checks recent signatures for an address through JSON-RPC or Helius, then forwards the result to an operations webhook.",
    category: "UTILITY",
    tags: ["wallet", "activity", "helius", "alert", "monitoring"],
    nodeTypes: ["trigger:cron", "action:helius-rpc", "output:webhook"],
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
          type: "action:helius-rpc",
          position: { x: 320, y: 220 },
          data: {
            method: "getSignaturesForAddress",
            params: ["YOUR_WALLET_ADDRESS", { limit: 10 }],
            credentialId: "",
            rpcUrl: "",
          },
        },
        {
          id: "n3",
          type: "output:webhook",
          position: { x: 610, y: 220 },
          data: {
            url: "https://example.com/ops/wallet-activity",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{{ $json.helius }}",
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
    title: "Token Account Watcher",
    description: "Watch SPL Token or Token-2022 accounts for an owner and notify on matches.",
    longDescription:
      "A token account monitoring workflow that periodically reads parsed token accounts, checks whether any match the configured owner and optional mint, and sends a compact webhook payload.",
    category: "UTILITY",
    tags: ["spl-token", "token-2022", "watcher", "monitoring"],
    nodeTypes: ["trigger:cron", "action:token-account-query", "logic:if-else", "output:webhook"],
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
          data: { owner: "YOUR_OWNER_ADDRESS", mint: "", tokenProgram: "spl", credentialId: "", rpcUrl: "" },
        },
        {
          id: "n3",
          type: "logic:if-else",
          position: { x: 590, y: 220 },
          data: { field: "tokenAccounts.count", operator: "gt", value: "0" },
        },
        {
          id: "n4",
          type: "output:webhook",
          position: { x: 860, y: 160 },
          data: {
            url: "https://example.com/ops/token-accounts",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{{ $json.tokenAccounts }}",
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
