import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaFake = {
  workflow: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(async () => ({})),
  },
  workflowExecution: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: any) => ({ id: "ex_new", ...data })),
  },
};
vi.mock("@solflow/db", () => ({ prisma: prismaFake }));
const queueExecution = vi.fn(async (id: string) => id);
vi.mock("../execution-worker/queue", () => ({ queueExecution }));
const qstash = {
  isQstashConfigured: vi.fn(() => true),
  qstashCreateSchedule: vi.fn(async () => "sched"),
  qstashDeleteScheduleForWorkflow: vi.fn(async () => 1),
};
vi.mock("./qstash-scheduler", () => qstash);

const { getTriggerManager } = await import("./index");

function webhookWorkflow(nodeData: Record<string, unknown> = {}, settings: unknown = {}) {
  return {
    id: "wf1",
    status: "ACTIVE",
    webhookPath: "hook1",
    webhookSecret: "s3cret-value",
    settings,
    definition: {
      nodes: [{ id: "w", type: "trigger:webhook", data: { httpMethod: "POST", ...nodeData } }],
      edges: [],
    },
  };
}

describe("TriggerManager.handleWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("queues the run with body/query/headers and the event id", async () => {
    prismaFake.workflow.findFirst.mockResolvedValue(webhookWorkflow());
    const res = await getTriggerManager().handleWebhook(
      "hook1", "POST", { "content-type": "application/json", "webhook-id": "evt_1" }, { a: 1 }, { q: "1" }, '{"a":1}',
    );
    expect(res.status).toBe(200);
    expect(queueExecution).toHaveBeenCalledWith("ex_new", "wf1");
    const data = (prismaFake.workflowExecution.create.mock.calls[0] as any)[0].data;
    expect(data.triggerData).toMatchObject({ triggerType: "webhook", body: { a: 1 }, query: { q: "1" }, meta: { eventId: "evt_1" } });
  });

  it("drops a duplicate delivery with the same event id", async () => {
    prismaFake.workflow.findFirst.mockResolvedValue(webhookWorkflow());
    prismaFake.workflowExecution.findFirst.mockResolvedValueOnce({ id: "ex_old" } as any);
    const res = await getTriggerManager().handleWebhook("hook1", "POST", { "webhook-id": "evt_1" }, {}, {}, "{}");
    expect(res).toEqual({ status: 200, body: { message: "Duplicate delivery ignored", executionId: "ex_old", duplicate: true } });
    expect(prismaFake.workflowExecution.create).not.toHaveBeenCalled();
    const where = (prismaFake.workflowExecution.findFirst.mock.calls[0] as any)[0].where;
    expect(where.triggerData).toEqual({ path: ["meta", "eventId"], equals: "evt_1" });
  });

  it("checks header auth in constant time and rejects a wrong secret", async () => {
    prismaFake.workflow.findFirst.mockResolvedValue(webhookWorkflow({ authentication: "header" }));
    const bad = await getTriggerManager().handleWebhook("hook1", "POST", { "x-webhook-secret": "s3cret-valu" }, {}, {}, "");
    expect(bad.status).toBe(401);
    const good = await getTriggerManager().handleWebhook("hook1", "POST", { "x-webhook-secret": "s3cret-value" }, {}, {}, "");
    expect(good.status).toBe(200);
  });

  it("allowlist ignores Origin/Referer and substring tricks", async () => {
    prismaFake.workflow.findFirst.mockResolvedValue(
      webhookWorkflow({}, { safety: { webhookAllowlist: ["203.0.113.7"] } }),
    );
    const spoofed = await getTriggerManager().handleWebhook(
      "hook1", "POST", { origin: "203.0.113.7", "x-forwarded-for": "203.0.113.70" }, {}, {}, "",
    );
    expect(spoofed.status).toBe(403);
    const real = await getTriggerManager().handleWebhook("hook1", "POST", { "x-forwarded-for": "203.0.113.7" }, {}, {}, "");
    expect(real.status).toBe(200);
  });
});

describe("TriggerManager cron lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("schedules with timezone and sets nextRunAt on activate", async () => {
    prismaFake.workflow.findUnique.mockResolvedValue({
      id: "wf1",
      definition: { nodes: [{ id: "c", type: "trigger:cron", data: { cronExpression: "0 9 * * *", timezone: "Asia/Tokyo" } }], edges: [] },
    });
    await getTriggerManager().activate("wf1");
    expect(qstash.qstashCreateSchedule).toHaveBeenCalledWith({ workflowId: "wf1", cron: "0 9 * * *", timezone: "Asia/Tokyo" });
    const update = (prismaFake.workflow.update.mock.calls[0] as any)[0].data;
    expect(update).toMatchObject({ cronExpression: "0 9 * * *", cronTimezone: "Asia/Tokyo" });
    expect(update.nextRunAt).toBeInstanceOf(Date);
  });

  it("rejects an invalid cron expression", async () => {
    prismaFake.workflow.findUnique.mockResolvedValue({
      id: "wf1",
      definition: { nodes: [{ id: "c", type: "trigger:cron", data: { cronExpression: "every day" } }], edges: [] },
    });
    await expect(getTriggerManager().activate("wf1")).rejects.toThrow(/5 fields/);
    expect(qstash.qstashCreateSchedule).not.toHaveBeenCalled();
  });

  it("reschedules an edited ACTIVE workflow and removes the schedule when the cron node is gone", async () => {
    prismaFake.workflow.findUnique.mockResolvedValueOnce({
      status: "ACTIVE",
      definition: { nodes: [{ id: "c", type: "trigger:cron", data: { cronExpression: "*/10 * * * *" } }], edges: [] },
    });
    await getTriggerManager().syncIfActive("wf1");
    expect(qstash.qstashCreateSchedule).toHaveBeenCalledWith({ workflowId: "wf1", cron: "*/10 * * * *", timezone: "UTC" });

    prismaFake.workflow.findUnique.mockResolvedValueOnce({
      status: "ACTIVE",
      definition: { nodes: [{ id: "m", type: "trigger:manual", data: {} }], edges: [] },
    });
    await getTriggerManager().syncIfActive("wf1");
    expect(qstash.qstashDeleteScheduleForWorkflow).toHaveBeenCalledWith("wf1");
  });

  it("does nothing for an edited workflow that is not ACTIVE", async () => {
    prismaFake.workflow.findUnique.mockResolvedValueOnce({ status: "DRAFT", definition: { nodes: [], edges: [] } });
    await getTriggerManager().syncIfActive("wf1");
    expect(qstash.qstashCreateSchedule).not.toHaveBeenCalled();
    expect(qstash.qstashDeleteScheduleForWorkflow).not.toHaveBeenCalled();
  });

  it("deactivate marks INACTIVE and deletes the schedule; a QStash failure doesn't block it", async () => {
    prismaFake.workflow.findUnique.mockResolvedValue({ id: "wf1" });
    qstash.qstashDeleteScheduleForWorkflow.mockRejectedValueOnce(new Error("QStash down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await getTriggerManager().deactivate("wf1");
    expect((prismaFake.workflow.update.mock.calls[0] as any)[0].data).toMatchObject({ status: "INACTIVE", nextRunAt: null });
    expect(qstash.qstashDeleteScheduleForWorkflow).toHaveBeenCalledWith("wf1");
  });

  it("moves the webhook path when the node's custom path changes, refusing a taken path", async () => {
    prismaFake.workflow.findUnique
      .mockResolvedValueOnce({ status: "ACTIVE", definition: { nodes: [{ id: "w", type: "trigger:webhook", data: { webhookPath: "new-path" } }], edges: [] } })
      .mockResolvedValueOnce({ webhookPath: "old-path", webhookSecret: "s" });
    prismaFake.workflow.findFirst.mockResolvedValueOnce(null);
    await getTriggerManager().syncIfActive("wf1");
    expect(prismaFake.workflow.update).toHaveBeenCalledWith({ where: { id: "wf1" }, data: { webhookPath: "new-path", webhookSecret: "s" } });

    prismaFake.workflow.findUnique
      .mockResolvedValueOnce({ status: "ACTIVE", definition: { nodes: [{ id: "w", type: "trigger:webhook", data: { webhookPath: "taken" } }], edges: [] } })
      .mockResolvedValueOnce({ webhookPath: "old-path", webhookSecret: "s" });
    prismaFake.workflow.findFirst.mockResolvedValueOnce({ id: "other" });
    await expect(getTriggerManager().syncIfActive("wf1")).rejects.toThrow(/already in use/);
  });
});
