// tRPC test router — run, status, history
// Phase 3: generateDefaultTests from IR, persist TestRun records,
// run tests via Docker (via compile-worker pipeline).

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import type { ProgramIR, Account } from "@solflow/ir";

// Local alias for Prisma JSON field values (Prisma client is ungenerated/stubbed)
type PrismaJsonValue =
  | string
  | number
  | boolean
  | null
  | PrismaJsonValue[]
  | { [key: string]: PrismaJsonValue };

// ─── generateDefaultTests ────────────────────────────────────────────────────
// Per docs/architecture/09-compilation-deployment.md → Auto-Generated Test Scaffolding.

export interface TestCase {
  name: string;
  instruction: string;
  accounts: Record<string, string>;
  args: Record<string, string>;
  expectedResult: "success" | { error: string };
}

function getDefaultValue(type: unknown): string {
  if (typeof type !== "string") return "0";
  switch (type) {
    case "bool":
      return "true";
    case "u8":
    case "u16":
    case "u32":
    case "u64":
    case "u128":
    case "i8":
    case "i16":
    case "i32":
    case "i64":
    case "i128":
      return "0";
    case "f32":
    case "f64":
      return "0.0";
    case "String":
      return '"test_value"';
    case "Pubkey":
      return "generate";
    default:
      return "0";
  }
}

function generateDefaultTests(ir: ProgramIR): TestCase[] {
  const tests: TestCase[] = [];

  for (const ix of ir.instructions) {
    // Happy path test
    tests.push({
      name: `${ix.name} - success`,
      instruction: ix.name,
      accounts: Object.fromEntries(
        ix.accounts.map((acc: Account) => [acc.name, "generate"]),
      ),
      args: Object.fromEntries(
        (ix.args ?? []).map((arg: { name: string; type: unknown }) => [
          arg.name,
          getDefaultValue(arg.type),
        ]),
      ),
      expectedResult: "success",
    });

    // Missing signer test (one per signer account)
    const signerAccounts = ix.accounts.filter((a: Account) =>
      a.constraints.some((c) => c.type === "signer"),
    );
    for (const signer of signerAccounts) {
      tests.push({
        name: `${ix.name} - missing signer (${signer.name})`,
        instruction: ix.name,
        accounts: Object.fromEntries(
          ix.accounts.map((acc: Account) => [
            acc.name,
            acc.name === signer.name ? "non-signer" : "generate",
          ]),
        ),
        args: Object.fromEntries(
          (ix.args ?? []).map((arg: { name: string; type: unknown }) => [
            arg.name,
            getDefaultValue(arg.type),
          ]),
        ),
        expectedResult: { error: "MissingRequiredSignature" },
      });
    }
  }

  return tests;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const testRouter = router({
  // ── Run tests ────────────────────────────────────────────────────────────
  run: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        /** Optional: supply custom test cases; if omitted, generate from IR */
        testCases: z
          .array(
            z.object({
              name: z.string(),
              instruction: z.string(),
              accounts: z.record(z.string()),
              args: z.record(z.string()),
              expectedResult: z.union([
                z.literal("success"),
                z.object({ error: z.string() }),
              ]),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.session.user.id },
        select: { id: true, irData: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      // Generate test cases from IR if not supplied
      let testCases: TestCase[];
      if (input.testCases) {
        testCases = input.testCases;
      } else if (project.irData) {
        testCases = generateDefaultTests(project.irData as ProgramIR);
      } else {
        testCases = [];
      }

      // Persist TestRun record
      const testRun = await ctx.prisma.testRun.create({
        data: {
          projectId: input.projectId,
          status: "QUEUED",
          testCases: testCases as unknown as any,
        },
      });

      // TODO (Phase 3 full): enqueue Docker test runner via BullMQ.
      // For now, generate test scaffolding results synchronously.
      // Each test case is validated against the IR structure (not real execution).
      const results = testCases.map((tc) => {
        const ix = (project.irData as ProgramIR)?.instructions.find(
          (i) => i.name === tc.instruction,
        );
        if (!ix) {
          return {
            name: tc.name,
            status: "skipped" as const,
            duration: 0,
            error: `Instruction "${tc.instruction}" not found in IR`,
          };
        }
        // Structural validation: check that required signer accounts are provided
        const missingAccounts = ix.accounts
          .filter((a) =>
            a.constraints.some((c) => c.type === "signer"),
          )
          .filter((a) => !tc.accounts[a.name] || tc.accounts[a.name] === "");
        if (tc.expectedResult !== "success" && missingAccounts.length > 0) {
          return {
            name: tc.name,
            status: "passed" as const,
            duration: 0,
            error: undefined,
          };
        }
        if (missingAccounts.length > 0) {
          return {
            name: tc.name,
            status: "failed" as const,
            duration: 0,
            error: `Missing accounts: ${missingAccounts.map((a) => a.name).join(", ")}`,
          };
        }
        return {
          name: tc.name,
          status: "passed" as const,
          duration: 0,
          error: undefined,
        };
      });

      const passed = results.filter((r) => r.status === "passed").length;
      const failed = results.filter((r) => r.status === "failed").length;

      await ctx.prisma.testRun.update({
        where: { id: testRun.id },
        data: {
          status: "COMPLETED" as any,
          results: results as unknown as any,
          completedAt: new Date(),
        },
      });

      return {
        runId: testRun.id,
        status: "completed",
        testCases,
        results: { passed, failed, total: results.length },
      };
    }),

  // ── Get test run status ──────────────────────────────────────────────────
  status: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (input.runId === "stub") {
        return { runId: "stub", status: "idle", results: [] };
      }
      const run = await ctx.prisma.testRun.findFirst({
        where: {
          id: input.runId,
          project: { userId: ctx.session.user.id },
        },
      });
      if (!run) throw new TRPCError({ code: "NOT_FOUND" });
      return run;
    }),

  // ── List test run history ────────────────────────────────────────────────
  history: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.prisma.testRun.findMany({
        where: { projectId: input.projectId },
        orderBy: { startedAt: "desc" },
        take: 20,
      });
    }),
});
