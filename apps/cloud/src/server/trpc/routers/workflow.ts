import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@solflow/db";
import { workflowLifecycleRateLimit } from "../../../lib/rate-limit";
import { nanoid } from "nanoid";
import { router, protectedProcedure } from "../trpc";
import { getTriggerManager } from "../../trigger-manager";
import { startCronWorker } from "../../trigger-manager/cron-worker";
import { shouldApiStartEmbeddedWorkers } from "../../runtime-mode";
import {
  buildAssistantWorkflowDraft,
  createSimulationReport,
} from "../../../lib/cloud-workflow-features";
import {
  workflowPublicSelect,
  workflowVersionPublicSelect,
} from "../public-selects";
import {
  workflowDefinitionSchema,
  workflowDescriptionSchema,
  workflowNameSchema,
  workflowSettingsSchema,
  workflowTagsSchema,
} from "../../workflow-input";
import {
  assertWalletOwnedBy,
  assertWorkflowActivationQuota,
} from "../../workflow-guards";

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
        name: workflowNameSchema,
        description: workflowDescriptionSchema.optional(),
        definition: workflowDefinitionSchema.optional(),
        settings: workflowSettingsSchema.optional(),
        tags: workflowTagsSchema.optional(),
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
        definition: workflowDefinitionSchema,
        settings: workflowSettingsSchema.optional(),
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
        name: workflowNameSchema.optional(),
        description: workflowDescriptionSchema.optional(),
        definition: workflowDefinitionSchema.optional(),
        settings: workflowSettingsSchema.optional(),
        walletId: z.string().nullable().optional(),
        tags: workflowTagsSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.prisma.workflow.findFirst({
        where: { id, userId: ctx.session.user.id },
        select: { id: true, status: true },
      });
      if (!existing) throw new Error("Workflow not found");
      await assertWalletOwnedBy(ctx.prisma, ctx.session.user.id!, data.walletId);

      const updated = await ctx.prisma.workflow.update({
        where: { id },
        data: data as Prisma.WorkflowUncheckedUpdateInput,
        select: workflowPublicSelect,
      });

      // Editing an ACTIVE workflow reschedules its cron and moves its webhook path.
      if (existing.status === "ACTIVE" && data.definition !== undefined) {
        await getTriggerManager().syncIfActive(id);
        return ctx.prisma.workflow.findFirstOrThrow({
          where: { id },
          select: workflowPublicSelect,
        });
      }
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.workflow.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!existing) throw new Error("Workflow not found");

      await getTriggerManager().removeSchedules(input.id);
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

      await assertWorkflowActivationQuota(ctx.prisma, ctx.session.user.id, input.id);

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

  /** Owner-only: the webhook trigger's secret (header auth / HMAC replay protection). */
  getWebhookSecret: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const workflow = await ctx.prisma.workflow.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        select: { id: true, webhookPath: true, webhookSecret: true },
      });
      if (!workflow) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
      return { webhookPath: workflow.webhookPath, webhookSecret: workflow.webhookSecret };
    }),

  /** Owner-only: replace the webhook secret. Senders must use the new value. */
  rotateWebhookSecret: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rl = workflowLifecycleRateLimit(ctx.session.user.id ?? "anonymous");
      if (!rl.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded. Try again in ${Math.ceil((rl.resetAt - Date.now()) / 1000)}s.`,
        });
      }
      const workflow = await ctx.prisma.workflow.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!workflow) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" });
      const updated = await ctx.prisma.workflow.update({
        where: { id: input.id },
        data: { webhookSecret: nanoid(32) },
        select: { webhookPath: true, webhookSecret: true },
      });
      return updated;
    }),
});
