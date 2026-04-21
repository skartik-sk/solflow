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
import { parseLogic } from "./parsers/logic-parser";
import { readRustProject, findRustFiles } from "./scanner";
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
  const parsed = parseContent(content);
  const result = parsedProgramToFlow(parsed);

  // Apply auto-layout
  autoLayout(result.nodes, result.edges);

  return result;
}

/**
 * Parse a single .rs file and return ReactFlow nodes/edges.
 */
export function parseFile(filePath: string): ParseResult {
  const content = readFileSync(filePath, "utf-8");
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

function parseContent(content: string): ParsedProgram {
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

  // 7. Parse logic for each instruction
  for (const ix of instructions) {
    const body = extractInstructionBody(content, ix.name);
    if (body) {
      ix.logicOps = parseLogic(body);
    }
  }

  return {
    name: programName || "unknown_program",
    version: "0.1.0",
    instructions,
    accounts,
    states,
    errors,
    events,
    constants,
  };
}
