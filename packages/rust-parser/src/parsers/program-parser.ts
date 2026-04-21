// Program parser — parse #[program] blocks and extract instruction signatures.

import { RE_PROGRAM_BLOCK, RE_INSTRUCTION_FN } from "../utils/anchor-patterns";
import { extractBalancedBlock, collectDocComments } from "../utils/regex-helpers";
import { mapRustType } from "../utils/type-mapper";
import type { ParsedInstruction, ParsedField } from "../types";

/**
 * Parse #[program] block to extract instruction signatures.
 * Returns: { programName, instructions }
 */
export function parseProgram(src: string): {
  programName?: string;
  instructions: ParsedInstruction[];
} {
  const match = RE_PROGRAM_BLOCK.exec(src);
  if (!match) return { instructions: [] };

  const programName = match[2];
  const blockStart = src.indexOf("{", match.index);

  const block = extractBalancedBlock(src, blockStart);
  if (!block) return { programName, instructions: [] };

  const instructions = parseInstructionFns(block.content);

  return { programName, instructions };
}

function parseInstructionFns(programBody: string): ParsedInstruction[] {
  const instructions: ParsedInstruction[] = [];

  const re = new RegExp(RE_INSTRUCTION_FN.source, "g");
  let fnMatch;

  while ((fnMatch = re.exec(programBody)) !== null) {
    const docComment = fnMatch[1]?.trim();
    const fnName = fnMatch[2];
    const accountsStructName = fnMatch[3];
    const extraArgs = fnMatch[4]?.trim();

    const description = docComment || collectDocComments(programBody, fnMatch.index) || undefined;

    const args = extraArgs ? parseFnArgs(extraArgs) : [];

    instructions.push({
      name: fnName,
      args,
      accountsStructName,
      description,
      logicOps: [],
      accessControl: "none",
    });
  }

  return instructions;
}

/**
 * Extract instruction handler body for a specific function.
 * Returns the content between { } of the function body.
 */
export function extractInstructionBody(
  src: string,
  fnName: string,
): string | null {
  const escapedName = fnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fnPattern = new RegExp(`pub\\s+fn\\s+${escapedName}\\s*\\(`);
  const fnMatch = fnPattern.exec(src);
  if (!fnMatch) return null;

  const bodyStart = src.indexOf("{", fnMatch.index);
  if (bodyStart === -1) return null;

  const body = extractBalancedBlock(src, bodyStart);
  return body ? body.content : null;
}

function parseFnArgs(argsStr: string): ParsedField[] {
  const args: ParsedField[] = [];
  const parts = splitArgs(argsStr);

  for (const part of parts) {
    const argMatch = part.trim().match(/^(\w+)\s*:\s*(.+)$/);
    if (argMatch) {
      args.push({
        name: argMatch[1],
        type: mapRustType(argMatch[2].trim()),
      });
    }
  }

  return args;
}

function splitArgs(src: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const ch of src) {
    if (ch === "<" || ch === "(" || ch === "[") depth++;
    else if (ch === ">" || ch === ")" || ch === "]") depth--;

    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);

  return parts;
}
