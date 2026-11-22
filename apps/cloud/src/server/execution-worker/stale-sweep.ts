// Marks executions that can no longer finish as TIMED_OUT. On serverless a run
// lives inside one function invocation (max 60 s); if the instance dies the row
// would otherwise stay QUEUED/RUNNING forever.
// SERVER ONLY.

import { prisma } from "@solflow/db";
import { getCloudRuntimeMode } from "../runtime-mode";

const SERVERLESS_STALE_MS = 2 * 60_000;
// Long-running workers allow workflow timeouts up to 15 min (+ queue wait).
const WORKER_STALE_MS = 20 * 60_000;
const SWEEP_THROTTLE_MS = 30_000;

export const STALE_EXECUTION_MESSAGE =
  "Run did not finish in time (the function running it stopped). Marked as timed out.";

export function staleExecutionThresholdMs(): number {
  return getCloudRuntimeMode() === "api" ? SERVERLESS_STALE_MS : WORKER_STALE_MS;
}

type SweepDb = {
  workflowExecution: {
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
};

export async function sweepStaleExecutions(
  db: SweepDb = prisma as unknown as SweepDb,
  now = Date.now(),
): Promise<number> {
  const cutoff = new Date(now - staleExecutionThresholdMs());
  const result = await db.workflowExecution.updateMany({
    where: {
      status: { in: ["QUEUED", "RUNNING"] },
      createdAt: { lt: cutoff },
    },
    data: {
      status: "TIMED_OUT",
      errorMessage: STALE_EXECUTION_MESSAGE,
      completedAt: new Date(now),
    },
  });
  return result.count;
}

let lastSweepAt = 0;

/** Throttled sweep for hot paths (execution list/get, cron fire). Never throws. */
export async function maybeSweepStaleExecutions(
  db?: SweepDb,
  now = Date.now(),
): Promise<void> {
  if (now - lastSweepAt < SWEEP_THROTTLE_MS) return;
  lastSweepAt = now;
  try {
    await sweepStaleExecutions(db, now);
  } catch (error) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        component: "execution-worker",
        event: "stale_sweep_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

export function resetStaleSweepThrottleForTests(): void {
  lastSweepAt = 0;
}
