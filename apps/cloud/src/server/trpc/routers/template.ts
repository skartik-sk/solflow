import { z } from "zod";
import type { Prisma } from "@solflow/db";
import { router, protectedProcedure, publicProcedure } from "../trpc";

export const templateRouter = router({
  list: publicProcedure
    .input(
      z.object({
        category: z.string().optional(),
        featured: z.boolean().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.WorkflowTemplateWhereInput = { status: "PUBLISHED" };
      if (input.category) where.category = input.category;
      if (input.featured) where.featured = true;

      return ctx.prisma.workflowTemplate.findMany({
        where,
        orderBy: [
          { featured: "desc" },
          { downloads: "desc" },
        ],
        take: input.limit,
      });
    }),

  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.workflowTemplate.findFirst({
        where: { id: input.id, status: "PUBLISHED" },
      });
    }),

  categories: publicProcedure.query(async ({ ctx }) => {
    const templates = await ctx.prisma.workflowTemplate.findMany({
      where: { status: "PUBLISHED" },
      select: { category: true },
    });
    const cats = Array.from(new Set(templates.map((t) => t.category)));
    return cats.sort();
  }),

  fork: protectedProcedure
    .input(
      z.object({
        templateId: z.string(),
        name: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.prisma.workflowTemplate.findFirst({
        where: { id: input.templateId, status: "PUBLISHED" },
      });
      if (!template) throw new Error("Template not found");

      // Increment download count
      await ctx.prisma.workflowTemplate.update({
        where: { id: template.id },
        data: { downloads: { increment: 1 } },
      });

      // Create workflow from template definition
      const workflow = await ctx.prisma.workflow.create({
        data: {
          user: { connect: { id: ctx.session.user.id } },
          name: input.name ?? template.title,
          description: `From template: ${template.title}`,
          definition: template.definition as Prisma.InputJsonValue,
          settings: template.settings as Prisma.InputJsonValue,
          tags: template.tags,
        },
      });

      return workflow;
    }),
});
