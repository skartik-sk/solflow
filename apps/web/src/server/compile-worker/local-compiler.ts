// apps/web/src/server/compile-worker/local-compiler.ts
// Compiles Solana programs using the LOCAL toolchain (anchor CLI, cargo-build-sbf).
// No Docker, no Redis needed — works with just cargo + solana CLI installed.
//
// This is the "zero-infra" path: same machine, direct compilation.
// Keep docker-runner.ts untouched as the production path.

import { spawn } from "child_process";
import { mkdir, writeFile, rm, readdir, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import type { ProgramIR } from "@solflow/ir";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LocalBuildInput {
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

export interface LocalBuildResult {
  success: boolean;
  logs: string[];
  errors: string[];
  warnings: string[];
  /** Path to the temp project dir (contains target/ on success) */
  workDir: string;
  /** Path to the compiled .so binary (if success) */
  binaryPath: string | null;
  /** Size of the .so binary in bytes */
  binarySize: number | null;
  duration: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Write pre-generated source files to a temp directory and return its path. */
async function createTempProject(
  files: { path: string; content: string }[],
): Promise<string> {
  const dir = join(tmpdir(), `solflow-local-${randomBytes(8).toString("hex")}`);
  await mkdir(dir, { recursive: true });

  for (const file of files) {
    const fullPath = join(dir, file.path);
    const fileDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    await mkdir(fileDir, { recursive: true });
    await writeFile(fullPath, file.content, "utf8");
  }

  return dir;
}

/** Spawn a command and stream stdout/stderr via callback. */
function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  onLog: (line: string, level: "info" | "warn" | "error") => void,
  timeoutMs: number = 10 * 60_000,
): Promise<{ code: number; logs: string[] }> {
  return new Promise((resolve) => {
    const logs: string[] = [];
    const proc = spawn(cmd, args, { cwd, shell: true });

    const append = (data: Buffer, level: "info" | "warn" | "error") => {
      for (const line of data.toString().split("\n").filter(Boolean)) {
        logs.push(line);
        const lv = /^error/i.test(line)
          ? "error"
          : /^warning/i.test(line)
            ? "warn"
            : level;
        onLog(line, lv);
      }
    };

    proc.stdout.on("data", (d: Buffer) => append(d, "info"));
    proc.stderr.on("data", (d: Buffer) => append(d, "info"));

    // Timeout: kill the process if it runs too long
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      onLog("Build timed out, killing process", "error");
      resolve({ code: 1, logs: [...logs, "Build timed out"] });
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, logs });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      logs.push(err.message);
      onLog(`Process error: ${err.message}`, "error");
      resolve({ code: 1, logs });
    });
  });
}

/** Recursively find .so files in a directory. */
async function findFilesRecursive(dir: string, ext: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...await findFilesRecursive(fullPath, ext));
      } else if (entry.name.endsWith(ext)) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory may not exist
  }
  return results;
}

/** Find the compiled .so binary in the project's target directory. */
async function findSoBinary(workDir: string, programName?: string): Promise<string | null> {
  // Search paths in priority order
  const searchPaths = [
    // Anchor workspace: target/deploy/ at project root
    join(workDir, "target", "deploy"),
    // Pinocchio/Quasar: target/deploy/ inside the program subdirectory
    programName ? join(workDir, "programs", programName, "target", "deploy") : null,
    // sbf-solana-solana release dir (cargo-build-sbf / cargo build-sbf output)
    programName ? join(workDir, "programs", programName, "target", "sbf-solana-solana", "release") : null,
    // bpfel-unknown-unknown (older Solana CLI versions)
    programName ? join(workDir, "programs", programName, "target", "bpfel-unknown-unknown", "release") : null,
    // Workspace-level sbf target
    join(workDir, "target", "sbf-solana-solana", "release"),
    join(workDir, "target", "bpfel-unknown-unknown", "release"),
  ].filter(Boolean) as string[];

  for (const dir of searchPaths) {
    try {
      const entries = await readdir(dir);
      // Prefer exact name match, then any .so file
      if (programName) {
        const exactMatch = entries.find((e) => e === `${programName}.so`);
        if (exactMatch) return join(dir, exactMatch);
      }
      const soFile = entries.find((e) => e.endsWith(".so"));
      if (soFile) return join(dir, soFile);
    } catch {
      // Directory doesn't exist, try next
    }
  }

  // Fallback: recursive search from workDir
  const allSoFiles = await findFilesRecursive(workDir, ".so");
  // Prefer deploy/release paths
  const releaseFile = allSoFiles.find((f) => f.includes("deploy") || f.includes("release"));
  return releaseFile ?? allSoFiles[0] ?? null;
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
 * Compile a Solana program locally using anchor CLI or cargo-build-sbf.
 * No Docker or Redis needed — just needs cargo + solana CLI installed.
 */
export async function runLocalBuild(
  input: LocalBuildInput,
  onLog: (line: string, level: "info" | "warn" | "error") => void,
): Promise<LocalBuildResult> {
  const startedAt = Date.now();
  const allLogs: string[] = [];

  // Step 1: Write generated files to temp dir
  let workDir: string;
  try {
    workDir = await createTempProject(input.generatedFiles);
    onLog(`Source files written to ${workDir}`, "info");
  } catch (err) {
    return {
      success: false,
      logs: [err instanceof Error ? err.message : String(err)],
      errors: ["Failed to create temp project directory"],
      warnings: [],
      workDir: "",
      binaryPath: null,
      binarySize: null,
      duration: Date.now() - startedAt,
    };
  }

  // Step 2: Compile
  const programName = input.ir.program.name;
  const isAnchor = input.framework === "ANCHOR";
  const buildDir = isAnchor ? workDir : join(workDir, "programs", programName);

  // For non-Anchor: use --bpf-out-dir to force the .so output to a known location
  // This eliminates the guesswork of where cargo-build-sbf puts the binary
  const outDir = join(workDir, "out");
  let buildCmd: string;
  if (isAnchor) {
    buildCmd = "anchor build";
  } else {
    // Create the output directory so cargo-build-sbf can write to it
    await mkdir(outDir, { recursive: true });
    buildCmd = `cargo-build-sbf --sbf-out-dir ${outDir}`;
  }

  onLog(`Running: ${buildCmd} in ${buildDir}`, "info");

  const { code, logs } = await runCommand(buildCmd, [], buildDir, onLog);
  allLogs.push(...logs);

  const duration = Date.now() - startedAt;
  const { errors, warnings } = parseErrors(allLogs);

  if (code !== 0) {
    onLog(`Build failed with exit code ${code}`, "error");
    // Clean up on failure
    await rm(workDir, { recursive: true, force: true }).catch((e) => {
      console.warn(`[local-compiler] Failed to clean ${workDir}:`, e instanceof Error ? e.message : e);
    });
    return {
      success: false,
      logs: allLogs,
      errors: errors.length > 0 ? errors : [`Build exited with code ${code}`],
      warnings,
      workDir: "",
      binaryPath: null,
      binarySize: null,
      duration,
    };
  }

  // Step 3: Find the compiled binary
  // First check the forced output directory (non-Anchor), then fall back to search
  let binaryPath: string | null = null;

  if (!isAnchor) {
    // Direct check in the forced output directory
    try {
      const outEntries = await readdir(outDir);
      onLog(`out/ contents: ${outEntries.join(', ')}`, "info");
      const soFile = outEntries.find((e) => e.endsWith(".so"));
      if (soFile) {
        binaryPath = join(outDir, soFile);
      }
    } catch {
      onLog(`out/ directory not found at ${outDir}`, "warn");
    }
  }

  if (!binaryPath) {
    // Fallback: search all target directories
    onLog(`Searching for .so in ${workDir} (program: ${programName})`, "info");
    binaryPath = await findSoBinary(workDir, programName);
  }

  let binarySize: number | null = null;

  if (binaryPath) {
    try {
      const fileInfo = await stat(binaryPath);
      binarySize = fileInfo.size;
    } catch {
      binarySize = null;
    }
    onLog(`Compiled binary: ${binaryPath} (${binarySize ?? "?"} bytes)`, "info");
  } else {
    // Don't delete temp dir so user can inspect manually
    onLog(`No .so binary found. Inspect temp dir: ls -R ${workDir}`, "warn");
  }

  return {
    success: true,
    logs: allLogs,
    errors: [],
    warnings,
    workDir,
    binaryPath,
    binarySize,
    duration,
  };
}

// ─── Devnet Deploy ────────────────────────────────────────────────────────────

export interface LocalDeployInput {
  binaryPath: string;
  network: "devnet" | "mainnet" | "localnet";
  /** Path to the keypair file for the program (optional — generated if not provided) */
  programKeypairPath?: string;
  /** Path to the payer keypair (defaults to ~/.config/solana/id.json) */
  payerKeypairPath?: string;
}

export interface LocalDeployResult {
  success: boolean;
  programId: string;
  txSignature: string;
  explorerUrl: string;
  logs: string[];
}

/**
 * Deploy a compiled .so binary to a Solana network using the local solana CLI.
 * Returns the program ID and explorer URL.
 */
export async function runLocalDeploy(
  input: LocalDeployInput,
  onLog: (line: string, level: "info" | "warn" | "error") => void,
): Promise<LocalDeployResult> {
  const clusterUrl =
    input.network === "devnet"
      ? "https://api.devnet.solana.com"
      : input.network === "mainnet"
        ? "https://api.mainnet-beta.solana.com"
        : "http://localhost:8899";

  const clusterFlag =
    input.network === "devnet"
      ? "--url devnet"
      : input.network === "mainnet"
        ? "--url mainnet-beta"
        : "--url localhost";

  onLog(`Deploying to ${input.network}...`, "info");

  // Use solana program deploy command
  const deployArgs = [
    "program",
    "deploy",
    input.binaryPath,
    clusterFlag,
    "--with-compute-unit-price",
    "1000",
  ];

  if (input.programKeypairPath) {
    deployArgs.push("--program-id", input.programKeypairPath);
  }

  if (input.payerKeypairPath) {
    deployArgs.push("--keypair", input.payerKeypairPath);
  }

  const { code, logs } = await runCommand(
    "solana",
    [deployArgs.join(" ")],
    "/tmp",
    onLog,
  );

  // Parse program ID from output
  const programIdMatch = logs.join("\n").match(/Program Id:\s+([1-9A-HJ-NP-Za-km-z]{32,44})/);
  const txSigMatch = logs.join("\n").match(/Signature:\s+([1-9A-HJ-NP-Za-km-z]{64,88})/);

  const programId = programIdMatch?.[1] ?? "";
  const txSignature = txSigMatch?.[1] ?? "";

  const explorerBase =
    input.network === "mainnet"
      ? "https://explorer.solana.com"
      : `https://explorer.solana.com/?cluster=${input.network}`;

  const explorerUrl = programId ? `${explorerBase}/address/${programId}` : "";

  if (code !== 0 || !programId) {
    return {
      success: false,
      programId,
      txSignature,
      explorerUrl,
      logs,
    };
  }

  onLog(`Deployed! Program ID: ${programId}`, "info");
  onLog(`Explorer: ${explorerUrl}`, "info");

  return {
    success: true,
    programId,
    txSignature,
    explorerUrl,
    logs,
  };
}
