// Execution Queue + Worker — picks up workflow execution jobs via BullMQ.
// SERVER ONLY — never import from client components.

import { Queue, Worker, type Job } from "bullmq";
import { prisma } from "@solflow/db";
import { WorkflowExecutor } from "@solflow/cloud-engine";
import { cloudNodeRegistry, registerBuiltinNodes } from "@solflow/cloud-nodes";

// Ensure nodes are registered
registerBuiltinNodes();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExecutionJobData {
  executionId: string;
  workflowId: string;
}

// ─── Redis connection ─────────────────────────────────────────────────────────

function getConnectionConfig() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname || "localhost", port: parseInt(parsed.port || "6379", 10) };
  } catch {
    return { host: "localhost", port: 6379 };
  }
}

// ─── Queue ────────────────────────────────────────────────────────────────────

let _queue: Queue<ExecutionJobData> | undefined;

export function getExecutionQueue(): Queue<ExecutionJobData> {
  if (!_queue) {
    _queue = new Queue<ExecutionJobData>("cloud-execution", {
      connection: getConnectionConfig(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 200,
        removeOnFail: 100,
      },
    });
  }
  return _queue;
}

export async function queueExecution(
  executionId: string,
  workflowId: string,
): Promise<string> {
  const queue = getExecutionQueue();
  const job = await queue.add("execute", { executionId, workflowId }, { jobId: executionId });
  return job.id ?? executionId;
}

// ─── Worker ───────────────────────────────────────────────────────────────────

let _worker: Worker<ExecutionJobData> | null = null;

export function startExecutionWorker(): void {
  if (_worker) return;

  _worker = new Worker<ExecutionJobData>(
    "cloud-execution",
    async (job: Job<ExecutionJobData>) => {
      const { executionId, workflowId } = job.data;

      console.log(`[execution-worker] Starting execution ${executionId} for workflow ${workflowId}`);

      // Fetch workflow definition from DB
      const workflow = await prisma.workflow.findFirst({
        where: { id: workflowId },
      });

      if (!workflow) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      const definition = workflow.definition as {
        nodes: Array<{ id: string; type: string; data: Record<string, unknown>; position: { x: number; y: number } }>;
        edges: Array<{ id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }>;
      };

      // Mark execution as running
      await prisma.workflowExecution.update({
        where: { id: executionId },
        data: { status: "RUNNING", startedAt: new Date() },
      });

      // Create mock wallet operations for now
      // TODO: Use WalletSigner with actual wallet from workflow.walletId
      const walletOps = {
        signAndSend: async () => "mock_signature",
        getPublicKey: async () => "11111111111111111111111111111111",
        getBalance: async () => 0,
      };

      const executor = new WorkflowExecutor(cloudNodeRegistry, walletOps);

      const result = await executor.execute(
        {
          id: workflowId,
          version: 1,
          nodes: definition.nodes,
          edges: definition.edges,
          settings: { timeout: 300, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" as const },
        },
        executionId,
      );

      // Update execution record with results
      const status = result.status === "success" ? "COMPLETED" : "FAILED";
      const nodeCount = definition.nodes.length;
      const successCount = Array.from(result.nodeResults.values()).filter(
        (r) => r.status === "success",
      ).length;
      const errorCount = Array.from(result.nodeResults.values()).filter(
        (r) => r.status === "error",
      ).length;

      await prisma.workflowExecution.update({
        where: { id: executionId },
        data: {
          status,
          completedAt: new Date(),
          duration: result.duration,
          nodesExecuted: nodeCount,
          nodesSucceeded: successCount,
          nodesFailed: errorCount,
          errorMessage: result.error,
        },
      });

      // Write per-node execution results
      for (const [nodeId, nodeResult] of result.nodeResults) {
        await prisma.nodeExecution.create({
          data: {
            executionId,
            nodeId,
            nodeType: nodeResult.nodeType,
            status: nodeResult.status === "success" ? "COMPLETED" : nodeResult.status === "error" ? "FAILED" : "SKIPPED",
            inputSnapshot: nodeResult.inputSnapshot as any,
            outputSnapshot: nodeResult.outputSnapshot as any,
            duration: nodeResult.duration,
            error: nodeResult.error,
            logs: nodeResult.logs as any,
            startedAt: new Date(Date.now() - nodeResult.duration),
            completedAt: new Date(),
          },
        });
      }

      console.log(
        `[execution-worker] Execution ${executionId} ${status} — ${successCount}/${nodeCount} nodes succeeded`,
      );
    },
    {
      connection: getConnectionConfig(),
      concurrency: 5,
      lockDuration: 5 * 60_000, // 5 min
    },
  );

  _worker.on("failed", (job, err) => {
    console.error(`[execution-worker] Job ${job?.id} failed:`, err);
  });

  _worker.on("completed", (job) => {
    console.log(`[execution-worker] Job ${job?.id} completed`);
  });
}

export async function stopExecutionWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
}
