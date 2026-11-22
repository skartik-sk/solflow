import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── In-memory prisma fake (only what the runner uses) ───────────────────────

type Row = Record<string, any>;
const db = {
  workflows: new Map<string, Row>(),
  executions: new Map<string, Row>(),
  nodeExecutions: [] as Row[],
};

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond && typeof cond === "object" && "in" in cond) return cond.in.includes(row[key]);
    return row[key] === cond;
  });
}

const prismaFake = {
  workflow: {
    findFirst: vi.fn(async ({ where }: any) => db.workflows.get(where.id) ?? null),
  },
  workflowExecution: {
    findUnique: vi.fn(async ({ where }: any) => db.executions.get(where.id) ?? null),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const row = db.executions.get(where.id);
      if (!row || !matches(row, where)) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    }),
    update: vi.fn(async ({ where, data }: any) => Object.assign(db.executions.get(where.id)!, data)),
  },
  nodeExecution: {
    findFirst: vi.fn(async ({ where }: any) =>
      db.nodeExecutions.find((n) => n.executionId === where.executionId && n.nodeId === where.nodeId) ?? null),
    create: vi.fn(async ({ data }: any) => {
      const row = { id: `n${db.nodeExecutions.length}`, ...data };
      db.nodeExecutions.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: any) =>
      Object.assign(db.nodeExecutions.find((n) => n.id === where.id)!, data)),
  },
};

vi.mock("@solflow/db", () => ({ prisma: prismaFake }));

const afterTasks: Array<Promise<unknown>> = [];
const afterMock = vi.fn((task: () => Promise<unknown>) => {
  afterTasks.push(task());
});
vi.mock("next/server", () => ({ after: (task: () => Promise<unknown>) => afterMock(task) }));

const bullmqAdd = vi.fn();
vi.mock("bullmq", () => ({
  Queue: vi.fn(() => ({ add: bullmqAdd, on: vi.fn(), client: Promise.reject(new Error("no redis")) })),
  Worker: vi.fn(() => ({ on: vi.fn() })),
}));

const { queueExecution, runExecution } = await import("./queue");
const { cloudNodeRegistry } = await import("@solflow/cloud-nodes");

function seed(opts: { triggerType?: string; triggerData?: unknown; definition?: unknown } = {}) {
  const definition = opts.definition ?? {
    nodes: [{ id: "t", type: "trigger:manual", position: { x: 0, y: 0 }, data: {} }],
    edges: [],
  };
  db.workflows.set("wf1", { id: "wf1", userId: "u1", walletId: null, definition, settings: {} });
  db.executions.set("ex1", {
    id: "ex1",
    workflowId: "wf1",
    status: "QUEUED",
    triggerType: opts.triggerType ?? "manual",
    triggerData: opts.triggerData ?? null,
    definitionSnapshot: definition,
  });
}

describe("serverless execution runner", () => {
  beforeEach(() => {
    db.workflows.clear();
    db.executions.clear();
    db.nodeExecutions.length = 0;
    afterTasks.length = 0;
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.CLOUD_RUNTIME_MODE = "api";
  });
  afterEach(() => {
    delete process.env.CLOUD_RUNTIME_MODE;
    vi.restoreAllMocks();
  });

  it("returns at once and runs via after() without Redis: QUEUED -> RUNNING -> COMPLETED", async () => {
    seed({ triggerData: { body: { amount: 5 } } });
    const id = await queueExecution("ex1", "wf1");
    expect(id).toBe("ex1");
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(bullmqAdd).not.toHaveBeenCalled();
    await Promise.all(afterTasks);

    const row = db.executions.get("ex1")!;
    expect(row.status).toBe("COMPLETED");
    expect(row.startedAt).toBeInstanceOf(Date);
    expect(row.completedAt).toBeInstanceOf(Date);
    const trigger = db.nodeExecutions.find((n) => n.nodeId === "t")!;
    expect(trigger.status).toBe("COMPLETED");
    expect(trigger.outputSnapshot[0].json).toMatchObject({ triggerType: "manual", body: { amount: 5 } });
  });

  it("skips a run that was cancelled while QUEUED", async () => {
    seed();
    db.executions.get("ex1")!.status = "CANCELLED";
    await runExecution("ex1", "wf1");
    expect(db.executions.get("ex1")!.status).toBe("CANCELLED");
    expect(db.nodeExecutions).toHaveLength(0);
  });

  it("stops between nodes on cancel and keeps CANCELLED as the final status", async () => {
    cloudNodeRegistry.register({
      ...cloudNodeRegistry.get("trigger:manual")!,
      type: "test:cancel-me",
      async execute() {
        db.executions.get("ex1")!.status = "CANCELLED"; // user pressed Cancel
        return [{ json: {} }];
      },
    });
    seed({
      definition: {
        nodes: [
          { id: "a", type: "test:cancel-me", position: { x: 0, y: 0 }, data: {} },
          { id: "b", type: "trigger:manual", position: { x: 0, y: 0 }, data: {} },
        ],
        edges: [{ id: "e", source: "a", target: "b" }],
      },
    });
    await runExecution("ex1", "wf1");
    const row = db.executions.get("ex1")!;
    expect(row.status).toBe("CANCELLED");
    expect(row.nodesExecuted).toBe(2);
    expect(db.nodeExecutions.find((n) => n.nodeId === "b")?.status).toBe("SKIPPED");
  });

  it("marks TIMED_OUT with a clear message when the serverless cap is hit", async () => {
    cloudNodeRegistry.register({
      ...cloudNodeRegistry.get("trigger:manual")!,
      type: "test:hang",
      execute: () => new Promise(() => {}),
    });
    seed({ definition: { nodes: [{ id: "h", type: "test:hang", position: { x: 0, y: 0 }, data: {} }], edges: [] } });
    await runExecution("ex1", "wf1", { maxTimeoutMs: 30, timeoutMessage: "Workflow timed out after 55 seconds (limit)" });
    const row = db.executions.get("ex1")!;
    expect(row.status).toBe("TIMED_OUT");
    expect(row.errorMessage).toBe("Workflow timed out after 55 seconds (limit)");
  });

  it("marks FAILED instead of throwing when the workflow is missing", async () => {
    seed();
    db.workflows.clear();
    await expect(runExecution("ex1", "wf1")).resolves.toBeUndefined();
    expect(db.executions.get("ex1")!.status).toBe("FAILED");
    expect(db.executions.get("ex1")!.errorMessage).toMatch(/not found/);
  });

  it("falls back to in-process when Redis is unreachable in worker mode", async () => {
    process.env.CLOUD_RUNTIME_MODE = "all";
    seed();
    await queueExecution("ex1", "wf1");
    expect(bullmqAdd).not.toHaveBeenCalled();
    expect(afterMock).toHaveBeenCalledTimes(1);
    await Promise.all(afterTasks);
    expect(db.executions.get("ex1")!.status).toBe("COMPLETED");
  });
});
