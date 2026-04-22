// apps/web/src/server/compile-worker/docker-runner.ts
// Compiles Solana programs via `docker exec` on the persistent compiler container.
//
// Uses the long-running solflow-compiler container (sleep infinity) with pre-cached
// deps and platform tools. This mirrors Solana Playground's approach:
// persistent container + cached toolchain = fast builds (~3s vs ~100s with docker run --rm).
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

// ─── Config ───────────────────────────────────────────────────────────────────

const COMPILER_CONTAINER = "solflow-compiler";

// Shared build directory — bind-mounted into both app and compiler containers
// so both can read/write the same files.
const BUILD_ROOT = process.env.SOLFLOW_BUILD_DIR || join(tmpdir(), "solflow-builds");

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function getBuildCommand(framework: "ANCHOR" | "PINOCCHIO" | "QUASAR", projectDir: string): string {
  const envPath = 'export PATH="/root/.cargo/bin:/root/.local/share/solana/install/active_release/bin:$PATH" && ';
  switch (framework) {
    case "ANCHOR":
      return envPath + `cd ${projectDir}/programs/* && anchor build && (anchor idl parse --file src/lib.rs --o ${projectDir}/idl.json || echo 'WARN: IDL parse failed')`;
    case "QUASAR":
    case "PINOCCHIO":
      return envPath + `cd ${projectDir}/programs/* && cargo build-sbf`;
    default:
      return envPath + `cd ${projectDir}/programs/* && cargo build-sbf`;
  }
}

function parseErrors(logs: string[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const line of logs) {
    if (/^error(\[E\d+\])?:/.test(line)) errors.push(line.trim());
    else if (/^warning(\[.*\])?:/.test(line)) warnings.push(line.trim());
  }
  return { errors, warnings };
}

async function findBinary(workDir: string, programName?: string): Promise<{ path: string; size: number } | null> {
  const { readdir, stat } = await import("fs/promises");
  const { extname } = await import("path");

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
    } catch { /* skip */ }
  }

  async function searchDir(dir: string): Promise<{ path: string; size: number } | null> {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return null; }
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

async function readIdl(workDir: string): Promise<string | null> {
  try {
    return await readFile(join(workDir, "idl.json"), "utf8");
  } catch { return null; }
}

// ─── Main runner ──────────────────────────────────────────────────────────────

export async function runDockerBuild(
  input: DockerBuildInput,
  onLog: (line: string, level: "info" | "warn" | "error") => void,
): Promise<DockerBuildResult> {
  const startedAt = Date.now();
  const logs: string[] = [];

  const workDir = await createTempProject(input.generatedFiles);
  onLog(`[docker] Source files written to ${workDir}`, "info");

  const programDir = input.ir.program.name;
  const buildCmd = getBuildCommand(input.framework, workDir);
  onLog(`[docker] Framework: ${input.framework}`, "info");

  // Use `docker exec` on the persistent compiler container.
  // Source files are at /tmp/solflow-builds/build-xxx, which is bind-mounted
  // into both the app container and the compiler container.
  const dockerArgs = [
    "exec",
    "-u", "root",
    COMPILER_CONTAINER,
    "/bin/sh", "-c",
    buildCmd,
  ];

  return new Promise<DockerBuildResult>((resolve, reject) => {
    const proc = spawn("docker", dockerArgs, { cwd: workDir });

    const appendLog = (data: Buffer, level: "info" | "warn" | "error" = "info") => {
      for (const line of data.toString().split("\n").filter(Boolean)) {
        logs.push(line);
        const lv = /^error/.test(line) ? "error" : /^warning/.test(line) ? "warn" : level;
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
        await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
        resolve({ success: false, logs, errors, warnings, workDir: "", duration, binaryPath: null, binarySize: null, idlJson: null });
      } else {
        onLog("[docker] Build succeeded", "info");
        const binary = await findBinary(workDir, programDir);
        if (binary) onLog(`[docker] Binary: ${binary.size} bytes`, "info");
        else onLog("[docker] No .so binary found in output", "warn");

        const idlJson = await readIdl(workDir);
        if (idlJson) onLog("[docker] IDL generated", "info");

        resolve({ success: true, logs, errors: [], warnings, workDir, duration, binaryPath: binary?.path ?? null, binarySize: binary?.size ?? null, idlJson });
      }
    });

    proc.on("error", async (err) => {
      onLog(`[docker] Docker spawn error: ${err.message}`, "error");
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      reject(new Error(`Docker spawn error: ${err.message}`));
    });

    const dockerTimeout = setTimeout(async () => {
      proc.kill("SIGKILL");
      onLog("[docker] Build timed out after 10 minutes", "error");
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      reject(new Error("Docker build timed out after 10 minutes"));
    }, 10 * 60_000);

    proc.on("close", () => clearTimeout(dockerTimeout));
  });
}
