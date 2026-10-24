// tRPC compile router — start, status, history
// Per docs/architecture/17-api-design.md → Compile Router.
// Phase 3: enqueues real BullMQ jobs; streams logs via WebSocket.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createHash } from "crypto";
import { rm, mkdir, copyFile, readFile } from "fs/promises";
import { join, resolve } from "path";
import { router, protectedProcedure } from "../trpc";
import { browserCompileRateLimit, compileRateLimit } from "@/lib/rate-limit";
import { flowToIR } from "@solflow/ir";
import { generateCode } from "@solflow/codegen";
import type { Node, Edge } from "@xyflow/react";
import { compileWithStrategy } from "@/server/compile-worker/compiler-strategy";
import { broadcastToJob } from "@/lib/ws-broadcaster";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Compute a deterministic SHA-256 hash of the IR JSON string (server-side). */
function hashIR(irJson: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(irJson))
    .digest("hex")
    .slice(0, 16);
}

/** Load a project's IR (regenerating it from the flow if needed) and open a BUILDING record. */
async function startBuild(ctx: any, projectId: string, where: "server" | "browser" = "server") {
  const project = await ctx.prisma.project.findFirst({
    where: { id: projectId, userId: ctx.session.user.id },
    select: { id: true, irData: true, framework: true, flowData: true },
  });
  if (!project) throw new TRPCError({ code: "NOT_FOUND" });

  // Regenerate IR from flow data if irData is missing
  let irData = project.irData;
  if (!irData && project.flowData) {
    try {
      const fd = project.flowData as unknown as { nodes: Node[]; edges: Edge[] };
      const ir = flowToIR(fd.nodes, fd.edges);
      irData = ir as unknown as typeof irData;
      // Persist the regenerated IR
      await ctx.prisma.project.update({
        where: { id: project.id },
        data: { irData: ir as unknown as any },
      });
    } catch (irErr) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `IR generation failed: ${irErr instanceof Error ? irErr.message : String(irErr)}`,
      });
    }
  }

  if (!irData) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Project has no flow data. Add a Program node with at least one connected Instruction.",
    });
  }

  // Rate limit: server builds are expensive; browser builds only cost codegen and a DB row.
  const userKey = ctx.session.user.id ?? "anonymous";
  const rl = where === "browser" ? browserCompileRateLimit(userKey) : compileRateLimit(userKey);
  if (!rl.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Compile rate limit exceeded. Try again in ${Math.ceil((rl.resetAt - Date.now()) / 1000)}s.`,
    });
  }

  const irHash = hashIR(irData);
  const framework = (project.framework?.toLowerCase() ?? "anchor") as
    | "anchor"
    | "pinocchio"
    | "quasar";

  // Create compilation record as BUILDING
  const compilation = await ctx.prisma.compilation.create({
    data: {
      projectId,
      status: "BUILDING",
      framework: project.framework,
      irHash,
    },
  });
  return { project, irData, irHash, framework, compilation };
}

async function saveGeneratedCode(ctx: any, projectId: string, files: { path: string; content: string }[]) {
  const generatedCode = files
    .map((f) => `// ─── ${f.path} ───────────────────────────\n${f.content}`)
    .join("\n\n");
  await ctx.prisma.project.update({
    where: { id: projectId },
    data: { generatedCode: generatedCode as any },
  });
}

// A deployable sBPF program: 64-bit little-endian ELF for EM_BPF (0xf7), at most 1 MiB.
function isSbpfProgram(bytes: Buffer): boolean {
  return (
    bytes.length > 64 &&
    bytes.length <= 1024 * 1024 &&
    bytes.readUInt32BE(0) === 0x7f454c46 &&
    bytes[4] === 2 &&
    bytes[5] === 1 &&
    bytes.readUInt16LE(18) === 0xf7
  );
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
      const { project, irData, irHash, framework, compilation } = await startBuild(ctx, input.projectId);

      try {
        // Step 1: Generate Rust source from IR
        const result = generateCode(irData as any, framework);
        if (result.errors.length > 0) {
          throw new Error(result.errors.map((e) => e.message).join("; "));
        }

        const codegenWarnings = result.warnings.map((w) => w.message);
        await saveGeneratedCode(ctx, input.projectId, result.files);

        // Step 2: Compile using best available method (WASM → Local CLI → codegen only)
        let buildLogs: string[] = [`Code generation — ${result.files.length} file(s)`];
        const buildWarnings = [...codegenWarnings];
        let buildErrors: string[] = [];
        let binarySize: number | null = null;
        let binaryPath: string | null = null;
        let binaryBytes: Buffer | null = null;
        let compileMethod: string = "codegen-only";

        try {
          const buildResult = await compileWithStrategy(
            {
              ir: irData as any,
              framework: project.framework,
              irHash,
              generatedFiles: result.files,
              options: {
                release: input.release,
                verifiable: input.verifiable,
                targetNetwork: input.targetNetwork,
              },
            },
            (line, level) => {
              // Broadcast build logs via WebSocket
              try {
                broadcastToJob(compilation.id, {
                  type: "build-log",
                  jobId: compilation.id,
                  data: { line, level },
                });
              } catch { /* WS not connected */ }
            },
          );

          buildLogs = buildResult.logs;
          buildWarnings.push(...buildResult.warnings);
          binarySize = buildResult.binarySize;
          binaryPath = buildResult.binaryPath;
          compileMethod = buildResult.method;

          if (!buildResult.success) {
            buildErrors = buildResult.errors;
          }

          // Copy binary to a persistent location before cleaning temp dir
          // (deploy step reads it later — cannot be on /tmp which OS may clean)
          if (buildResult.binaryPath && buildResult.workDir) {
            try {
              // Store in .solflow-builds at project root (gitignored, survives restarts)
              const buildStoreDir = resolve(process.cwd(), ".solflow-builds");
              await mkdir(buildStoreDir, { recursive: true });
              const persistentName = `${compilation.id}.so`;
              const persistentPath = join(buildStoreDir, persistentName);
              await copyFile(buildResult.binaryPath, persistentPath);
              binaryPath = persistentPath;
            } catch {
              // If copy fails, keep the original path (temp dir won't be cleaned)
              binaryPath = buildResult.binaryPath;
            }
          }

          // Read the .so bytes NOW (before the temp dir is cleaned) so they can be
          // persisted in the DB. On serverless (Vercel) the filesystem is read-only
          // outside /tmp and each instance has its own ephemeral /tmp, so a file
          // path is useless to the later deploy step — only persisted bytes work.
          if (buildResult.binaryPath) {
            try {
              binaryBytes = await readFile(buildResult.binaryPath);
            } catch {
              binaryBytes = null;
            }
          }

          // Clean up temp directory from build (binary already copied)
          if (buildResult.workDir) {
            await rm(buildResult.workDir, { recursive: true, force: true }).catch(() => undefined);
          }
        } catch {
          // Compilation strategy exhausted — codegen only
          buildLogs.push("No compilation toolchain available — showing generated source only.");
          buildWarnings.push("Install anchor CLI and cargo-build-sbf for compilation, or enable WASM.");
        }

        // Success requires no errors AND an actual binary to deploy
        const hasBinary = !!binaryPath;
        const success = buildErrors.length === 0 && hasBinary;

        if (!hasBinary && buildErrors.length === 0) {
          buildLogs.push("Build exited cleanly but no .so binary was found — cannot deploy.");
          compileMethod = "codegen-only";
        }

        await ctx.prisma.compilation.update({
          where: { id: compilation.id },
          data: {
            status: success ? "SUCCESS" : "FAILED",
            logs: buildLogs.join("\n"),
            ...(buildErrors.length > 0 ? { errors: buildErrors as unknown as any } : {}),
            ...(buildWarnings.length > 0 ? { warnings: buildWarnings as unknown as any } : {}),
            ...(binarySize ? { binarySize } : {}),
            ...(binaryPath ? { binaryUrl: binaryPath } : {}),
            ...(binaryBytes ? { binaryBytes: new Uint8Array(binaryBytes) } : {}),
            completedAt: new Date(),
          },
        });

        if (success) {
          await ctx.prisma.project.update({
            where: { id: input.projectId },
            data: { status: "COMPILED" },
          });
        }

        // Broadcast completion
        try {
          broadcastToJob(compilation.id, {
            type: "build-complete",
            jobId: compilation.id,
            data: {
              success,
              binarySize: binarySize ?? undefined,
              errors: buildErrors.length > 0 ? buildErrors : undefined,
              warnings: buildWarnings.length > 0 ? buildWarnings : undefined,
            },
          });
        } catch { /* WS not connected */ }

        return {
          jobId: compilation.id,
          codeGenerated: true,
          binaryBuilt: success && !!binaryPath,
          fileCount: result.files.length,
          binarySize,
          warnings: buildWarnings.length,
          compileMethod,
          logs: buildLogs,
          errors: buildErrors,
        };
      } catch (err) {
        // Code generation failed — update the original compilation record
        await ctx.prisma.compilation.update({
          where: { id: compilation.id },
          data: {
            status: "FAILED",
            errors: [
              err instanceof Error ? err.message : String(err),
            ] as unknown as any,
            completedAt: new Date(),
          },
        });

        return {
          jobId: compilation.id,
          codeGenerated: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),

  // ── In-browser build: generate source, the client compiles it ───────────
  prepareBrowserBuild: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { project, irData, framework, compilation } = await startBuild(ctx, input.projectId, "browser");
      const result = generateCode(irData as any, framework);
      if (result.errors.length > 0) {
        const message = result.errors.map((e) => e.message).join("; ");
        await ctx.prisma.compilation.update({
          where: { id: compilation.id },
          data: { status: "FAILED", errors: [message] as unknown as any, completedAt: new Date() },
        });
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
      await saveGeneratedCode(ctx, input.projectId, result.files);
      return {
        jobId: compilation.id,
        framework: project.framework,
        files: result.files.map((f) => ({ path: f.path, content: f.content })),
        warnings: result.warnings.map((w) => w.message),
      };
    }),

  // ── In-browser build: store the program the client compiled ─────────────
  completeBrowserBuild: protectedProcedure
    .input(
      z.object({
        jobId: z.string(),
        // base64 sBPF program; ~1.4 MB of base64 covers the 1 MiB program limit
        program: z.string().max(1_500_000).optional(),
        logs: z.array(z.string().max(10_000)).max(500).default([]),
        errors: z.array(z.string().max(20_000)).max(50).default([]),
        durationMs: z.number().int().nonnegative().max(600_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const compilation = await ctx.prisma.compilation.findFirst({
        where: { id: input.jobId, project: { userId: ctx.session.user.id } },
        select: { id: true, projectId: true, status: true },
      });
      if (!compilation) throw new TRPCError({ code: "NOT_FOUND" });
      if (compilation.status !== "BUILDING") {
        throw new TRPCError({ code: "CONFLICT", message: "This build already finished." });
      }

      const program = input.program ? Buffer.from(input.program, "base64") : null;
      if (program && !isSbpfProgram(program)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not a valid Solana program." });
      }
      const success = !!program && input.errors.length === 0;

      await ctx.prisma.compilation.update({
        where: { id: compilation.id },
        data: {
          status: success ? "SUCCESS" : "FAILED",
          logs: input.logs.join("\n"),
          ...(input.errors.length > 0 ? { errors: input.errors as unknown as any } : {}),
          // The bytes live in the DB (serverless); binaryUrl just marks "has a binary" for deploy.
          ...(success
            ? {
                binarySize: program!.length,
                binaryBytes: new Uint8Array(program!),
                binaryUrl: `browser:${compilation.id}.so`,
              }
            : {}),
          ...(input.durationMs !== undefined ? { duration: input.durationMs } : {}),
          completedAt: new Date(),
        },
      });
      if (success) {
        await ctx.prisma.project.update({
          where: { id: compilation.projectId },
          data: { status: "COMPILED" },
        });
      }
      return { jobId: compilation.id, success, binarySize: program?.length ?? null };
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
