// tRPC test router — run, status, history
// Phase 3: generateDefaultTests from IR, persist TestRun records,
// run tests via Docker (via compile-worker pipeline).

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { flowToIR } from "@solflow/ir";
import { generateCode } from "@solflow/codegen";
import type { ProgramIR, Account } from "@solflow/ir";
import type { Node, Edge } from "@xyflow/react";
import { broadcastToJob } from "@/lib/ws-broadcaster";
import { runGeneratedProjectTests } from "@/server/test-runner/local-test-runner";
import type { GeneratedTestRuntime } from "@/server/test-runner/local-test-runner";

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
        runtime: z.enum(["cargo-smoke", "surfpool-simnet"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.session.user.id },
        select: { id: true, irData: true, flowData: true, framework: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      let irData = project.irData as ProgramIR | null;
      if (!irData && project.flowData) {
        try {
          const fd = project.flowData as unknown as { nodes: Node[]; edges: Edge[] };
          irData = flowToIR(fd.nodes, fd.edges);
          await ctx.prisma.project.update({
            where: { id: project.id },
            data: { irData: irData as unknown as any },
          });
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `IR generation failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      if (!irData) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Project has no IR or flow data. Add a Program node with at least one connected Instruction.",
        });
      }

      // Generate test cases from IR if not supplied
      let testCases: TestCase[];
      if (input.testCases) {
        testCases = input.testCases;
      } else if (irData) {
        testCases = generateDefaultTests(irData);
      } else {
        testCases = [];
      }

      // Persist TestRun record
      const testRun = await ctx.prisma.testRun.create({
        data: {
          projectId: input.projectId,
          status: "RUNNING",
          testCases: testCases as unknown as any,
        },
      });

      const framework = project.framework as "ANCHOR" | "PINOCCHIO" | "QUASAR";
      const codegenFramework = framework.toLowerCase() as
        | "anchor"
        | "pinocchio"
        | "quasar";
      const generated = generateCode(irData, codegenFramework);

      if (generated.errors.length > 0) {
        const results = [
          {
            name: `${codegenFramework} code generation`,
            status: "failed" as const,
            duration: 0,
            error: generated.errors.map((error) => error.message).join("; "),
          },
        ];
        await ctx.prisma.testRun.update({
          where: { id: testRun.id },
          data: {
            status: "ERROR" as any,
            results: results as unknown as any,
            summary: { passed: 0, failed: 1, total: 1 } as unknown as any,
            logs: results[0].error,
            completedAt: new Date(),
            duration: 0,
          },
        });
        return {
          runId: testRun.id,
          status: "error",
          testCases,
          results: { passed: 0, failed: 1, total: 1 },
          resultItems: results,
          logs: [results[0].error],
        };
      }

      const runResult = await runGeneratedProjectTests({
        framework,
        programName: irData.program.name,
        files: generated.files,
        runtime: input.runtime ?? getDefaultGeneratedTestRuntime(),
      });

      const results = [
        {
          name: `${codegenFramework} ${runResult.runtime === "surfpool-simnet" ? "Surfpool Simnet test" : "cargo smoke test"}`,
          status: runResult.success ? ("passed" as const) : ("failed" as const),
          duration: runResult.duration,
          error: runResult.errors[0],
        },
      ];

      const passed = results.filter((r) => r.status === "passed").length;
      const failed = results.filter((r) => r.status === "failed").length;
      const summary = { passed, failed, total: results.length };

      await ctx.prisma.testRun.update({
        where: { id: testRun.id },
        data: {
          status: runResult.status as any,
          results: results as unknown as any,
          summary: summary as unknown as any,
          logs: [
            `Runner: ${runResult.runner}`,
            `Runtime: ${runResult.runtime}`,
            runResult.setupCommand ? `Setup: ${runResult.setupCommand}` : null,
            `Command: ${runResult.command}`,
            ...runResult.logs,
            ...runResult.errors.map((error) => `error: ${error}`),
            ...runResult.warnings.map((warning) => `warning: ${warning}`),
          ].filter(Boolean).join("\n"),
          duration: runResult.duration,
          completedAt: new Date(),
        },
      });

      try {
        for (const result of results) {
          broadcastToJob(testRun.id, {
            type: "test-result",
            jobId: testRun.id,
            data: {
              test: result.name,
              passed: result.status === "passed",
              time: result.duration,
              error: result.error,
            },
          });
        }
        broadcastToJob(testRun.id, {
          type: "test-complete",
          jobId: testRun.id,
          data: { ...summary, duration: runResult.duration },
        });
      } catch {
        // WebSocket server is optional in tests and serverless previews.
      }

      return {
        runId: testRun.id,
        status: runResult.success ? "passed" : "failed",
        testCases,
        results: summary,
        resultItems: results,
        logs: runResult.logs,
        runtime: runResult.runtime,
        runner: runResult.runner,
        command: runResult.command,
        setupCommand: runResult.setupCommand,
        duration: runResult.duration,
        workDir: runResult.workDir,
        errors: runResult.errors,
        warnings: runResult.warnings,
      };
    }),

  // ── Get test run status ──────────────────────────────────────────────────
  status: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ ctx, input }) => {
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

function getDefaultGeneratedTestRuntime(): GeneratedTestRuntime {
  return process.env.SOLFLOW_TEST_RUNTIME === "surfpool-simnet"
    ? "surfpool-simnet"
    : "cargo-smoke";
}
