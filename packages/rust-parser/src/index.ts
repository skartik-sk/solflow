// @solflow/rust-parser — Public API
//
// parseProgram(path) — parse a full Anchor/Pinocchio project directory
// parseFile(filePath) — parse a single .rs file
// parseString(content) — parse raw Rust source string

import { readFileSync } from "fs";
import { basename } from "path";
import type { Node, Edge } from "@xyflow/react";
import { autoLayout } from "@solflow/idl-import";
import { parseProgram as parseProgramSig } from "./parsers/program-parser";
import { parseAccounts } from "./parsers/account-parser";
import { parseStates } from "./parsers/state-parser";
import { parseErrors } from "./parsers/error-parser";
import { parseEvents } from "./parsers/event-parser";
import { parseConstants } from "./parsers/constant-parser";
import { parseLogic, parseLogicWithContext } from "./parsers/logic-parser";
import { readRustProject, parseCargoVersion, scanRustProject } from "./scanner";
import { parsedProgramToFlow } from "./converters/to-flow";
import { extractInstructionBody } from "./parsers/program-parser";
import type {
  ParseFramework,
  ParseOptions,
  ParseReport,
  ParseReportFile,
  ParseResult,
  ParseStats,
  ParsedProgram,
  ParsedStructures,
  SourceCoverageOptions,
} from "./types";

export type { ParseOptions, ParseReport, ParseResult, ParseStats, ParsedStructures, SourceCoverageOptions };
export type {
  ParsedProgram,
  ParsedInstruction,
  ParsedAccount,
  ParsedState,
  ParsedError,
  ParsedEvent,
  ParsedConstant,
  ParsedField,
} from "./types";

/**
 * Parse a full project directory and return ReactFlow nodes/edges.
 */
export function parseProgram(path: string, options?: ParseOptions): ParseResult {
  const scan = scanRustProject(path, 10, options?.sourceCoverage);
  const content = readRustProject(path, options?.sourceCoverage);
  const version = parseCargoVersion(path) || "0.1.0";
  const parsed = parseContent(content, version, options?.includeLogic);
  const result = parsedProgramToFlow(parsed);

  // Apply auto-layout
  autoLayout(result.nodes, result.edges);

  return {
    ...result,
    report: createParseReport({
      framework: options?.framework ?? scan.framework,
      parsedFiles: scan.parsedFiles,
      skippedFiles: scan.skippedFiles,
      stats: result.stats,
      warnings: result.warnings,
      content,
    }),
  };
}

/**
 * Parse a single .rs file and return ReactFlow nodes/edges.
 */
export function parseFile(filePath: string): ParseResult {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stats = emptyStats();
    const warnings = [`Failed to read file: ${msg}`];
    return {
      nodes: [],
      edges: [],
      stats,
      warnings,
      report: createParseReport({
        framework: "unknown",
        parsedFiles: [],
        skippedFiles: [{ path: basename(filePath), status: "skipped", reason: msg }],
        stats,
        warnings,
        content: "",
      }),
    };
  }
  const parsed = parseContent(content);
  const result = parsedProgramToFlow(parsed);

  autoLayout(result.nodes, result.edges);

  return {
    ...result,
    report: createParseReport({
      framework: detectFrameworkFromContent(content),
      parsedFiles: [{ path: basename(filePath), status: "parsed" }],
      skippedFiles: [],
      stats: result.stats,
      warnings: result.warnings,
      content,
    }),
  };
}

/**
 * Parse raw Rust source string and return parsed structures (not flow nodes).
 */
export function parseString(content: string, _fileName?: string): ParsedStructures {
  const parsed = parseContent(content);

  return {
    programName: parsed.name,
    instructions: parsed.instructions,
    accountStructs: parsed.accounts,
    states: parsed.states,
    errors: parsed.errors,
    events: parsed.events,
    constants: parsed.constants,
  };
}

// ─── Internal: parse content into ParsedProgram ──────────────────────

function parseContent(content: string, version?: string, includeLogic?: boolean): ParsedProgram {
  // 1. Parse program structure (instruction signatures)
  const { programName, instructions } = parseProgramSig(content);

  // 2. Parse account structs
  const accounts = parseAccounts(content);

  // 3. Parse state structs
  const states = parseStates(content);

  // 4. Parse errors
  const errors = parseErrors(content);

  // 5. Parse events
  const events = parseEvents(content);

  // 6. Parse constants
  const constants = parseConstants(content);

  // 7. Parse logic for each instruction (if enabled)
  const shouldParseLogic = includeLogic !== false;
  for (const ix of instructions) {
    ix.logicOps = [];
    if (shouldParseLogic) {
      const body = extractInstructionBody(content, ix.name);
      if (body) {
        ix.logicOps = parseLogicWithContext(body, content, ix.accountsStructName, new Set());
      }
    }
  }

  return {
    name: programName || "unknown_program",
    version: version || "0.1.0",
    instructions,
    accounts,
    states,
    errors,
    events,
    constants,
  };
}

function emptyStats(): ParseStats {
  return {
    instructions: 0,
    accounts: 0,
    states: 0,
    errors: 0,
    events: 0,
    logicOps: 0,
  };
}

function createParseReport(input: {
  framework: ParseFramework;
  parsedFiles: ParseReportFile[];
  skippedFiles: ParseReportFile[];
  stats: ParseStats;
  warnings: string[];
  content: string;
}): ParseReport {
  const unsupportedConstructs = detectUnsupportedConstructs(input.content, input.stats, input.framework);
  const confidenceReasons: string[] = [];
  let confidence: ParseReport["confidence"] = "high";

  if (input.stats.instructions === 0) {
    confidence = "low";
    confidenceReasons.push("No instructions were detected");
  } else {
    confidenceReasons.push(`${input.stats.instructions} instruction(s) detected`);
  }

  if (input.framework === "unknown") {
    confidence = confidence === "high" ? "medium" : confidence;
    confidenceReasons.push("Project framework could not be detected");
  } else {
    confidenceReasons.push(`${input.framework} framework detected`);
  }

  if (input.parsedFiles.length === 0) {
    confidence = "low";
    confidenceReasons.push("No Rust source files were parsed");
  } else {
    confidenceReasons.push(`${input.parsedFiles.length} Rust source file(s) scanned`);
  }

  if (unsupportedConstructs.length > 0) {
    confidence = confidence === "high" ? "medium" : confidence;
    confidenceReasons.push(`${unsupportedConstructs.length} construct(s) require manual review`);
  }

  if (input.warnings.length > 0) {
    confidence = confidence === "high" ? "medium" : confidence;
    confidenceReasons.push(`${input.warnings.length} warning(s) emitted`);
  }

  return {
    framework: input.framework,
    filesParsed: input.parsedFiles.length,
    filesSkipped: input.skippedFiles.length,
    parsedFiles: input.parsedFiles,
    skippedFiles: input.skippedFiles,
    unsupportedConstructs,
    confidence,
    confidenceReasons,
  };
}

function detectFrameworkFromContent(content: string): ParseFramework {
  if (content.includes("anchor_lang") || content.includes("#[program]")) return "anchor";
  if (content.includes("quasar_lang") || content.includes("quasar_lang::prelude")) return "quasar";
  if (
    content.includes("pinocchio")
    || content.includes("entrypoint!")
    || content.includes("program_entrypoint!")
    || content.includes("lazy_program_entrypoint!")
  ) {
    return "pinocchio";
  }
  return "unknown";
}

function detectUnsupportedConstructs(content: string, stats: ParseStats, framework: ParseFramework): string[] {
  const unsupported = new Set<string>();

  if (content.includes("#[access_control")) {
    unsupported.add("Anchor access_control macros require manual review");
  }
  if (content.includes("remaining_accounts")) {
    unsupported.add("remaining_accounts usage is not expanded into explicit account nodes");
  }
  if (/\bInterfaceAccount\b|\bInterface\b/.test(content)) {
    unsupported.add("Interface account constraints are normalized only where the type mapper recognizes them");
  }
  if (
    framework === "pinocchio"
    && stats.instructions === 0
    && (content.includes("program_entrypoint!") || content.includes("lazy_program_entrypoint!"))
  ) {
    unsupported.add("Pinocchio entrypoint dispatch was detected but no instruction handlers were extracted");
  }

  return Array.from(unsupported);
}
