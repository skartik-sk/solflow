# SolStudio Cloud - Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Cloud app, node system, execution engine, editor UI, and 4 basic nodes so users can visually create workflows and run them manually end-to-end.

**Architecture:** New `apps/cloud` Next.js 15 app in the monorepo with 4 new packages (`cloud-nodes`, `cloud-engine`, `cloud-wallet`, `cloud-defi`). Same tRPC + Zustand + React Flow patterns as the existing web app. Server-side execution via BullMQ workers.

**Tech Stack:** Next.js 15, React 19, TypeScript, React Flow, Zustand + Zundo, tRPC v11, Prisma, BullMQ, Radix UI, Tailwind CSS v4 (OKLCH dark theme)

---

## File Structure

### New Files Created

```
packages/
  cloud-nodes/
    package.json
    tsconfig.json
    src/
      index.ts
      types.ts
      registry.ts
      components/
        cloud-base-node.tsx
        handle.tsx
      nodes/
        trigger-manual.tsx
        action-price-fetch.tsx
        transform-filter.tsx
        logic-if-else.tsx
    __tests__/
      registry.test.ts
      expression.test.ts

  cloud-engine/
    package.json
    tsconfig.json
    src/
      index.ts
      types.ts
      executor.ts
      expression.ts
      dag.ts
    __tests__/
      executor.test.ts
      expression.test.ts
      dag.test.ts

  cloud-wallet/
    package.json
    tsconfig.json
    src/
      index.ts
      encryption.ts
      wallet-manager.ts
      types.ts
    __tests__/
      encryption.test.ts

  cloud-defi/
    package.json
    tsconfig.json
    src/
      index.ts
      types.ts
      adapters/
        birdeye.ts
        jupiter.ts
    __tests__/
      birdeye.test.ts

apps/cloud/
  package.json
  next.config.ts
  server.ts
  tsconfig.json
  tsconfig.server.json
  tailwind.config.ts
  postcss.config.js
  src/
    app/
      layout.tsx
      page.tsx
      globals.css
      (auth)/
        signin/page.tsx
      (dashboard)/
        layout.tsx
        dashboard/page.tsx
        workflows/
          page.tsx
          new/page.tsx
          [id]/page.tsx
        wallets/
          page.tsx
        executions/
          page.tsx
          [id]/page.tsx
      (editor)/
        layout.tsx
        editor/[workflowId]/page.tsx
      api/
        trpc/[trpc]/route.ts
        auth/[...nextauth]/route.ts
        webhook/[path]/route.ts
    components/
      layout/
        sidebar.tsx
        topbar.tsx
        app-shell.tsx
      editor/
        workflow-canvas.tsx
        node-palette.tsx
        properties-panel.tsx
        execution-panel.tsx
        editor-toolbar.tsx
        connection-line.tsx
      dashboard/
        workflow-card.tsx
        stats-cards.tsx
        execution-timeline.tsx
    store/
      workflow-store.ts
      editor-ui-store.ts
      execution-store.ts
    lib/
      trpc/
        client.ts
        server.ts
      ws.ts
    server/
      trpc/
        trpc.ts
        routers/
          index.ts
          workflow.ts
          execution.ts
          wallet.ts
          credential.ts
          nodes.ts
      engine/
        executor-service.ts
        workers/
          execution-worker.ts
```

### Modified Files

```
packages/db/prisma/schema.prisma     (add Cloud models)
package.json                          (add cloud workspace scripts)
```

---

## Task 1: Create `@solflow/cloud-nodes` Package

**Files:**
- Create: `packages/cloud-nodes/package.json`
- Create: `packages/cloud-nodes/tsconfig.json`
- Create: `packages/cloud-nodes/src/types.ts`
- Create: `packages/cloud-nodes/src/registry.ts`
- Create: `packages/cloud-nodes/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@solflow/cloud-nodes",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@xyflow/react": "^12.5.0",
    "lucide-react": "^0.469.0",
    "react": "^19.0.0",
    "zod": "^3.24.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.0",
    "tailwind-merge": "^3.0.0"
  },
  "devDependencies": {
    "@solflow/tsconfig": "workspace:*",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "@solflow/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create types.ts with all core node interfaces**

```typescript
import type { ComponentType } from "react";
import type { NodeProps } from "@xyflow/react";

// ─── Data Model ──────────────────────────────────────────────────────────────

export interface WorkflowItem {
  json: Record<string, unknown>;
  binary?: Record<string, { data: Buffer; mimeType: string; fileName?: string }>;
  error?: { message: string; stack?: string };
  pairedItem?: { item: number; input?: number };
}

// ─── Node Classification ─────────────────────────────────────────────────────

export type NodeCategory =
  | "trigger"
  | "action"
  | "transform"
  | "logic"
  | "ai"
  | "output";

export const CATEGORY_COLORS: Record<NodeCategory, string> = {
  trigger: "#22c55e",
  action: "#3b82f6",
  transform: "#f59e0b",
  logic: "#a855f7",
  ai: "#ec4899",
  output: "#06b6d4",
};

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  trigger: "Triggers",
  action: "Actions",
  transform: "Transform",
  logic: "Logic",
  ai: "AI",
  output: "Output",
};

export type ConnectionType = "main" | "ai" | "trigger";

export const CONNECTION_COLORS: Record<ConnectionType, string> = {
  main: "#3b82f6",
  ai: "#a855f7",
  trigger: "#22c55e",
};

// ─── Property Schema ─────────────────────────────────────────────────────────

export type PropertyType =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "json"
  | "pubkey"
  | "address"
  | "expression"
  | "credential"
  | "wallet-select"
  | "code"
  | "date"
  | "duration";

export interface NodeProperty {
  key: string;
  label: string;
  type: PropertyType;
  required: boolean;
  description?: string;
  default?: unknown;
  options?: { label: string; value: string }[];
  placeholder?: string;
  credentialType?: string;
  supportsExpressions?: boolean;
}

// ─── Node I/O Definition ─────────────────────────────────────────────────────

export interface NodePort {
  type: ConnectionType;
  label: string;
  max?: number;
}

// ─── Wallet Operations (provided by engine at runtime) ───────────────────────

export interface WalletOperations {
  signAndSend(tx: unknown, walletId: string): Promise<string>;
  getPublicKey(walletId: string): Promise<string>;
  getBalance(walletId: string): Promise<number>;
}

// ─── Node Logger ─────────────────────────────────────────────────────────────

export interface NodeLogger {
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

// ─── Execution Contexts ──────────────────────────────────────────────────────

export interface NodeExecutionContext {
  inputs: WorkflowItem[][];
  params: Record<string, unknown>;
  executionId: string;
  nodeId: string;
  wallet: WalletOperations;
  logger: NodeLogger;
  signal: AbortSignal;
}

export interface NodeTriggerContext {
  params: Record<string, unknown>;
  emit: (items: WorkflowItem[]) => void;
  wallet: WalletOperations;
  logger: NodeLogger;
}

export interface NodeTriggerHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface NodeWebhookContext {
  request: {
    method: string;
    headers: Record<string, string>;
    body: unknown;
    query: Record<string, string>;
  };
  params: Record<string, unknown>;
  logger: NodeLogger;
}

// ─── Cloud Node Definition ───────────────────────────────────────────────────

export interface CloudNodeDefinition {
  type: string;
  label: string;
  category: NodeCategory;
  description: string;
  icon: string;
  color: string;
  properties: NodeProperty[];
  inputs: NodePort[];
  outputs: NodePort[];
  defaultData: Record<string, unknown>;
  component: ComponentType<NodeProps>;
  execute?: (ctx: NodeExecutionContext) => Promise<WorkflowItem[]>;
  trigger?: (ctx: NodeTriggerContext) => Promise<NodeTriggerHandle>;
  webhook?: (ctx: NodeWebhookContext) => Promise<WorkflowItem[]>;
}

// ─── React Flow Node Data ────────────────────────────────────────────────────

export interface CloudFlowNodeData {
  label: string;
  type: string;
  category: NodeCategory;
  icon: string;
  color: string;
  properties: NodeProperty[];
  inputs: NodePort[];
  outputs: NodePort[];
  data: Record<string, unknown>;
  status?: "idle" | "running" | "success" | "error";
  outputPreview?: unknown;
}
```

- [ ] **Step 4: Create registry.ts**

```typescript
import type { ComponentType } from "react";
import type { CloudNodeDefinition, NodeCategory } from "./types";

export class CloudNodeRegistry {
  private nodes: Map<string, CloudNodeDefinition> = new Map();

  register(node: CloudNodeDefinition): void {
    if (this.nodes.has(node.type)) {
      throw new Error(`Node type "${node.type}" already registered`);
    }
    this.nodes.set(node.type, node);
  }

  get(type: string): CloudNodeDefinition | undefined {
    return this.nodes.get(type);
  }

  getAll(): CloudNodeDefinition[] {
    return Array.from(this.nodes.values());
  }

  getByCategory(category: NodeCategory): CloudNodeDefinition[] {
    return this.getAll().filter((n) => n.category === category);
  }

  getNodeTypes(): Record<string, ComponentType> {
    const types: Record<string, ComponentType> = {};
    for (const node of this.nodes.values()) {
      types[node.type] = node.component;
    }
    return types;
  }

  has(type: string): boolean {
    return this.nodes.has(type);
  }

  clear(): void {
    this.nodes.clear();
  }
}

export const cloudNodeRegistry = new CloudNodeRegistry();
```

- [ ] **Step 5: Create barrel index.ts (nodes imported in later tasks)**

```typescript
export * from "./types";
export * from "./registry";
export { cloudNodeRegistry } from "./registry";
```

- [ ] **Step 6: Install dependencies and verify build**

Run: `cd packages/cloud-nodes && bun install && bun run build`
Expected: Compiles without errors

- [ ] **Step 7: Write registry test**

Create `packages/cloud-nodes/__tests__/registry.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { CloudNodeRegistry } from "../src/registry";
import type { CloudNodeDefinition } from "../src/types";

const mockNode: CloudNodeDefinition = {
  type: "test:mock",
  label: "Mock Node",
  category: "action",
  description: "A mock node for testing",
  icon: "Zap",
  color: "#3b82f6",
  properties: [],
  inputs: [],
  outputs: [],
  defaultData: {},
  component: (() => null) as any,
};

describe("CloudNodeRegistry", () => {
  let registry: CloudNodeRegistry;

  beforeEach(() => {
    registry = new CloudNodeRegistry();
  });

  it("registers and retrieves a node", () => {
    registry.register(mockNode);
    expect(registry.get("test:mock")).toEqual(mockNode);
  });

  it("returns undefined for unregistered node", () => {
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("throws on duplicate registration", () => {
    registry.register(mockNode);
    expect(() => registry.register(mockNode)).toThrow("already registered");
  });

  it("getAll returns all registered nodes", () => {
    registry.register(mockNode);
    registry.register({ ...mockNode, type: "test:mock2" });
    expect(registry.getAll()).toHaveLength(2);
  });

  it("getByCategory filters correctly", () => {
    registry.register(mockNode);
    registry.register({ ...mockNode, type: "test:trigger1", category: "trigger" });
    expect(registry.getByCategory("action")).toHaveLength(1);
    expect(registry.getByCategory("trigger")).toHaveLength(1);
    expect(registry.getByCategory("logic")).toHaveLength(0);
  });

  it("getNodeTypes returns component map", () => {
    registry.register(mockNode);
    const types = registry.getNodeTypes();
    expect(types["test:mock"]).toBeDefined();
  });

  it("has checks existence", () => {
    registry.register(mockNode);
    expect(registry.has("test:mock")).toBe(true);
    expect(registry.has("nonexistent")).toBe(false);
  });

  it("clear removes all nodes", () => {
    registry.register(mockNode);
    registry.clear();
    expect(registry.getAll()).toHaveLength(0);
  });
});
```

- [ ] **Step 8: Run tests**

Run: `cd packages/cloud-nodes && bun run test`
Expected: All 8 tests PASS

- [ ] **Step 9: Commit**

```
feat(cloud-nodes): add node type system and registry

Core types for the cloud workflow node system: WorkflowItem data model,
CloudNodeDefinition interface, NodeProperty schema, execution contexts,
and CloudNodeRegistry with auto-discovery pattern.
```

---

## Task 2: Create `@solflow/cloud-engine` Package

**Files:**
- Create: `packages/cloud-engine/package.json`
- Create: `packages/cloud-engine/tsconfig.json`
- Create: `packages/cloud-engine/src/types.ts`
- Create: `packages/cloud-engine/src/expression.ts`
- Create: `packages/cloud-engine/src/dag.ts`
- Create: `packages/cloud-engine/src/executor.ts`
- Create: `packages/cloud-engine/src/index.ts`
- Test: `packages/cloud-engine/__tests__/expression.test.ts`
- Test: `packages/cloud-engine/__tests__/dag.test.ts`
- Test: `packages/cloud-engine/__tests__/executor.test.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@solflow/cloud-engine",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@solflow/cloud-nodes": "workspace:*",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@solflow/tsconfig": "workspace:*",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "@solflow/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create engine types.ts**

```typescript
import type { WorkflowItem } from "@solflow/cloud-nodes";

export interface WorkflowDefinition {
  id: string;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowSettings {
  timeout: number;
  retryPolicy: { maxAttempts: number; delayMs: number };
  defaultWalletId?: string;
  onError: "stop" | "continue" | "branch";
}

export type ExecutionStatus =
  | "queued"
  | "running"
  | "waiting"
  | "success"
  | "error"
  | "cancelled"
  | "timeout";

export type NodeExecStatus =
  | "queued"
  | "running"
  | "success"
  | "error"
  | "skipped"
  | "waiting";

export interface NodeExecutionResult {
  nodeId: string;
  nodeType: string;
  status: NodeExecStatus;
  inputSnapshot: unknown;
  outputSnapshot: unknown;
  duration: number;
  error?: string;
  logs: { timestamp: number; level: string; message: string; data?: unknown }[];
}

export interface ExecutionResult {
  executionId: string;
  workflowId: string;
  status: ExecutionStatus;
  nodeResults: Map<string, NodeExecutionResult>;
  startedAt: number;
  completedAt?: number;
  duration?: number;
  error?: string;
}
```

- [ ] **Step 4: Write expression resolver tests first**

Create `packages/cloud-engine/__tests__/expression.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { resolveExpressions } from "../src/expression";

describe("resolveExpressions", () => {
  const inputs = [
    [
      { json: { price: 150.5, symbol: "SOL", volume: 1000000 } },
      { json: { price: 151.0, symbol: "SOL", volume: 1005000 } },
    ],
  ];

  it("resolves $json.field from first item of first input", () => {
    const result = resolveExpressions("Price is {{ $json.price }}", inputs);
    expect(result).toBe("Price is 150.5");
  });

  it("resolves nested field paths", () => {
    const nestedInputs = [
      [{ json: { data: { nested: { value: 42 } } } }],
    ];
    const result = resolveExpressions("{{ $json.data.nested.value }}", nestedInputs);
    expect(result).toBe("42");
  });

  it("returns empty string for missing fields", () => {
    const result = resolveExpressions("{{ $json.missing }}", inputs);
    expect(result).toBe("");
  });

  it("resolves multiple expressions in one string", () => {
    const result = resolveExpressions("{{ $json.symbol }} at {{ $json.price }}", inputs);
    expect(result).toBe("SOL at 150.5");
  });

  it("handles strings without expressions", () => {
    const result = resolveExpressions("no expressions here", inputs);
    expect(result).toBe("no expressions here");
  });

  it("resolves non-string params (numbers, booleans) as-is", () => {
    expect(resolveExpressions(42, inputs)).toBe(42);
    expect(resolveExpressions(true, inputs)).toBe(true);
  });

  it("resolves expressions in object values recursively", () => {
    const params = { amount: "{{ $json.price }}", label: "static" };
    const result = resolveExpressions(params, inputs);
    expect(result).toEqual({ amount: "150.5", label: "static" });
  });

  it("resolves expressions in array values", () => {
    const params = ["{{ $json.symbol }}", "static"];
    const result = resolveExpressions(params, inputs);
    expect(result).toEqual(["SOL", "static"]);
  });
});
```

- [ ] **Step 5: Run expression tests (should fail)**

Run: `cd packages/cloud-engine && bun run test __tests__/expression.test.ts`
Expected: FAIL - module not found

- [ ] **Step 6: Implement expression.ts**

```typescript
import type { WorkflowItem } from "@solflow/cloud-nodes";

type ExpressionContext = WorkflowItem[][];

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function resolveExpressions(
  value: unknown,
  inputs: ExpressionContext,
): unknown {
  if (typeof value === "string") {
    return resolveString(value, inputs);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveExpressions(item, inputs));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = resolveExpressions(v, inputs);
    }
    return result;
  }
  return value;
}

function resolveString(template: string, inputs: ExpressionContext): string {
  return template.replace(/\{\{\s*(.+?)\s*\}\}/g, (_, expr: string) => {
    const trimmed = expr.trim();
    if (trimmed.startsWith("$json.")) {
      const path = trimmed.slice(6);
      const firstItem = inputs[0]?.[0]?.json;
      if (!firstItem) return "";
      const val = getNestedValue(firstItem, path);
      return val !== undefined ? String(val) : "";
    }
    return "";
  });
}
```

- [ ] **Step 7: Run expression tests (should pass)**

Run: `cd packages/cloud-engine && bun run test __tests__/expression.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 8: Write DAG tests**

Create `packages/cloud-engine/__tests__/dag.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildDAG, topologicalSort, getParallelBatches } from "../src/dag";
import type { WorkflowNode, WorkflowEdge } from "../src/types";

const nodes: WorkflowNode[] = [
  { id: "a", type: "trigger:manual", position: { x: 0, y: 0 }, data: {} },
  { id: "b", type: "action:price-fetch", position: { x: 200, y: 0 }, data: {} },
  { id: "c", type: "logic:if-else", position: { x: 400, y: 0 }, data: {} },
  { id: "d", type: "action:jupiter-swap", position: { x: 600, y: -100 }, data: {} },
  { id: "e", type: "output:webhook", position: { x: 600, y: 100 }, data: {} },
];

describe("buildDAG", () => {
  it("builds adjacency list from edges", () => {
    const edges: WorkflowEdge[] = [
      { id: "e1", source: "a", target: "b" },
      { id: "e2", source: "b", target: "c" },
      { id: "e3", source: "c", target: "d" },
      { id: "e4", source: "c", target: "e" },
    ];
    const dag = buildDAG(nodes, edges);
    expect(dag.get("a")).toEqual([{ target: "b" }]);
    expect(dag.get("b")).toEqual([{ target: "c" }]);
    expect(dag.get("c")!.map((e) => e.target).sort()).toEqual(["d", "e"]);
    expect(dag.get("d")).toEqual([]);
  });

  it("handles nodes with no edges", () => {
    const dag = buildDAG([nodes[0]], []);
    expect(dag.get("a")).toEqual([]);
  });
});

describe("topologicalSort", () => {
  it("sorts linear chain", () => {
    const edges: WorkflowEdge[] = [
      { id: "e1", source: "a", target: "b" },
      { id: "e2", source: "b", target: "c" },
    ];
    const dag = buildDAG(nodes.slice(0, 3), edges);
    const sorted = topologicalSort(dag, ["a", "b", "c"]);
    expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("b"));
    expect(sorted.indexOf("b")).toBeLessThan(sorted.indexOf("c"));
  });

  it("sorts diamond graph", () => {
    const edges: WorkflowEdge[] = [
      { id: "e1", source: "a", target: "b" },
      { id: "e2", source: "a", target: "c" },
      { id: "e3", source: "b", target: "d" },
      { id: "e4", source: "c", target: "d" },
    ];
    const dag = buildDAG(nodes.slice(0, 4), edges);
    const sorted = topologicalSort(dag, ["a", "b", "c", "d"]);
    expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("b"));
    expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("c"));
    expect(sorted.indexOf("b")).toBeLessThan(sorted.indexOf("d"));
    expect(sorted.indexOf("c")).toBeLessThan(sorted.indexOf("d"));
  });

  it("detects circular dependency", () => {
    const edges: WorkflowEdge[] = [
      { id: "e1", source: "a", target: "b" },
      { id: "e2", source: "b", target: "c" },
      { id: "e3", source: "c", target: "a" },
    ];
    const dag = buildDAG(nodes.slice(0, 3), edges);
    expect(() => topologicalSort(dag, ["a", "b", "c"])).toThrow("circular");
  });
});

describe("getParallelBatches", () => {
  it("groups independent nodes in same batch", () => {
    const edges: WorkflowEdge[] = [
      { id: "e1", source: "a", target: "b" },
      { id: "e2", source: "a", target: "c" },
    ];
    const dag = buildDAG(nodes.slice(0, 3), edges);
    const sorted = topologicalSort(dag, ["a", "b", "c"]);
    const batches = getParallelBatches(sorted, dag);
    expect(batches[0]).toEqual(["a"]);
    expect(batches[1].sort()).toEqual(["b", "c"]);
  });
});
```

- [ ] **Step 9: Run DAG tests (should fail)**

Run: `cd packages/cloud-engine && bun run test __tests__/dag.test.ts`
Expected: FAIL - module not found

- [ ] **Step 10: Implement dag.ts**

```typescript
import type { WorkflowNode, WorkflowEdge } from "./types";

export interface DAGEdge {
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export type DAG = Map<string, DAGEdge[]>;
export type InDegree = Map<string, number>;

export function buildDAG(nodes: WorkflowNode[], edges: WorkflowEdge[]): DAG {
  const dag: DAG = new Map();
  for (const node of nodes) {
    dag.set(node.id, []);
  }
  for (const edge of edges) {
    const existing = dag.get(edge.source) ?? [];
    existing.push({
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    });
    dag.set(edge.source, existing);
  }
  return dag;
}

export function topologicalSort(dag: DAG, nodeIds: string[]): string[] {
  const inDegree: Map<string, number> = new Map();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
  }
  for (const [, edges] of dag) {
    for (const edge of edges) {
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const edge of dag.get(id) ?? []) {
      const newDeg = (inDegree.get(edge.target) ?? 1) - 1;
      inDegree.set(edge.target, newDeg);
      if (newDeg === 0) queue.push(edge.target);
    }
  }

  if (sorted.length !== nodeIds.length) {
    throw new Error(
      `Circular dependency detected. Sorted ${sorted.length}/${nodeIds.length} nodes.`
    );
  }
  return sorted;
}

export function getParallelBatches(sorted: string[], dag: DAG): string[][] {
  const inDegree: Map<string, number> = new Map();
  for (const id of sorted) {
    inDegree.set(id, 0);
  }
  for (const [, edges] of dag) {
    for (const edge of edges) {
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
  }

  const batches: string[][] = [];
  const processed = new Set<string>();

  while (processed.size < sorted.length) {
    const batch: string[] = [];
    for (const id of sorted) {
      if (processed.has(id)) continue;
      if ((inDegree.get(id) ?? 0) === 0) {
        batch.push(id);
      }
    }
    if (batch.length === 0) break;
    batches.push(batch);
    for (const id of batch) {
      processed.add(id);
      for (const edge of dag.get(id) ?? []) {
        inDegree.set(edge.target, (inDegree.get(edge.target) ?? 1) - 1);
      }
    }
  }
  return batches;
}
```

- [ ] **Step 11: Run DAG tests (should pass)**

Run: `cd packages/cloud-engine && bun run test __tests__/dag.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 12: Write executor tests**

Create `packages/cloud-engine/__tests__/executor.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { WorkflowExecutor } from "../src/executor";
import { CloudNodeRegistry } from "@solflow/cloud-nodes";
import type { CloudNodeDefinition, NodeExecutionContext } from "@solflow/cloud-nodes";
import type { WorkflowDefinition } from "../src/types";

function createMockNode(
  type: string,
  executeFn: (ctx: NodeExecutionContext) => Promise<any>,
): CloudNodeDefinition {
  return {
    type,
    label: type,
    category: "action",
    description: "mock",
    icon: "Zap",
    color: "#3b82f6",
    properties: [],
    inputs: [{ type: "main", label: "in" }],
    outputs: [{ type: "main", label: "out" }],
    defaultData: {},
    component: (() => null) as any,
    execute: executeFn,
  };
}

const mockWallet = {
  signAndSend: vi.fn(),
  getPublicKey: vi.fn(),
  getBalance: vi.fn(),
};

describe("WorkflowExecutor", () => {
  it("executes a linear chain of nodes", async () => {
    const registry = new CloudNodeRegistry();
    registry.register(
      createMockNode("trigger:manual", async () => [
        { json: { count: 1 } },
      ])
    );
    registry.register(
      createMockNode("action:doubler", async (ctx) => {
        const input = ctx.inputs[0][0].json;
        return [{ json: { count: (input.count as number) * 2 } }];
      })
    );
    registry.register(
      createMockNode("action:trippler", async (ctx) => {
        const input = ctx.inputs[0][0].json;
        return [{ json: { count: (input.count as number) * 3 } }];
      })
    );

    const def: WorkflowDefinition = {
      id: "wf-1",
      version: 1,
      nodes: [
        { id: "n1", type: "trigger:manual", position: { x: 0, y: 0 }, data: {} },
        { id: "n2", type: "action:doubler", position: { x: 200, y: 0 }, data: {} },
        { id: "n3", type: "action:trippler", position: { x: 400, y: 0 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ],
      settings: { timeout: 30, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
    };

    const executor = new WorkflowExecutor(registry, mockWallet as any);
    const result = await executor.execute(def, "exec-1");

    expect(result.status).toBe("success");
    expect(result.nodeResults.get("n1")?.status).toBe("success");
    expect(result.nodeResults.get("n2")?.status).toBe("success");
    expect(result.nodeResults.get("n3")?.status).toBe("success");

    const n3Output = result.nodeResults.get("n3")?.outputSnapshot as any[];
    expect(n3Output[0].json.count).toBe(6);
  });

  it("handles parallel branches", async () => {
    const registry = new CloudNodeRegistry();
    registry.register(
      createMockNode("trigger:manual", async () => [{ json: { value: 10 } }])
    );
    registry.register(
      createMockNode("action:double", async (ctx) => {
        const v = ctx.inputs[0][0].json.value as number;
        return [{ json: { value: v * 2 } }];
      })
    );
    registry.register(
      createMockNode("action:triple", async (ctx) => {
        const v = ctx.inputs[0][0].json.value as number;
        return [{ json: { value: v * 3 } }];
      })
    );
    registry.register(
      createMockNode("action:merge", async (ctx) => {
        const values = ctx.inputs.flat().map((i) => i.json.value);
        return [{ json: { values } }];
      })
    );

    const def: WorkflowDefinition = {
      id: "wf-2",
      version: 1,
      nodes: [
        { id: "n1", type: "trigger:manual", position: { x: 0, y: 0 }, data: {} },
        { id: "n2", type: "action:double", position: { x: 200, y: -100 }, data: {} },
        { id: "n3", type: "action:triple", position: { x: 200, y: 100 }, data: {} },
        { id: "n4", type: "action:merge", position: { x: 400, y: 0 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n1", target: "n3" },
        { id: "e3", source: "n2", target: "n4" },
        { id: "e4", source: "n3", target: "n4" },
      ],
      settings: { timeout: 30, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
    };

    const executor = new WorkflowExecutor(registry, mockWallet as any);
    const result = await executor.execute(def, "exec-2");

    expect(result.status).toBe("success");
    const n4Output = result.nodeResults.get("n4")?.outputSnapshot as any[];
    expect(n4Output[0].json.values).toEqual([20, 30]);
  });

  it("captures errors per node with onError=stop", async () => {
    const registry = new CloudNodeRegistry();
    registry.register(
      createMockNode("trigger:manual", async () => [{ json: {} }])
    );
    registry.register(
      createMockNode("action:fail", async () => {
        throw new Error("Something broke");
      })
    );

    const def: WorkflowDefinition = {
      id: "wf-3",
      version: 1,
      nodes: [
        { id: "n1", type: "trigger:manual", position: { x: 0, y: 0 }, data: {} },
        { id: "n2", type: "action:fail", position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2" }],
      settings: { timeout: 30, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
    };

    const executor = new WorkflowExecutor(registry, mockWallet as any);
    const result = await executor.execute(def, "exec-3");

    expect(result.status).toBe("error");
    expect(result.nodeResults.get("n2")?.error).toBe("Something broke");
  });
});
```

- [ ] **Step 13: Implement executor.ts**

```typescript
import {
  cloudNodeRegistry,
  type CloudNodeDefinition,
  type NodeExecutionContext,
  type WorkflowItem,
  type WalletOperations,
  type NodeLogger,
} from "@solflow/cloud-nodes";
import { buildDAG, topologicalSort, getParallelBatches } from "./dag";
import { resolveExpressions } from "./expression";
import type {
  WorkflowDefinition,
  ExecutionResult,
  NodeExecutionResult,
  NodeExecStatus,
} from "./types";

export class WorkflowExecutor {
  private registry: CloudNodeRegistry;
  private walletOps: WalletOperations;
  private aborted = false;
  private logs: Map<string, { timestamp: number; level: string; message: string; data?: unknown }[]>;

  constructor(registry: CloudNodeRegistry, walletOps: WalletOperations) {
    this.registry = registry;
    this.walletOps = walletOps;
    this.logs = new Map();
  }

  async execute(
    def: WorkflowDefinition,
    executionId: string,
  ): Promise<ExecutionResult> {
    this.aborted = false;
    this.logs.clear();
    const nodeResults: Map<string, NodeExecutionResult> = new Map();
    const outputData: Map<string, WorkflowItem[]> = new Map();

    const startedAt = Date.now();

    try {
      const dag = buildDAG(def.nodes, def.edges);
      const nodeIds = def.nodes.map((n) => n.id);
      const sorted = topologicalSort(dag, nodeIds);
      const batches = getParallelBatches(sorted, dag);

      for (const batch of batches) {
        if (this.aborted) break;

        await Promise.all(
          batch.map((nodeId) =>
            this.executeNode(nodeId, def, executionId, dag, nodeResults, outputData)
          )
        );
      }

      const hasError = Array.from(nodeResults.values()).some(
        (r) => r.status === "error"
      );

      return {
        executionId,
        workflowId: def.id,
        status: hasError ? "error" : "success",
        nodeResults,
        startedAt,
        completedAt: Date.now(),
        duration: Date.now() - startedAt,
      };
    } catch (err) {
      return {
        executionId,
        workflowId: def.id,
        status: "error",
        nodeResults,
        startedAt,
        completedAt: Date.now(),
        duration: Date.now() - startedAt,
        error: (err as Error).message,
      };
    }
  }

  private async executeNode(
    nodeId: string,
    def: WorkflowDefinition,
    executionId: string,
    dag: ReturnType<typeof buildDAG>,
    nodeResults: Map<string, NodeExecutionResult>,
    outputData: Map<string, WorkflowItem[]>,
  ): Promise<void> {
    const wfNode = def.nodes.find((n) => n.id === nodeId)!;
    const nodeDef = this.registry.get(wfNode.type);
    if (!nodeDef?.execute) {
      nodeResults.set(nodeId, {
        nodeId,
        nodeType: wfNode.type,
        status: "skipped",
        inputSnapshot: null,
        outputSnapshot: null,
        duration: 0,
        logs: [],
      });
      return;
    }

    // Gather inputs from upstream nodes
    const inputs: WorkflowItem[][] = [];
    const upstreamEdges = Array.from(dag.entries())
      .filter(([, edges]) => edges.some((e) => e.target === nodeId))
      .map(([source]) => ({ source }));

    for (const { source } of upstreamEdges) {
      const upstreamOutput = outputData.get(source) ?? [];
      inputs.push(upstreamOutput);
    }

    // Resolve expressions in node config
    const params = resolveExpressions(wfNode.data, inputs) as Record<string, unknown>;

    const nodeLogs: { timestamp: number; level: string; message: string; data?: unknown }[] = [];
    const logger: NodeLogger = {
      info: (msg, data) => nodeLogs.push({ timestamp: Date.now(), level: "info", message: msg, data }),
      warn: (msg, data) => nodeLogs.push({ timestamp: Date.now(), level: "warn", message: msg, data }),
      error: (msg, data) => nodeLogs.push({ timestamp: Date.now(), level: "error", message: msg, data }),
    };

    const ctx: NodeExecutionContext = {
      inputs,
      params,
      executionId,
      nodeId,
      wallet: this.walletOps,
      logger,
      signal: new AbortController().signal,
    };

    const startTime = Date.now();
    try {
      const output = await nodeDef.execute(ctx);
      outputData.set(nodeId, output);
      nodeResults.set(nodeId, {
        nodeId,
        nodeType: wfNode.type,
        status: "success",
        inputSnapshot: this.safeSnapshot(inputs),
        outputSnapshot: this.safeSnapshot(output),
        duration: Date.now() - startTime,
        logs: nodeLogs,
      });
    } catch (err) {
      nodeResults.set(nodeId, {
        nodeId,
        nodeType: wfNode.type,
        status: "error",
        inputSnapshot: this.safeSnapshot(inputs),
        outputSnapshot: null,
        duration: Date.now() - startTime,
        error: (err as Error).message,
        logs: nodeLogs,
      });
    }
  }

  private safeSnapshot(data: unknown): unknown {
    try {
      return JSON.parse(JSON.stringify(data));
    } catch {
      return null;
    }
  }

  abort(): void {
    this.aborted = true;
  }
}
```

- [ ] **Step 14: Create index.ts barrel**

```typescript
export * from "./types";
export { resolveExpressions } from "./expression";
export { buildDAG, topologicalSort, getParallelBatches } from "./dag";
export type { DAG, DAGEdge } from "./dag";
export { WorkflowExecutor } from "./executor";
```

- [ ] **Step 15: Run all engine tests**

Run: `cd packages/cloud-engine && bun run test`
Expected: All tests PASS (expression + dag + executor)

- [ ] **Step 16: Commit**

```
feat(cloud-engine): add workflow execution engine with DAG, expression resolver, and executor

Core execution engine: topological sort for node ordering, parallel batch
execution, expression language ({{ $json.field }}), and WorkflowExecutor
that runs node graphs end-to-end with result snapshots.
```

---

## Task 3: Create `@solflow/cloud-wallet` and `@solflow/cloud-defi` Stubs

**Files:**
- Create: `packages/cloud-wallet/package.json`, `src/index.ts`, `src/types.ts`, `src/encryption.ts`
- Create: `packages/cloud-defi/package.json`, `src/index.ts`, `src/types.ts`
- Test: `packages/cloud-wallet/__tests__/encryption.test.ts`

- [ ] **Step 1: Create cloud-wallet package.json**

```json
{
  "name": "@solflow/cloud-wallet",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@solflow/cloud-nodes": "workspace:*",
    "@solana/web3.js": "^1.98.0"
  },
  "devDependencies": {
    "@solflow/tsconfig": "workspace:*",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create encryption.ts with tests**

`packages/cloud-wallet/src/encryption.ts`:

```typescript
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

export interface EncryptedKey {
  encrypted: string;
  iv: string;
  tag: string;
  salt: string;
}

function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return pbkdf2Sync(masterKey, salt, ITERATIONS, KEY_LENGTH, "sha256");
}

export function encryptPrivateKey(
  privateKey: Uint8Array,
  masterKey: string,
): EncryptedKey {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(masterKey, salt);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(privateKey)),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    salt: salt.toString("base64"),
  };
}

export function decryptPrivateKey(
  encryptedData: EncryptedKey,
  masterKey: string,
): Uint8Array {
  const salt = Buffer.from(encryptedData.salt, "base64");
  const key = deriveKey(masterKey, salt);
  const iv = Buffer.from(encryptedData.iv, "base64");
  const tag = Buffer.from(encryptedData.tag, "base64");
  const encrypted = Buffer.from(encryptedData.encrypted, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return new Uint8Array(decrypted);
}
```

`packages/cloud-wallet/__tests__/encryption.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { encryptPrivateKey, decryptPrivateKey } from "../src/encryption";

describe("encryption", () => {
  it("encrypts and decrypts a private key", () => {
    const originalKey = new Uint8Array(64).fill(42);
    const masterKey = "test-master-key-32-bytes-long!!";

    const encrypted = encryptPrivateKey(originalKey, masterKey);
    expect(encrypted.encrypted).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.tag).toBeDefined();
    expect(encrypted.salt).toBeDefined();

    const decrypted = decryptPrivateKey(encrypted, masterKey);
    expect(decrypted).toEqual(originalKey);
  });

  it("fails with wrong master key", () => {
    const originalKey = new Uint8Array(64).fill(42);
    const encrypted = encryptPrivateKey(originalKey, "correct-key-32-bytes-long!!");
    expect(() => decryptPrivateKey(encrypted, "wrong-key-32-bytes-long!!!!!")).toThrow();
  });

  it("produces different ciphertext for same input (random salt/iv)", () => {
    const key = new Uint8Array(64).fill(1);
    const masterKey = "test-master-key-32-bytes-long!!";
    const enc1 = encryptPrivateKey(key, masterKey);
    const enc2 = encryptPrivateKey(key, masterKey);
    expect(enc1.encrypted).not.toBe(enc2.encrypted);
    expect(enc1.salt).not.toBe(enc2.salt);
  });
});
```

- [ ] **Step 3: Run encryption tests**

Run: `cd packages/cloud-wallet && bun run test`
Expected: All 3 tests PASS

- [ ] **Step 4: Create cloud-wallet index.ts**

```typescript
export { encryptPrivateKey, decryptPrivateKey } from "./encryption";
export type { EncryptedKey } from "./encryption";
```

- [ ] **Step 5: Create cloud-defi stub package.json + types**

`packages/cloud-defi/package.json`:

```json
{
  "name": "@solflow/cloud-defi",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "build": "tsc" },
  "dependencies": { "@solflow/cloud-nodes": "workspace:*" },
  "devDependencies": { "@solflow/tsconfig": "workspace:*", "typescript": "^5.7.0" }
}
```

`packages/cloud-defi/src/types.ts`:

```typescript
export interface DeFiAdapter {
  protocol: string;
  operations: string[];
  execute(
    operation: string,
    params: Record<string, unknown>,
    walletOps: unknown,
  ): Promise<unknown>;
}
```

`packages/cloud-defi/src/index.ts`:

```typescript
export type { DeFiAdapter } from "./types";
```

- [ ] **Step 6: Commit**

```
feat(cloud-wallet, cloud-defi): add wallet encryption and DeFi adapter interface

AES-256-GCM encryption with PBKDF2 key derivation for cloud wallets.
DeFi adapter interface for protocol integrations (stub for Phase 2).
```

---

## Task 4: Add Cloud Database Models

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Read existing schema**

Read `packages/db/prisma/schema.prisma` to understand existing models and find the User model.

- [ ] **Step 2: Add Cloud models to schema.prisma**

Append after existing models:

```prisma
// ─── Cloud Workflow Models ────────────────────────────────────────────────────

model CloudWallet {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  label        String
  publicKey    String
  encryptedKey String   @db.Text
  keyIv        String
  keyTag       String
  keySalt      String
  network      String   @default("mainnet")
  lastUsedAt   DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  workflows    Workflow[]

  @@unique([userId, label])
  @@index([userId])
  @@index([publicKey])
}

model CloudCredential {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  label        String
  type         String
  encryptedData String @db.Text
  dataIv       String
  dataTag      String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([userId])
}

model Workflow {
  id            String         @id @default(cuid())
  userId        String
  user          User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  name          String
  description   String?
  status        String         @default("DRAFT")
  definition    Json
  settings      Json           @default("{}")
  cronExpression String?
  cronTimezone   String?
  nextRunAt     DateTime?
  webhookPath   String?        @unique
  webhookSecret String?
  tags          String[]
  walletId      String?
  wallet        CloudWallet?   @relation(fields: [walletId], references: [id], onDelete: SetNull)
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  executions    WorkflowExecution[]
  versions      WorkflowVersion[]

  @@index([userId])
  @@index([status])
  @@index([nextRunAt])
}

model WorkflowVersion {
  id          String   @id @default(cuid())
  workflowId  String
  workflow    Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  version     Int
  label       String?
  definition  Json
  settings    Json
  createdAt   DateTime @default(now())

  @@unique([workflowId, version])
  @@index([workflowId])
}

model WorkflowExecution {
  id                 String          @id @default(cuid())
  workflowId         String
  workflow           Workflow        @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  status             String          @default("QUEUED")
  triggerType        String
  triggerData        Json?
  startedAt          DateTime?
  completedAt        DateTime?
  duration           Int?
  nodesExecuted      Int             @default(0)
  nodesSucceeded     Int             @default(0)
  nodesFailed        Int             @default(0)
  executionData      Json?
  definitionSnapshot Json?
  errorMessage       String?
  jobId              String?
  createdAt          DateTime        @default(now())

  nodeResults        NodeExecution[]

  @@index([workflowId])
  @@index([status])
  @@index([createdAt])
  @@index([workflowId, createdAt])
}

model NodeExecution {
  id             String            @id @default(cuid())
  executionId    String
  execution      WorkflowExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)
  nodeId         String
  nodeType       String
  status         String            @default("QUEUED")
  inputSnapshot  Json?
  outputSnapshot Json?
  duration       Int?
  error          String?
  logs           Json?
  startedAt      DateTime?
  completedAt    DateTime?

  @@index([executionId])
  @@index([executionId, nodeId])
}

model WorkflowTemplate {
  id              String   @id @default(cuid())
  title           String
  description     String
  longDescription String?
  category        String
  tags            String[]
  thumbnailUrl    String?
  definition      Json
  settings        Json     @default("{}")
  nodeTypes       String[]
  authorId        String?
  author          User?    @relation(fields: [authorId], references: [id])
  downloads       Int      @default(0)
  likes           Int      @default(0)
  rating          Float?
  featured        Boolean  @default(false)
  status          String   @default("PUBLISHED")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([category])
  @@index([featured])
  @@index([downloads])
}
```

Also add to the User model:
```prisma
  cloudWallets      CloudWallet[]
  cloudCredentials  CloudCredential[]
  workflows         Workflow[]
  templateAuthor    WorkflowTemplate[]
```

- [ ] **Step 3: Generate Prisma client**

Run: `cd packages/db && bunx prisma generate`
Expected: Prisma client generated with new models

- [ ] **Step 4: Commit**

```
feat(db): add Cloud workflow models (Workflow, Execution, NodeExecution, CloudWallet, Credential, Template)

Prisma schema additions for the cloud workflow automation platform.
```

---

## Task 5: Create `apps/cloud` Next.js App

**Files:**
- Create: `apps/cloud/package.json`
- Create: `apps/cloud/next.config.ts`
- Create: `apps/cloud/server.ts`
- Create: `apps/cloud/tsconfig.json`
- Create: `apps/cloud/tailwind.config.ts`
- Create: `apps/cloud/postcss.config.js`
- Create: `apps/cloud/src/app/layout.tsx`
- Create: `apps/cloud/src/app/page.tsx`
- Create: `apps/cloud/src/app/globals.css`

- [ ] **Step 1: Read existing web app files for exact patterns**

Read these files to copy exact patterns:
- `apps/web/package.json`
- `apps/web/server.ts`
- `apps/web/next.config.ts`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/globals.css`

- [ ] **Step 2: Create apps/cloud/package.json**

Same structure as apps/web but with cloud-specific dependencies:

```json
{
  "name": "@solflow/cloud",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "NODE_OPTIONS='--max-old-space-size=4096' tsx server.ts",
    "dev:next": "next dev --turbopack",
    "build": "next build",
    "start": "NODE_OPTIONS='--max-old-space-size=4096' tsx server.ts",
    "lint": "next lint"
  },
  "dependencies": {
    "@radix-ui/react-accordion": "^2.1.0",
    "@radix-ui/react-alert-dialog": "^1.1.0",
    "@radix-ui/react-avatar": "^1.1.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-scroll-area": "^2.2.0",
    "@radix-ui/react-select": "^2.1.0",
    "@radix-ui/react-separator": "^1.1.0",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-switch": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-tooltip": "^1.1.0",
    "@solflow/auth": "workspace:*",
    "@solflow/cloud-engine": "workspace:*",
    "@solflow/cloud-nodes": "workspace:*",
    "@solflow/cloud-wallet": "workspace:*",
    "@solflow/db": "workspace:*",
    "@solflow/ui": "workspace:*",
    "@trpc/client": "^11.0.0",
    "@trpc/react-query": "^11.0.0",
    "@trpc/server": "^11.0.0",
    "@tanstack/react-query": "^5.62.0",
    "@xyflow/react": "^12.5.0",
    "bullmq": "^5.0.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.0",
    "framer-motion": "^12.0.0",
    "lucide-react": "^0.469.0",
    "next": "^15.3.0",
    "next-auth": "^5.0.0-beta.28",
    "next-themes": "^0.4.6",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "sonner": "^2.0.0",
    "superjson": "^2.2.0",
    "tailwind-merge": "^3.0.0",
    "ws": "^8.18.0",
    "zod": "^3.24.0",
    "zustand": "^5.0.0",
    "zundo": "^2.2.0"
  },
  "devDependencies": {
    "@solflow/tsconfig": "workspace:*",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/ws": "^8.5.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "tailwindcss": "^4.1.0",
    "@tailwindcss/postcss": "^4.1.0"
  }
}
```

- [ ] **Step 3: Create next.config.ts**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@solflow/ui",
    "@solflow/cloud-nodes",
    "@solflow/cloud-engine",
    "@solflow/cloud-wallet",
    "@solflow/auth",
    "@solflow/db",
  ],
  webpack: (config) => {
    config.resolve.fallback = { fs: false, path: false, os: false, crypto: false };
    return config;
  },
};

export default nextConfig;
```

- [ ] **Step 4: Create server.ts (same pattern as apps/web)**

Read `apps/web/server.ts` and create `apps/cloud/server.ts` following the exact same pattern, but with `/api/ws` WebSocket path for execution progress.

- [ ] **Step 5: Create globals.css (copy from apps/web)**

Copy `apps/web/src/app/globals.css` verbatim to `apps/cloud/src/app/globals.css`. Same OKLCH theme, same node colors.

- [ ] **Step 6: Create layout.tsx**

```typescript
import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Bricolage_Grotesque } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SolStudio Cloud - Solana Workflow Automation",
  description: "Automate your Solana operations with visual workflows",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} ${bricolageGrotesque.variable} font-sans antialiased`}
      >
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Create landing page.tsx**

A simple landing page for cloud.solstudio.fun with hero, features, and CTA. Same dark theme styling.

- [ ] **Step 8: Create tsconfig.json, tailwind.config.ts, postcss.config.js**

Copy patterns from apps/web.

- [ ] **Step 9: Install and verify build**

Run: `cd apps/cloud && bun install && bun run build`
Expected: App compiles (may have warnings, no errors)

- [ ] **Step 10: Commit**

```
feat(cloud): scaffold apps/cloud Next.js app

New cloud app with same theme, fonts, and patterns as apps/web.
Custom server with WebSocket support for execution progress.
```

---

## Task 6: Build tRPC API Layer

**Files:**
- Create: `apps/cloud/src/server/trpc/trpc.ts`
- Create: `apps/cloud/src/server/trpc/routers/index.ts`
- Create: `apps/cloud/src/server/trpc/routers/workflow.ts`
- Create: `apps/cloud/src/server/trpc/routers/execution.ts`
- Create: `apps/cloud/src/server/trpc/routers/wallet.ts`
- Create: `apps/cloud/src/server/trpc/routers/nodes.ts`
- Create: `apps/cloud/src/app/api/trpc/[trpc]/route.ts`
- Create: `apps/cloud/src/lib/trpc/client.ts`
- Create: `apps/cloud/src/lib/trpc/server.ts`

- [ ] **Step 1: Create tRPC setup (trpc.ts)**

Follow exact pattern from `apps/web/src/server/trpc/trpc.ts`. Same auth context, same protectedProcedure.

- [ ] **Step 2: Create workflow router**

CRUD operations: create, list, get, update, delete, duplicate. Uses Prisma Workflow model.

- [ ] **Step 3: Create execution router**

`run` procedure: creates a WorkflowExecution record, enqueues BullMQ job.
`list`, `get`, `cancel` procedures for execution management.

- [ ] **Step 4: Create wallet router**

`create`, `list`, `getBalance`, `delete` procedures. Uses cloud-wallet encryption.

- [ ] **Step 5: Create nodes router**

Read-only router that returns available node types from cloudNodeRegistry.

- [ ] **Step 6: Create API route handler and client**

Same pattern as apps/web for tRPC route handler and React client hooks.

- [ ] **Step 7: Commit**

```
feat(cloud): add tRPC API layer (workflow, execution, wallet, nodes routers)

Type-safe API using tRPC with protected procedures. Workflow CRUD,
execution management, wallet operations, and node registry access.
```

---

## Task 7: Build Cloud Node Visual Components

**Files:**
- Create: `packages/cloud-nodes/src/components/cloud-base-node.tsx`
- Create: `packages/cloud-nodes/src/components/handle.tsx`
- Create: `packages/cloud-nodes/src/nodes/trigger-manual.tsx`
- Create: `packages/cloud-nodes/src/nodes/action-price-fetch.tsx`
- Create: `packages/cloud-nodes/src/nodes/transform-filter.tsx`
- Create: `packages/cloud-nodes/src/nodes/logic-if-else.tsx`

- [ ] **Step 1: Read existing BaseNodeShell**

Read `packages/flow-nodes/src/base-node.tsx` to understand exact styling patterns.

- [ ] **Step 2: Create CloudBaseNode component**

Same visual style as BaseNodeShell but with:
- Status indicator dot (idle=gray, running=yellow pulse, success=green, error=red)
- Category-colored left border
- Connection-type-colored handles
- Compact design matching existing node aesthetic

- [ ] **Step 3: Create typed handle component**

```typescript
// Handle with color based on ConnectionType
// main = blue, trigger = green, ai = purple
```

- [ ] **Step 4: Create trigger-manual node**

Visual component + execute function. Manual trigger provides initial test data.

- [ ] **Step 5: Create action-price-fetch node**

Calls Birdeye/DexScreener API (stub for now, returns mock data). Properties: token address, source (birdeye/dexscreener).

- [ ] **Step 6: Create transform-filter node**

Filters items based on a condition. Properties: field, operator (equals, contains, gt, lt), value.

- [ ] **Step 7: Create logic-if-else node**

Two outputs (true/false). Branches based on condition evaluation. Properties: field, operator, value.

- [ ] **Step 8: Register all nodes in index.ts barrel**

Import and register all 4 nodes with cloudNodeRegistry.

- [ ] **Step 9: Commit**

```
feat(cloud-nodes): add visual node components and 4 basic nodes

CloudBaseNode shell with status indicators, typed handles.
4 working nodes: manual trigger, price fetch, filter, if-else.
```

---

## Task 8: Build Editor UI

**Files:**
- Create: `apps/cloud/src/store/workflow-store.ts`
- Create: `apps/cloud/src/store/editor-ui-store.ts`
- Create: `apps/cloud/src/store/execution-store.ts`
- Create: `apps/cloud/src/components/editor/workflow-canvas.tsx`
- Create: `apps/cloud/src/components/editor/node-palette.tsx`
- Create: `apps/cloud/src/components/editor/properties-panel.tsx`
- Create: `apps/cloud/src/components/editor/execution-panel.tsx`
- Create: `apps/cloud/src/components/editor/editor-toolbar.tsx`
- Create: `apps/cloud/src/app/(editor)/layout.tsx`
- Create: `apps/cloud/src/app/(editor)/editor/[workflowId]/page.tsx`

- [ ] **Step 1: Read existing stores and editor components**

Read these to replicate patterns:
- `apps/web/src/store/flow-store.ts`
- `apps/web/src/store/ui-store.ts`
- `apps/web/src/components/editor/FlowCanvas.tsx`
- `apps/web/src/components/editor/PropertiesPanel.tsx`

- [ ] **Step 2: Create workflow-store.ts**

Zustand + Zundo temporal store. Manages:
- nodes[], edges[] (React Flow state)
- onNodesChange, onEdgesChange, onConnect
- addNode(type, position), removeNode(id)
- undo/redo with structural equality
- workflowId, isDirty, save()

- [ ] **Step 3: Create editor-ui-store.ts**

Zustand + persist. Manages:
- paletteOpen, propertiesOpen, executionPanelOpen
- selectedNodeId
- theme

- [ ] **Step 4: Create execution-store.ts**

Zustand. Manages:
- currentExecutionId, executionStatus
- nodeStatuses: Map<string, NodeExecStatus>
- updateNodeStatus(nodeId, status) from WebSocket

- [ ] **Step 5: Create WorkflowCanvas.tsx**

React Flow canvas with:
- nodeTypes from cloudNodeRegistry.getNodeTypes()
- Custom edge styles (same as existing editor)
- MiniMap, Controls, Background
- Drop handler for adding nodes from palette

- [ ] **Step 6: Create NodePalette.tsx**

Left sidebar with:
- Category tabs (Triggers, Actions, Transform, Logic, AI, Output)
- Node cards grouped by category
- Draggable items (drag to canvas to add)
- Search/filter

- [ ] **Step 7: Create PropertiesPanel.tsx**

Right sidebar with:
- Selected node's properties rendered as form fields
- Each NodeProperty renders appropriate input (text, number, select, boolean, etc.)
- Expression support indicator
- Node type info (icon, description)

- [ ] **Step 8: Create ExecutionPanel.tsx**

Bottom panel with:
- Run button (triggers manual execution)
- Execution status (progress bar)
- Output table (shows data at each node)
- Error display

- [ ] **Step 9: Create EditorToolbar.tsx**

Top toolbar with:
- Workflow name (editable)
- Save button
- Run button
- Activate/Deactivate toggle
- Undo/Redo
- Back to dashboard

- [ ] **Step 10: Create editor layout and page**

Full-screen layout (no dashboard chrome). Editor page loads workflow from tRPC, initializes store.

- [ ] **Step 11: Commit**

```
feat(cloud): add workflow editor UI with canvas, palette, properties panel

Visual workflow editor using React Flow with same design language.
Drag-and-drop node palette, configurable properties panel, execution panel.
```

---

## Task 9: Build Dashboard Pages

**Files:**
- Create: `apps/cloud/src/app/(dashboard)/layout.tsx`
- Create: `apps/cloud/src/app/(dashboard)/dashboard/page.tsx`
- Create: `apps/cloud/src/app/(dashboard)/workflows/page.tsx`
- Create: `apps/cloud/src/app/(dashboard)/workflows/new/page.tsx`
- Create: `apps/cloud/src/app/(dashboard)/workflows/[id]/page.tsx`
- Create: `apps/cloud/src/app/(dashboard)/executions/page.tsx`
- Create: `apps/cloud/src/app/(dashboard)/executions/[id]/page.tsx`
- Create: `apps/cloud/src/app/(dashboard)/wallets/page.tsx`
- Create: `apps/cloud/src/components/layout/sidebar.tsx`
- Create: `apps/cloud/src/components/layout/topbar.tsx`
- Create: `apps/cloud/src/components/dashboard/workflow-card.tsx`
- Create: `apps/cloud/src/components/dashboard/stats-cards.tsx`

- [ ] **Step 1: Create dashboard layout**

Sidebar + topbar shell. Same dark theme. Sidebar nav: Dashboard, Workflows, Executions, Wallets.

- [ ] **Step 2: Create dashboard overview page**

Stats cards (active workflows, total executions, success rate), recent executions timeline, quick actions.

- [ ] **Step 3: Create workflows list page**

Grid/list of user's workflows with status badges, last run time, quick actions (edit, run, activate).

- [ ] **Step 4: Create workflow detail page**

Workflow info, trigger configuration, recent executions, edit button (navigates to editor).

- [ ] **Step 5: Create execution pages**

List of all executions across workflows. Detail page shows node-by-node execution replay.

- [ ] **Step 6: Create wallets page**

List of cloud wallets with balances, create/import wallet dialog.

- [ ] **Step 7: Commit**

```
feat(cloud): add dashboard, workflows, executions, and wallets pages

Full dashboard UI with sidebar navigation, workflow management,
execution history, and wallet management pages.
```

---

## Task 10: End-to-End Integration

**Files:**
- Create: `apps/cloud/src/server/engine/executor-service.ts`
- Create: `apps/cloud/src/server/workers/execution-worker.ts`

- [ ] **Step 1: Create executor service**

Thin wrapper around WorkflowExecutor that:
- Loads workflow definition from DB
- Creates WorkflowExecution record
- Runs executor
- Saves NodeExecution records
- Updates WorkflowExecution status

- [ ] **Step 2: Create BullMQ execution worker**

Worker that processes execution jobs from the queue. Uses executor service.

- [ ] **Step 3: Test full flow manually**

1. Start the app: `cd apps/cloud && bun run dev`
2. Navigate to dashboard
3. Create a new workflow
4. Open editor
5. Add: Manual Trigger → Price Fetch → If/Else (price > 100 → Filter)
6. Save workflow
7. Click Run
8. Verify execution results in execution panel

- [ ] **Step 4: Final commit**

```
feat(cloud): add executor service and BullMQ worker for end-to-end workflow execution

Integration of engine with tRPC API and database. Full manual execution
flow from editor to execution results display.
```

---

## Verification

After all tasks complete:

1. `bun run build` from repo root - all packages compile
2. `bun run test` - all tests pass (registry, expression, dag, executor, encryption)
3. Manual test in browser:
   - Dashboard loads with dark theme (same as apps/web)
   - Create workflow → opens editor
   - Drag nodes from palette onto canvas
   - Wire nodes together
   - Configure node properties in panel
   - Click Run → execution completes
   - See results per node in execution panel
4. Verify fonts: Bricolage Grotesque headings, Inter body, JetBrains Mono code
5. Verify colors: OKLCH dark background, purple accents, category-colored nodes
