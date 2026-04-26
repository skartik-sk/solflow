// Cron Worker — processes cron trigger jobs from BullMQ.
// SERVER ONLY — never import from client components.

import { Worker, type Job } from "bullmq";
import { prisma } from "@solflow/db";
import { queueExecution, startExecutionWorker } from "../execution-worker/queue";

// ─── Redis connection ────────────────────────────────────────────────────────

function getConnectionConfig() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "localhost",
      port: parseInt(parsed.port || "6379", 10),
    };
  } catch {
    return { host: "localhost", port: 6379 };
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface CronJobData {
  workflowId: string;
}

// ─── Worker ─────────────────────────────────────────────────────────────────

let _cronWorker: Worker<CronJobData> | null = null;

export function startCronWorker(): void {
  if (_cronWorker) return;

  _cronWorker = new Worker<CronJobData>(
    "cloud-cron-triggers",
    async (job: Job<CronJobData>) => {
      const { workflowId } = job.data;

      const workflow = await prisma.workflow.findFirst({
        where: { id: workflowId, status: "ACTIVE" },
      });

      if (!workflow) {
        logCronWorkerEvent("workflow_skipped", { workflowId });
        return;
      }

      // Create execution record
      const execution = await prisma.workflowExecution.create({
        data: {
          workflowId: workflow.id,
          status: "QUEUED",
          triggerType: "cron",
          triggerData: {
            cronExpression: workflow.cronExpression,
            triggeredAt: new Date().toISOString(),
          },
          definitionSnapshot: workflow.definition as any,
        },
      });

      // Enqueue for execution
      startExecutionWorker();
      await queueExecution(execution.id, workflow.id);

      // Update nextRunAt
      if (job.timestamp) {
        // BullMQ provides the next run time
        await prisma.workflow.update({
          where: { id: workflowId },
          data: { nextRunAt: new Date(job.timestamp) },
        });
      }

      logCronWorkerEvent("workflow_triggered", {
        workflowId,
        executionId: execution.id,
      });
    },
    {
      connection: getConnectionConfig(),
      concurrency: 5,
    }
  );

  _cronWorker.on("failed", (job, err) => {
    logCronWorkerEvent("job_failed", {
      jobId: job?.id,
      workflowId: job?.data.workflowId,
      error: err.message,
    }, "error");
  });

  _cronWorker.on("completed", (job) => {
    logCronWorkerEvent("job_completed", {
      jobId: job.id,
      workflowId: job.data.workflowId,
    });
  });

  logCronWorkerEvent("started", {});
}

export async function stopCronWorker(): Promise<void> {
  if (_cronWorker) {
    await _cronWorker.close();
    _cronWorker = null;
  }
}

export function isCronWorkerRunning(): boolean {
  return _cronWorker !== null;
}

function logCronWorkerEvent(
  event: string,
  data: Record<string, unknown>,
  level: "info" | "error" = "info",
): void {
  const payload = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    component: "cron-worker",
    event,
    ...data,
  });

  if (level === "error") {
    console.error(payload);
  } else {
    console.log(payload);
  }
}
