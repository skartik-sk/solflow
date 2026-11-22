// Trigger Manager — manages lifecycle of cron and webhook triggers.
// SERVER ONLY — never import from client components.

import { Queue, type Queue as QueueType } from "bullmq";
import { prisma, type Prisma } from "@solflow/db";
import { registerBuiltinNodes } from "@solflow/cloud-nodes";
import { queueExecution } from "../execution-worker/queue";
import { nanoid } from "nanoid";
import {
  isIpAllowed,
  redactWebhookHeaders,
  validateWebhookReplayProtection,
  webhookClientIp,
  webhookEventId,
  webhookSecretMatches,
} from "./webhook-security";
import { createRedisErrorLogger, getRedisConnectionConfig } from "../redis";
import {
  isQstashConfigured,
  qstashCreateSchedule,
  qstashDeleteScheduleForWorkflow,
} from "./qstash-scheduler";
import { isValidTimezone, nextCronRun, parseCron } from "./cron";
import { getCloudRuntimeMode } from "../runtime-mode";

const WEBHOOK_PATH_RE = /^[A-Za-z0-9_-]{3,64}$/;
const EVENT_DEDUP_WINDOW_MS = 24 * 60 * 60_000;

type TriggerNode = { id: string; type: string; data: Record<string, unknown> };

function triggerNodesOf(definition: unknown): TriggerNode[] {
  const nodes = (definition as { nodes?: unknown } | null)?.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.filter(
    (n): n is TriggerNode =>
      Boolean(n) && typeof (n as TriggerNode).type === "string" && (n as TriggerNode).type.startsWith("trigger:"),
  );
}

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

    const triggerNodes = await this.syncTriggers(workflowId, workflow.definition);

    // Update workflow status
    await prisma.workflow.update({
      where: { id: workflowId },
      data: { status: "ACTIVE" },
    });

    console.log(
      `[trigger-manager] Activated workflow ${workflowId} — ${triggerNodes.length} trigger(s)`
    );
  }

  /**
   * Re-apply triggers after an ACTIVE workflow was edited: reschedule cron
   * (or remove it if the cron node is gone) and update the webhook path.
   */
  async syncIfActive(workflowId: string): Promise<void> {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { status: true, definition: true },
    });
    if (workflow?.status !== "ACTIVE") return;
    await this.syncTriggers(workflowId, workflow.definition);
  }

  private async syncTriggers(workflowId: string, definition: unknown): Promise<TriggerNode[]> {
    const triggerNodes = triggerNodesOf(definition);
    for (const node of triggerNodes) {
      await this.activateTrigger(workflowId, node);
    }
    if (!triggerNodes.some((node) => node.type === "trigger:cron")) {
      await this.deactivateCronTrigger(workflowId);
      await prisma.workflow.update({
        where: { id: workflowId },
        data: { cronExpression: null, cronTimezone: null, nextRunAt: null },
      });
    }
    return triggerNodes;
  }

  // ─── Activate a single trigger node ─────────────────────────────────────

  private async activateTrigger(
    workflowId: string,
    node: TriggerNode
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
      String(node.data.cronExpression ?? "").trim() || "*/5 * * * *";
    const timezone = String(node.data.timezone ?? "").trim() || "UTC";
    parseCron(cronExpression); // throws a readable error for a bad expression
    if (!isValidTimezone(timezone)) {
      throw new Error(`Unknown cron timezone "${timezone}"`);
    }
    const nextRunAt = nextCronRun(cronExpression, timezone);

    // Serverless: schedule via QStash (no always-on worker). Falls back to the
    // BullMQ repeatable job below for dev/VM when QStash isn't configured.
    if (isQstashConfigured()) {
      await qstashCreateSchedule({ workflowId, cron: cronExpression, timezone });
      await prisma.workflow.update({
        where: { id: workflowId },
        data: { cronExpression, cronTimezone: timezone, nextRunAt },
      });
      console.log(
        `[trigger-manager] QStash cron schedule set: ${cronExpression} for workflow ${workflowId}`,
      );
      return;
    }

    if (getCloudRuntimeMode() === "api") {
      throw new Error(
        "Cron triggers on serverless need Upstash QStash: set QSTASH_TOKEN and CLOUD_PUBLIC_BASE_URL.",
      );
    }

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
        nextRunAt,
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

    const customPath =
      typeof node.data.webhookPath === "string" ? node.data.webhookPath.trim() : "";
    if (customPath && !WEBHOOK_PATH_RE.test(customPath)) {
      throw new Error(
        "Webhook path must be 3-64 characters of letters, numbers, - or _",
      );
    }
    // Custom path wins (so editing it on an ACTIVE workflow moves the URL);
    // otherwise keep the existing path or generate one.
    const webhookPath = customPath || workflow?.webhookPath || nanoid(16);
    if (webhookPath !== workflow?.webhookPath) {
      const taken = await prisma.workflow.findFirst({
        where: { webhookPath, NOT: { id: workflowId } },
        select: { id: true },
      });
      if (taken) throw new Error(`Webhook path "${webhookPath}" is already in use`);
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

    // Mark inactive first: /api/cron/fire skips inactive workflows, so a
    // schedule that fails to delete below can't start runs.
    await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        status: "INACTIVE",
        nextRunAt: null,
      },
    });

    // Remove cron trigger (keep the webhook path; inactive paths return 404)
    await this.removeSchedules(workflowId);

    console.log(
      `[trigger-manager] Deactivated workflow ${workflowId}`
    );
  }

  /** Best-effort removal of a workflow's cron schedule (deactivate / delete). */
  async removeSchedules(workflowId: string): Promise<void> {
    try {
      await this.deactivateCronTrigger(workflowId);
    } catch (err) {
      console.error(
        `[trigger-manager] Could not remove cron schedule for ${workflowId}:`,
        err,
      );
    }
  }

  /** Recompute nextRunAt after a cron fire. */
  async refreshNextRun(workflowId: string): Promise<void> {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { cronExpression: true, cronTimezone: true },
    });
    if (!workflow?.cronExpression) return;
    let nextRunAt: Date | null = null;
    try {
      nextRunAt = nextCronRun(workflow.cronExpression, workflow.cronTimezone || "UTC");
    } catch {
      nextRunAt = null;
    }
    await prisma.workflow.update({ where: { id: workflowId }, data: { nextRunAt } });
  }

  private async deactivateCronTrigger(workflowId: string): Promise<void> {
    if (isQstashConfigured()) {
      await qstashDeleteScheduleForWorkflow(workflowId);
      return;
    }
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
    let replayKey: string | undefined;
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

    const webhookAllowlist = getWebhookAllowlist(workflow.settings);
    if (webhookAllowlist.length > 0 && !isIpAllowed(webhookClientIp(headers), webhookAllowlist)) {
      logWebhookEvent("allowlist_rejected", {
        workflowId: workflow.id,
        path,
        method,
      });
      return { status: 403, body: { error: "Webhook source is not allowed" } };
    }

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
        if (!webhookSecretMatches(headerValue, workflow.webhookSecret)) {
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
          seen: (key, sinceMs) =>
            this.hasRecentExecutionWithMeta(workflow.id, "replayKey", key, sinceMs),
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
        replayKey = replay.replayKey;
      }
    }

    // Drop duplicate deliveries when the sender gives a delivery/event id.
    const eventId = webhookEventId(headers);
    if (eventId) {
      const duplicate = await this.findRecentExecutionWithMeta(
        workflow.id,
        "eventId",
        eventId,
        receivedAt - EVENT_DEDUP_WINDOW_MS,
      );
      if (duplicate) {
        logWebhookEvent("duplicate_event", { workflowId: workflow.id, path, method, executionId: duplicate });
        return {
          status: 200,
          body: { message: "Duplicate delivery ignored", executionId: duplicate, duplicate: true },
        };
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
        ...(replayKey ? { replayKey } : {}),
        ...(eventId ? { eventId } : {}),
        contentLength: headers["content-length"] ?? null,
        contentType: headers["content-type"] ?? null,
      },
    };

    const execution = await prisma.workflowExecution.create({
      data: {
        workflowId: workflow.id,
        status: "QUEUED",
        triggerType: "webhook",
        triggerData: triggerData as Prisma.InputJsonValue,
        definitionSnapshot: workflow.definition as Prisma.InputJsonValue,
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

  private async findRecentExecutionWithMeta(
    workflowId: string,
    field: "eventId" | "replayKey",
    value: string,
    sinceMs: number,
  ): Promise<string | undefined> {
    const existing = await prisma.workflowExecution.findFirst({
      where: {
        workflowId,
        triggerType: "webhook",
        createdAt: { gte: new Date(sinceMs) },
        triggerData: { path: ["meta", field], equals: value },
      },
      select: { id: true },
    });
    return existing?.id;
  }

  private async hasRecentExecutionWithMeta(
    workflowId: string,
    field: "eventId" | "replayKey",
    value: string,
    sinceMs: number,
  ): Promise<boolean> {
    return Boolean(await this.findRecentExecutionWithMeta(workflowId, field, value, sinceMs));
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
        await this.syncTriggers(workflow.id, workflow.definition);
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

function getWebhookAllowlist(settings: unknown): string[] {
  const safety = (settings as { safety?: { webhookAllowlist?: unknown } } | null)?.safety;
  if (!Array.isArray(safety?.webhookAllowlist)) return [];
  return safety.webhookAllowlist
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
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
