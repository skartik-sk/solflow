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
        console.log(
          `[cron-worker] Workflow ${workflowId} not found or not active, skipping`
        );
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

      console.log(
        `[cron-worker] Triggered workflow ${workflowId} — execution ${execution.id}`
      );
    },
    {
      connection: getConnectionConfig(),
      concurrency: 5,
    }
  );

  _cronWorker.on("failed", (job, err) => {
    console.error(
      `[cron-worker] Job ${job?.id} failed for workflow ${job?.data?.workflowId}:`,
      err
    );
  });

  _cronWorker.on("completed", (job) => {
    console.log(`[cron-worker] Job ${job.id} completed for workflow ${job.data.workflowId}`);
  });

  console.log("[cron-worker] Started");
}

export async function stopCronWorker(): Promise<void> {
  if (_cronWorker) {
    await _cronWorker.close();
    _cronWorker = null;
  }
}
