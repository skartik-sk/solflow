// State parser — parse #[account] data structs (not inside Accounts derive).

import { RE_STATE_STRUCT } from "../utils/anchor-patterns";
import { extractBalancedBlock, collectDocComments } from "../utils/regex-helpers";
import { mapRustType } from "../utils/type-mapper";
import type { ParsedState, ParsedField } from "../types";

export function parseStates(src: string): ParsedState[] {
  const states: ParsedState[] = [];
  let searchFrom = 0;

  while (searchFrom < src.length) {
    const remaining = src.slice(searchFrom);
    const re = new RegExp(RE_STATE_STRUCT.source);
    const match = re.exec(remaining);
    if (!match) break;

    const attrContent = match[1] || "";
    const docComment = match[2]?.trim();
    const structName = match[3];
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

    const description = docComment || collectDocComments(src, matchIndex) || undefined;
    const isZeroCopy = attrContent.includes("zero_copy");
    const fields = parseStateFields(block.content);

    states.push({ name: structName, fields, isZeroCopy, description });
    searchFrom = block.endPos;
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
  const before = src.slice(0, pos);
  const lastDerive = before.lastIndexOf("derive(");
  if (lastDerive === -1) return false;

  const accountsIdx = before.indexOf("Accounts", lastDerive);
  if (accountsIdx === -1) return false;

  const lastCloseBrace = before.lastIndexOf("}", pos);
  return accountsIdx > (lastCloseBrace === -1 ? 0 : lastCloseBrace);
}
