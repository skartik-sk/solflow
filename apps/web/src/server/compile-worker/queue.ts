// apps/web/src/server/compile-worker/queue.ts
// BullMQ queue + worker for compilation jobs.
// Per docs/architecture/09-compilation-deployment.md → Job Queue System.
//
// SERVER ONLY — never import from client components.

import { Queue, Worker, type Job } from "bullmq";
import type { ProgramIR } from "@solflow/ir";
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
  framework: "ANCHOR" | "PINOCCHIO";
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
        const result = await runDockerBuild(
          { ir, framework, options, irHash },
          (line, level) => log(line, level),
        );

        if (result.success) {
          const artifacts = await collectArtifacts(result.workDir, framework);

          await prisma.compilation.update({
            where: { id: compilationId },
            data: {
              status: "SUCCESS",
              logs: result.logs.join("\n"),
              warnings: result.warnings as unknown as PrismaJsonValue,
              binaryUrl: artifacts.binaryPath,
              binarySize: artifacts.binarySize,
              idlData:
                (artifacts.idl as unknown as PrismaJsonValue) ?? undefined,
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
              errors: result.errors as unknown as PrismaJsonValue,
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
            errors: [msg] as unknown as PrismaJsonValue,
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
    },
  );

  _worker.on("failed", (job, err) => {
    console.error(`[compile-worker] Job ${job?.id} failed:`, err);
  });
}
