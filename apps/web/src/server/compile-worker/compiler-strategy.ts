// apps/web/src/server/compile-worker/compiler-strategy.ts
// Strategy pattern for choosing the compilation method.
//
// Priority:
//   1. WASM compiler (in-browser like solpg — Phase 2)
//   2. Local CLI (anchor build / cargo build-sbf — current default)
//   3. Docker runner (production isolation — future)
//   4. Codegen only (just generates source, no binary)
//
// The compile router calls `compileWithStrategy()` which picks the best
// available method and falls back gracefully.

import type { ProgramIR } from "@solflow/ir";
import { runWasmBuild } from "./wasm-compiler";
import { runLocalBuild } from "./local-compiler";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompileInput {
  ir: ProgramIR;
  framework: "ANCHOR" | "PINOCCHIO";
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
  /** Temp project directory (contains source files and target/) */
  workDir: string;
  /** Path to the compiled .so binary */
  binaryPath: string | null;
  /** Size of .so binary in bytes */
  binarySize: number | null;
  /** Compilation duration in ms */
  duration: number;
  /** Which method was used */
  method: "solpg-cloud" | "wasm" | "local-cli" | "docker" | "codegen-only";
}

// ─── Strategy ─────────────────────────────────────────────────────────────────

/**
 * Compile a Solana program using the best available method.
 *
 * Tries methods in priority order:
 *   1. WASM compiler → 2. Local CLI → 3. Codegen only
 *
 * Each method has the same interface so they're interchangeable.
 */
export async function compileWithStrategy(
  input: CompileInput,
  onLog: (line: string, level: "info" | "warn" | "error") => void,
): Promise<CompileResult> {
  // ── Method 1: WASM compiler (solpg-like) ──────────────────────────────
  // The WASM compiler tries WASM first, then falls back to local CLI internally.
  // This is the primary compilation path going forward.
  try {
    const result = await runWasmBuild(input, onLog);
    if (result.success) {
      return result;
    }

    // If WASM compiler couldn't produce a binary but didn't throw,
    // fall through to try other methods
    if (result.method === "codegen-only" && result.errors.length > 0) {
      onLog(
        "[strategy] WASM compiler couldn't compile — trying local CLI directly...",
        "warn",
      );
    } else {
      // WASM compiler failed with actual build errors (not missing toolchain)
      return result;
    }
  } catch (err) {
    onLog(
      `[strategy] WASM compiler error: ${err instanceof Error ? err.message : String(err)}`,
      "warn",
    );
  }

  // ── Method 2: Local CLI (anchor build / cargo build-sbf) ──────────────
  try {
    const result = await runLocalBuild(input, onLog);
    if (result.success) {
      return { ...result, method: "local-cli" };
    }
    // Local CLI failed with build errors — don't fall through
    return { ...result, method: "local-cli" };
  } catch (err) {
    onLog(
      `[strategy] Local CLI error: ${err instanceof Error ? err.message : String(err)}`,
      "warn",
    );
  }

  // ── Method 3: Codegen only (no binary, just source code) ──────────────
  onLog(
    "[strategy] No compilation toolchain available — generating source only.",
    "warn",
  );

  return {
    success: false,
    logs: [
      "[strategy] Code generation complete but no compilation toolchain available.",
      "[strategy] Install anchor CLI (`avm install latest`) and cargo-build-sbf for compilation.",
      "[strategy] Or enable WASM compilation for in-browser builds.",
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
