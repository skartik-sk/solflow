// tRPC router — project snapshots (version history)

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { createSnapshot } from "@solflow/versioning";
import type { FlowData } from "@solflow/versioning";

export const snapshotRouter = router({
  // ─── List snapshots for a project ────────────────────────────────
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.projectSnapshot.findMany({
        where: { projectId: input.projectId },
        orderBy: { version: "desc" },
        take: 50,
        select: {
          id: true,
          version: true,
          label: true,
          flowHash: true,
          diffData: true,
          createdAt: true,
        },
      });
    }),

  // ─── Get a single snapshot with full flow + diff data ─────────────
  get: protectedProcedure
    .input(z.object({ snapshotId: z.string() }))
    .query(async ({ ctx, input }) => {
      const snapshot = await ctx.prisma.projectSnapshot.findFirst({
        where: {
          id: input.snapshotId,
          project: { userId: ctx.session.user.id },
        },
      });
      if (!snapshot) throw new TRPCError({ code: "NOT_FOUND" });
      return snapshot;
    }),

  // ─── Create a new snapshot (called on manual save / compile) ──────
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        /** Optional human-readable label for this version. */
        label: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.session.user.id },
        select: { id: true, flowData: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      if (!project.flowData)
        throw new TRPCError({ code: "BAD_REQUEST", message: "No flow data" });

      const snapshot = await createSnapshot(
        ctx.prisma,
        input.projectId,
        project.flowData as unknown as FlowData,
        input.label,
      );

      return { id: snapshot.id, version: snapshot.version };
    }),

  // ─── Update label on a snapshot ──────────────────────────────────
  updateLabel: protectedProcedure
    .input(
      z.object({
        snapshotId: z.string(),
        label: z.string().min(1).max(120),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership via project relation
      const snapshot = await ctx.prisma.projectSnapshot.findFirst({
        where: {
          id: input.snapshotId,
          project: { userId: ctx.session.user.id },
        },
        select: { id: true },
      });
      if (!snapshot) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.prisma.projectSnapshot.update({
        where: { id: input.snapshotId },
        data: { label: input.label },
      });

      return { success: true };
    }),

  // ─── Restore a previous snapshot ──────────────────────────────────
  restore: protectedProcedure
    .input(z.object({ snapshotId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const snapshot = await ctx.prisma.projectSnapshot.findFirst({
        where: {
          id: input.snapshotId,
          project: { userId: ctx.session.user.id },
        },
      });
      if (!snapshot) throw new TRPCError({ code: "NOT_FOUND" });

      // Create a "restore" snapshot then update the project
      await createSnapshot(
        ctx.prisma,
        snapshot.projectId,
        snapshot.flowData as unknown as FlowData,
        `Restored from v${snapshot.version}`,
      );

      await ctx.prisma.project.update({
        where: { id: snapshot.projectId },
        data: {
          flowData: snapshot.flowData ?? {},
          irData: snapshot.irData,
        },
      });

      return { success: true, flowData: snapshot.flowData };
    }),
});
