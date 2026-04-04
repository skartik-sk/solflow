// apps/web/src/server/compile-worker/wasm-compiler.ts
// Cloud-based compilation using the Solana Playground build API.
//
// This is the same approach solpg uses: source files are sent to a remote
// server running cargo-build-sbf, which returns the compiled .so binary.
// No local toolchain, no Docker, no Redis needed.
//
// Strategy:
//   1. Try Solana Playground build API (cloud compilation, like solpg)
//   2. Fall back to local CLI (anchor build / cargo build-sbf)
//   3. Fall back to codegen only (just generated source, no binary)

import { mkdir, writeFile, readFile, rm, writeFile as writeFileCb } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { spawn } from "child_process";
import type { ProgramIR } from "@solflow/ir";
import { generateCode } from "@solflow/codegen";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WasmBuildInput {
  ir: ProgramIR;
  framework: "ANCHOR" | "PINOCCHIO";
  irHash: string;
  options: {
    release: boolean;
    verifiable: boolean;
    targetNetwork: "devnet" | "mainnet" | "localnet";
  };
}

export interface WasmBuildResult {
  success: boolean;
  logs: string[];
  errors: string[];
  warnings: string[];
  /** Path to the temp project dir */
  workDir: string;
  /** Path to the compiled .so binary (if success) */
  binaryPath: string | null;
  /** Size of the .so binary in bytes */
  binarySize: number | null;
  duration: number;
  /** Which compilation method was actually used */
  method: "solpg-cloud" | "local-cli" | "codegen-only";
}

// ─── SolPG Cloud Build API ────────────────────────────────────────────────────

const SOLPG_BUILD_URL = process.env.SOLPG_BUILD_URL ?? "https://api.solpg.io";
const SOLPG_BUILD_TIMEOUT = 120_000; // 2 minutes

interface SolpgBuildResponse {
  stderr: string;
  uuid: string;
  idl: Record<string, unknown> | null;
}

interface SolpgBuildError {
  error: string;
}

/**
 * Compile source files using the Solana Playground build API.
 * This is exactly what solpg does — sends Rust source to a cloud server,
 * gets back compiled .so binary.
 */
async function compileWithSolpg(
  files: { path: string; content: string }[],
  onLog: (line: string, level: "info" | "warn" | "error") => void,
): Promise<{ success: boolean; uuid: string; logs: string[]; idl: unknown } | null> {
  onLog("[solpg] Sending source files to Solana Playground build API...", "info");

  // Convert our file paths to solpg format.
  // Our codegen produces: "programs/{name}/src/lib.rs", "programs/{name}/src/instructions/mod.rs", etc.
  // solpg expects: "/src/lib.rs", "/src/instructions/mod.rs", etc.
  // Skip Cargo.toml — solpg has its own with pre-vendored dependencies.
  const solpgFiles: [string, string][] = files
    .filter((f) => !f.path.endsWith("Cargo.toml"))
    .map((f) => {
      let solpgPath: string;
      if (f.path.startsWith("/src")) {
        solpgPath = f.path;
      } else {
        const srcIdx = f.path.indexOf("/src/");
        if (srcIdx !== -1) {
          solpgPath = f.path.substring(srcIdx); // "/src/lib.rs" etc.
        } else {
          solpgPath = `/src/${f.path.split("/").pop()}`;
        }
      }
      return [solpgPath, f.content];
    });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SOLPG_BUILD_TIMEOUT);

    const response = await fetch(`${SOLPG_BUILD_URL}/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: solpgFiles,
        flags: {
          seedsFeature: false,
          noDocs: true,
          safetyChecks: false,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => "Unknown error");
      onLog(`[solpg] Build API returned ${response.status}: ${errText}`, "error");
      return null;
    }

    const data = (await response.json()) as SolpgBuildResponse | SolpgBuildError;

    if ("error" in data) {
      onLog(`[solpg] Build API error: ${data.error}`, "error");
      return null;
    }

    const buildData = data as SolpgBuildResponse;
    const logs = buildData.stderr
      .split("\n")
      .filter((l: string) => l.trim().length > 0);

    // Stream all logs
    for (const line of logs) {
      const level: "info" | "warn" | "error" = /^error/i.test(line)
        ? "error"
        : /^warning/i.test(line)
          ? "warn"
          : "info";
      onLog(line, level);
    }

    // Check if build succeeded (solpg returns stderr which includes errors)
    const hasCompilationError = buildData.stderr.includes("error: could not compile")
      || buildData.stderr.includes("error[E");

    onLog(
      hasCompilationError
        ? "[solpg] Build completed with errors"
        : `[solpg] Build successful — uuid: ${buildData.uuid}`,
      hasCompilationError ? "error" : "info",
    );

    return {
      success: !hasCompilationError,
      uuid: buildData.uuid,
      logs,
      idl: buildData.idl,
    };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      onLog("[solpg] Build timed out after 120 seconds", "error");
    } else {
      onLog(`[solpg] Build API unreachable: ${err instanceof Error ? err.message : String(err)}`, "warn");
    }
    return null;
  }
}

/**
 * Fetch the compiled .so binary from the Solana Playground server.
 */
async function fetchSolpgBinary(
  uuid: string,
  destPath: string,
  onLog: (line: string, level: "info" | "warn" | "error") => void,
): Promise<number | null> {
  onLog(`[solpg] Fetching compiled binary...`, "info");

  try {
    const response = await fetch(`${SOLPG_BUILD_URL}/deploy/${uuid}`);
    if (!response.ok) {
      onLog(`[solpg] Failed to fetch binary: ${response.status}`, "error");
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(destPath, buffer);
    onLog(`[solpg] Binary saved: ${destPath} (${buffer.byteLength} bytes)`, "info");
    return buffer.byteLength;
  } catch (err) {
    onLog(`[solpg] Failed to fetch binary: ${err instanceof Error ? err.message : String(err)}`, "error");
    return null;
  }
}

// ─── Local CLI fallback ──────────────────────────────────────────────────────

function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  onLog: (line: string, level: "info" | "warn" | "error") => void,
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

    proc.on("close", (code) => resolve({ code: code ?? 1, logs }));
    proc.on("error", (err) => {
      logs.push(err.message);
      onLog(`Process error: ${err.message}`, "error");
      resolve({ code: 1, logs });
    });
  });
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

// ─── Main runner ──────────────────────────────────────────────────────────────

/**
 * Compile a Solana program using the Solana Playground build API.
 *
 * Strategy (same UX as solpg):
 *   1. Send source files to api.solpg.io/build (cloud compilation)
 *   2. Download the compiled .so binary from api.solpg.io/deploy/{uuid}
 *   3. Fall back to local CLI if cloud API is unavailable
 *   4. Fall back to codegen-only if nothing works
 */
export async function runWasmBuild(
  input: WasmBuildInput,
  onLog: (line: string, level: "info" | "warn" | "error") => void,
): Promise<WasmBuildResult> {
  const startedAt = Date.now();
  const generatedFramework = input.framework === "ANCHOR" ? "anchor" : "pinocchio";

  // Step 1: Generate Rust source code from IR
  const generated = generateCode(input.ir, generatedFramework);

  if (generated.errors.length > 0) {
    return {
      success: false,
      logs: generated.errors.map((e) => e.message),
      errors: generated.errors.map((e) => e.message),
      warnings: [],
      workDir: "",
      binaryPath: null,
      binarySize: null,
      duration: Date.now() - startedAt,
      method: "codegen-only",
    };
  }

  onLog(`[solpg] Generated ${generated.files.length} source file(s)`, "info");
  for (const f of generated.files) {
    onLog(`[solpg]   ${f.path} (${f.content.length} chars)`, "info");
  }

  // Step 2: Try SolPG cloud compilation first
  const solpgResult = await compileWithSolpg(generated.files, onLog);

  if (solpgResult) {
    if (solpgResult.success) {
      // Build succeeded — fetch the binary
      const workDir = join(tmpdir(), `solflow-solpg-${randomBytes(4).toString("hex")}`);
      await mkdir(workDir, { recursive: true });
      const binaryPath = join(workDir, "program.so");
      const binarySize = await fetchSolpgBinary(solpgResult.uuid, binaryPath, onLog);

      if (binarySize) {
        return {
          success: true,
          logs: solpgResult.logs,
          errors: [],
          warnings: [],
          workDir,
          binaryPath,
          binarySize,
          duration: Date.now() - startedAt,
          method: "solpg-cloud",
        };
      }
      // Binary fetch failed — fall through to local CLI
      onLog("[solpg] Binary fetch failed, trying local CLI...", "warn");
    } else {
      // Build had errors — return them (same as solpg behavior)
      const { errors, warnings } = parseErrors(solpgResult.logs);
      return {
        success: false,
        logs: solpgResult.logs,
        errors: errors.length > 0 ? errors : ["Compilation failed"],
        warnings,
        workDir: "",
        binaryPath: null,
        binarySize: null,
        duration: Date.now() - startedAt,
        method: "solpg-cloud",
      };
    }
  }

  // Step 3: SolPG API unavailable — fall back to local CLI
  onLog("[solpg] Cloud API unavailable, trying local toolchain...", "warn");

  // Write files to temp dir for local compilation
  let workDir: string;
  try {
    workDir = join(tmpdir(), `solflow-local-${randomBytes(4).toString("hex")}`);
    await mkdir(workDir, { recursive: true });

    for (const file of generated.files) {
      const fullPath = join(workDir, file.path);
      const fileDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
      await mkdir(fileDir, { recursive: true });
      await writeFile(fullPath, file.content, "utf8");
    }
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
      method: "codegen-only",
    };
  }

  const buildCmd =
    input.framework === "ANCHOR"
      ? "anchor build"
      : "cargo build-sbf --release";

  onLog(`[local] Running: ${buildCmd}`, "info");

  try {
    const { code, logs } = await runCommand(buildCmd, [], workDir, onLog);
    const duration = Date.now() - startedAt;
    const { errors, warnings } = parseErrors(logs);

    if (code !== 0) {
      onLog(`[local] Build failed with exit code ${code}`, "error");
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      return {
        success: false,
        logs,
        errors: errors.length > 0 ? errors : [`Build exited with code ${code}`],
        warnings,
        workDir: "",
        binaryPath: null,
        binarySize: null,
        duration,
        method: "local-cli",
      };
    }

    // Find the .so binary in target/deploy/
    const deployDir = join(workDir, "target", "deploy");
    let binaryPath: string | null = null;
    let binarySize: number | null = null;

    try {
      const { readdir } = await import("fs/promises");
      const entries = await readdir(deployDir);
      const soFile = entries.find((e) => e.endsWith(".so"));
      if (soFile) {
        binaryPath = join(deployDir, soFile);
        const buf = await readFile(binaryPath);
        binarySize = buf.byteLength;
        onLog(`[local] Compiled binary: ${binaryPath} (${binarySize} bytes)`, "info");
      }
    } catch {
      onLog("[local] Build succeeded but no .so binary found", "warn");
    }

    return {
      success: true,
      logs,
      errors: [],
      warnings,
      workDir,
      binaryPath,
      binarySize,
      duration,
      method: "local-cli",
    };
  } catch (err) {
    onLog(
      `[local] Toolchain not available: ${err instanceof Error ? err.message : String(err)}`,
      "warn",
    );

    return {
      success: false,
      logs: [
        "[solpg] Cloud compilation unavailable.",
        "[local] Local toolchain not available.",
        "Generated source code is available for manual compilation.",
      ],
      errors: [
        "No compilation method available. Check your connection or install anchor CLI.",
      ],
      warnings: [],
      workDir,
      binaryPath: null,
      binarySize: null,
      duration: Date.now() - startedAt,
      method: "codegen-only",
    };
  }
}
