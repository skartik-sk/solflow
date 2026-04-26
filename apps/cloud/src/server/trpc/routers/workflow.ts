import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { workflowLifecycleRateLimit } from "@/lib/rate-limit";
import { router, protectedProcedure } from "../trpc";
import { getTriggerManager } from "../../trigger-manager";
import { startCronWorker } from "../../trigger-manager/cron-worker";
import {
  workflowPublicSelect,
  workflowVersionPublicSelect,
} from "../public-selects";

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
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.workflow.create({
        data: {
          user: { connect: { id: ctx.session.user.id } },
          name: input.name,
          description: input.description,
          definition: { nodes: [], edges: [] } as any,
          settings: {
            timeout: 300,
            retryPolicy: { maxAttempts: 1, delayMs: 0 },
            onError: "stop",
          } as any,
        },
        select: workflowPublicSelect,
      });
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

      const data: any = {
        user: { connect: { id: ctx.session.user.id } },
        name: input.name ?? `${original.name} (copy)`,
        description: original.description,
        definition: original.definition,
        settings: original.settings,
        tags: original.tags,
      };
      if (original.walletId) data.walletId = original.walletId;

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

      // Ensure cron worker is running
      startCronWorker();

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
