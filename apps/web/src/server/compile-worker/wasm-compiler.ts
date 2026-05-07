// apps/web/src/server/compile-worker/wasm-compiler.ts
// Cloud-based compilation using a remote build server.
//
// Source files are sent to a remote server running cargo-build-sbf,
// which returns the compiled .so binary.
// No local toolchain, no Docker, no Redis needed.
//
// Strategy:
//   1. Try cloud build API (remote compilation)
//   2. Fall back to local CLI (anchor build / cargo build-sbf)
//   3. Fall back to codegen only (just generated source, no binary)

import {
  mkdir,
  writeFile,
  readFile,
  rm,
} from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { spawn } from "child_process";
import type { ProgramIR } from "@solflow/ir";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WasmBuildInput {
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
  method: "cloud" | "local-cli" | "codegen-only";
}

// ─── Cloud Build API ────────────────────────────────────────────────────

const CLOUD_BUILD_URL = process.env.CLOUD_BUILD_URL ?? "https://api.solpg.io";
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
 * Flatten a multi-file Anchor project into a single /src/lib.rs for the cloud build server.
 *
 * Our codegen produces:
 *   programs/{name}/src/lib.rs             — main entry with `pub mod instructions;`
 *   programs/{name}/src/instructions/mod.rs — `pub mod initialize;`
 *   programs/{name}/src/instructions/initialize.rs — actual instruction handler
 *   programs/{name}/src/state/mod.rs        — `pub mod counter;`
 *   programs/{name}/src/state/counter.rs    — account struct
 *
 * The cloud build server expects a single /src/lib.rs with everything inline.
 * Strategy: strip `pub mod X;` declarations and inline the content of each module.
 */
function flattenForCloudBuild(
  files: { path: string; content: string }[],
): [string, string][] {
  const fileMap = new Map<string, string>();
  for (const f of files) {
    if (f.path.endsWith("Cargo.toml")) continue;
    const srcIdx = f.path.indexOf("/src/");
    if (srcIdx !== -1) {
      const key = f.path.substring(srcIdx + 5);
      fileMap.set(key, f.content);
    }
  }

  const libRs = fileMap.get("lib.rs") ?? "";
  if (!libRs) return [["/src/lib.rs", "// No source code generated"]];

  // Collect module contents by category
  const instructions: string[] = [];
  const states: string[] = [];
  const errors: string[] = [];
  const events: string[] = [];
  const constants: string[] = [];

  // Extract instruction handler bodies and account structs from instruction files
  for (const [path, content] of fileMap) {
    if (path === "lib.rs" || path.endsWith("mod.rs")) continue;
    if (path.startsWith("instructions/")) {
      instructions.push(content);
    } else if (path.startsWith("state/")) {
      states.push(content);
    } else if (path.startsWith("errors")) {
      errors.push(content);
    } else if (path.startsWith("events")) {
      events.push(content);
    } else if (path.startsWith("constants")) {
      constants.push(content);
    }
  }

  // Strip `use anchor_lang::prelude::*;` and `use crate::...` from module contents
  const stripImports = (code: string) =>
    code
      .replace(/^use\s+anchor_lang::prelude::\*;\s*$/gm, "")
      .replace(
        /^use\s+crate::(state|instructions|errors|events|constants)::\w+;\s*$/gm,
        "",
      )
      .replace(/^use\s+crate::errors::\w+;\s*$/gm, "")
      .trim();

  // Build the #[program] block from lib.rs
  // Extract the declare_id! and program module
  const declareIdMatch = libRs.match(/declare_id!\("[^"]*"\);/);
  const declareId = declareIdMatch
    ? declareIdMatch[0]
    : 'declare_id!("11111111111111111111111111111111");';

  // Extract the #[program] module body
  const programModuleMatch = libRs.match(
    /#\[program\]\s*pub mod \w+ \{([\s\S]*?)\n\}/,
  );
  const programBody = programModuleMatch ? programModuleMatch[1].trim() : "";

  // Simpler approach: just replace module calls with direct inline
  // For each instruction file, extract the handler function body and Accounts struct
  const handlerBodies: Map<
    string,
    { body: string; args: string; ctxName: string }
  > = new Map();
  const accountStructs: string[] = [];

  for (const instrContent of instructions) {
    const stripped = stripImports(instrContent);

    // Extract handler function
    const handlerMatch = stripped.match(
      /pub fn handler\(ctx: Context<(\w+)>([^)]*)\)\s*(?:->\s*Result<\(\)>\s*)?\{([\s\S]*?)\n\}/,
    );
    if (handlerMatch) {
      const ctxName = handlerMatch[1];
      const args = handlerMatch[2].trim();
      const body = handlerMatch[3].trim();
      handlerBodies.set(ctxName, { body, args, ctxName });
    }

    // Extract Accounts struct(s) — use matchAll to capture all structs per file
    const accountsMatches = [...stripped.matchAll(
      /#\[derive\(Accounts\)\]\s*(?:#\[instruction\([^)]*\)\]\s*)?pub struct \w+[^{]*\{[\s\S]*?\n\}/g,
    )];
    for (const m of accountsMatches) {
      accountStructs.push(m[0]);
    }
  }

  // Extract state structs
  const stateStructs: string[] = [];
  for (const stateContent of states) {
    const stripped = stripImports(stateContent);
    const structMatches = [...stripped.matchAll(
      /#\[account[^\n]*\](?:\s*#\[derive[^\n]*\])*\s*pub struct \w+[^{]*\{[\s\S]*?\n\}/g,
    )];
    for (const m of structMatches) {
      stateStructs.push(m[0]);
    }
  }

  // Extract error enums
  const errorEnums: string[] = [];
  for (const errorContent of errors) {
    const stripped = stripImports(errorContent);
    const enumMatch = stripped.match(
      /#\[error_code\]\s*pub enum \w+[^{]*\{[\s\S]*?\n\}/,
    );
    if (enumMatch) {
      errorEnums.push(enumMatch[0]);
    }
  }

  // Extract event structs — use matchAll to capture all events per file
  const eventStructs: string[] = [];
  for (const eventContent of events) {
    const stripped = stripImports(eventContent);
    const structMatches = [...stripped.matchAll(
      /#\[event\]\s*pub struct \w+[^{]*\{[\s\S]*?\n\}/g,
    )];
    for (const m of structMatches) {
      eventStructs.push(m[0]);
    }
  }

  // Extract program name from lib.rs — avoid "program" which clashes with #[program] macro
  const programNameMatch = libRs.match(/pub mod (\w+)\s*\{/);
  const rawProgramName = programNameMatch ? programNameMatch[1] : "my_program";
  const programName = rawProgramName === "program" ? "my_program" : rawProgramName;

  // Build the instruction fns for #[program]
  const instrFns: string[] = [];
  for (const [ctxName, info] of handlerBodies) {
    const fnNameMatch = programBody.match(
      new RegExp(`pub fn (\\w+)\\(ctx: Context<${ctxName}>`),
    );
    const fnName = fnNameMatch ? fnNameMatch[1] : ctxName.toLowerCase();
    const extraArgs = info.args ? ` ${info.args}` : "";
    instrFns.push(
      `    pub fn ${fnName}(ctx: Context<${ctxName}>${extraArgs}) -> Result<()> {\n` +
        info.body
          .split("\n")
          .map((l) => (l ? `        ${l}` : ""))
          .join("\n") +
        `\n    }`,
    );
  }

  // Assemble the final single-file lib.rs
  const parts: string[] = [
    "use anchor_lang::prelude::*;\n",
    `${declareId}\n`,
    "#[program]",
    `pub mod ${programName} {`,
    "    use super::*;",
    "",
    instrFns.join("\n\n"),
    "}\n",
  ];

  if (stateStructs.length) {
    parts.push(stateStructs.join("\n\n") + "\n");
  }
  if (accountStructs.length) {
    parts.push(accountStructs.join("\n\n") + "\n");
  }
  if (errorEnums.length) {
    parts.push(errorEnums.join("\n\n") + "\n");
  }
  if (eventStructs.length) {
    parts.push(eventStructs.join("\n\n") + "\n");
  }

  return [["/src/lib.rs", parts.join("\n")]];
}

/**
 * Compile source files using the Solana Playground build API.
 * This is exactly the cloud build server — it sends Rust source to a cloud server,
 * gets back compiled .so binary.
 */
async function compileWithCloudBuild(
  files: { path: string; content: string }[],
  onLog: (line: string, level: "info" | "warn" | "error") => void,
): Promise<{
  success: boolean;
  uuid: string;
  logs: string[];
  idl: unknown;
} | null> {
  onLog(
    "[cloud] Sending source files to Solana Playground build API...",
    "info",
  );

  // Flatten all source files into a single /src/lib.rs for the cloud build server.
  // The build server doesn't handle multi-module Rust projects well — it expects one file.
  // We merge all modules (instructions, state, errors, events) inline into lib.rs.
  const cloudFiles: [string, string][] = flattenForCloudBuild(files);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SOLPG_BUILD_TIMEOUT);

    const response = await fetch(`${CLOUD_BUILD_URL}/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: cloudFiles,
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
      onLog(
        `[cloud] Build API returned ${response.status}: ${errText}`,
        "error",
      );
      return null;
    }

    const data = (await response.json()) as
      | SolpgBuildResponse
      | SolpgBuildError;

    if ("error" in data) {
      onLog(`[cloud] Build API error: ${data.error}`, "error");
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

    // Check if build succeeded (the cloud build server returns stderr which includes errors)
    const hasCompilationError =
      buildData.stderr.includes("error: could not compile") ||
      buildData.stderr.includes("error[E");

    onLog(
      hasCompilationError
        ? "[cloud] Build completed with errors"
        : `[cloud] Build successful — uuid: ${buildData.uuid}`,
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
      onLog("[cloud] Build timed out after 120 seconds", "error");
    } else {
      onLog(
        `[cloud] Build API unreachable: ${err instanceof Error ? err.message : String(err)}`,
        "warn",
      );
    }
    return null;
  }
}

/**
 * Fetch the compiled .so binary from the Solana Playground server.
 */
async function fetchCloudBinary(
  uuid: string,
  destPath: string,
  onLog: (line: string, level: "info" | "warn" | "error") => void,
): Promise<number | null> {
  onLog(`[cloud] Fetching compiled binary...`, "info");

  try {
    const response = await fetch(`${CLOUD_BUILD_URL}/deploy/${uuid}`);
    if (!response.ok) {
      onLog(`[cloud] Failed to fetch binary: ${response.status}`, "error");
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(destPath, buffer);
    onLog(
      `[cloud] Binary saved: ${destPath} (${buffer.byteLength} bytes)`,
      "info",
    );
    return buffer.byteLength;
  } catch (err) {
    onLog(
      `[cloud] Failed to fetch binary: ${err instanceof Error ? err.message : String(err)}`,
      "error",
    );
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
 * Strategy (same UX as cloud deployment):
 *   1. Send source files to the cloud build API (cloud compilation)
 *   2. Download the compiled .so binary from the cloud build API
 *   3. Fall back to local CLI if cloud API is unavailable
 *   4. Fall back to codegen-only if nothing works
 */
export async function runWasmBuild(
  input: WasmBuildInput,
  onLog: (line: string, level: "info" | "warn" | "error") => void,
): Promise<WasmBuildResult> {
  const startedAt = Date.now();

  // Step 1: Use pre-generated source files (generated once in compile.ts)
  const generatedFiles = input.generatedFiles;

  onLog(`[cloud] Using ${generatedFiles.length} pre-generated source file(s)`, "info");
  for (const f of generatedFiles) {
    onLog(`[cloud]   ${f.path} (${f.content.length} chars)`, "info");
  }

  // Step 2: Try cloud build (SolPG only supports Anchor framework)
  let cloudResult: { success: boolean; uuid: string; logs: string[]; idl: unknown } | null = null;
  if (input.framework === "ANCHOR") {
    cloudResult = await compileWithCloudBuild(generatedFiles, onLog);
  } else {
    onLog(`[cloud] Cloud build only supports Anchor — skipping for ${input.framework}`, "warn");
  }

  if (cloudResult) {
    if (cloudResult.success) {
      // Build succeeded — fetch the binary
      const workDir = join(
        tmpdir(),
        `solflow-cloud-${randomBytes(4).toString("hex")}`,
      );
      await mkdir(workDir, { recursive: true });
      const binaryPath = join(workDir, "program.so");
      const binarySize = await fetchCloudBinary(
        cloudResult.uuid,
        binaryPath,
        onLog,
      );

      if (binarySize) {
        return {
          success: true,
          logs: cloudResult.logs,
          errors: [],
          warnings: [],
          workDir,
          binaryPath,
          binarySize,
          duration: Date.now() - startedAt,
          method: "cloud",
        };
      }
      // Binary fetch failed — fall through to local CLI
      onLog("[cloud] Binary fetch failed, trying local CLI...", "warn");
    } else {
      // Build had errors — return them (same behavior)
      const { errors, warnings } = parseErrors(cloudResult.logs);
      return {
        success: false,
        logs: cloudResult.logs,
        errors: errors.length > 0 ? errors : ["Compilation failed"],
        warnings,
        workDir: "",
        binaryPath: null,
        binarySize: null,
        duration: Date.now() - startedAt,
        method: "cloud",
      };
    }
  }

  // Step 3: cloud build unavailable — falling back to local CLI
  onLog("[cloud] Cloud API unavailable, trying local toolchain...", "warn");

  // Write files to temp dir for local compilation
  let workDir: string;
  try {
    workDir = join(tmpdir(), `solflow-local-${randomBytes(4).toString("hex")}`);
    await mkdir(workDir, { recursive: true });

    for (const file of generatedFiles) {
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
      : "cargo-build-sbf";

  // Anchor builds from workspace root, cargo-build-sbf needs the program subdirectory
  const programName = input.ir.program.name;
  const isAnchor = input.framework === "ANCHOR";
  const buildDir = isAnchor ? workDir : join(workDir, "programs", programName);

  // For non-Anchor: use --bpf-out-dir to force output to a known location
  const outDir = join(workDir, "out");
  if (!isAnchor) {
    await mkdir(outDir, { recursive: true });
  }
  const effectiveBuildCmd = isAnchor ? buildCmd : `${buildCmd} --sbf-out-dir ${outDir}`;

  onLog(`[local] Running: ${effectiveBuildCmd} in ${buildDir}`, "info");

  try {
    const { code, logs } = await runCommand(effectiveBuildCmd, [], buildDir, onLog);
    const duration = Date.now() - startedAt;
    const { errors, warnings } = parseErrors(logs);

    if (code !== 0) {
      onLog(`[local] Build failed with exit code ${code}`, "error");
      await rm(workDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
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

    // Find the .so binary
    let binaryPath: string | null = null;
    let binarySize: number | null = null;
    const { readdir } = await import("fs/promises");

    // Search paths in priority order
    const searchPaths = isAnchor
      ? [join(workDir, "target", "deploy")]
      : [
          outDir, // forced output via --bpf-out-dir
          join(workDir, "programs", programName, "target", "deploy"),
          join(workDir, "programs", programName, "target", "sbf-solana-solana", "release"),
          join(workDir, "target", "deploy"),
          join(workDir, "target", "sbf-solana-solana", "release"),
        ];

    for (const dir of searchPaths) {
      try {
        const entries = await readdir(dir);
        const soFile = entries.find((e) => e.endsWith(".so"));
        if (soFile) {
          binaryPath = join(dir, soFile);
          const buf = await readFile(binaryPath);
          binarySize = buf.byteLength;
          onLog(
            `[local] Compiled binary: ${binaryPath} (${binarySize} bytes)`,
            "info",
          );
          break;
        }
      } catch {
        // Directory doesn't exist, try next
      }
    }

    if (!binaryPath) {
      onLog(`[local] Build succeeded but no .so binary found. Temp dir: ${workDir}`, "warn");
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
        "[cloud] Cloud compilation unavailable.",
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
