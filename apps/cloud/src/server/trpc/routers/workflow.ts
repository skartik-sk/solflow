import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@solflow/db";
import { workflowLifecycleRateLimit } from "@/lib/rate-limit";
import { router, protectedProcedure, type Context } from "../trpc";
import { getTriggerManager } from "../../trigger-manager";
import { startCronWorker } from "../../trigger-manager/cron-worker";
import { shouldApiStartEmbeddedWorkers } from "../../runtime-mode";
import {
  buildAssistantWorkflowDraft,
  createSimulationReport,
} from "@/lib/cloud-workflow-features";
import {
  workflowPublicSelect,
  workflowVersionPublicSelect,
} from "../public-selects";

function getPositiveIntEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

async function assertWorkflowActivationQuota(ctx: {
  session: { user: { id?: string } };
  prisma: Context["prisma"];
}, workflowId: string): Promise<void> {
  if (process.env.CLOUD_QUOTA_ENFORCEMENT !== "true") return;

  const userId = ctx.session.user.id;
  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Sign in before activating Cloud workflows.",
    });
  }
  const [user, activeCount] = await Promise.all([
    ctx.prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    }),
    ctx.prisma.workflow.count({
      where: {
        userId,
        status: "ACTIVE",
        NOT: { id: workflowId },
      },
    }),
  ]);

  const trialDays = getPositiveIntEnv("CLOUD_TRIAL_DAYS", 7);
  const maxActiveWorkflows = getPositiveIntEnv("CLOUD_FREE_ACTIVE_WORKFLOWS", 1);
  const trialStartedAt = user?.createdAt?.getTime?.() ?? Date.now();
  const trialEndsAt = trialStartedAt + trialDays * 24 * 60 * 60 * 1000;

  if (Date.now() > trialEndsAt) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cloud trial quota expired. Upgrade is required to activate workflows.",
    });
  }

  if (activeCount >= maxActiveWorkflows) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Free Cloud quota allows ${maxActiveWorkflows} active workflow${maxActiveWorkflows === 1 ? "" : "s"}.`,
    });
  }
}

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

export const workflowRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.workflow.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        ...workflowPublicSelect,
        _count: { select: { executions: true } },
      },
    });
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.workflow.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        select: {
          ...workflowPublicSelect,
          versions: {
            orderBy: { version: "desc" },
            take: 10,
            select: workflowVersionPublicSelect,
          },
        },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        definition: z
          .object({ nodes: z.array(z.any()), edges: z.array(z.any()) })
          .optional(),
        settings: z.any().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.workflow.create({
        data: {
          user: { connect: { id: ctx.session.user.id } },
          name: input.name,
          description: input.description,
          definition: (input.definition ?? {
            nodes: [],
            edges: [],
          }) as Prisma.InputJsonValue,
          settings: (input.settings ??
            DEFAULT_WORKFLOW_SETTINGS) as Prisma.InputJsonValue,
          tags: input.tags,
        },
        select: workflowPublicSelect,
      });
    }),

  createFromAssistant: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(3).max(1000),
        name: z.string().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const draft = buildAssistantWorkflowDraft(input.prompt);
      return ctx.prisma.workflow.create({
        data: {
          user: { connect: { id: ctx.session.user.id } },
          name: input.name ?? draft.name,
          description: draft.description,
          definition: draft.definition as Prisma.InputJsonValue,
          settings: draft.settings as Prisma.InputJsonValue,
          tags: draft.tags,
        },
        select: workflowPublicSelect,
      });
    }),

  simulate: protectedProcedure
    .input(
      z.object({
        workflowId: z.string().optional(),
        definition: z.object({ nodes: z.array(z.any()), edges: z.array(z.any()) }),
        settings: z.any().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.workflowId) {
        const workflow = await ctx.prisma.workflow.findFirst({
          where: { id: input.workflowId, userId: ctx.session.user.id },
          select: { id: true },
        });
        if (!workflow) throw new Error("Workflow not found");
      }

      return createSimulationReport(input.definition, input.settings);
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        definition: z
          .object({ nodes: z.array(z.any()), edges: z.array(z.any()) })
          .optional(),
        settings: z.any().optional(),
        walletId: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.prisma.workflow.findFirst({
        where: { id, userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!existing) throw new Error("Workflow not found");

      return ctx.prisma.workflow.update({
        where: { id },
        data,
        select: workflowPublicSelect,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.workflow.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!existing) throw new Error("Workflow not found");

      return ctx.prisma.workflow.delete({
        where: { id: input.id },
        select: workflowPublicSelect,
      });
    }),

  duplicate: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const original = await ctx.prisma.workflow.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
      });
      if (!original) throw new Error("Workflow not found");

      const data: Prisma.WorkflowCreateInput = {
        user: { connect: { id: ctx.session.user.id } },
        name: input.name ?? `${original.name} (copy)`,
        description: original.description,
        definition: original.definition as Prisma.InputJsonValue,
        settings: original.settings as Prisma.InputJsonValue,
        tags: original.tags,
      };
      if (original.walletId) {
        data.wallet = { connect: { id: original.walletId } };
      }

      return ctx.prisma.workflow.create({ data, select: workflowPublicSelect });
    }),

  activate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rl = workflowLifecycleRateLimit(ctx.session.user.id ?? "anonymous");
      if (!rl.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Workflow activation rate limit exceeded. Try again in ${Math.ceil((rl.resetAt - Date.now()) / 1000)}s.`,
        });
      }

      const workflow = await ctx.prisma.workflow.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
      });
      if (!workflow) throw new Error("Workflow not found");

      await assertWorkflowActivationQuota(ctx, input.id);

      if (shouldApiStartEmbeddedWorkers()) {
        startCronWorker();
      }

      const triggerManager = getTriggerManager();
      await triggerManager.activate(input.id);

      return ctx.prisma.workflow.findFirst({
        where: { id: input.id },
        select: { id: true, status: true, cronExpression: true, webhookPath: true },
      });
    }),

  deactivate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rl = workflowLifecycleRateLimit(ctx.session.user.id ?? "anonymous");
      if (!rl.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Workflow deactivation rate limit exceeded. Try again in ${Math.ceil((rl.resetAt - Date.now()) / 1000)}s.`,
        });
      }

      const workflow = await ctx.prisma.workflow.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
      });
      if (!workflow) throw new Error("Workflow not found");

      const triggerManager = getTriggerManager();
      await triggerManager.deactivate(input.id);

      return ctx.prisma.workflow.findFirst({
        where: { id: input.id },
        select: { id: true, status: true },
      });
    }),
});
