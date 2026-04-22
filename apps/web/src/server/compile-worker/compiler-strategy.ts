import type { ProgramIR } from "@solflow/ir";
import { execFile } from "child_process";
import { runWasmBuild } from "./wasm-compiler";
import { runLocalBuild } from "./local-compiler";
import { runDockerBuild } from "./docker-runner";

// ─── Fast availability checks ────────────────────────────────────────────────

/** Check if Docker CLI exists and the compiler image is available (fast, ~50ms). */
function isDockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("docker", ["images", "-q", "solflow-compiler:latest"], (err, stdout) => {
      resolve(!err && stdout.trim().length > 0);
    });
  });
}

/** Check if anchor CLI or cargo-build-sbf is available (fast, ~50ms). */
function isLocalCliAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("which", ["anchor"], (err) => {
      if (!err) return resolve(true);
      execFile("which", ["cargo-build-sbf"], (err2) => resolve(!err2));
    });
  });
}

export interface CompileInput {
  ir: ProgramIR;
  framework: "ANCHOR" | "PINOCCHIO" | "QUASAR";
  irHash: string;
  /** Pre-generated source files from codegen (generated once, passed to all runners) */
  generatedFiles: { path: string; content: string }[];
  options: {
    release: boolean;
    verifiable: boolean;
    targetNetwork: "devnet" | "mainnet" | "localnet";
  };
}

export interface CompileResult {
  success: boolean;
  logs: string[];
  errors: string[];
  warnings: string[];
  workDir: string;
  binaryPath: string | null;
  binarySize: number | null;
  duration: number;
  method: "cloud" | "wasm" | "local-cli" | "docker" | "codegen-only";
  idlJson?: string | null;
}

export async function compileWithStrategy(
  input: CompileInput,
  onLog: (line: string, level: "info" | "warn" | "error") => void,
): Promise<CompileResult> {
  console.error(`[compile] framework: ${input.framework}`);

  // ── Anchor: use Solana PG cloud API (fast, reliable, handles workspace structure) ──
  if (input.framework === "ANCHOR") {
    onLog("[strategy] Anchor → using cloud build (Solana PG API)", "info");
    try {
      const result = await runWasmBuild(input, onLog);
      if (result.success) return result;
      // Cloud failed — report error, don't fall through
      onLog("[strategy] Cloud build failed for Anchor.", "error");
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onLog(`[strategy] Cloud build error: ${msg}`, "error");
      return {
        success: false,
        logs: [`[strategy] Cloud build error: ${msg}`],
        errors: [msg],
        warnings: [],
        workDir: "",
        binaryPath: null,
        binarySize: null,
        duration: 0,
        method: "cloud",
      };
    }
  }

  // ── Pinocchio / Quasar: use Docker (local compiler container) ──
  const dockerReady = await isDockerAvailable();
  console.error(`[compile] Docker available: ${dockerReady}`);

  if (dockerReady) {
    try {
      const result = await runDockerBuild(input, onLog);
      console.error(`[compile] Docker result: success=${result.success}, logs count=${result.logs.length}`);
      for (const logLine of result.logs) {
        console.error(`[compile][docker] ${logLine}`);
      }

      if (result.success) {
        return {
          success: true,
          logs: result.logs,
          errors: [],
          warnings: result.warnings,
          workDir: result.workDir,
          binaryPath: result.binaryPath,
          binarySize: result.binarySize,
          duration: result.duration,
          method: "docker",
          idlJson: result.idlJson,
        };
      }

      const dockerErrors = result.errors.length > 0
        ? result.errors
        : result.logs.filter(l => /error/i.test(l));
      onLog("[strategy] Docker build failed.", "error");
      for (const e of dockerErrors.slice(0, 10)) {
        onLog(e, "error");
      }

      return {
        success: false,
        logs: result.logs,
        errors: dockerErrors.length > 0 ? dockerErrors : ["Docker build failed with no specific error."],
        warnings: result.warnings,
        workDir: "",
        binaryPath: null,
        binarySize: null,
        duration: result.duration,
        method: "docker",
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[compile] Docker threw: ${msg}`);
      onLog(`[strategy] Docker build error: ${msg}`, "error");
      return {
        success: false,
        logs: [`[strategy] Docker build error: ${msg}`],
        errors: [msg],
        warnings: [],
        workDir: "",
        binaryPath: null,
        binarySize: null,
        duration: 0,
        method: "docker",
      };
    }
  }

  // Docker not available
  return {
    success: false,
    logs: ["[strategy] Docker not available."],
    errors: ["Docker not available and cloud build not applicable for this framework."],
    warnings: [],
    workDir: "",
    binaryPath: null,
    binarySize: null,
    duration: 0,
    method: "codegen-only",
  };
}
