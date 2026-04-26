// Trigger Manager — manages lifecycle of cron and webhook triggers.
// SERVER ONLY — never import from client components.

import { Queue, type Queue as QueueType } from "bullmq";
import { prisma } from "@solflow/db";
import { cloudNodeRegistry, registerBuiltinNodes } from "@solflow/cloud-nodes";
import { queueExecution, startExecutionWorker } from "../execution-worker/queue";
import { nanoid } from "nanoid";

registerBuiltinNodes();

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

// ─── Trigger Manager ────────────────────────────────────────────────────────

class TriggerManager {
  private cronQueue: QueueType | null = null;
  private activeCronJobs = new Map<string, string>(); // workflowId -> BullMQ repeat job ID

  constructor() {}

  // ─── Activate a workflow's triggers ──────────────────────────────────────

  async activate(workflowId: string): Promise<void> {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
    });
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

    const definition = workflow.definition as {
      nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>;
      edges: Array<{ id: string; source: string; target: string }>;
    };

    // Find all trigger nodes in the workflow
    const triggerNodes = definition.nodes.filter((n) =>
      n.type.startsWith("trigger:")
    );

    for (const node of triggerNodes) {
      await this.activateTrigger(workflowId, node);
    }

    // Update workflow status
    await prisma.workflow.update({
      where: { id: workflowId },
      data: { status: "ACTIVE" },
    });

    console.log(
      `[trigger-manager] Activated workflow ${workflowId} — ${triggerNodes.length} trigger(s)`
    );
  }

  // ─── Activate a single trigger node ─────────────────────────────────────

  private async activateTrigger(
    workflowId: string,
    node: { id: string; type: string; data: Record<string, unknown> }
  ): Promise<void> {
    switch (node.type) {
      case "trigger:cron":
        await this.activateCronTrigger(workflowId, node);
        break;

      case "trigger:webhook":
        await this.activateWebhookTrigger(workflowId, node);
        break;

      case "trigger:manual":
        // Manual triggers don't need background setup
        break;

      default:
        console.warn(
          `[trigger-manager] Unknown trigger type: ${node.type}, skipping`
        );
    }
  }

  // ─── Cron Trigger ───────────────────────────────────────────────────────

  private async activateCronTrigger(
    workflowId: string,
    node: { id: string; type: string; data: Record<string, unknown> }
  ): Promise<void> {
    const cronExpression =
      (node.data.cronExpression as string) || "*/5 * * * *";
    const timezone = (node.data.timezone as string) || "UTC";

    if (!this.cronQueue) {
      this.cronQueue = new Queue("cloud-cron-triggers", {
        connection: getConnectionConfig(),
      });
    }

    // Remove existing repeatable job for this workflow if any
    await this.deactivateCronTrigger(workflowId);

    // Add repeatable job
    const repeatJobId = `cron:${workflowId}`;
    await this.cronQueue.add(
      "cron-trigger",
      { workflowId },
      {
        repeat: { pattern: cronExpression, tz: timezone },
        jobId: repeatJobId,
      }
    );

    this.activeCronJobs.set(workflowId, repeatJobId);

    // Update workflow with cron info
    await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        cronExpression,
        cronTimezone: timezone,
      },
    });

    console.log(
      `[trigger-manager] Cron trigger activated: ${cronExpression} (${timezone}) for workflow ${workflowId}`
    );
  }

  // ─── Webhook Trigger ────────────────────────────────────────────────────

  private async activateWebhookTrigger(
    workflowId: string,
    node: { id: string; type: string; data: Record<string, unknown> }
  ): Promise<void> {
    let webhookPath = node.data.webhookPath as string | undefined;

    // Generate a path if not provided
    if (!webhookPath) {
      webhookPath = nanoid(16);
    }

    // Generate a webhook secret for authentication
    const webhookSecret = nanoid(32);

    await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        webhookPath,
        webhookSecret,
      },
    });

    console.log(
      `[trigger-manager] Webhook trigger activated: /webhooks/${webhookPath} for workflow ${workflowId}`
    );
  }

  // ─── Deactivate a workflow's triggers ────────────────────────────────────

  async deactivate(workflowId: string): Promise<void> {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
    });
    if (!workflow) return;

    // Remove cron trigger
    await this.deactivateCronTrigger(workflowId);

    // Clear webhook path (keep the path but mark inactive)
    await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        status: "INACTIVE",
        nextRunAt: null,
      },
    });

    console.log(
      `[trigger-manager] Deactivated workflow ${workflowId}`
    );
  }

  private async deactivateCronTrigger(workflowId: string): Promise<void> {
    if (!this.cronQueue) return;

    const repeatJobId = `cron:${workflowId}`;
    try {
      const repeatableJobs = await this.cronQueue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        if (job.id === repeatJobId || job.key.includes(workflowId)) {
          await this.cronQueue.removeRepeatableByKey(job.key);
        }
      }
    } catch (err) {
      console.error(
        `[trigger-manager] Error deactivating cron for ${workflowId}:`,
        err
      );
    }

    this.activeCronJobs.delete(workflowId);
  }

  // ─── Handle incoming webhook ────────────────────────────────────────────

  async handleWebhook(
    path: string,
    method: string,
    headers: Record<string, string>,
    body: unknown,
    query: Record<string, string>
  ): Promise<{ status: number; body: unknown }> {
    const workflow = await prisma.workflow.findFirst({
      where: { webhookPath: path, status: "ACTIVE" },
    });

    if (!workflow) {
      return { status: 404, body: { error: "Webhook not found" } };
    }

    // Find the webhook trigger node to check authentication
    const definition = workflow.definition as {
      nodes: Array<{
        id: string;
        type: string;
        data: Record<string, unknown>;
      }>;
      edges: Array<{ id: string; source: string; target: string }>;
    };

    const webhookNode = definition.nodes.find(
      (n) => n.type === "trigger:webhook"
    );

    // Validate HTTP method
    if (webhookNode) {
      const expectedMethod = (webhookNode.data.httpMethod as string) || "POST";
      if (expectedMethod !== "ANY" && expectedMethod !== method) {
        return { status: 405, body: { error: `Method ${method} not allowed` } };
      }

      // Check authentication if configured
      const authType = (webhookNode.data.authentication as string) || "none";
      if (authType === "header") {
        const authHeaderName =
          (webhookNode.data.authHeaderName as string) ||
          "X-Webhook-Secret";
        const headerValue = headers[authHeaderName.toLowerCase()];
        if (headerValue !== workflow.webhookSecret) {
          return { status: 401, body: { error: "Unauthorized" } };
        }
      }
    }

    // Create execution
    const triggerData = {
      triggerType: "webhook",
      method,
      headers,
      body,
      query,
      timestamp: Date.now(),
    };

    const execution = await prisma.workflowExecution.create({
      data: {
        workflowId: workflow.id,
        status: "QUEUED",
        triggerType: "webhook",
        triggerData: triggerData as any,
        definitionSnapshot: workflow.definition as any,
      },
    });

    // Enqueue execution
    startExecutionWorker();
    await queueExecution(execution.id, workflow.id);

    const responseCode = webhookNode
      ? ((webhookNode.data.responseCode as number) || 200)
      : 200;

    return {
      status: responseCode,
      body: {
        message: "Workflow triggered",
        executionId: execution.id,
      },
    };
  }

  // ─── Restore active triggers on server startup ──────────────────────────

  async restoreActiveTriggers(): Promise<void> {
    const activeWorkflows = await prisma.workflow.findMany({
      where: { status: "ACTIVE" },
    });

    console.log(
      `[trigger-manager] Restoring ${activeWorkflows.length} active workflow(s)`
    );

    for (const workflow of activeWorkflows) {
      try {
        const definition = workflow.definition as {
          nodes: Array<{
            id: string;
            type: string;
            data: Record<string, unknown>;
          }>;
          edges: Array<{ id: string; source: string; target: string }>;
        };

        const triggerNodes = definition.nodes.filter((n) =>
          n.type.startsWith("trigger:")
        );

        for (const node of triggerNodes) {
          await this.activateTrigger(workflow.id, node);
        }
      } catch (err) {
        console.error(
          `[trigger-manager] Error restoring workflow ${workflow.id}:`,
          err
        );
      }
    }
  }

  // ─── Shutdown ────────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    if (this.cronQueue) {
      await this.cronQueue.close();
      this.cronQueue = null;
    }
    this.activeCronJobs.clear();
    console.log("[trigger-manager] Shutdown complete");
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _instance: TriggerManager | null = null;

export function getTriggerManager(): TriggerManager {
  if (!_instance) {
    _instance = new TriggerManager();
  }
  return _instance;
}
