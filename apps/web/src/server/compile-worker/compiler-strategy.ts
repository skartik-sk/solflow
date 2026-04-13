import type { ProgramIR } from "@solflow/ir";
import { runWasmBuild } from "./wasm-compiler";
import { runLocalBuild } from "./local-compiler";
import { runDockerBuild } from "./docker-runner";

export interface CompileInput {
  ir: ProgramIR;
  framework: "ANCHOR" | "PINOCCHIO" | "QUASAR";
  irHash: string;
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
  // Strategy 1: Docker build (preferred — supports all 3 frameworks)
  try {
    const result = await runDockerBuild(input, onLog);
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
    onLog("[strategy] Docker build failed — trying other methods...", "warn");
  } catch (err) {
    onLog(
      `[strategy] Docker not available: ${err instanceof Error ? err.message : String(err)}`,
      "warn",
    );
  }

  // Strategy 2: WASM/cloud build
  try {
    const result = await runWasmBuild(input, onLog);
    if (result.success) {
      return result;
    }

    if (result.method === "codegen-only" && result.errors.length > 0) {
      onLog("[strategy] Cloud build unavailable — trying local CLI...", "warn");
    } else {
      return result;
    }
  } catch (err) {
    onLog(
      `[strategy] Cloud build error: ${err instanceof Error ? err.message : String(err)}`,
      "warn",
    );
  }

  // Strategy 3: Local CLI
  try {
    const result = await runLocalBuild(input, onLog);
    if (result.success) {
      return { ...result, method: "local-cli" };
    }
    return { ...result, method: "local-cli" };
  } catch (err) {
    onLog(
      `[strategy] Local CLI error: ${err instanceof Error ? err.message : String(err)}`,
      "warn",
    );
  }

  // Strategy 4: Codegen only (no binary)
  onLog(
    "[strategy] No compilation toolchain available — generating source only.",
    "warn",
  );

  return {
    success: false,
    logs: [
      "[strategy] Code generation complete but no compilation toolchain available.",
      "[strategy] Generated source code is available for download.",
    ],
    errors: [
      "No compilation toolchain available. Generated source code is available for download.",
    ],
    warnings: [],
    workDir: "",
    binaryPath: null,
    binarySize: null,
    duration: 0,
    method: "codegen-only",
  };
}
