// tRPC test router — run, status, history
// Phase 3: generateDefaultTests from IR, persist TestRun records,
// run tests via Docker (via compile-worker pipeline).

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { flowToIR } from "@solflow/ir";
import { generateCode } from "@solflow/codegen";
import type { ProgramIR } from "@solflow/ir";
import type { Node, Edge } from "@xyflow/react";
import { broadcastToJob } from "@/lib/ws-broadcaster";
import { runGeneratedProjectTests } from "@/server/test-runner/local-test-runner";
import type { GeneratedTestRuntime } from "@/server/test-runner/local-test-runner";
import {
  isGitHubActionsConfigured,
  startGitHubActionsJob,
  pollGitHubActionsJob,
  encodeGhHandle,
  decodeGhHandle,
  fetchTestOutcome,
  deleteJobBranch,
} from "@/server/compile-worker/gh-actions-runner";
import { validateIrForBuild } from "@/server/ir-guard";
import { JOB_STALE_MS, isStaleJob } from "@/server/jobs/limits";
import { testRunRateLimit } from "@/lib/rate-limit";

// Custom test cases from the editor are not accepted: the generated crate's
// `cargo test` (or Surfpool smoke run) is what actually executes, and it has no
// way to run per-instruction cases yet. Accepting them only to ignore them was
// misleading, so the payload was removed (unknown keys are stripped by zod).

/** Shape returned by both test.run and test.status. */
function runResponse(row: {
  id: string;
  status: string;
  results: unknown;
  summary: unknown;
  logs: string | null;
  duration: number | null;
}) {
  const summary = (row.summary ?? null) as { passed?: number; failed?: number; total?: number; gha?: unknown } | null;
  const pending = row.status === "RUNNING" || row.status === "QUEUED";
  const resultItems = Array.isArray(row.results) ? (row.results as Array<{ name: string; status: "passed" | "failed" | "skipped"; duration: number; error?: string }>) : [];
  const logs = (row.logs ?? "").split("\n").filter(Boolean);
  return {
    runId: row.id,
    pending,
    status: pending ? "running" : row.status === "PASSED" ? "passed" : row.status === "ERROR" ? "error" : "failed",
    results: {
      passed: summary?.passed ?? 0,
      failed: summary?.failed ?? 0,
      total: summary?.total ?? 0,
    },
    resultItems,
    logs,
    errors: logs.filter((l) => l.startsWith("error: ")).map((l) => l.slice(7)),
    warnings: [] as string[],
    runtime: "cargo-smoke" as GeneratedTestRuntime,
    runner: "github-actions",
    command: "cargo test --manifest-path programs/program/Cargo.toml --lib",
    setupCommand: null as string | null,
    duration: row.duration,
  };
}

async function sweepStaleTestRuns(ctx: any, projectId: string) {
  await ctx.prisma.testRun.updateMany({
    where: { projectId, status: { in: ["RUNNING", "QUEUED"] }, startedAt: { lt: new Date(Date.now() - JOB_STALE_MS) } },
    data: {
      status: "FAILED",
      logs: "error: Test run timed out: it did not finish within 20 minutes.",
      summary: { passed: 0, failed: 1, total: 1 } as unknown as any,
      completedAt: new Date(),
    },
  });
}

/** Advance a GitHub Actions test run by one short poll; record the outcome when done. */
async function pollGitHubTest(ctx: any, run: any) {
  const handle = decodeGhHandle((run.summary as { gha?: string } | null)?.gha);
  if (!handle) return run;
  const poll = await pollGitHubActionsJob(handle);
  if (poll.state === "queued" || poll.state === "running") {
    if (poll.handle.runId !== handle.runId) {
      return ctx.prisma.testRun.update({
        where: { id: run.id },
        data: { summary: { gha: encodeGhHandle(poll.handle) } as unknown as any },
      });
    }
    return run;
  }
  const outcome = await fetchTestOutcome(poll.handle.runId!);
  const success = poll.state === "success" && outcome.success;
  const duration = Date.now() - new Date(run.startedAt).getTime();
  const results = [
    {
      name: `${String(run.framework ?? "program").toLowerCase()} cargo smoke test`,
      status: success ? ("passed" as const) : ("failed" as const),
      duration,
      error: success ? undefined : (outcome.errors[0] ?? `GitHub Actions run ended: ${poll.conclusion}`),
    },
  ];
  const res = await ctx.prisma.testRun.updateMany({
    where: { id: run.id, status: "RUNNING" },
    data: {
      status: success ? "PASSED" : "FAILED",
      results: results as unknown as any,
      summary: { passed: success ? 1 : 0, failed: success ? 0 : 1, total: 1 } as unknown as any,
      logs: [
        "Runner: github-actions",
        poll.htmlUrl ? `Run: ${poll.htmlUrl}` : null,
        ...outcome.logs.slice(-400),
        ...outcome.errors.map((e) => `error: ${e}`),
      ]
        .filter(Boolean)
        .join("\n"),
      duration,
      completedAt: new Date(),
    },
  });
  if (res.count > 0) await deleteJobBranch(handle.branch);
  return ctx.prisma.testRun.findUnique({ where: { id: run.id } });
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const testRouter = router({
  // ── Run tests ────────────────────────────────────────────────────────────
  run: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        runtime: z.enum(["cargo-smoke", "surfpool-simnet"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.session.user.id },
        select: { id: true, irData: true, flowData: true, framework: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      const rl = testRunRateLimit(ctx.session.user.id!);
      if (!rl.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Test rate limit exceeded. Try again in ${Math.ceil((rl.resetAt - Date.now()) / 1000)}s.`,
        });
      }
      await sweepStaleTestRuns(ctx, project.id);

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

      const guard = validateIrForBuild(irData);
      if (!guard.ok) throw new TRPCError({ code: "BAD_REQUEST", message: guard.message });

      // Persist TestRun record
      const testRun = await ctx.prisma.testRun.create({
        data: {
          projectId: input.projectId,
          status: "RUNNING",
          testCases: [] as unknown as any,
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
          pending: false,
          status: "error",
          results: { passed: 0, failed: 1, total: 1 },
          resultItems: results,
          logs: [results[0].error],
        };
      }

      // In production (Vercel) trigger the GitHub Actions test runner and return;
      // the client polls test.status. Local dev (no GITHUB_TOKEN) runs cargo inline.
      if (isGitHubActionsConfigured()) {
        try {
          const handle = await startGitHubActionsJob("test", generated.files);
          const row = await ctx.prisma.testRun.update({
            where: { id: testRun.id },
            data: {
              summary: { gha: encodeGhHandle(handle) } as unknown as any,
              logs: `Runner: github-actions\n[gh-actions] pushed ${handle.branch}, waiting for a runner…`,
            },
          });
          return runResponse(row);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const row = await ctx.prisma.testRun.update({
            where: { id: testRun.id },
            data: {
              status: "ERROR",
              summary: { passed: 0, failed: 1, total: 1 } as unknown as any,
              logs: `error: ${msg}`,
              completedAt: new Date(),
            },
          });
          return runResponse(row);
        }
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
        pending: false,
        status: runResult.success ? "passed" : "failed",
        results: summary,
        resultItems: results,
        logs: runResult.logs,
        runtime: runResult.runtime as GeneratedTestRuntime,
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
      if (run.status !== "RUNNING" && run.status !== "QUEUED") return runResponse(run);

      if (isStaleJob(run.startedAt)) {
        await sweepStaleTestRuns(ctx, run.projectId);
      } else {
        try {
          const project = await ctx.prisma.project.findUnique({
            where: { id: run.projectId },
            select: { framework: true },
          });
          await pollGitHubTest(ctx, { ...run, framework: project?.framework });
        } catch (err) {
          console.warn("[test] GitHub poll failed:", err instanceof Error ? err.message : err);
        }
      }
      const latest = await ctx.prisma.testRun.findUnique({ where: { id: run.id } });
      return runResponse(latest ?? run);
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
      await sweepStaleTestRuns(ctx, project.id);
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
