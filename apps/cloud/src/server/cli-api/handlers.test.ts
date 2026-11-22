import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaFake = {
  workflow: {
    findFirst: vi.fn(async () => ({ id: "wf1", definition: { nodes: [], edges: [] } })),
    findFirstOrThrow: vi.fn(async () => ({ id: "wf1" })),
    update: vi.fn(async () => ({ id: "wf1" })),
    delete: vi.fn(async () => ({ id: "wf1" })),
    count: vi.fn(async () => 0),
  },
  user: { findUnique: vi.fn(async () => ({ createdAt: new Date() })) },
  cloudWallet: { findFirst: vi.fn(async () => null) },
  workflowExecution: {
    create: vi.fn(async () => ({ id: "ex1", status: "QUEUED" })),
    findMany: vi.fn(async () => []),
    updateMany: vi.fn(async () => ({ count: 0 })),
  },
};
vi.mock("@solflow/db", () => ({ prisma: prismaFake }));
vi.mock("./auth", () => ({
  CloudCliAuthError: class extends Error {},
  authenticateCloudCliRequest: vi.fn(async () => ({
    apiKeyId: "k",
    apiKeyName: "k",
    user: { id: "u1", email: null, name: null, walletAddress: null },
  })),
}));
vi.mock("../trpc/routers/credential", () => ({
  credentialTypeSchema: {},
  encryptedCredentialPayload: vi.fn(),
  secretDataSchema: {},
  validateCredentialData: vi.fn(),
}));
const queueExecution = vi.fn(async (id: string) => id);
vi.mock("../execution-worker/queue", () => ({ queueExecution, startExecutionWorker: vi.fn() }));
const manager = { activate: vi.fn(), deactivate: vi.fn(), syncIfActive: vi.fn(), removeSchedules: vi.fn() };
vi.mock("../trigger-manager", () => ({ getTriggerManager: () => manager }));
vi.mock("../trigger-manager/cron-worker", () => ({ startCronWorker: vi.fn() }));

const { handleCloudCliRequest } = await import("./handlers");
const { resetRateLimitStoreForTests } = await import("../../lib/rate-limit");

function req(method: string, path: string, body?: unknown) {
  return new Request(`https://cloud.example.com/api/cli/v1/${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("cloud CLI API guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStoreForTests();
    process.env.CLOUD_RUNTIME_MODE = "api";
  });

  it("rejects a foreign walletId on PATCH", async () => {
    const res = await handleCloudCliRequest(req("PATCH", "workflows/wf1", { walletId: "someone-elses" }), ["workflows", "wf1"]);
    expect(res.status).toBe(404);
    expect(prismaFake.workflow.update).not.toHaveBeenCalled();
  });

  it("reschedules triggers when an ACTIVE workflow's definition changes", async () => {
    const res = await handleCloudCliRequest(req("PATCH", "workflows/wf1", { definition: { nodes: [], edges: [] } }), ["workflows", "wf1"]);
    expect(res.status).toBe(200);
    expect(manager.syncIfActive).toHaveBeenCalledWith("wf1");
  });

  it("caps definition size", async () => {
    const nodes = Array.from({ length: 301 }, (_, i) => ({ id: String(i) }));
    const res = await handleCloudCliRequest(req("PATCH", "workflows/wf1", { definition: { nodes, edges: [] } }), ["workflows", "wf1"]);
    expect(res.status).toBe(400);
  });

  it("removes the cron schedule before deleting", async () => {
    await handleCloudCliRequest(req("DELETE", "workflows/wf1"), ["workflows", "wf1"]);
    expect(manager.removeSchedules).toHaveBeenCalledWith("wf1");
    expect(prismaFake.workflow.delete).toHaveBeenCalled();
  });

  it("applies the activation quota", async () => {
    process.env.CLOUD_QUOTA_ENFORCEMENT = "true";
    prismaFake.workflow.count.mockResolvedValueOnce(1);
    const res = await handleCloudCliRequest(req("POST", "workflows/wf1/activate", {}), ["workflows", "wf1", "activate"]);
    delete process.env.CLOUD_QUOTA_ENFORCEMENT;
    expect(res.status).toBe(403);
    expect(manager.activate).not.toHaveBeenCalled();
  });

  it("rate-limits run like tRPC and returns the QUEUED execution at once", async () => {
    for (let i = 0; i < 20; i += 1) {
      const res = await handleCloudCliRequest(req("POST", "workflows/wf1/run", {}), ["workflows", "wf1", "run"]);
      expect(res.status).toBe(202);
    }
    const limited = await handleCloudCliRequest(req("POST", "workflows/wf1/run", {}), ["workflows", "wf1", "run"]);
    expect(limited.status).toBe(429);
    expect(queueExecution).toHaveBeenCalledTimes(20);
  });
});
