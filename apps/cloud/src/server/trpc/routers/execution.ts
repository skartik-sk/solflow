import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@solflow/db";
import { manualExecutionRateLimit } from "../../../lib/rate-limit";
import { router, protectedProcedure } from "../trpc";
import { queueExecution, startExecutionWorker } from "../../execution-worker/queue";
import { shouldApiStartEmbeddedWorkers } from "../../runtime-mode";
import { maybeSweepStaleExecutions } from "../../execution-worker/stale-sweep";
import { testDataSchema } from "../../workflow-input";

function assertManualRunRateLimit(userId: string): void {
  const rl = manualExecutionRateLimit(userId);
  if (!rl.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Execution rate limit exceeded. Try again in ${Math.ceil((rl.resetAt - Date.now()) / 1000)}s.`,
    });
  }
}

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
      await maybeSweepStaleExecutions();
      const where: Prisma.WorkflowExecutionWhereInput = {
        workflow: { userId: ctx.session.user.id },
      };
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
      await maybeSweepStaleExecutions();
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
        testData: testDataSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertManualRunRateLimit(ctx.session.user.id ?? "anonymous");

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
          definitionSnapshot: workflow.definition as Prisma.InputJsonValue,
        },
      });

      if (shouldApiStartEmbeddedWorkers()) {
        startExecutionWorker();
      }
      await queueExecution(execution.id, workflow.id);

      return execution;
    }),

  replay: protectedProcedure
    .input(z.object({ executionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertManualRunRateLimit(ctx.session.user.id ?? "anonymous");
      const original = await ctx.prisma.workflowExecution.findFirst({
        where: {
          id: input.executionId,
          workflow: { userId: ctx.session.user.id },
        },
        select: {
          id: true,
          workflowId: true,
          triggerType: true,
          triggerData: true,
          definitionSnapshot: true,
        },
      });
      if (!original) throw new Error("Execution not found");

      const execution = await ctx.prisma.workflowExecution.create({
        data: {
          workflowId: original.workflowId,
          status: "QUEUED",
          triggerType: "replay",
          triggerData: {
            replayOf: original.id,
            originalTriggerType: original.triggerType,
            originalTriggerData: original.triggerData,
          } as Prisma.InputJsonValue,
          definitionSnapshot:
            original.definitionSnapshot === null
              ? undefined
              : (original.definitionSnapshot as Prisma.InputJsonValue),
        },
      });

      if (shouldApiStartEmbeddedWorkers()) {
        startExecutionWorker();
      }
      await queueExecution(execution.id, original.workflowId);

      return execution;
    }),

  approveReplay: protectedProcedure
    .input(z.object({ executionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertManualRunRateLimit(ctx.session.user.id ?? "anonymous");

      const original = await ctx.prisma.workflowExecution.findFirst({
        where: {
          id: input.executionId,
          workflow: { userId: ctx.session.user.id },
        },
        select: {
          id: true,
          workflowId: true,
          triggerType: true,
          triggerData: true,
          definitionSnapshot: true,
        },
      });
      if (!original) throw new Error("Execution not found");

      const execution = await ctx.prisma.workflowExecution.create({
        data: {
          workflowId: original.workflowId,
          status: "QUEUED",
          triggerType: "approval",
          triggerData: {
            approvalOf: original.id,
            walletAutomationApproved: true,
            originalTriggerType: original.triggerType,
            originalTriggerData: original.triggerData,
          } as Prisma.InputJsonValue,
          definitionSnapshot:
            original.definitionSnapshot === null
              ? undefined
              : (original.definitionSnapshot as Prisma.InputJsonValue),
        },
      });

      if (shouldApiStartEmbeddedWorkers()) {
        startExecutionWorker();
      }
      await queueExecution(execution.id, original.workflowId);

      return execution;
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // QUEUED and RUNNING runs can be cancelled. The runner checks this status
      // between nodes and never overwrites CANCELLED with its final status.
      const execution = await ctx.prisma.workflowExecution.findFirst({
        where: {
          id: input.id,
          workflow: { userId: ctx.session.user.id },
          status: { in: ["QUEUED", "RUNNING"] },
        },
        select: { id: true },
      });
      if (!execution) throw new Error("Queued or running execution not found");

      const updated = await ctx.prisma.workflowExecution.updateMany({
        where: { id: execution.id, status: { in: ["QUEUED", "RUNNING"] } },
        data: {
          status: "CANCELLED",
          completedAt: new Date(),
          errorMessage: "Cancelled by user",
        },
      });
      if (updated.count === 0) throw new Error("Execution already finished");

      return ctx.prisma.workflowExecution.findUnique({ where: { id: execution.id } });
    }),
});
