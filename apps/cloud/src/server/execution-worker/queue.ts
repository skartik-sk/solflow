// Execution Queue + Worker — picks up workflow execution jobs via BullMQ.
// SERVER ONLY — never import from client components.

import { Queue, Worker, type Job } from "bullmq";
import { prisma } from "@solflow/db";
import { WorkflowExecutor } from "@solflow/cloud-engine";
import { cloudNodeRegistry, registerBuiltinNodes } from "@solflow/cloud-nodes";
import type { CredentialOperations, WalletOperations } from "@solflow/cloud-nodes";
import { decryptString, WalletSigner, type EncryptedKey } from "@solflow/cloud-wallet";
import type { WorkflowSettings } from "@solflow/cloud-engine";

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

function getRpcUrl(network: string): string {
  switch (network) {
    case "devnet":
      return process.env.DEVNET_RPC_URL ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
    case "localnet":
      return process.env.LOCALNET_RPC_URL ?? "http://127.0.0.1:8899";
    case "mainnet":
    default:
      return process.env.MAINNET_RPC_URL ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  }
}

function getMasterKey(): string {
  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKey) {
    throw new Error("ENCRYPTION_MASTER_KEY not configured");
  }
  return masterKey;
}

function normalizeWorkflowSettings(raw: unknown): WorkflowSettings {
  const settings = raw && typeof raw === "object" ? raw as Record<string, any> : {};
  const retryPolicy = settings.retryPolicy && typeof settings.retryPolicy === "object"
    ? settings.retryPolicy as Record<string, unknown>
    : {};
  const onError = ["stop", "continue", "branch"].includes(settings.onError)
    ? settings.onError as WorkflowSettings["onError"]
    : "stop";

  return {
    timeout: Number.isFinite(Number(settings.timeout)) && Number(settings.timeout) > 0
      ? Number(settings.timeout)
      : 300,
    retryPolicy: {
      maxAttempts: Number.isFinite(Number(retryPolicy.maxAttempts)) && Number(retryPolicy.maxAttempts) > 0
        ? Math.floor(Number(retryPolicy.maxAttempts))
        : 1,
      delayMs: Number.isFinite(Number(retryPolicy.delayMs)) && Number(retryPolicy.delayMs) >= 0
        ? Math.floor(Number(retryPolicy.delayMs))
        : 0,
    },
    defaultWalletId: typeof settings.defaultWalletId === "string" ? settings.defaultWalletId : undefined,
    onError,
  };
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

function createWalletOperations(workflow: {
  id: string;
  userId: string;
  walletId: string | null;
}): WalletOperations {
  const signers = new Map<string, WalletSigner>();

  async function loadWallet(requestedWalletId?: string) {
    const walletId = requestedWalletId || workflow.walletId;
    if (!walletId) {
      throw new Error(`Workflow ${workflow.id} has no cloud wallet configured`);
    }

    const wallet = await prisma.cloudWallet.findFirst({
      where: { id: walletId, userId: workflow.userId },
    });
    if (!wallet) {
      throw new Error(`Cloud wallet ${walletId} not found for workflow owner`);
    }

    const encryptedKey: EncryptedKey = {
      encrypted: wallet.encryptedKey,
      iv: wallet.keyIv,
      tag: wallet.keyTag,
      salt: wallet.keySalt,
    };

    let signer = signers.get(wallet.network);
    if (!signer) {
      signer = new WalletSigner({
        rpcUrl: getRpcUrl(wallet.network),
        masterKey: getMasterKey(),
      });
      signers.set(wallet.network, signer);
    }

    return { wallet, signer, encryptedKey };
  }

  return {
    async signAndSend(tx, walletId) {
      const { wallet, signer, encryptedKey } = await loadWallet(walletId);
      const signature = await signer.signAndSend(tx as Parameters<WalletSigner["signAndSend"]>[0], wallet.id, encryptedKey);
      await prisma.cloudWallet.update({
        where: { id: wallet.id },
        data: { lastUsedAt: new Date() },
      });
      return signature;
    },
    async simulate(tx, walletId) {
      const { wallet, signer, encryptedKey } = await loadWallet(walletId);
      return signer.simulate(tx as Parameters<WalletSigner["simulate"]>[0], wallet.id, encryptedKey);
    },
    async getPublicKey(walletId) {
      const { wallet, signer, encryptedKey } = await loadWallet(walletId);
      return signer.getPublicKey(wallet.id, encryptedKey);
    },
    async getBalance(walletId) {
      const { wallet, signer, encryptedKey } = await loadWallet(walletId);
      return signer.getBalance(wallet.id, encryptedKey);
    },
  };
}

function createCredentialOperations(workflow: {
  userId: string;
}): CredentialOperations {
  return {
    async get(id, allowedTypes) {
      const credential = await prisma.cloudCredential.findFirst({
        where: { id, userId: workflow.userId },
      });
      if (!credential) {
        throw new Error(`Cloud credential ${id} not found for workflow owner`);
      }

      if (allowedTypes?.length && !allowedTypes.includes(credential.type)) {
        throw new Error(
          `Cloud credential ${credential.label} is type "${credential.type}", expected ${allowedTypes.join(" or ")}`,
        );
      }

      const decrypted = decryptString({
        encrypted: credential.encryptedData,
        iv: credential.dataIv,
        tag: credential.dataTag,
        salt: credential.dataSalt,
      }, getMasterKey());

      await prisma.cloudCredential.update({
        where: { id: credential.id },
        data: { lastUsedAt: new Date() },
      });

      return {
        id: credential.id,
        label: credential.label,
        type: credential.type,
        data: JSON.parse(decrypted) as Record<string, unknown>,
      };
    },
  };
}

// ─── Worker ───────────────────────────────────────────────────────────────────

let _worker: Worker<ExecutionJobData> | null = null;

export function startExecutionWorker(): void {
  if (_worker) return;

  _worker = new Worker<ExecutionJobData>(
    "cloud-execution",
    async (job: Job<ExecutionJobData>) => {
      const { executionId, workflowId } = job.data;

      logExecutionWorkerEvent("started", { executionId, workflowId });

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

      const walletOps = createWalletOperations(workflow);
      const credentialOps = createCredentialOperations(workflow);

      const executor = new WorkflowExecutor(cloudNodeRegistry, walletOps, credentialOps);

      const result = await executor.execute(
        {
          id: workflowId,
          version: 1,
          nodes: definition.nodes,
          edges: definition.edges,
          settings: normalizeWorkflowSettings(workflow.settings),
        },
        executionId,
      );

      // Update execution record with results
      const status = result.status === "success"
        ? "COMPLETED"
        : result.status === "cancelled"
          ? "CANCELLED"
          : result.status === "timeout"
            ? "TIMED_OUT"
            : "FAILED";
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

      logExecutionWorkerEvent("finished", {
        executionId,
        workflowId,
        status,
        nodesSucceeded: successCount,
        nodesTotal: nodeCount,
      });
    },
    {
      connection: getConnectionConfig(),
      concurrency: 5,
      lockDuration: 5 * 60_000, // 5 min
    },
  );

  _worker.on("failed", (job, err) => {
    logExecutionWorkerEvent("job_failed", {
      jobId: job?.id,
      executionId: job?.data.executionId,
      workflowId: job?.data.workflowId,
      error: err.message,
    }, "error");
  });

  _worker.on("completed", (job) => {
    logExecutionWorkerEvent("job_completed", {
      jobId: job?.id,
      executionId: job.data.executionId,
      workflowId: job.data.workflowId,
    });
  });
}

export async function stopExecutionWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
}

export function isExecutionWorkerRunning(): boolean {
  return _worker !== null;
}

export async function getExecutionQueueHealth(): Promise<{
  redis: { ok: boolean; latencyMs: number; error?: string };
  queue: {
    name: string;
    counts: Record<string, number>;
  };
}> {
  const queue = getExecutionQueue();
  const startedAt = Date.now();

  try {
    const client = await queue.client;
    await client.ping();
    const counts = await queue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "completed",
      "failed",
      "paused",
    );

    return {
      redis: { ok: true, latencyMs: Date.now() - startedAt },
      queue: { name: queue.name, counts },
    };
  } catch (error) {
    return {
      redis: {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      },
      queue: { name: queue.name, counts: {} },
    };
  }
}

function logExecutionWorkerEvent(
  event: string,
  data: Record<string, unknown>,
  level: "info" | "error" = "info",
): void {
  const payload = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    component: "execution-worker",
    event,
    ...data,
  });

  if (level === "error") {
    console.error(payload);
  } else {
    console.log(payload);
  }
}
