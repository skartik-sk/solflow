# SolStudio Cloud - Workflow Automation Platform Design Spec

**Date**: 2026-04-25
**Status**: Draft
**Domain**: cloud.solstudio.fun

---

## Context

SolStudio currently provides a visual smart contract IDE (apps/web) for building Solana programs. Users want to automate on-chain operations - DeFi trading, token management, monitoring - without writing code. This spec designs a full workflow automation platform (like n8n) purpose-built for Solana, hosted as a separate app at cloud.solstudio.fun, reusing the existing monorepo infrastructure, auth, and design system.

**Target users**: Non-technical (DeFi traders, NFT collectors, DAO operators).
**Core principle**: Every node must be usable without writing code. Pre-built templates get users started in minutes.

---

## 1. Architecture Overview

### System Diagram

```
cloud.solstudio.fun
        |
  Next.js 15 (apps/cloud) + Custom Server
        |
  +-----+-----+-----+
  |     |       |     |
Front  tRPC  WS    API
React  Routers Server Routes
Flow   +       |     |
  |     |      |   Webhook
  |     |      |   Receiver
  |     v      v
  |  PostgreSQL Redis+BullMQ
  |     |      |
  |     v      v
  |  Prisma   Execution Workers
  |            (BullMQ jobs)
  |               |
  |    +----------+----------+
  |    |          |          |
  |  Node      Cloud      DeFi
  |  Registry  Wallet     Adapters
  |            Manager
```

### App Structure: `apps/cloud/`

Separate Next.js 15 app in the monorepo. Same patterns as `apps/web` (custom server, tRPC, WebSocket, Prisma).

### New Packages

| Package | Purpose |
|---------|---------|
| `@solflow/cloud-nodes` | Node type definitions, React components, metadata, registry |
| `@solflow/cloud-engine` | Server-side execution engine, expression resolver, DAG executor |
| `@solflow/cloud-wallet` | AES-256-GCM encrypted key management, transaction signing |
| `@solflow/cloud-defi` | DeFi protocol adapters (Jupiter, Birdeye, Raydium, Orca, MarginFi, Kamino) |

### Shared Packages Reused (unchanged)

- `@solflow/ui` - Button, Card, Input, Select, Badge, Dialog, etc.
- `@solflow/auth` - NextAuth v5 (Google, GitHub, Solana Wallet)
- `@solflow/db` - Prisma (new Cloud models added)
- `@solflow/tsconfig`, `@solflow/eslint-config` - Build tooling

---

## 2. Node System

### Core Data Model

```typescript
// Items flow between nodes
interface WorkflowItem {
  json: Record<string, unknown>;
  binary?: Record<string, { data: Buffer; mimeType: string; fileName?: string }>;
  error?: { message: string; stack?: string };
  pairedItem?: { item: number; input?: number };
}

// Node categories
type NodeCategory = "trigger" | "action" | "transform" | "logic" | "ai" | "output";

// Connection types
type ConnectionType = "main" | "ai" | "trigger";
```

### Node Definition Interface

```typescript
interface CloudNodeDefinition {
  type: string;              // e.g., "trigger:wallet-event", "action:jupiter-swap"
  label: string;             // "Jupiter Swap"
  category: NodeCategory;
  description: string;
  icon: string;              // Lucide icon name
  color: string;             // Hex accent color
  properties: NodeProperty[];
  inputs: { type: ConnectionType; label: string; max?: number }[];
  outputs: { type: ConnectionType; label: string; max?: number }[];
  defaultData: Record<string, unknown>;
  component: ComponentType;  // React component for editor canvas
  execute?: (ctx: NodeExecutionContext) => Promise<WorkflowItem[]>;
  trigger?: (ctx: NodeTriggerContext) => Promise<NodeTriggerHandle>;
  webhook?: (ctx: NodeWebhookContext) => Promise<WorkflowItem[]>;
}
```

### Node Registry

Singleton registry that auto-discovers nodes. Each node is a file in `cloud-nodes/src/nodes/`. Adding a new node = creating one file + importing it in `index.ts`.

### Visual Node Component

`CloudBaseNode` shell provides: category-colored header, status indicator (idle/running/success/error), typed handles (main=blue, ai=purple, trigger=green), last output preview.

### Expression Language

`{{ $json.field }}` references data from the first item of the first input.
`{{ $input[N].field }}` references specific input connections.
`{{ $now }}` for current timestamp.

---

## 3. Execution Engine

### DAG Executor

1. Parse React Flow graph (nodes + edges) into a DAG
2. Topological sort to determine execution order
3. Group independent nodes for parallel execution
4. For each node: gather inputs from upstream, resolve expressions, execute, store results
5. Handle errors per workflow settings (stop/continue/branch)

### Trigger Manager

Long-lived process managing active triggers:
- **Cron**: BullMQ repeatable jobs
- **Webhook**: Next.js API route that routes to the correct workflow
- **On-chain**: Solana WebSocket subscriptions (account changes, program logs)
- **Manual**: Direct API call

When a trigger fires, it enqueues a new BullMQ execution job.

### Execution State

Stored in PostgreSQL via Prisma:
- `WorkflowExecution` - Overall run (status, timing, summary)
- `NodeExecution` - Per-node results (input/output snapshots, logs, duration, errors)

---

## 4. Database Schema (New Models)

### Key Models

- **CloudWallet** - Encrypted keypairs (publicKey, encryptedKey, keyIv, keyTag)
- **CloudCredential** - API keys (Birdeye, Telegram bot tokens, etc.)
- **Workflow** - Definition (React Flow JSON), settings, status, cron schedule, webhook path
- **WorkflowVersion** - Version history with definition snapshots
- **WorkflowExecution** - Run records with status, timing, node counts
- **NodeExecution** - Per-node execution data (input/output snapshots, logs, duration)
- **WorkflowTemplate** - Marketplace templates (definition, category, downloads, rating)

### Enums

- `WorkflowStatus`: DRAFT, ACTIVE, PAUSED, ARCHIVED, ERROR
- `ExecutionStatus`: QUEUED, RUNNING, WAITING, SUCCESS, ERROR, CANCELLED, TIMEOUT
- `NodeExecStatus`: QUEUED, RUNNING, SUCCESS, ERROR, SKIPPED, WAITING

---

## 5. Cloud Wallet Security

### Encryption Scheme

- Ed25519 keypairs generated server-side
- Private key encrypted with **AES-256-GCM**
- Key derived via **HKDF-SHA256**(masterKey, perWalletSalt, "solstudio-cloud-wallet-v1")
- Master key stored in environment variable `ENCRYPTION_MASTER_KEY`
- Per-wallet: random 32-byte salt, random 12-byte IV
- Private key NEVER sent to client, ONLY decrypted in-memory during `signAndSend()`

### Security Measures

1. Per-wallet unique salt (prevents cross-wallet attacks)
2. Authenticated encryption (AES-256-GCM = integrity + confidentiality)
3. In-memory only decryption during signing
4. Rate limiting on signing operations
5. Full audit log (execution ID, node ID, tx signature, timestamp)
6. User authorization check on every signing operation

---

## 6. MVP Node List (14 Nodes)

### Triggers (4)
1. `trigger:manual` - Click "Run" to start
2. `trigger:cron` - Schedule with cron expression
3. `trigger:webhook` - Expose URL, fire on HTTP request
4. `trigger:wallet-event` - On SOL/SPL transfers, balance changes

### Actions (5)
5. `action:jupiter-swap` - Swap tokens via Jupiter
6. `action:token-transfer` - Send SOL or SPL tokens
7. `action:price-fetch` - Get price from Birdeye/DexScreener
8. `action:ai-agent` - Call LLM with context, structured output, tools
9. `action:lending` - Supply/borrow/withdraw on MarginFi/Kamino

### Transform (2)
10. `transform:filter` - Keep/discard items by condition
11. `transform:json` - Parse, extract, reshape JSON

### Logic (2)
12. `logic:if-else` - Branch on condition (true/false outputs)
13. `logic:wait` - Pause for duration or until time

### Output (1)
14. `output:webhook` - POST data to external URL

---

## 7. API Design (tRPC)

### Router Structure

```
cloudRouter
  ├── workflow    (create, list, get, update, delete, duplicate, activate, deactivate)
  ├── execution   (run, list, get, cancel, retry)
  ├── wallet      (create, list, get, delete, getBalance)
  ├── credential  (create, list, get, update, delete, test)
  ├── template    (list, get, fork, rate)
  ├── nodes       (list, get, getCategories) -- read-only, for editor
  └── user        (getSettings, updateSettings)
```

### WebSocket Messages

Real-time execution progress:
- `execution-started`, `node-started`, `node-completed`, `node-error`, `execution-completed`

---

## 8. Frontend Structure

### Pages

```
/                          Landing page
/signin                    Auth (same providers)
/dashboard                 Overview: active workflows, recent executions
/workflows                 List user's workflows
/workflows/new             Create workflow (name + template picker)
/workflows/[id]            Workflow detail (triggers, stats, runs)
/editor/[workflowId]       Visual workflow editor (React Flow canvas)
/executions                Execution history
/executions/[id]           Single execution replay (node-by-node)
/wallets                   Wallet management
/wallets/new               Create/import wallet
/credentials               API key management
/templates                 Template marketplace
/templates/[id]            Template detail + "Use this template"
```

### Editor Components

- `WorkflowCanvas` - React Flow canvas (same base as existing editor)
- `NodePalette` - Left sidebar node picker (grouped by category)
- `PropertiesPanel` - Right sidebar node config (form fields per node)
- `ExecutionPanel` - Bottom panel: run button, output, logs
- `EditorToolbar` - Save, run, activate, undo/redo

### Zustand Stores

- `workflow-store` - Canvas state (nodes, edges, undo/redo via zundo)
- `editor-ui-store` - Panel visibility, zoom, selected node
- `execution-store` - Live execution state (node statuses, WebSocket updates)

### Key Differences from Existing Editor

- **Data flow** instead of code generation
- **Multiple connection types** (main, ai, trigger) with colored handles
- **Execution replay** - nodes show status badges after running
- **No code generation** - just visual wiring and node config
- **Run button** - prominent manual execution trigger

---

## 9. DeFi Protocol Adapters

### `@solflow/cloud-defi` Package

| Protocol | Operations | API/SDK |
|----------|-----------|---------|
| Jupiter | Swap, limit orders, DCA | Jupiter Quote/Swap API |
| Raydium | Swap, LP, farming | Raydium SDK |
| Orca | Swap, LP, whirlpools | Orca Whirlpools SDK |
| MarginFi | Supply, borrow, withdraw | MarginFi SDK |
| Kamino | Supply, borrow, leverage | Kamino SDK |
| Birdeye | Price, volume, market data | Birdeye API |
| DexScreener | Price, pair info, volume | DexScreener API |
| Polymarket (future) | Prediction market operations | Polymarket CLOB API |

Each adapter is a TypeScript class with a standard interface:
```typescript
interface DeFiAdapter {
  protocol: string;
  operations: string[];
  execute(operation: string, params: Record<string, unknown>, wallet: WalletOperations): Promise<unknown>;
}
```

---

## 10. Phased Roadmap

### Phase 1: Foundation (Weeks 1-3)

Goal: Scaffold app, visual editor working with basic nodes, end-to-end manual execution.

1. Create `apps/cloud` Next.js app (same patterns as apps/web)
2. Create `@solflow/cloud-nodes` package (types, registry, CloudBaseNode)
3. Create `@solflow/cloud-engine` package (basic WorkflowExecutor)
4. Add Prisma models: Workflow, WorkflowExecution, NodeExecution, CloudWallet
5. Build tRPC routers: workflow, execution
6. Build editor: WorkflowCanvas, NodePalette, PropertiesPanel
7. Implement 4 nodes: trigger:manual, action:price-fetch, transform:filter, logic:if-else
8. End-to-end test: create workflow, wire nodes, run manually, see results

### Phase 2: Cloud Wallets + DeFi (Weeks 4-5)

Goal: Cloud wallet management, first DeFi integrations.

1. Create `@solflow/cloud-wallet` package (encryption, signing)
2. Create `@solflow/cloud-defi` package (Jupiter, Birdeye adapters)
3. Build walletRouter, credentialRouter
4. Implement: action:jupiter-swap, action:token-transfer
5. Wallet management UI
6. BullMQ execution worker (separate process)
7. Docker-compose updates

### Phase 3: Triggers + Scheduling (Weeks 6-7)

Goal: Automated workflows via cron and webhooks.

1. Implement trigger:cron (BullMQ repeatable jobs)
2. Implement trigger:webhook (Next.js API route)
3. Implement trigger:wallet-event (Solana WebSocket subscription)
4. Scheduler worker (cron trigger management)
5. Trigger Manager lifecycle (activate/deactivate)
6. Workflow activation UI

### Phase 4: AI + Templates (Weeks 8-9)

Goal: AI agent nodes, template marketplace.

1. Implement action:ai-agent (LLM call with structured output)
2. Template system: WorkflowTemplate model, browser, fork
3. Build 5 starter templates:
   - "DCA into SOL"
   - "Price alert via webhook"
   - "Auto-compound lending"
   - "Wallet balance monitor"
   - "Token swap on threshold"
4. Implement output:webhook, action:lending, logic:wait

### Phase 5: Polish + Production (Weeks 10-12)

Goal: Production deployment.

1. Execution history UI (timeline, per-node inspector)
2. WebSocket real-time progress
3. Error handling: retry, error branch
4. Rate limiting
5. Monitoring (execution metrics, wallet alerts, health checks)
6. Docker deployment for cloud.solstudio.fun
7. Domain, SSL, CDN
8. Onboarding flow

---

## 11. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Separate app (`apps/cloud`) not adding to `apps/web` | Different domain (workflow automation vs smart contract IDE), independent scaling, clean separation |
| New node system, not reusing `@solflow/plugin-sdk` | Plugin SDK has `toIR`, `cargoDependencies`, `codegen` - wrong abstraction. Cloud nodes need `execute()`, `trigger()`, `webhook()` |
| Server-side execution for MVP | Non-technical users can't run local servers. Cloud wallets need server-side access. Cron/webhooks need persistent process. |
| BullMQ (already in stack) | Existing compile worker uses same pattern. Reliable job queuing with retries, persistence, concurrency. |
| AES-256-GCM wallet encryption | Industry standard authenticated encryption. Per-wallet salt prevents cross-wallet attacks. |
| React Flow (already in stack) | Existing visual editor already uses it. Same drag-and-drop canvas, handles, connections. |

---

## 12. Future Extensibility

The architecture supports adding new nodes by creating a single file:

```typescript
// packages/cloud-nodes/src/nodes/action-new-protocol.ts
export const newProtocolAction: CloudNodeDefinition = {
  type: "action:new-protocol",
  label: "New Protocol Action",
  category: "action",
  // ... define properties, inputs, outputs, execute function
};
```

Then import and register in `index.ts`. No changes to the engine, editor, or API needed.

Future node categories to add post-MVP:
- **NFT operations** (mint, transfer, metadata via Metaplex)
- **Governance** (vote, propose via Realms)
- **Staking** (stake, unstake, delegate)
- **Oracle** (Pyth price feeds, Switchboard)
- **More DeFi** (Drift, Phoenix, OpenBook)
- **More outputs** (Telegram, Discord, Email, Slack)
- **Database** (store/query workflow data)
- **Sub-workflows** (call other workflows as nodes)
- **Prediction markets** (Polymarket-style)
