// tRPC project router — CRUD + save + generateCode + export
// Per docs/architecture/17-api-design.md → Project Router section.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { flowToIR } from "@solflow/ir";
import { generateCode } from "@solflow/codegen";
import type { Node, Edge } from "@xyflow/react";
import { createHash } from "crypto";
import { Keypair } from "@solana/web3.js";
import { encodeSecretKey } from "@/server/secret-key-crypto";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createDefaultFlow(programPublicKey: string) {
  const ts = Date.now();

  const programId = `program-${ts}`;
  const instrId = `instruction-${ts}`;
  const accountId = `account-${ts}`;
  const stateId = `state-${ts}`;
  const logicId = `logic-${ts}`;
  const authorityId = `authority-${ts}`;
  const systemProgramId = `system-program-${ts}`;

  return {
    nodes: [
      {
        id: programId,
        type: "program",
        position: { x: 300, y: 50 },
        data: {
          name: "my_program",
          version: "0.1.0",
          description: "My first Anchor program",
          license: "MIT",
          programId: programPublicKey,
        },
      },
      {
        id: instrId,
        type: "instruction",
        position: { x: 300, y: 220 },
        data: {
          name: "initialize",
          description: "Initialize the program state",
          args: [],
          accessControl: "none",
        },
      },
      {
        id: accountId,
        type: "account",
        position: { x: 120, y: 420 },
        data: {
          name: "state_account",
          accountType: "account",
          isMut: true,
          isSigner: false,
          isInit: true,
          isClose: false,
        },
      },
      {
        id: authorityId,
        type: "account",
        position: { x: 300, y: 420 },
        data: {
          name: "authority",
          accountType: "signer",
          isMut: false,
          isSigner: true,
          isInit: false,
          isClose: false,
        },
      },
      {
        id: systemProgramId,
        type: "account",
        position: { x: 480, y: 420 },
        data: {
          name: "system_program",
          accountType: "system-program",
          isMut: false,
          isSigner: false,
          isInit: false,
          isClose: false,
        },
      },
      {
        id: stateId,
        type: "state",
        position: { x: 120, y: 600 },
        data: {
          name: "ProgramState",
          fields: [
            { name: "authority", type: "Pubkey" },
            { name: "count", type: "u64" },
          ],
          isZeroCopy: false,
        },
      },
      {
        id: logicId,
        type: "logic",
        position: { x: 300, y: 340 },
        data: {
          logicType: "set-field",
          order: 0,
          operation: {
            type: "set-field",
            account: "state_account",
            field: "count",
            value: "0",
          },
        },
      },
    ],
    edges: [
      {
        id: `e-${programId}-${instrId}`,
        source: programId,
        target: instrId,
        sourceHandle: "instruction-out",
        targetHandle: "instruction-in",
        type: "smoothstep",
        animated: true,
      },
      {
        id: `e-${instrId}-${accountId}`,
        source: instrId,
        target: accountId,
        sourceHandle: "account-out",
        targetHandle: "account-in",
        type: "smoothstep",
        animated: true,
      },
      {
        id: `e-${instrId}-${authorityId}`,
        source: instrId,
        target: authorityId,
        sourceHandle: "account-out",
        targetHandle: "account-in",
        type: "smoothstep",
        animated: true,
      },
      {
        id: `e-${instrId}-${systemProgramId}`,
        source: instrId,
        target: systemProgramId,
        sourceHandle: "account-out",
        targetHandle: "account-in",
        type: "smoothstep",
        animated: true,
      },
      {
        id: `e-${instrId}-${logicId}`,
        source: instrId,
        target: logicId,
        sourceHandle: "logic-out",
        targetHandle: "logic-in",
        type: "smoothstep",
        animated: true,
      },
      {
        id: `e-${stateId}-${accountId}`,
        source: stateId,
        target: accountId,
        sourceHandle: "data-out",
        targetHandle: "data-in",
        type: "smoothstep",
        animated: true,
      },
    ],
  };
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
        framework: z.enum(["ANCHOR", "PINOCCHIO", "QUASAR"]).optional(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const projects = await ctx.prisma.project.findMany({
        where: {
          userId: ctx.session.user.id!,
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
      const {
        programKeypair: _programKeypair,
        deployments,
        ...safeProject
      } = project;
      return {
        ...safeProject,
        deployments: deployments.map(
          ({ programKeypair: _deploymentKeypair, ...deployment }) => deployment,
        ),
      };
    }),

  // ── Create new project (optionally fork from marketplace template) ───────
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        framework: z.enum(["ANCHOR", "PINOCCHIO", "QUASAR"]),
        templateId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const programKp = Keypair.generate();
      const programPublicKey = programKp.publicKey.toBase58();
      const programSecretKey = encodeSecretKey(programKp.secretKey);

      let initialFlowData: Record<string, unknown> =
        createDefaultFlow(programPublicKey);
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
          userId: ctx.session.user.id!,
          flowData: initialFlowData as any,
          programKeypair: programSecretKey,
          ...(forkedFrom && { forkedFrom }),
        },
      });

      const { programKeypair: _programKeypair, ...safeProject } = project;
      return safeProject;
    }),

  // ── Save flow state + optional snapshot ─────────────────────────────────
  save: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        flowData: z.object({
          nodes: z.array(z.any()),
          edges: z.array(z.any()),
        }),
        framework: z.enum(["ANCHOR", "PINOCCHIO", "QUASAR"]).optional(),
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
      let irError: string | null = null;
      try {
        irData = flowToIR(
          input.flowData.nodes as Node[],
          input.flowData.edges as Edge[],
        );
      } catch (err) {
        irError = err instanceof Error ? err.message : "IR generation failed";
        // Non-fatal: save flow even if IR fails, but report the error
      }

      await ctx.prisma.project.update({
        where: { id: input.id },
        data: {
          flowData: input.flowData as any,
          irData: irData as any,
          ...(input.framework && { framework: input.framework }),
          ...(input.name && { name: input.name }),
        },
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
            flowData: input.flowData as any,
            irData: irData as any,
            flowHash: createHash("sha256").update(JSON.stringify(input.flowData)).digest("hex").slice(0, 16),
          },
        });
      }

      return { success: true, irError };
    }),

  // ── Update project metadata ──────────────────────────────────────────────
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        framework: z.enum(["ANCHOR", "PINOCCHIO", "QUASAR"]).optional(),
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
      const project = await ctx.prisma.project.update({ where: { id }, data });
      const { programKeypair: _programKeypair, ...safeProject } = project;
      return safeProject;
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
        framework: z.enum(["anchor", "pinocchio", "quasar"]),
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
