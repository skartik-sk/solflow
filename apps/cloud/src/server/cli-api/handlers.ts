import { NextResponse } from "next/server";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@solflow/db";
import { prisma } from "@solflow/db";
import {
  cloudCredentialPublicSelect,
  cloudWalletPublicSelect,
  workflowPublicSelect,
} from "../trpc/public-selects";
import { authenticateCloudCliRequest, CloudCliAuthError } from "./auth";
import {
  credentialTypeSchema,
  encryptedCredentialPayload,
  secretDataSchema,
  validateCredentialData,
} from "../trpc/routers/credential";
import { queueExecution, startExecutionWorker } from "../execution-worker/queue";
import { getTriggerManager } from "../trigger-manager";
import { startCronWorker } from "../trigger-manager/cron-worker";
import { shouldApiStartEmbeddedWorkers } from "../runtime-mode";
import { maybeSweepStaleExecutions } from "../execution-worker/stale-sweep";
import {
  manualExecutionRateLimit,
  workflowLifecycleRateLimit,
  type RateLimitResult,
} from "../../lib/rate-limit";
import {
  parseInput,
  testDataSchema,
  workflowDefinitionSchema,
  workflowDescriptionSchema,
  workflowNameSchema,
  workflowSettingsSchema,
  workflowTagsSchema,
} from "../workflow-input";
import {
  assertWalletOwnedBy,
  assertWorkflowActivationQuota,
} from "../workflow-guards";
import { cloudNodeRegistry, registerBuiltinNodes } from "@solflow/cloud-nodes";
import { encryptPrivateKey } from "@solflow/cloud-wallet";
import { Keypair } from "@solana/web3.js";

const DEFAULT_WORKFLOW_SETTINGS = {
  timeout: 300,
  retryPolicy: { maxAttempts: 1, delayMs: 0 },
  onError: "stop",
  safety: {
    simulationRequired: true,
    manualApprovalRequired: true,
    walletAutomationAllowed: false,
    maxSlippageBps: 100,
    allowedMints: [],
    webhookAllowlist: [],
  },
};

export async function handleCloudCliRequest(
  request: Request,
  segments: string[],
): Promise<NextResponse> {
  try {
    const ctx = await authenticateCloudCliRequest(request);
    const [resource, id, action] = segments;

    if (request.method === "GET" && resource === "whoami") {
      return json({
        ok: true,
        endpoint: new URL(request.url).origin,
        apiKey: { id: ctx.apiKeyId, name: ctx.apiKeyName },
        user: ctx.user,
      });
    }

    if (resource === "workflows") {
      return await handleWorkflowRequest(request, ctx.user.id, id, action);
    }

    if (resource === "executions") {
      return await handleExecutionRequest(request, ctx.user.id, id);
    }

    if (resource === "credentials") {
      return await handleCredentialRequest(request, ctx.user.id, id);
    }

    if (resource === "wallets") {
      return await handleWalletRequest(request, ctx.user.id, id);
    }

    if (request.method === "GET" && resource === "nodes") {
      registerBuiltinNodes();
      return json({
        nodes: cloudNodeRegistry.getAll().map((node) => ({
          type: node.type,
          label: node.label,
          category: node.category,
          description: node.description,
          icon: node.icon,
          color: node.color,
          properties: node.properties,
          inputs: node.inputs,
          outputs: node.outputs,
          defaultData: node.defaultData,
        })),
      });
    }

    return json({ error: "Cloud CLI endpoint not found" }, 404);
  } catch (err) {
    if (err instanceof CloudCliAuthError) {
      return json({ error: err.message }, err.status);
    }
    if (err instanceof TRPCError) {
      return json({ error: err.message }, trpcErrorStatus(err.code));
    }
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 400);
  }
}

async function handleWalletRequest(
  request: Request,
  userId: string,
  id?: string,
): Promise<NextResponse> {
  if (request.method === "GET" && !id) {
    const wallets = await prisma.cloudWallet.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: cloudWalletPublicSelect,
    });
    return json({ wallets });
  }

  if (request.method === "POST" && !id) {
    const body = await readJsonObject(request);
    const masterKey = process.env.ENCRYPTION_MASTER_KEY;
    if (!masterKey) throw new Error("ENCRYPTION_MASTER_KEY not configured");

    const network = body.network === "mainnet" ? "mainnet" : "devnet";
    const keypair = Keypair.generate();
    const encrypted = encryptPrivateKey(keypair.secretKey, masterKey);
    const wallet = await prisma.cloudWallet.create({
      data: {
        user: { connect: { id: userId } },
        label: readRequiredString(body.label, "label"),
        publicKey: keypair.publicKey.toBase58(),
        encryptedKey: encrypted.encrypted,
        keyIv: encrypted.iv,
        keyTag: encrypted.tag,
        keySalt: encrypted.salt,
        network,
      },
      select: cloudWalletPublicSelect,
    });
    return json({ wallet }, 201);
  }

  if (!id) return json({ error: "Wallet ID is required" }, 400);

  const existing = await prisma.cloudWallet.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) return json({ error: "Wallet not found" }, 404);

  if (request.method === "DELETE") {
    const wallet = await prisma.cloudWallet.delete({
      where: { id },
      select: cloudWalletPublicSelect,
    });
    return json({ wallet });
  }

  return json({ error: "Unsupported wallet operation" }, 405);
}

async function handleWorkflowRequest(
  request: Request,
  userId: string,
  id?: string,
  action?: string,
): Promise<NextResponse> {
  if (request.method === "GET" && !id) {
    const workflows = await prisma.workflow.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        ...workflowPublicSelect,
        _count: { select: { executions: true } },
      },
    });
    return json({ workflows });
  }

  if (request.method === "POST" && !id) {
    const body = await readJsonObject(request);
    const definition = readDefinition(body.definition);
    const workflow = await prisma.workflow.create({
      data: {
        user: { connect: { id: userId } },
        name: parseInput(workflowNameSchema, readRequiredString(body.name, "name"), "name"),
        description: readDescription(body.description),
        definition: (definition ?? { nodes: [], edges: [] }) as Prisma.InputJsonValue,
        settings: (body.settings === undefined
          ? DEFAULT_WORKFLOW_SETTINGS
          : parseInput(workflowSettingsSchema, body.settings, "settings")) as Prisma.InputJsonValue,
        tags: readTags(body.tags),
      },
      select: workflowPublicSelect,
    });
    return json({ workflow }, 201);
  }

  if (!id) return json({ error: "Workflow ID is required" }, 400);

  const existing = await prisma.workflow.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) return json({ error: "Workflow not found" }, 404);

  if (request.method === "GET" && !action) {
    const workflow = await prisma.workflow.findFirst({
      where: { id, userId },
      select: workflowPublicSelect,
    });
    return json({ workflow });
  }

  if (request.method === "PATCH" && !action) {
    const body = await readJsonObject(request);
    const data: Prisma.WorkflowUpdateInput = {};
    if (body.name !== undefined) data.name = parseInput(workflowNameSchema, readRequiredString(body.name, "name"), "name");
    if (body.description !== undefined) data.description = readDescription(body.description);
    if (body.definition !== undefined) data.definition = readDefinition(body.definition) as Prisma.InputJsonValue;
    if (body.settings !== undefined) data.settings = parseInput(workflowSettingsSchema, body.settings, "settings") as Prisma.InputJsonValue;
    if (body.tags !== undefined) data.tags = readTags(body.tags);
    if (body.walletId !== undefined) {
      if (body.walletId) {
        const walletId = String(body.walletId);
        await assertWalletOwnedBy(prisma, userId, walletId);
        data.wallet = { connect: { id: walletId } };
      } else {
        data.wallet = { disconnect: true };
      }
    }

    let workflow = await prisma.workflow.update({
      where: { id },
      data,
      select: workflowPublicSelect,
    });
    // Editing an ACTIVE workflow reschedules its cron and moves its webhook path.
    if (body.definition !== undefined) {
      await getTriggerManager().syncIfActive(id);
      workflow = await prisma.workflow.findFirstOrThrow({
        where: { id },
        select: workflowPublicSelect,
      });
    }
    return json({ workflow });
  }

  if (request.method === "DELETE" && !action) {
    await getTriggerManager().removeSchedules(id);
    const workflow = await prisma.workflow.delete({
      where: { id },
      select: workflowPublicSelect,
    });
    return json({ workflow });
  }

  if (request.method === "POST" && action === "activate") {
    const limited = rateLimited(workflowLifecycleRateLimit(userId), "Workflow activation");
    if (limited) return limited;
    await assertWorkflowActivationQuota(prisma, userId, id);
    if (shouldApiStartEmbeddedWorkers()) startCronWorker();
    await getTriggerManager().activate(id);
    const workflow = await prisma.workflow.findFirst({
      where: { id, userId },
      select: { id: true, status: true, cronExpression: true, webhookPath: true },
    });
    return json({ workflow });
  }

  if (request.method === "POST" && action === "deactivate") {
    const limited = rateLimited(workflowLifecycleRateLimit(userId), "Workflow deactivation");
    if (limited) return limited;
    await getTriggerManager().deactivate(id);
    const workflow = await prisma.workflow.findFirst({
      where: { id, userId },
      select: { id: true, status: true },
    });
    return json({ workflow });
  }

  if (request.method === "POST" && action === "run") {
    const limited = rateLimited(manualExecutionRateLimit(userId), "Execution");
    if (limited) return limited;
    const body = await readJsonObject(request);
    const testData = body.testData === undefined
      ? undefined
      : parseInput(testDataSchema, body.testData, "testData");
    const workflow = await prisma.workflow.findFirst({
      where: { id, userId },
      select: { id: true, definition: true },
    });
    if (!workflow) return json({ error: "Workflow not found" }, 404);

    const execution = await prisma.workflowExecution.create({
      data: {
        workflowId: workflow.id,
        status: "QUEUED",
        triggerType: "manual",
        triggerData: testData === undefined ? undefined : (testData as Prisma.InputJsonValue),
        definitionSnapshot: workflow.definition as Prisma.InputJsonValue,
      },
    });
    if (shouldApiStartEmbeddedWorkers()) startExecutionWorker();
    await queueExecution(execution.id, workflow.id);
    return json({ execution }, 202);
  }

  return json({ error: "Unsupported workflow operation" }, 405);
}

async function handleExecutionRequest(
  request: Request,
  userId: string,
  id?: string,
): Promise<NextResponse> {
  if (request.method === "GET") await maybeSweepStaleExecutions();

  if (request.method === "GET" && !id) {
    const url = new URL(request.url);
    const limit = clampInt(url.searchParams.get("limit"), 50, 1, 100);
    const workflowId = url.searchParams.get("workflowId") ?? undefined;
    const executions = await prisma.workflowExecution.findMany({
      where: {
        workflow: { userId },
        ...(workflowId ? { workflowId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        workflow: { select: { name: true } },
        _count: { select: { nodeResults: true } },
      },
    });
    return json({ executions });
  }

  if (request.method === "GET" && id) {
    const execution = await prisma.workflowExecution.findFirst({
      where: { id, workflow: { userId } },
      include: {
        nodeResults: { orderBy: { startedAt: "asc" } },
        workflow: { select: { name: true } },
      },
    });
    if (!execution) return json({ error: "Execution not found" }, 404);
    return json({ execution });
  }

  return json({ error: "Unsupported execution operation" }, 405);
}

async function handleCredentialRequest(
  request: Request,
  userId: string,
  id?: string,
): Promise<NextResponse> {
  if (request.method === "GET" && !id) {
    const credentials = await prisma.cloudCredential.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: cloudCredentialPublicSelect,
    });
    return json({ credentials });
  }

  if (request.method === "POST" && !id) {
    const body = await readJsonObject(request);
    const type = credentialTypeSchema.parse(body.type);
    const data = secretDataSchema.parse(body.data);
    validateCredentialData(type, data);
    const credential = await prisma.cloudCredential.create({
      data: {
        user: { connect: { id: userId } },
        label: readRequiredString(body.label, "label"),
        type,
        ...encryptedCredentialPayload(data),
      },
      select: cloudCredentialPublicSelect,
    });
    return json({ credential }, 201);
  }

  if (!id) return json({ error: "Credential ID is required" }, 400);

  const existing = await prisma.cloudCredential.findFirst({
    where: { id, userId },
    select: { id: true, type: true },
  });
  if (!existing) return json({ error: "Credential not found" }, 404);

  if (request.method === "PATCH") {
    const body = await readJsonObject(request);
    const data: Prisma.CloudCredentialUpdateInput = {};
    if (body.label !== undefined) data.label = readRequiredString(body.label, "label");
    if (body.data !== undefined) {
      const secretData = secretDataSchema.parse(body.data);
      const credentialType = credentialTypeSchema.parse(existing.type);
      validateCredentialData(credentialType, secretData);
      Object.assign(data, encryptedCredentialPayload(secretData));
    }
    const credential = await prisma.cloudCredential.update({
      where: { id },
      data,
      select: cloudCredentialPublicSelect,
    });
    return json({ credential });
  }

  if (request.method === "DELETE") {
    const credential = await prisma.cloudCredential.delete({
      where: { id },
      select: cloudCredentialPublicSelect,
    });
    return json({ credential });
  }

  return json({ error: "Unsupported credential operation" }, 405);
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  if (request.method === "GET" || request.method === "DELETE") return {};
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("JSON body must be an object");
    }
    return body as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && err.message === "JSON body must be an object") throw err;
    throw new Error("Invalid JSON body");
  }
}

function readDefinition(value: unknown): { nodes: unknown[]; edges: unknown[] } | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Workflow definition must be an object");
  }
  const definition = value as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(definition.nodes) || !Array.isArray(definition.edges)) {
    throw new Error("Workflow definition must include nodes[] and edges[]");
  }
  return parseInput(workflowDefinitionSchema, definition, "definition");
}

function readDescription(value: unknown): string | undefined {
  const description = readOptionalString(value);
  return description === undefined
    ? undefined
    : parseInput(workflowDescriptionSchema, description, "description");
}

function readTags(value: unknown): string[] {
  return parseInput(workflowTagsSchema, readStringArray(value), "tags");
}

function rateLimited(rl: RateLimitResult, label: string): NextResponse | null {
  if (rl.allowed) return null;
  return json(
    { error: `${label} rate limit exceeded. Try again in ${Math.ceil((rl.resetAt - Date.now()) / 1000)}s.` },
    429,
  );
}

function trpcErrorStatus(code: TRPCError["code"]): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "TOO_MANY_REQUESTS":
      return 429;
    default:
      return 400;
  }
}

function readRequiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function readOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("Expected string value");
  return value.trim();
}

function readStringArray(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Expected string array");
  return value.map((item) => readRequiredString(item, "array item"));
}

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
