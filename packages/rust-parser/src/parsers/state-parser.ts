// State parser — parse #[account] data structs (not inside Accounts derive).

import { RE_STATE_STRUCT } from "../utils/anchor-patterns";
import { extractBalancedBlock, collectDocComments } from "../utils/regex-helpers";
import { mapRustType } from "../utils/type-mapper";
import type { ParsedState, ParsedField } from "../types";

export function parseStates(src: string): ParsedState[] {
  const states: ParsedState[] = [];
  let searchFrom = 0;

  // 1. Parse #[account] structs (Anchor)
  while (searchFrom < src.length) {
    const remaining = src.slice(searchFrom);
    const re = new RegExp(RE_STATE_STRUCT.source);
    const match = re.exec(remaining);
    if (!match) break;

    const attrContent = match[1] || "";
    const structName = match[2];
    const matchIndex = searchFrom + match.index;

    if (isInsideAccountsBlock(src, matchIndex)) {
      searchFrom = matchIndex + match[0].length;
      continue;
    }

    const blockStart = src.indexOf("{", matchIndex);
    const block = extractBalancedBlock(src, blockStart);
    if (!block) {
      searchFrom = matchIndex + match[0].length;
      continue;
    }

    const description = collectDocComments(src, matchIndex) || undefined;
    const isZeroCopy = attrContent.includes("zero_copy");
    const fields = parseStateFields(block.content);

    states.push({ name: structName, fields, isZeroCopy, description });
    searchFrom = block.endPos;
  }

  // 2. Parse #[repr(C)] structs (Pinocchio state)
  const reprCRe = /#\[repr\s*\(\s*C\s*\)\]\s*(?:#\[derive\s*\([^)]*\)\]\s*)?pub\s+struct\s+(\w+)\s*\{/g;
  let reprMatch;
  while ((reprMatch = reprCRe.exec(src)) !== null) {
    const structName = reprMatch[1];
    // Skip if already parsed as Anchor #[account]
    if (states.some(s => s.name === structName)) continue;
    if (isInsideAccountsBlock(src, reprMatch.index)) continue;

    const blockStart = src.indexOf("{", reprMatch.index);
    const block = extractBalancedBlock(src, blockStart);
    if (!block) continue;

    const fields = parseStateFields(block.content);
    const description = collectDocComments(src, reprMatch.index) || undefined;
    states.push({ name: structName, fields, isZeroCopy: false, description });
  }

  return states;
}

function parseStateFields(body: string): ParsedField[] {
  const fields: ParsedField[] = [];
  let pendingDoc: string | undefined;

  for (const line of body.split("\n")) {
    const trimmed = line.trim();

    const docMatch = trimmed.match(/^\/\/\/\s*(.*)/);
    if (docMatch) {
      pendingDoc = (pendingDoc ? pendingDoc + " " : "") + docMatch[1].trim();
      continue;
    }

    const fieldMatch = trimmed.match(/^pub\s+(\w+)\s*:\s*(.+?)\s*(?:,|$)/);
    if (fieldMatch) {
      const fieldType = fieldMatch[2].replace(/<'info>/, "").trim();
      fields.push({
        name: fieldMatch[1],
        type: mapRustType(fieldType),
        description: pendingDoc || undefined,
      });
      pendingDoc = undefined;
    }

    if (trimmed !== "" && !docMatch && !fieldMatch) {
      pendingDoc = undefined;
    }
  }

  return fields;
}

function isInsideAccountsBlock(src: string, pos: number): boolean {
  // Walk backwards from pos, tracking brace depth to find the enclosing block
  let depth = 0;
  let i = pos - 1;

  while (i >= 0) {
    if (src[i] === "}") depth++;
    else if (src[i] === "{") {
      depth--;
      if (depth < 0) break;
    }
    i--;
  }

  // Scan from the start of the enclosing block to pos for derive(Accounts)
  const before = src.slice(Math.max(0, i), pos);
  const lastDerive = before.lastIndexOf("#[derive");
  if (lastDerive === -1) return false;

  const deriveBlock = before.slice(lastDerive);
  const hasAccounts = /\bAccounts\b/.test(deriveBlock);
  if (!hasAccounts) return false;

  // Count braces in the derive-to-pos segment
  let braceDepth = 0;
  for (let ci = 0; ci < deriveBlock.length; ci++) {
    if (deriveBlock[ci] === "{") braceDepth++;
    else if (deriveBlock[ci] === "}") braceDepth--;
  }

  // If braces balanced, struct was closed — NOT inside
  return braceDepth > 0;
}
