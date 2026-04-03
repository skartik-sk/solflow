// tRPC compile router — start, status, history
// Per docs/architecture/17-api-design.md → Compile Router.
// Phase 3: enqueues real BullMQ jobs; streams logs via WebSocket.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createHash } from "crypto";
import { router, protectedProcedure } from "../trpc";
import { compileRateLimit } from "@/lib/rate-limit";

// Local alias for Prisma JSON field values (Prisma client is ungenerated/stubbed)
type PrismaJsonValue =
  | string
  | number
  | boolean
  | null
  | PrismaJsonValue[]
  | { [key: string]: PrismaJsonValue };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Compute a deterministic SHA-256 hash of the IR JSON string (server-side). */
function hashIR(irJson: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(irJson))
    .digest("hex")
    .slice(0, 16);
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const compileRouter = router({
  // ── Start compilation ────────────────────────────────────────────────────
  start: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        release: z.boolean().default(true),
        verifiable: z.boolean().default(false),
        targetNetwork: z
          .enum(["devnet", "mainnet", "localnet"])
          .default("devnet"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.session.user.id },
        select: { id: true, irData: true, framework: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      if (!project.irData) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Project has no IR data. Save the flow first.",
        });
      }

      // Rate limit: 5 compile jobs per user per 5 minutes
      const rl = compileRateLimit(ctx.session.user.id ?? "anonymous");
      if (!rl.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Compile rate limit exceeded. Try again in ${Math.ceil((rl.resetAt - Date.now()) / 1000)}s.`,
        });
      }

      const irHash = hashIR(project.irData);

      // Persist the compilation record (status=QUEUED)
      const compilation = await ctx.prisma.compilation.create({
        data: {
          projectId: input.projectId,
          status: "QUEUED",
          framework: project.framework,
          irHash,
        },
      });

      // Enqueue BullMQ job (lazy import to avoid loading worker code in all paths)
      try {
        const { queueCompilation } =
          await import("@/server/compile-worker/queue");

        // irData is already stored as ProgramIR JSON — cast directly
        const ir = project.irData as Parameters<
          typeof queueCompilation
        >[0]["ir"];

        await queueCompilation({
          compilationId: compilation.id,
          projectId: input.projectId,
          ir,
          framework: project.framework,
          irHash,
          options: {
            release: input.release,
            verifiable: input.verifiable,
            targetNetwork: input.targetNetwork,
          },
        });
      } catch (err) {
        // If queueing fails, mark compilation as failed
        await ctx.prisma.compilation.update({
          where: { id: compilation.id },
          data: {
            status: "FAILED",
            errors: [
              err instanceof Error ? err.message : String(err),
            ] as unknown as any,
          },
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to queue compilation job",
          cause: err,
        });
      }

      return { jobId: compilation.id };
    }),

  // ── Get compilation status ───────────────────────────────────────────────
  status: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ ctx, input }) => {
      const compilation = await ctx.prisma.compilation.findFirst({
        where: {
          id: input.jobId,
          project: { userId: ctx.session.user.id },
        },
      });
      if (!compilation) throw new TRPCError({ code: "NOT_FOUND" });
      return compilation;
    }),

  // ── List compilation history for a project ──────────────────────────────
  history: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.compilation.findMany({
        where: { projectId: input.projectId },
        orderBy: { startedAt: "desc" },
        take: 20,
      });
    }),
});
