// tRPC project router — CRUD + save + generateCode + export
// Per docs/architecture/17-api-design.md → Project Router section.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { flowToIR } from "@solflow/ir";
import { generateCode } from "@solflow/codegen";
import type { Node, Edge } from "@xyflow/react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createDefaultFlow() {
  return { nodes: [], edges: [] };
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const projectRouter = router({
  // ── List user's projects ────────────────────────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        status: z
          .enum(["DRAFT", "COMPILED", "TESTED", "DEPLOYED", "ARCHIVED"])
          .optional(),
        framework: z.enum(["ANCHOR", "PINOCCHIO"]).optional(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const projects = await ctx.prisma.project.findMany({
        where: {
          userId: ctx.session.user.id,
          ...(input.status && { status: input.status }),
          ...(input.framework && { framework: input.framework }),
        },
        orderBy: { updatedAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
        select: {
          id: true,
          name: true,
          description: true,
          framework: true,
          status: true,
          updatedAt: true,
          _count: { select: { snapshots: true, deployments: true } },
        },
      });

      let nextCursor: string | undefined;
      if (projects.length > input.limit) {
        const next = projects.pop();
        nextCursor = next?.id;
      }

      return { projects, nextCursor };
    }),

  // ── Get single project with recent activity ─────────────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        include: {
          deployments: { orderBy: { deployedAt: "desc" }, take: 5 },
          compilations: { orderBy: { startedAt: "desc" }, take: 5 },
          auditReports: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      return project;
    }),

  // ── Create new project (optionally fork from marketplace template) ───────
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        framework: z.enum(["ANCHOR", "PINOCCHIO"]),
        templateId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let initialFlowData: Record<string, unknown> = createDefaultFlow();
      let forkedFrom: string | undefined;

      if (input.templateId) {
        const template = await ctx.prisma.marketplaceListing.findUnique({
          where: { id: input.templateId },
        });
        if (template) {
          initialFlowData = template.templateFlowData as Record<
            string,
            unknown
          >;
          forkedFrom = input.templateId;
          await ctx.prisma.marketplaceListing.update({
            where: { id: input.templateId },
            data: { forks: { increment: 1 } },
          });
        }
      }

      const project = await ctx.prisma.project.create({
        data: {
          name: input.name,
          description: input.description,
          framework: input.framework,
          userId: ctx.session.user.id,
          flowData: initialFlowData,
          ...(forkedFrom && { forkedFrom }),
        },
      });

      return project;
    }),

  // ── Save flow state + optional snapshot ─────────────────────────────────
  save: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        flowData: z.object({
          nodes: z.array(z.any()),
          edges: z.array(z.any()),
        }),
        createSnapshot: z.boolean().default(false),
        snapshotLabel: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.project.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // Generate IR server-side for storage
      let irData: unknown = null;
      try {
        irData = flowToIR(
          input.flowData.nodes as Node[],
          input.flowData.edges as Edge[],
        );
      } catch {
        // Non-fatal: save flow even if IR fails
      }

      await ctx.prisma.project.update({
        where: { id: input.id },
        data: { flowData: input.flowData, irData },
      });

      // Create snapshot if requested
      if (input.createSnapshot) {
        const count = await ctx.prisma.projectSnapshot.count({
          where: { projectId: input.id },
        });
        await ctx.prisma.projectSnapshot.create({
          data: {
            projectId: input.id,
            version: count + 1,
            label: input.snapshotLabel,
            flowData: input.flowData,
            irData,
            flowHash: JSON.stringify(input.flowData).length.toString(), // lightweight hash
          },
        });
      }

      return { success: true };
    }),

  // ── Update project metadata ──────────────────────────────────────────────
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        framework: z.enum(["ANCHOR", "PINOCCHIO"]).optional(),
        status: z
          .enum(["DRAFT", "COMPILED", "TESTED", "DEPLOYED", "ARCHIVED"])
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.prisma.project.findFirst({
        where: { id, userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.prisma.project.update({ where: { id }, data });
    }),

  // ── Delete project ───────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.project.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.prisma.project.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ── Generate code preview (in-memory, no save) ───────────────────────────
  generateCode: protectedProcedure
    .input(
      z.object({
        flowData: z.object({
          nodes: z.array(z.any()),
          edges: z.array(z.any()),
        }),
        framework: z.enum(["anchor", "pinocchio"]),
      }),
    )
    .mutation(async ({ input }) => {
      const ir = flowToIR(
        input.flowData.nodes as Node[],
        input.flowData.edges as Edge[],
      );
      return generateCode(ir, input.framework);
    }),
});
