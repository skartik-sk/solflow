import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { queueExecution, startExecutionWorker } from "../../execution-worker/queue";

export const executionRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        workflowId: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: any = { workflow: { userId: ctx.session.user.id } };
      if (input.workflowId) where.workflowId = input.workflowId;

      const executions = await ctx.prisma.workflowExecution.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          workflow: { select: { name: true } },
          _count: { select: { nodeResults: true } },
        },
      });

      let nextCursor: string | undefined;
      if (executions.length > input.limit) {
        const nextItem = executions.pop();
        nextCursor = nextItem!.id;
      }

      return { items: executions, nextCursor };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.workflowExecution.findFirst({
        where: {
          id: input.id,
          workflow: { userId: ctx.session.user.id },
        },
        include: {
          nodeResults: { orderBy: { startedAt: "asc" } },
          workflow: { select: { name: true } },
        },
      });
    }),

  run: protectedProcedure
    .input(
      z.object({
        workflowId: z.string(),
        testData: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const workflow = await ctx.prisma.workflow.findFirst({
        where: { id: input.workflowId, userId: ctx.session.user.id },
      });
      if (!workflow) throw new Error("Workflow not found");

      const execution = await ctx.prisma.workflowExecution.create({
        data: {
          workflowId: workflow.id,
          status: "QUEUED",
          triggerType: "manual",
          triggerData: input.testData ?? undefined,
          definitionSnapshot: workflow.definition as any,
        },
      });

      // Start the worker if not already running, then enqueue
      startExecutionWorker();
      await queueExecution(execution.id, workflow.id);

      return execution;
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.workflowExecution.update({
        where: {
          id: input.id,
          workflow: { userId: ctx.session.user.id },
          status: "RUNNING",
        },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
    }),
});
