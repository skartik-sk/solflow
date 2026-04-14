// apps/web/src/server/compile-worker/queue.ts
// BullMQ queue + worker for compilation jobs.
// Per docs/architecture/09-compilation-deployment.md → Job Queue System.
//
// SERVER ONLY — never import from client components.

import { Queue, Worker, type Job } from "bullmq";
import type { ProgramIR } from "@solflow/ir";
import { generateCode } from "@solflow/codegen";
import { runDockerBuild } from "./docker-runner";
import { collectArtifacts } from "./artifact-collector";
import { broadcastToJob } from "@/lib/ws-broadcaster";
import { prisma } from "@solflow/db";

// Local alias for Prisma JSON field values (Prisma client is ungenerated/stubbed)
type PrismaJsonValue =
  | string
  | number
  | boolean
  | null
  | PrismaJsonValue[]
  | { [key: string]: PrismaJsonValue };

/** Cast for Prisma JSON fields that have incompatible generated types.
 *  Uses `any` to bridge PrismaJsonValue (includes null) → InputJsonValue (excludes null). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asPrismaJson<T>(value: T): any {
  return value;
}

// ─── Redis connection config ──────────────────────────────────────────────────
// Pass a plain connection object to BullMQ — avoids the ioredis version
// conflict that arises when sharing a Redis instance across two different
// ioredis installs (apps/web's and BullMQ's bundled one).

function getConnectionConfig(): { host: string; port: number } {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "localhost",
      port: parseInt(parsed.port || "6379", 10),
    };
  } catch {
    return { host: "localhost", port: 6379 };
  }
}

// ─── Queue ────────────────────────────────────────────────────────────────────

export interface CompileJobData {
  compilationId: string;
  projectId: string;
  ir: ProgramIR;
  framework: "ANCHOR" | "PINOCCHIO" | "QUASAR";
  irHash: string;
  options: {
    release: boolean;
    verifiable: boolean;
    targetNetwork: "devnet" | "mainnet" | "localnet";
  };
}

let _compileQueue: Queue<CompileJobData> | undefined;

export function getCompileQueue(): Queue<CompileJobData> {
  if (!_compileQueue) {
    _compileQueue = new Queue<CompileJobData>("compile", {
      connection: getConnectionConfig(),
      defaultJobOptions: {
        attempts: 1, // No retries for compilation
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });
  }
  return _compileQueue;
}

/**
 * Enqueue a compilation job and return the BullMQ job ID.
 */
export async function queueCompilation(data: CompileJobData): Promise<string> {
  const queue = getCompileQueue();
  const job = await queue.add("compile", data, {
    jobId: data.compilationId, // Use DB id as job id for easy lookup
  });
  return job.id ?? data.compilationId;
}

// ─── Worker ───────────────────────────────────────────────────────────────────

let _worker: Worker<CompileJobData> | null = null;

export function startCompileWorker(): void {
  if (_worker) return; // Already running

  _worker = new Worker<CompileJobData>(
    "compile",
    async (job: Job<CompileJobData>) => {
      const { compilationId, projectId, ir, framework, irHash, options } =
        job.data;

      const log = (line: string, level: "info" | "warn" | "error" = "info") => {
        broadcastToJob(compilationId, {
          type: "build-log",
          jobId: compilationId,
          data: { line, level },
        });
      };

      // Mark as building
      await prisma.compilation.update({
        where: { id: compilationId },
        data: { status: "BUILDING" },
      });

      log(`Starting ${framework} compilation for project ${projectId}…`);

      try {
        // Generate code once for the queue worker (separate from compile.ts path)
        const genFramework = framework === "ANCHOR" ? "anchor" : framework === "QUASAR" ? "quasar" : "pinocchio";
        const generated = generateCode(ir, genFramework);
        if (generated.errors.length > 0) {
          throw new Error(generated.errors.map((e) => e.message).join("; "));
        }

        const result = await runDockerBuild(
          { ir, framework, options, irHash, generatedFiles: generated.files },
          (line, level) => log(line, level),
        );

        if (result.success) {
          const artifacts = await collectArtifacts(result.workDir, framework);

          await prisma.compilation.update({
            where: { id: compilationId },
            data: {
              status: "SUCCESS",
              logs: result.logs.join("\n"),
              warnings: asPrismaJson(result.warnings),
              binaryUrl: artifacts.binaryPath,
              binarySize: artifacts.binarySize,
              idlData:
                asPrismaJson(artifacts.idl) ?? undefined,
              completedAt: new Date(),
              duration: result.duration,
            },
          });

          broadcastToJob(compilationId, {
            type: "build-complete",
            jobId: compilationId,
            data: {
              success: true,
              binarySize: artifacts.binarySize,
              warnings: result.warnings,
            },
          });

          log(
            `Compilation succeeded — binary size: ${artifacts.binarySize} bytes`,
            "info",
          );
        } else {
          await prisma.compilation.update({
            where: { id: compilationId },
            data: {
              status: "FAILED",
              logs: result.logs.join("\n"),
              errors: asPrismaJson(result.errors),
              completedAt: new Date(),
              duration: result.duration,
            },
          });

          broadcastToJob(compilationId, {
            type: "build-complete",
            jobId: compilationId,
            data: { success: false, errors: result.errors },
          });

          log(`Compilation failed — ${result.errors.length} error(s)`, "error");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await prisma.compilation.update({
          where: { id: compilationId },
          data: {
            status: "FAILED",
            errors: asPrismaJson([msg]),
            completedAt: new Date(),
          },
        });

        broadcastToJob(compilationId, {
          type: "build-complete",
          jobId: compilationId,
          data: { success: false, errors: [msg] },
        });

        throw err;
      }
    },
    {
      connection: getConnectionConfig(),
      concurrency: 3,
      lockDuration: 10 * 60_000, // 10 min — matches Docker timeout
    },
  );

  _worker.on("failed", (job, err) => {
    console.error(`[compile-worker] Job ${job?.id} failed:`, err);
  });
}

/**
 * Gracefully stop the compile worker. Waits for current jobs to finish.
 */
export async function stopCompileWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
}
