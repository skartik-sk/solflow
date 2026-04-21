// apps/web/src/server/compile-worker/docker-runner.ts
// Spawns an isolated Docker container to compile Anchor/Pinocchio/Quasar programs.
//
// SERVER ONLY.

import { spawn } from "child_process";
import { mkdir, writeFile, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import type { ProgramIR } from "@solflow/ir";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DockerBuildInput {
  ir: ProgramIR;
  framework: "ANCHOR" | "PINOCCHIO" | "QUASAR";
  irHash: string;
  generatedFiles: { path: string; content: string }[];
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
  binaryPath: string | null;
  binarySize: number | null;
  idlJson: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Write pre-generated source files to a temp directory and return its path. */
// Shared build directory visible to both the app container and the host Docker daemon.
// When using Docker socket mount, `docker run -v` resolves paths on the HOST,
// so temp dirs inside the app container are invisible. This path must be a
// Docker named volume or host bind-mount that both sides can see.
const BUILD_ROOT = process.env.SOLFLOW_BUILD_DIR || join(tmpdir(), "solflow-builds");

async function createTempProject(
  files: { path: string; content: string }[],
): Promise<string> {
  await mkdir(BUILD_ROOT, { recursive: true });
  const dir = join(BUILD_ROOT, `build-${randomBytes(8).toString("hex")}`);
  await mkdir(dir, { recursive: true });

  for (const file of files) {
    const fullPath = join(dir, file.path);
    const fileDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    await mkdir(fileDir, { recursive: true });
    await writeFile(fullPath, file.content, "utf8");
  }

  return dir;
}
/** Get the build command for each framework. */
function getBuildCommand(framework: "ANCHOR" | "PINOCCHIO" | "QUASAR"): string {
  const envPath = "export PATH=\"/root/.cargo/bin:/root/.local/share/solana/install/active_release/bin:$PATH\" && ";
  switch (framework) {
    case "ANCHOR":
      // Anchor: use `anchor build` which handles cargo-build-sbf + IDL generation
      // IDL parse is best-effort: log failure but don't fail the overall build
      return envPath + "cd /home/builder/project/programs/* && anchor build && (anchor idl parse --file src/lib.rs --o /home/builder/project/idl.json || echo 'WARN: IDL parse failed')";
    case "QUASAR":
      // Quasar: standard cargo build-sbf (quasar-lang is just a crate dependency)
      return envPath + "cd /home/builder/project/programs/* && cargo build-sbf --release";
    case "PINOCCHIO":
      // Pinocchio: standard cargo build-sbf
      return envPath + "cd /home/builder/project/programs/* && cargo build-sbf --release";
    default:
      return envPath + "cargo build-sbf --release";
  }
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

/** Try to find the compiled .so binary in the build directory. */
async function findBinary(workDir: string, programName?: string): Promise<{ path: string; size: number } | null> {
  const { readdir, stat } = await import("fs/promises");
  const { extname } = await import("path");

  // Search specific high-probability paths first, then fall back to recursive
  const searchPaths = [
    join(workDir, "target", "deploy"),
    programName ? join(workDir, "programs", programName, "target", "deploy") : null,
    programName ? join(workDir, "programs", programName, "target", "sbf-solana-solana", "release") : null,
    join(workDir, "target", "sbf-solana-solana", "release"),
  ].filter(Boolean) as string[];

  for (const dir of searchPaths) {
    try {
      const entries = await readdir(dir);
      for (const entry of entries) {
        if (extname(entry) === ".so") {
          const fullPath = join(dir, entry);
          const s = await stat(fullPath);
          return { path: fullPath, size: s.size };
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  // Fallback: recursive search
  async function searchDir(dir: string): Promise<{ path: string; size: number } | null> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return null;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = await searchDir(fullPath);
        if (found) return found;
      } else if (extname(entry.name) === ".so") {
        const s = await stat(fullPath);
        return { path: fullPath, size: s.size };
      }
    }
    return null;
  }

  return searchDir(workDir);
}

/** Try to read the IDL file generated by Anchor. */
async function readIdl(workDir: string): Promise<string | null> {
  try {
    const idlPath = join(workDir, "idl.json");
    return await readFile(idlPath, "utf8");
  } catch {
    return null;
  }
}

// ─── Main runner ──────────────────────────────────────────────────────────────

/**
 * Run the compiler Docker container and stream logs via callback.
 * Supports Anchor, Pinocchio, and Quasar frameworks.
 */
export async function runDockerBuild(
  input: DockerBuildInput,
  onLog: (line: string, level: "info" | "warn" | "error") => void,
): Promise<DockerBuildResult> {
  const startedAt = Date.now();
  const logs: string[] = [];

  const workDir = await createTempProject(input.generatedFiles);
  onLog(`[docker] Source files written to ${workDir}`, "info");

  // Determine the project subdirectory (programs/<name>/)
  const programDir = input.ir.program.name;
  const buildCmd = getBuildCommand(input.framework);

  onLog(`[docker] Framework: ${input.framework}, Build: ${buildCmd}`, "info");

  // Docker run arguments
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

  return new Promise<DockerBuildResult>((resolve, reject) => {
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
        onLog(`[docker] Build failed (exit code ${code})`, "error");
        await rm(workDir, { recursive: true, force: true }).catch((e) => {
          console.warn(`[docker-runner] Failed to clean ${workDir}:`, e instanceof Error ? e.message : e);
        });
        resolve({
          success: false,
          logs,
          errors,
          warnings,
          workDir: "",
          duration,
          binaryPath: null,
          binarySize: null,
          idlJson: null,
        });
      } else {
        onLog("[docker] Build succeeded", "info");

        // Find the compiled binary
        const binary = await findBinary(workDir, programDir);
        if (binary) {
          onLog(`[docker] Binary: ${binary.size} bytes`, "info");
        } else {
          onLog("[docker] No .so binary found in output", "warn");
        }

        // Try to read IDL (Anchor only)
        const idlJson = await readIdl(workDir);
        if (idlJson) {
          onLog("[docker] IDL generated", "info");
        }

        resolve({
          success: true,
          logs,
          errors: [],
          warnings,
          workDir,
          duration,
          binaryPath: binary?.path ?? null,
          binarySize: binary?.size ?? null,
          idlJson,
        });
      }
    });

    proc.on("error", async (err) => {
      const duration = Date.now() - startedAt;
      onLog(`[docker] Docker spawn error: ${err.message}`, "error");
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      reject(new Error(`Docker spawn error: ${err.message}`));
    });

    // Timeout: kill the Docker process after 10 minutes to prevent hangs
    const dockerTimeout = setTimeout(async () => {
      proc.kill("SIGKILL");
      onLog("[docker] Build timed out after 10 minutes, killing container", "error");
      // Clean up temp directory on timeout (the close handler won't run since we reject first)
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      reject(new Error("Docker build timed out after 10 minutes"));
    }, 10 * 60_000);

    proc.on("close", () => clearTimeout(dockerTimeout));
  });
}
