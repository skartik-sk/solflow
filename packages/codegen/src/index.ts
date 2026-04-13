// @solflow/codegen — IR → Rust source code
//
// Entry point: generateCode(ir, framework) → GeneratedProject
// This module is browser-safe (no fs, no Node.js builtins).

import type { ProgramIR } from "@solflow/ir";
import { generateAnchor } from "./generators/anchor/index";
import { generatePinocchio } from "./generators/pinocchio/index";
import { generateQuasar } from "./generators/quasar/index";
import crypto from "./utils/sha256";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface GeneratedFile {
  path: string;
  content: string;
  language: "rust" | "toml" | "typescript" | "json";
}

export interface CodegenError {
  message: string;
  nodeId?: string;
}

export interface CodegenWarning {
  message: string;
  nodeId?: string;
}

export interface GeneratedProject {
  framework: "anchor" | "pinocchio" | "quasar";
  files: GeneratedFile[];
  warnings: CodegenWarning[];
  errors: CodegenError[];
  metadata: {
    generatedAt: string;
    irHash: string;
    solflowVersion: string;
  };
}

// ─── Main entry point ────────────────────────────────────────────────────────

export function generateCode(
  ir: ProgramIR,
  framework: "anchor" | "pinocchio" | "quasar",
): GeneratedProject {
  const irHash = hashIR(ir);

  let files: GeneratedFile[];
  let warnings: CodegenWarning[];
  let errors: CodegenError[];

  if (framework === "anchor") {
    const result = generateAnchor(ir);
    files = result.files;
    warnings = result.warnings;
    errors = result.errors;
  } else if (framework === "quasar") {
    const result = generateQuasar(ir);
    files = result.files;
    warnings = result.warnings;
    errors = result.errors;
  } else if (framework === "pinocchio") {
    const result = generatePinocchio(ir);
    files = result.files;
    warnings = result.warnings;
    errors = result.errors;
  } else {
    // Unknown framework — return error instead of silently defaulting
    files = [];
    warnings = [];
    errors = [{ message: `Unknown framework: "${framework}". Supported: anchor, pinocchio, quasar` }];
  }

  return {
    framework,
    files,
    warnings,
    errors,
    metadata: {
      generatedAt: new Date().toISOString(),
      irHash,
      solflowVersion: "0.1.0",
    },
  };
}

// ─── IR hash (deterministic) ─────────────────────────────────────────────────

function hashIR(ir: ProgramIR): string {
  // Use a deterministic JSON serialisation (sorted keys) → djb2 hash
  const json = stableStringify(ir);
  return crypto.hash(json);
}

// ─── Stable JSON serialisation (sorted keys) ─────────────────────────────────

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(value as object).sort();
  const pairs = keys.map(
    (k) =>
      JSON.stringify(k) +
      ":" +
      stableStringify((value as Record<string, unknown>)[k]),
  );
  return "{" + pairs.join(",") + "}";
}
