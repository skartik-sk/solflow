import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaFake = {
  workflow: {
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(async () => ({ id: "wf1" })),
    update: vi.fn(async ({ data }: any) => ({ id: "wf1", ...data })),
  },
  cloudWallet: { findFirst: vi.fn(async () => null) },
  workflowExecution: {
    findFirst: vi.fn(),
    findUnique: vi.fn(async () => ({ id: "ex1", status: "CANCELLED" })),
    findMany: vi.fn(async () => []),
    create: vi.fn(async () => ({ id: "ex2", status: "QUEUED" })),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
};
vi.mock("@solflow/db", () => ({ prisma: prismaFake }));
vi.mock("@solflow/auth", () => ({ auth: vi.fn() }));
const queueExecution = vi.fn(async (id: string) => id);
vi.mock("../../execution-worker/queue", () => ({ queueExecution, startExecutionWorker: vi.fn() }));
const manager = { activate: vi.fn(), deactivate: vi.fn(), syncIfActive: vi.fn(), removeSchedules: vi.fn() };
vi.mock("../../trigger-manager", () => ({ getTriggerManager: () => manager }));
vi.mock("../../trigger-manager/cron-worker", () => ({ startCronWorker: vi.fn() }));

const { workflowRouter } = await import("./workflow");
const { executionRouter } = await import("./execution");
const { resetRateLimitStoreForTests } = await import("../../../lib/rate-limit");

const ctx = (userId = "u1") =>
  ({ session: { user: { id: userId } }, prisma: prismaFake, headers: new Headers() }) as any;

describe("workflow router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStoreForTests();
  });

  it("rejects a foreign walletId on update", async () => {
    prismaFake.workflow.findFirst.mockResolvedValueOnce({ id: "wf1", status: "DRAFT" });
    await expect(workflowRouter.createCaller(ctx()).update({ id: "wf1", walletId: "w-other" })).rejects.toThrow(/Wallet not found/);
    expect(prismaFake.workflow.update).not.toHaveBeenCalled();
  });

  it("re-syncs triggers when an ACTIVE workflow's definition is edited", async () => {
    prismaFake.workflow.findFirst.mockResolvedValueOnce({ id: "wf1", status: "ACTIVE" });
    await workflowRouter.createCaller(ctx()).update({ id: "wf1", definition: { nodes: [], edges: [] } });
    expect(manager.syncIfActive).toHaveBeenCalledWith("wf1");
  });

  it("caps description length", async () => {
    await expect(
      workflowRouter.createCaller(ctx()).update({ id: "wf1", description: "d".repeat(2_001) }),
    ).rejects.toThrow();
  });

  it("removes the cron schedule on delete", async () => {
    prismaFake.workflow.findFirst.mockResolvedValueOnce({ id: "wf1" });
    (prismaFake.workflow as any).delete = vi.fn(async () => ({ id: "wf1" }));
    await workflowRouter.createCaller(ctx()).delete({ id: "wf1" });
    expect(manager.removeSchedules).toHaveBeenCalledWith("wf1");
  });

  it("reveals and rotates the webhook secret for the owner only", async () => {
    prismaFake.workflow.findFirst.mockResolvedValueOnce(null);
    await expect(workflowRouter.createCaller(ctx("intruder")).getWebhookSecret({ id: "wf1" })).rejects.toThrow(/not found/i);
    expect((prismaFake.workflow.findFirst.mock.calls[0] as any)[0].where).toEqual({ id: "wf1", userId: "intruder" });

    prismaFake.workflow.findFirst.mockResolvedValueOnce({ id: "wf1", webhookPath: "p", webhookSecret: "old" });
    expect(await workflowRouter.createCaller(ctx()).getWebhookSecret({ id: "wf1" })).toEqual({ webhookPath: "p", webhookSecret: "old" });

    prismaFake.workflow.findFirst.mockResolvedValueOnce({ id: "wf1" });
    prismaFake.workflow.update.mockResolvedValueOnce({ webhookPath: "p", webhookSecret: "x".repeat(32) } as any);
    const rotated = await workflowRouter.createCaller(ctx()).rotateWebhookSecret({ id: "wf1" });
    const newSecret = (prismaFake.workflow.update.mock.calls.at(-1) as any)[0].data.webhookSecret;
    expect(newSecret).toHaveLength(32);
    expect(newSecret).not.toBe("old");
    expect(rotated.webhookSecret).toHaveLength(32);
  });
});

describe("execution router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStoreForTests();
  });

  it("returns the QUEUED row immediately from run", async () => {
    prismaFake.workflow.findFirst.mockResolvedValueOnce({ id: "wf1", definition: { nodes: [], edges: [] } });
    const execution = await executionRouter.createCaller(ctx()).run({ workflowId: "wf1" });
    expect(execution.status).toBe("QUEUED");
    expect(queueExecution).toHaveBeenCalledWith("ex2", "wf1");
  });

  it("can cancel a QUEUED run, guarded against a finished run", async () => {
    prismaFake.workflowExecution.findFirst.mockResolvedValueOnce({ id: "ex1" });
    await executionRouter.createCaller(ctx()).cancel({ id: "ex1" });
    const call = (prismaFake.workflowExecution.updateMany.mock.calls[0] as any)[0];
    expect(call.where).toEqual({ id: "ex1", status: { in: ["QUEUED", "RUNNING"] } });
    expect(call.data.status).toBe("CANCELLED");
    expect((prismaFake.workflowExecution.findFirst.mock.calls[0] as any)[0].where.status).toEqual({ in: ["QUEUED", "RUNNING"] });
  });

  it("rate-limits replay", async () => {
    prismaFake.workflowExecution.findFirst.mockResolvedValue({ id: "ex1", workflowId: "wf1", triggerType: "manual", triggerData: null, definitionSnapshot: null });
    const caller = executionRouter.createCaller(ctx("replayer"));
    for (let i = 0; i < 20; i += 1) await caller.replay({ executionId: "ex1" });
    await expect(caller.replay({ executionId: "ex1" })).rejects.toThrow(/rate limit/i);
    prismaFake.workflowExecution.findFirst.mockReset();
  });
});
