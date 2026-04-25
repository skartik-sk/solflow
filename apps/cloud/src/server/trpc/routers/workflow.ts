import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

export const workflowRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.workflow.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { executions: true } } },
    });
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.workflow.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        include: {
          wallet: true,
          versions: { orderBy: { version: "desc" }, take: 10 },
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
      return ctx.prisma.workflow.update({
        where: { id, userId: ctx.session.user.id },
        data,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.workflow.delete({
        where: { id: input.id, userId: ctx.session.user.id },
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

      return ctx.prisma.workflow.create({ data });
    }),
});
