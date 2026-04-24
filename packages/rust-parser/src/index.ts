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
import { readRustProject, findRustFiles, parseCargoVersion } from "./scanner";
import { parsedProgramToFlow } from "./converters/to-flow";
import { extractInstructionBody } from "./parsers/program-parser";
import type {
  ParseOptions,
  ParseResult,
  ParseStats,
  ParsedProgram,
  ParsedStructures,
} from "./types";

export type { ParseOptions, ParseResult, ParseStats, ParsedStructures };
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
  const content = readRustProject(path);
  const version = parseCargoVersion(path) || "0.1.0";
  const parsed = parseContent(content, version, options?.includeLogic);
  const result = parsedProgramToFlow(parsed);

  // Apply auto-layout
  autoLayout(result.nodes, result.edges);

  return result;
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
    return { nodes: [], edges: [], stats: { instructions: 0, accounts: 0, states: 0, errors: 0, events: 0, logicOps: 0 }, warnings: [`Failed to read file: ${msg}`] };
  }
  const parsed = parseContent(content);
  const result = parsedProgramToFlow(parsed);

  autoLayout(result.nodes, result.edges);

  return result;
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
