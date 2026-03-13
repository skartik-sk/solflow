// apps/web/src/server/compile-worker/docker-runner.ts
// Spawns an isolated Docker container to compile Anchor/Pinocchio programs.
// Per docs/architecture/09-compilation-deployment.md → Backend Compilation Steps.
//
// SERVER ONLY.

import { spawn } from "child_process";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import type { ProgramIR } from "@solflow/ir";
import { generateCode } from "@solflow/codegen";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DockerBuildInput {
  ir: ProgramIR;
  framework: "ANCHOR" | "PINOCCHIO";
  irHash: string;
  options: {
    release: boolean;
    verifiable: boolean;
    targetNetwork: "devnet" | "mainnet" | "localnet";
  };
}

export interface DockerBuildResult {
  success: boolean;
  logs: string[];
  errors: string[];
  warnings: string[];
  workDir: string;
  duration: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Write generated source files to a temp directory and return its path. */
async function createTempProject(
  ir: ProgramIR,
  framework: "ANCHOR" | "PINOCCHIO",
): Promise<string> {
  const dir = join(tmpdir(), `solflow-${randomBytes(8).toString("hex")}`);
  await mkdir(dir, { recursive: true });

  const generatedFramework = framework === "ANCHOR" ? "anchor" : "pinocchio";
  const generated = generateCode(ir, generatedFramework);

  for (const file of generated.files) {
    const fullPath = join(dir, file.path);
    const fileDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    await mkdir(fileDir, { recursive: true });
    await writeFile(fullPath, file.content, "utf8");
  }

  return dir;
}

/** Parse rustc/anchor error lines from log output. */
function parseErrors(logs: string[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const line of logs) {
    if (/^error(\[E\d+\])?:/.test(line)) errors.push(line.trim());
    else if (/^warning(\[.*\])?:/.test(line)) warnings.push(line.trim());
  }

  return { errors, warnings };
}

// ─── Main runner ──────────────────────────────────────────────────────────────

/**
 * Run the compiler Docker container synchronously and stream logs via callback.
 */
export async function runDockerBuild(
  input: DockerBuildInput,
  onLog: (line: string, level: "info" | "warn" | "error") => void,
): Promise<DockerBuildResult> {
  const startedAt = Date.now();
  const logs: string[] = [];

  const workDir = await createTempProject(input.ir, input.framework);
  onLog(`Source files written to ${workDir}`, "info");

  const buildCmd =
    input.framework === "ANCHOR" ? "anchor build" : "cargo build-sbf --release";

  // Docker run arguments per spec:
  //   --rm           — remove container after run
  //   --memory=2g    — resource limits
  //   --cpus=2
  //   --network=none — isolated during build
  //   -v <workDir>   — mount source dir read-write
  const dockerArgs = [
    "run",
    "--rm",
    "--memory=2g",
    "--cpus=2",
    "--network=none",
    "-v",
    `${workDir}:/home/builder/project`,
    "solflow-compiler:latest",
    "/bin/sh",
    "-c",
    buildCmd,
  ];

  return new Promise<DockerBuildResult>((resolve) => {
    const proc = spawn("docker", dockerArgs, { cwd: workDir });

    const appendLog = (
      data: Buffer,
      level: "info" | "warn" | "error" = "info",
    ) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        logs.push(line);
        const lv = /^error/.test(line)
          ? "error"
          : /^warning/.test(line)
            ? "warn"
            : level;
        onLog(line, lv);
      }
    };

    proc.stdout.on("data", (d: Buffer) => appendLog(d, "info"));
    proc.stderr.on("data", (d: Buffer) => appendLog(d, "warn"));

    proc.on("close", async (code) => {
      const duration = Date.now() - startedAt;
      const { errors, warnings } = parseErrors(logs);
      const success = code === 0;

      if (!success) {
        // Clean up on failure
        await rm(workDir, { recursive: true, force: true }).catch(
          () => undefined,
        );
        resolve({
          success: false,
          logs,
          errors,
          warnings,
          workDir: "",
          duration,
        });
      } else {
        resolve({
          success: true,
          logs,
          errors: [],
          warnings,
          workDir,
          duration,
        });
      }
    });

    proc.on("error", async (err) => {
      const duration = Date.now() - startedAt;
      onLog(`Docker spawn error: ${err.message}`, "error");
      await rm(workDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
      resolve({
        success: false,
        logs,
        errors: [err.message],
        warnings: [],
        workDir: "",
        duration,
      });
    });
  });
}
