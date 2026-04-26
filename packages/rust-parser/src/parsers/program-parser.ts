// Program parser — parse #[program] blocks and extract instruction signatures.
// Also handles `impl` blocks for instruction bodies found in separate modules.
// Also handles Pinocchio entrypoint! pattern.

import { RE_PROGRAM_BLOCK } from "../utils/anchor-patterns";
import { extractBalancedBlock, collectDocComments } from "../utils/regex-helpers";
import { mapRustType } from "../utils/type-mapper";
import type { ParsedInstruction, ParsedField } from "../types";

/**
 * Parse #[program] block to extract instruction signatures.
 * Also detects Pinocchio programs (entrypoint! pattern).
 * Returns: { programName, instructions }
 */
export function parseProgram(src: string): {
  programName?: string;
  instructions: ParsedInstruction[];
} {
  const instructions: ParsedInstruction[] = [];
  let programName: string | undefined;

  // 1. Try Anchor/Quasar #[program] blocks
  let offset = 0;
  while (offset < src.length) {
    const remaining = src.slice(offset);
    const match = RE_PROGRAM_BLOCK.exec(remaining);
    if (!match) break;

    const name = match[1];
    if (!programName) programName = name;

    const absIdx = offset + match.index;
    const blockStart = src.indexOf("{", absIdx);
    const block = extractBalancedBlock(src, blockStart);
    if (!block) {
      offset = absIdx + match[0].length;
      continue;
    }

    const parsed = parseInstructionFns(block.content);
    instructions.push(...parsed);
    offset = block.endPos;
  }

  // 2. If no #[program] found, try Pinocchio entrypoint! pattern
  if (instructions.length === 0) {
    const pinoResult = parsePinocchioProgram(src);
    if (pinoResult) {
      return pinoResult;
    }
  }

  return { programName, instructions };
}

/**
 * Parse Pinocchio program — detect entrypoint!/program_entrypoint! and process_instruction match arms.
 * Handles multiple patterns:
 * 1. Name::DISCRIMINATOR pattern (structured instruction dispatch)
 * 2. Raw numeric discriminators: Some((0, data)) => function_name(...)
 * 3. Single-instruction programs with no match arms
 */
function parsePinocchioProgram(src: string): { programName?: string; instructions: ParsedInstruction[] } | null {
  // Detect Pinocchio by entrypoint! or program_entrypoint! or lazy_program_entrypoint! macro
  const hasEntrypoint = src.includes("entrypoint!") || src.includes("program_entrypoint!") || src.includes("lazy_program_entrypoint!");
  const hasProcessInstruction = src.includes("process_instruction");
  if (!hasEntrypoint && !hasProcessInstruction) return null;

  const instructions: ParsedInstruction[] = [];

  // Pattern 1: Name::DISCRIMINATOR pattern
  const discriminatorRe = /(\w+)::DISCRIMINATOR/g;
  const ixNames = new Set<string>();
  let dm;
  while ((dm = discriminatorRe.exec(src)) !== null) {
    ixNames.add(dm[1]);
  }

  // Pattern 2: Raw numeric discriminators: Some((0, data)) => function_call(...)
  const numericDiscRe = /Some\s*\(\s*\(\s*(\d+)\s*,\s*(?:data|_)\s*\)\s*\)\s*=>\s*(\w+)\s*\(/g;
  let ndm;
  const numericIxes: Map<string, string> = new Map(); // functionName -> discriminator
  while ((ndm = numericDiscRe.exec(src)) !== null) {
    numericIxes.set(ndm[2], ndm[1]);
  }

  // Pattern 3: Extract process_instruction body and look for match arms with function calls
  if (ixNames.size === 0 && numericIxes.size === 0) {
    // Try to find the process_instruction function body
    const piBody = extractProcessInstructionBody(src);
    if (piBody) {
      // Look for function calls in match arms or direct calls
      const fnCallRe = /(\w+)\s*\(\s*(?:_program_id|program_id)?\s*,?\s*(?:accounts)?\s*,?\s*(?:data|instruction_data)?\s*\)/g;
      let fc;
      const fnCalls = new Set<string>();
      while ((fc = fnCallRe.exec(piBody)) !== null) {
        const name = fc[1];
        // Skip common non-instruction names
        if (["process_instruction", "log", "Some", "Err", "Ok", "unwrap", "try_from"].includes(name)) continue;
        fnCalls.add(name);
      }

      for (const fnName of fnCalls) {
        numericIxes.set(fnName, String(numericIxes.size));
      }

      // If still nothing, check for a single-instruction program
      if (fnCalls.size === 0 && piBody.length > 20) {
        // Single instruction — the entire process_instruction body is the instruction
        instructions.push({
          name: "process",
          args: extractPinocchioSingleInstructionArgs(src),
          accountsStructName: "",
          description: undefined,
          logicOps: [],
          accessControl: "none",
        });

        const programName = extractPinocchioProgramName(src);
        return { programName, instructions };
      }
    }
  }

  // Try to get program name
  let programName: string | undefined;
  const cargoMatch = src.match(/name\s*=\s*"([^"]+)"/);
  if (cargoMatch) programName = cargoMatch[1];
  if (!programName) programName = extractPinocchioProgramName(src);

  // Process Name::DISCRIMINATOR instructions
  for (const ixName of ixNames) {
    const body = extractPinocchioProcessBody(src, ixName);
    const accountsStructName = `${ixName}Accounts`;
    const accountFields = parsePinocchioAccountStruct(src, accountsStructName);
    const dataStructName = `${ixName}InstructionData`;
    const dataFields = parsePinocchioDataStruct(src, dataStructName);
    const args: ParsedField[] = dataFields.map(f => ({ name: f.name, type: f.type }));

    instructions.push({
      name: ixName.toLowerCase(),
      args,
      accountsStructName,
      description: undefined,
      logicOps: [],
      accessControl: "none",
    });
  }

  // Process numeric discriminator instructions
  for (const [fnName, disc] of numericIxes) {
    if (ixNames.has(fnName)) continue; // Already handled by DISCRIMINATOR pattern

    // Find function body
    const body = extractPinocchioFunctionBody(src, fnName);

    // Look for account structs related to this function
    const args = extractPinocchioFnArgs(src, fnName);

    instructions.push({
      name: fnName.replace(/_/g, "_").toLowerCase(),
      args,
      accountsStructName: "",
      description: undefined,
      logicOps: [],
      accessControl: "none",
    });
  }

  if (instructions.length === 0) return null;
  return { programName: programName || "pinocchio_program", instructions };
}

/**
 * Extract process_instruction function body.
 * Also handles lazy_program_entrypoint! which uses InstructionContext parameter.
 */
function extractProcessInstructionBody(src: string): string | null {
  // Standard process_instruction function
  const re = /fn\s+process_instruction\s*\([^)]*\)\s*->\s*(?:ProgramResult|.*?Result)/g;
  let match;
  while ((match = re.exec(src)) !== null) {
    const bodyStart = src.indexOf("{", match.index);
    if (bodyStart === -1) continue;
    const body = extractBalancedBlock(src, bodyStart);
    if (body) return body.content;
  }

  // lazy_program_entrypoint! uses process_instruction with InstructionContext
  const lazyRe = /fn\s+process_instruction\s*\(\s*(?:mut\s+)?instruction_context\s*:\s*(?:mut\s+)?InstructionContext/g;
  while ((match = lazyRe.exec(src)) !== null) {
    const bodyStart = src.indexOf("{", match.index);
    if (bodyStart === -1) continue;
    const body = extractBalancedBlock(src, bodyStart);
    if (body) return body.content;
  }

  return null;
}

/**
 * Extract a standalone Pinocchio function body (not inside an impl).
 */
function extractPinocchioFunctionBody(src: string, fnName: string): string | null {
  const escaped = fnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`fn\\s+${escaped}\\s*\\(`, "g");
  let match;
  while ((match = re.exec(src)) !== null) {
    const bodyStart = src.indexOf("{", match.index);
    if (bodyStart === -1) continue;
    const body = extractBalancedBlock(src, bodyStart);
    if (body) return body.content;
  }
  return null;
}

/**
 * Extract args from a Pinocchio function's parameters and related structs.
 */
function extractPinocchioFnArgs(src: string, fnName: string): ParsedField[] {
  const escaped = fnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const args: ParsedField[] = [];

  // Look for #[repr(C)] structs that might be the instruction data
  // Try: function_name_instruction_data, FunctionNameInstructionData, etc.
  const pascalName = fnName.charAt(0).toUpperCase() + fnName.slice(1);
  const candidates = [
    `${pascalName}InstructionData`,
    `${fnName}_instruction_data`,
    `${pascalName}Data`,
    `InstructionData`,
  ];

  for (const candidate of candidates) {
    const dataFields = parsePinocchioDataStruct(src, candidate);
    if (dataFields.length > 0) {
      return dataFields;
    }
  }

  return args;
}

/**
 * Extract args for a single-instruction Pinocchio program.
 */
function extractPinocchioSingleInstructionArgs(src: string): ParsedField[] {
  // Look for #[repr(C)] struct with TryFrom impl
  const reprCRe = /#\[repr\s*\(\s*C\s*\)\]\s*(?:#\[derive\s*\([^)]*\)\]\s*)?(?:pub\s+)?struct\s+(\w+)\s*\{/g;
  let match;
  while ((match = reprCRe.exec(src)) !== null) {
    const structName = match[1];
    // Check if this struct has a TryFrom impl
    if (src.includes(`impl TryFrom`) && src.includes(structName)) {
      return parsePinocchioDataStruct(src, structName);
    }
  }
  return [];
}

/**
 * Try to extract a program name from the Pinocchio source.
 */
function extractPinocchioProgramName(src: string): string | undefined {
  // Try mod declaration
  const modMatch = src.match(/(?:pub\s+)?mod\s+(\w+)\s*;/);
  if (modMatch) return modMatch[1];
  // Try ID constant with crate::ID or solana_program::pubkey! declaration
  const idDeclMatch = src.match(/solana_program::pubkey!\s*\(\s*"([^"]+)"/);
  if (idDeclMatch) return "pinocchio_program";
  const idMatch = src.match(/pub\s+const\s+ID/);
  if (idMatch) return "pinocchio_program";
  // Try to derive from the process_instruction function's context
  const pioMatch = src.match(/crate::(\w+)::/);
  if (pioMatch) return pioMatch[1];
  return undefined;
}

/**
 * Extract the process() method body from a Pinocchio instruction impl block.
 */
function extractPinocchioProcessBody(src: string, ixName: string): string | null {
  // Look for: impl<'a> Name<'a> { ... pub fn process(&mut self) -> ProgramResult { ... } }
  const re = new RegExp(`impl<'a>\\s+${ixName}<'a>\\s*\\{`, "g");
  let match;
  while ((match = re.exec(src)) !== null) {
    const implBlock = extractBalancedBlock(src, src.indexOf("{", match.index));
    if (implBlock) {
      const processRe = /pub\s+fn\s+process\s*\([^)]*\)\s*->\s*ProgramResult\s*\{/g;
      const pMatch = processRe.exec(implBlock.content);
      if (pMatch) {
        const bodyStart = implBlock.content.indexOf("{", pMatch.index);
        const body = extractBalancedBlock(implBlock.content, bodyStart);
        if (body) return body.content;
      }
    }
  }
  return null;
}

/**
 * Parse a Pinocchio accounts struct to get field names.
 */
function parsePinocchioAccountStruct(src: string, structName: string): ParsedField[] {
  const fields: ParsedField[] = [];
  const re = new RegExp(`pub\\s+struct\\s+${structName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<'a>\\s*\\{`, "g");
  let match;
  while ((match = re.exec(src)) !== null) {
    const block = extractBalancedBlock(src, src.indexOf("{", match.index));
    if (block) {
      const fieldRe = /pub\s+(\w+)\s*:\s*(?:&'a\s+)?AccountInfo/g;
      let fm;
      while ((fm = fieldRe.exec(block.content)) !== null) {
        fields.push({ name: fm[1], type: { defined: "AccountInfo" } });
      }
    }
  }
  return fields;
}

/**
 * Parse a Pinocchio instruction data struct to get field names and types.
 */
function parsePinocchioDataStruct(src: string, structName: string): ParsedField[] {
  const fields: ParsedField[] = [];
  const escaped = structName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`pub\\s+struct\\s+${escaped}\\s*\\{`, "g");
  let match;
  while ((match = re.exec(src)) !== null) {
    const block = extractBalancedBlock(src, src.indexOf("{", match.index));
    if (block) {
      const fieldRe = /pub\s+(\w+)\s*:\s*(\w+)/g;
      let fm;
      while ((fm = fieldRe.exec(block.content)) !== null) {
        fields.push({ name: fm[1], type: mapRustType(fm[2]) });
      }
    }
  }
  return fields;
}

function parseInstructionFns(programBody: string): ParsedInstruction[] {
  const instructions: ParsedInstruction[] = [];

  // Strip all comments so multi-line signatures with inline comments parse correctly
  const cleaned = programBody.replace(/\/\/.*$/gm, "");

  // Phase 1: Find all `pub fn` declarations
  const fnDeclRe = /(?:\/\/\/\s*(.*))?\s*pub\s+fn\s+(\w+)(?:<[^>]*>)?\s*\(/g;
  let fnDecl;
  while ((fnDecl = fnDeclRe.exec(cleaned)) !== null) {
    const docComment = fnDecl[1]?.trim();
    const fnName = fnDecl[2];
    const parenStart = fnDecl.index + fnDecl[0].length - 1; // position of '('

    // Phase 2: Extract balanced paren block manually
    const parenContent = extractBalancedParens(cleaned, parenStart);
    if (!parenContent) continue;

    // Phase 3: Parse "param: Context<X>" and extra args from paren content
    const parsed = parseFnSignature(parenContent);
    if (!parsed) continue;

    const description = docComment || collectDocComments(cleaned, fnDecl.index) || undefined;

    // Check for #[access_control] before this function
    let accessControl: "none" | "admin_only" | "custom" = "none";
    const before = cleaned.slice(Math.max(0, fnDecl.index - 300), fnDecl.index);
    if (/#\[access_control\s*\(/.test(before)) {
      accessControl = "custom";
    }

    instructions.push({
      name: fnName,
      args: parsed.args,
      accountsStructName: parsed.accountsStructName,
      description,
      logicOps: [],
      accessControl,
    });
  }

  return instructions;
}

/**
 * Extract content between balanced ( ) starting at the opening paren position.
 */
function extractBalancedParens(src: string, openPos: number): string | null {
  if (src[openPos] !== "(") return null;
  let depth = 1;
  let pos = openPos + 1;
  while (pos < src.length && depth > 0) {
    if (src[pos] === '"') {
      pos++;
      while (pos < src.length && src[pos] !== '"') {
        if (src[pos] === "\\") pos++;
        pos++;
      }
      pos++;
      continue;
    }
    if (src[pos] === "(") depth++;
    else if (src[pos] === ")") depth--;
    pos++;
  }
  return src.slice(openPos + 1, pos - 1);
}

/**
 * Parse function signature content: "param: Context<X>, extra_arg: Type, ..."
 */
function parseFnSignature(sig: string): { accountsStructName: string; args: ParsedField[] } | null {
  // Normalize whitespace (collapse multi-line into single line)
  const normalized = sig.replace(/\s+/g, " ").trim();

  // Match: param: Context<'_, '_, '_, 'info, AccountsStruct>  or  param: Context<AccountsStruct>
  // Also handles: param: Ctx<AccountsStruct> (Quasar framework)
  // Also handles: param: CtxWithRemaining<AccountsStruct> (Quasar framework)
  // Handles any number of lifetime parameters before the struct name
  const ctxMatch = normalized.match(/(\w+)\s*:\s*(?:Context|CtxWithRemaining|Ctx)\s*<\s*(?:'\w+\s*,\s*)*(\w+)/);
  if (!ctxMatch) return null;

  const accountsStructName = ctxMatch[2];

  // Get everything after the Context param — find matching > by tracking angle bracket depth
  const ctxStart = normalized.search(/Context|CtxWithRemaining|Ctx\b/);
  const openAngle = normalized.indexOf("<", ctxStart);
  let angleDepth = 0;
  let ctxEnd = openAngle;
  for (let ci = openAngle; ci < normalized.length; ci++) {
    if (normalized[ci] === "<") angleDepth++;
    else if (normalized[ci] === ">") {
      angleDepth--;
      if (angleDepth === 0) { ctxEnd = ci; break; }
    }
  }
  const afterCtx = normalized.slice(ctxEnd + 1).trim();

  // Parse extra args (after comma following the Context param)
  const args: ParsedField[] = [];
  if (afterCtx.startsWith(",")) {
    const extraStr = afterCtx.slice(1).trim();
    if (extraStr) {
      const parts = splitArgs(extraStr);
      for (const part of parts) {
        const argMatch = part.trim().match(/^(\w+)\s*:\s*(.+)$/);
        if (argMatch) {
          args.push({
            name: argMatch[1],
            type: mapRustType(argMatch[2].trim()),
          });
        }
      }
    }
  }

  return { accountsStructName, args };
}

/**
 * Extract instruction handler body for a specific function.
 * Searches both inside #[program] block and in `impl <program>` blocks.
 * Also handles Pinocchio process() methods.
 */
export function extractInstructionBody(
  src: string,
  fnName: string,
): string | null {
  const escapedName = fnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Try 0: Pinocchio — capitalize name and look for impl Xxx<'a> { pub fn process() }
  // Also try for standalone functions with this name
  const pascalName = fnName.charAt(0).toUpperCase() + fnName.slice(1);
  const pinoPattern = new RegExp(`impl<'a>\\s+${pascalName}<'a>\\s*\\{`, "g");
  let pinoMatch;
  while ((pinoMatch = pinoPattern.exec(src)) !== null) {
    const implBlock = extractBalancedBlock(src, src.indexOf("{", pinoMatch.index));
    if (implBlock) {
      const processRe = /pub\s+fn\s+process\s*\([^)]*\)\s*->\s*ProgramResult\s*\{/g;
      const pMatch = processRe.exec(implBlock.content);
      if (pMatch) {
        const bodyStart = implBlock.content.indexOf("{", pMatch.index);
        if (bodyStart !== -1) {
          const body = extractBalancedBlock(implBlock.content, bodyStart);
          if (body) return body.content;
        }
      }
    }
  }

  // Try 0b: Pinocchio standalone function — fn make(...) or fn process(...)
  // These are called from match arms in process_instruction
  if (fnName === "process") {
    // For single-instruction programs, use the process_instruction body
    const piBody = extractProcessInstructionBody(src);
    if (piBody) return piBody;
  }
  const standaloneRe = new RegExp(`(?:pub\\s+)?fn\\s+${escapedName}\\s*\\(\\s*(?:_program_id|program_id|_pid)?\\s*,?\\s*(?:accounts|&\\[AccountInfo\\])`, "g");
  let standaloneMatch;
  while ((standaloneMatch = standaloneRe.exec(src)) !== null) {
    const bodyStart = src.indexOf("{", standaloneMatch.index);
    if (bodyStart === -1) continue;
    const body = extractBalancedBlock(src, bodyStart);
    if (body) return body.content;
  }

  // Try 1: Direct pub fn match — skip commented-out matches
  const fnPattern = new RegExp(`pub\\s+fn\\s+${escapedName}\\s*\\(`, "g");
  let fnMatch;
  while ((fnMatch = fnPattern.exec(src)) !== null) {
    // Check if this match is inside a comment
    const lineStart = src.lastIndexOf("\n", fnMatch.index) + 1;
    const prefix = src.slice(lineStart, fnMatch.index).trim();
    if (prefix.startsWith("//") || prefix === "//") continue;
    // Check if inside a block comment
    const before = src.slice(0, fnMatch.index);
    const lastOpen = before.lastIndexOf("/*");
    const lastClose = before.lastIndexOf("*/");
    if (lastOpen !== -1 && (lastClose === -1 || lastOpen > lastClose)) continue;

    const bodyStart = src.indexOf("{", fnMatch.index);
    if (bodyStart !== -1) {
      const body = extractBalancedBlock(src, bodyStart);
      if (body) return body.content;
    }
  }

  // Try 2: Look inside impl blocks for the function
  const implPattern = /impl\s*<\s*'info\s*>\s*\w+\s*\{/g;
  let implMatch;
  while ((implMatch = implPattern.exec(src)) !== null) {
    const implBlock = extractBalancedBlock(src, src.indexOf("{", implMatch.index));
    if (implBlock) {
      const fnInImpl = new RegExp(`pub\\s+fn\\s+${escapedName}\\s*\\(`);
      const fnMatch2 = fnInImpl.exec(implBlock.content);
      if (fnMatch2) {
        const bodyStart = implBlock.content.indexOf("{", fnMatch2.index);
        if (bodyStart !== -1) {
          const body = extractBalancedBlock(implBlock.content, bodyStart);
          if (body) return body.content;
        }
      }
    }
  }

  return null;
}

function splitArgs(src: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let ci = 0;

  while (ci < src.length) {
    const ch = src[ci];
    // Skip string literals
    if (ch === '"') {
      current += ch;
      ci++;
      while (ci < src.length && src[ci] !== '"') {
        if (src[ci] === "\\") { current += src[ci]; ci++; }
        current += src[ci];
        ci++;
      }
      if (ci < src.length) { current += src[ci]; ci++; }
      continue;
    }
    if (ch === "<" || ch === "(" || ch === "[") depth++;
    else if (ch === ">" || ch === ")" || ch === "]") depth--;

    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
    ci++;
  }
  if (current.trim()) parts.push(current);

  return parts;
}
