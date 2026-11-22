import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@solflow/db", () => ({ prisma: {} }));

import {
  maybeSweepStaleExecutions,
  resetStaleSweepThrottleForTests,
  STALE_EXECUTION_MESSAGE,
  sweepStaleExecutions,
} from "./stale-sweep";

function fakeDb() {
  return { workflowExecution: { updateMany: vi.fn(async () => ({ count: 2 })) } };
}

describe("stale execution sweep", () => {
  afterEach(() => {
    delete process.env.CLOUD_RUNTIME_MODE;
    resetStaleSweepThrottleForTests();
  });

  it("marks QUEUED/RUNNING rows older than 2 min TIMED_OUT on serverless", async () => {
    process.env.CLOUD_RUNTIME_MODE = "api";
    const db = fakeDb();
    const now = Date.parse("2026-01-01T00:10:00Z");
    expect(await sweepStaleExecutions(db, now)).toBe(2);
    expect(db.workflowExecution.updateMany).toHaveBeenCalledWith({
      where: {
        status: { in: ["QUEUED", "RUNNING"] },
        createdAt: { lt: new Date(now - 2 * 60_000) },
      },
      data: { status: "TIMED_OUT", errorMessage: STALE_EXECUTION_MESSAGE, completedAt: new Date(now) },
    });
  });

  it("gives long-running workers a longer window", async () => {
    process.env.CLOUD_RUNTIME_MODE = "worker";
    const db = fakeDb();
    const now = Date.now();
    await sweepStaleExecutions(db, now);
    const where = (db.workflowExecution.updateMany.mock.calls[0] as any)[0].where;
    expect(where.createdAt.lt.getTime()).toBe(now - 20 * 60_000);
  });

  it("throttles the hot-path sweep and never throws", async () => {
    process.env.CLOUD_RUNTIME_MODE = "api";
    const db = { workflowExecution: { updateMany: vi.fn(async () => { throw new Error("db down"); }) } };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(maybeSweepStaleExecutions(db, 1_000_000)).resolves.toBeUndefined();
    await maybeSweepStaleExecutions(db, 1_010_000);
    expect(db.workflowExecution.updateMany).toHaveBeenCalledTimes(1);
    await maybeSweepStaleExecutions(db, 1_040_000);
    expect(db.workflowExecution.updateMany).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
