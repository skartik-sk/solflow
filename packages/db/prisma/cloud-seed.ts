// packages/db/prisma/cloud-seed.ts
// Seed cloud workflow templates.
// Run with: bun run prisma/cloud-seed.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function makeDefinition(
  nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }>,
  edges: Array<{ id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }>,
) {
  return { nodes, edges };
}

// ─── Template definitions ───────────────────────────────────────────────────

const CLOUD_TEMPLATES = [
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. PRICE ALERT BOT
  // ═══════════════════════════════════════════════════════════════════════════
  {
    title: "Price Alert Bot",
    description: "Monitor token prices and get notified when thresholds are hit.",
    longDescription:
      "A cron-triggered workflow that fetches token prices every 5 minutes, checks if the price crosses your threshold, and sends an HTTP notification (e.g. to Slack or Discord).",
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
          data: { token: "So11111111111111111111111111111111111111112" },
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
    description: "Automatically swap tokens on a schedule using Jupiter.",
    longDescription:
      "Dollar-cost average into any token by setting up a weekly cron that swaps a fixed amount of SOL for your target token via Jupiter Aggregator.",
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
  // 3. PORTFOLIO MONITOR
  // ═══════════════════════════════════════════════════════════════════════════
  {
    title: "Portfolio Monitor",
    description: "Track wallet balances and token holdings across protocols.",
    longDescription:
      "Periodically checks wallet SOL balance and token prices, aggregates the data, and sends a summary via webhook. Great for monitoring portfolio performance.",
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
          data: { token: "So11111111111111111111111111111111111111112" },
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
    description: "Automatically transfer tokens to a specified address on a schedule.",
    longDescription:
      "Set up recurring token transfers (e.g., payroll, distributions) triggered by a cron schedule. Uses your cloud wallet to sign transactions automatically.",
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
    description: "Receive webhook data, process with AI, and forward results.",
    longDescription:
      "Accept incoming webhook data (e.g., from Helius or Triton), use an AI agent to analyze the transaction or event, then forward the analysis to Slack or store it.",
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
];

// ─── Seed ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding cloud workflow templates...\n");

  for (const tmpl of CLOUD_TEMPLATES) {
    const existing = await prisma.workflowTemplate.findFirst({
      where: { title: tmpl.title },
    });

    if (existing) {
      console.log(`  [skip] "${tmpl.title}" already exists`);
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

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
