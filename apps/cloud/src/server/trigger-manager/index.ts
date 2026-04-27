// Trigger Manager — manages lifecycle of cron and webhook triggers.
// SERVER ONLY — never import from client components.

import { Queue, type Queue as QueueType } from "bullmq";
import { prisma } from "@solflow/db";
import { cloudNodeRegistry, registerBuiltinNodes } from "@solflow/cloud-nodes";
import { queueExecution } from "../execution-worker/queue";
import { nanoid } from "nanoid";
import {
  redactWebhookHeaders,
  validateWebhookReplayProtection,
} from "./webhook-security";
import { createRedisErrorLogger, getRedisConnectionConfig } from "../redis";

registerBuiltinNodes();

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
        connection: getRedisConnectionConfig(),
      });
      this.cronQueue.on("error", createRedisErrorLogger("trigger-manager-cron-queue"));
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
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { webhookPath: true, webhookSecret: true },
    });

    let webhookPath = node.data.webhookPath as string | undefined;

    // Generate a path if not provided
    if (!webhookPath) {
      webhookPath = workflow?.webhookPath ?? nanoid(16);
    }

    // Preserve existing webhook secret across worker restores/re-activations.
    const webhookSecret = workflow?.webhookSecret ?? nanoid(32);

    await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        webhookPath,
        webhookSecret,
      },
    });

    console.log(
      `[trigger-manager] Webhook trigger activated: /api/webhook/${webhookPath} for workflow ${workflowId}`
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
    query: Record<string, string>,
    rawBody = "",
  ): Promise<{ status: number; body: unknown }> {
    const receivedAt = Date.now();
    const workflow = await prisma.workflow.findFirst({
      where: { webhookPath: path, status: "ACTIVE" },
    });

    if (!workflow) {
      logWebhookEvent("not_found", { path, method });
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
        logWebhookEvent("method_rejected", {
          workflowId: workflow.id,
          path,
          method,
          expectedMethod,
        });
        return { status: 405, body: { error: `Method ${method} not allowed` } };
      }

      const maxBodyKb = Number(webhookNode.data.maxBodyKb ?? 256);
      const rawBodyBytes = new TextEncoder().encode(rawBody).byteLength;
      if (Number.isFinite(maxBodyKb) && maxBodyKb > 0 && rawBodyBytes > maxBodyKb * 1024) {
        logWebhookEvent("body_rejected", {
          workflowId: workflow.id,
          path,
          method,
          bodyBytes: rawBodyBytes,
          maxBodyKb,
        });
        return { status: 413, body: { error: "Webhook request body is too large" } };
      }

      // Check authentication if configured
      const authType = (webhookNode.data.authentication as string) || "none";
      if (authType === "header") {
        const authHeaderName =
          (webhookNode.data.authHeaderName as string) ||
          "X-Webhook-Secret";
        const headerValue = headers[authHeaderName.toLowerCase()];
        if (headerValue !== workflow.webhookSecret) {
          logWebhookEvent("auth_rejected", {
            workflowId: workflow.id,
            path,
            method,
          });
          return { status: 401, body: { error: "Unauthorized" } };
        }
      }

      if (webhookNode.data.replayProtection === true) {
        const replay = await validateWebhookReplayProtection({
          headers,
          secret: workflow.webhookSecret,
          rawBody,
          now: receivedAt,
        });
        if (!replay.ok) {
          logWebhookEvent("replay_rejected", {
            workflowId: workflow.id,
            path,
            method,
            status: replay.status,
            reason: replay.error,
          });
          return { status: replay.status, body: { error: replay.error } };
        }
      }
    }

    // Create execution
    const triggerData = {
      triggerType: "webhook",
      method,
      headers: redactWebhookHeaders(headers),
      body,
      query,
      timestamp: receivedAt,
      meta: {
        path,
        replayProtection: webhookNode?.data.replayProtection === true,
        contentLength: headers["content-length"] ?? null,
        contentType: headers["content-type"] ?? null,
      },
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

    await queueExecution(execution.id, workflow.id);
    logWebhookEvent("queued", {
      workflowId: workflow.id,
      executionId: execution.id,
      path,
      method,
    });

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

function logWebhookEvent(event: string, data: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      component: "cloud-webhook",
      event,
      ...data,
    }),
  );
}
