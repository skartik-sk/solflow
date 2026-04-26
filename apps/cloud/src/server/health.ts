import { prisma } from "@solflow/db";
import {
  getExecutionQueueHealth,
  isExecutionWorkerRunning,
} from "./execution-worker/queue";
import { isCronWorkerRunning } from "./trigger-manager/cron-worker";

export type HealthState = "ok" | "degraded" | "down";

export interface CloudHealthReport {
  status: HealthState;
  service: "solstudio-cloud";
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    db: {
      status: HealthState;
      latencyMs: number;
      error?: string;
    };
    redis: {
      status: HealthState;
      latencyMs: number;
      error?: string;
    };
    workers: {
      status: HealthState;
      execution: boolean;
      cron: boolean;
    };
    executionQueue: {
      status: HealthState;
      name: string;
      counts: Record<string, number>;
    };
  };
}

export async function getCloudHealthReport(): Promise<CloudHealthReport> {
  const [db, queueHealth] = await Promise.all([
    checkDb(),
    getExecutionQueueHealth(),
  ]);

  const workers = {
    execution: isExecutionWorkerRunning(),
    cron: isCronWorkerRunning(),
  };
  const workerStatus = workers.execution && workers.cron ? "ok" : "degraded";
  const redisStatus: HealthState = queueHealth.redis.ok ? "ok" : "down";
  const executionQueueStatus: HealthState = queueHealth.redis.ok ? "ok" : "down";

  const checks: CloudHealthReport["checks"] = {
    db,
    redis: {
      status: redisStatus,
      latencyMs: queueHealth.redis.latencyMs,
      error: queueHealth.redis.error,
    },
    workers: {
      status: workerStatus,
      ...workers,
    },
    executionQueue: {
      status: executionQueueStatus,
      name: queueHealth.queue.name,
      counts: queueHealth.queue.counts,
    },
  };

  return {
    status: summarizeHealth([
      checks.db.status,
      checks.redis.status,
      checks.workers.status,
      checks.executionQueue.status,
    ]),
    service: "solstudio-cloud",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    checks,
  };
}

export function summarizeHealth(states: HealthState[]): HealthState {
  if (states.includes("down")) return "down";
  if (states.includes("degraded")) return "degraded";
  return "ok";
}

async function checkDb(): Promise<CloudHealthReport["checks"]["db"]> {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      status: "down",
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
