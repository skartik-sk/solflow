// Account parser — parse #[derive(Accounts)] structs.
// Handles multiple derives, multi-line attributes, and all Anchor constraint types.

import { RE_ACCOUNTS_STRUCT } from "../utils/anchor-patterns";
import { extractBalancedBlock } from "../utils/regex-helpers";
import { detectAccountKind } from "../utils/type-mapper";
import { parseConstraints } from "./constraint-parser";
import type { ParsedAccount } from "../types";

/**
 * Parse all #[derive(Accounts)] structs from Rust source.
 * Returns a map: struct name → parsed accounts.
 */
export function parseAccounts(src: string): Record<string, ParsedAccount[]> {
  const result: Record<string, ParsedAccount[]> = {};

  let searchFrom = 0;
  while (searchFrom < src.length) {
    const remaining = src.slice(searchFrom);
    const re = new RegExp(RE_ACCOUNTS_STRUCT.source);
    const match = re.exec(remaining);
    if (!match) break;

    const structName = match[3];
    const absIndex = searchFrom + match.index;

    const block = extractBalancedBlock(src, absIndex + match[0].length - 1);
    if (!block || block.endPos <= searchFrom) {
      searchFrom = absIndex + match[0].length;
      continue;
    }

    const accounts = parseAccountFields(block.content);
    result[structName] = accounts;

    searchFrom = block.endPos;
  }

  return result;
}

/** Check if an attribute string is complete: the outer #[...] brackets are balanced. */
function isCompleteAttr(text: string): boolean {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") { i++; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth--;
  }
  return depth === 0;
}

/**
 * Extract the content between balanced parens in #[account(...)].
 * Uses bracket counting instead of regex to handle nested parens/brackets.
 */
function extractAttrContent(text: string): string | null {
  const start = text.indexOf("(");
  if (start === -1) return "";
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") { i++; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        return text.slice(start + 1, i);
      }
    }
  }
  return null;
}

function parseAccountFields(body: string): ParsedAccount[] {
  const accounts: ParsedAccount[] = [];
  let pendingDoc: string | undefined;
  let pendingAttrs: string[] = [];
  let accumulating: string | undefined;

  const lines = body.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Collect doc comments
    const docMatch = trimmed.match(/^\/\/\/\s*(.*)/);
    if (docMatch) {
      pendingDoc = (pendingDoc ? pendingDoc + " " : "") + docMatch[1].trim();
      continue;
    }

    // Collect #[account(...)] attributes — handle multi-line by accumulating
    if (trimmed.startsWith("#[account")) {
      let attrText = trimmed;
      if (!isCompleteAttr(attrText)) {
        accumulating = attrText;
        continue;
      }
      const content = extractAttrContent(attrText);
      if (content !== null) {
        pendingAttrs.push(content);
      }
      continue;
    }

    // Continue accumulating multi-line attribute
    if (accumulating !== undefined && !trimmed.startsWith("pub ")) {
      accumulating += " " + trimmed;
      if (isCompleteAttr(accumulating)) {
        const content = extractAttrContent(accumulating);
        if (content !== null) {
          pendingAttrs.push(content);
        }
        accumulating = undefined;
      }
      continue;
    }

    // Collect individual #[signer], #[mut] attributes
    const singleAttrMatch = trimmed.match(/^#\[(signer|mut)\]$/);
    if (singleAttrMatch) {
      pendingAttrs.push(singleAttrMatch[1]);
      continue;
    }

    // Match field: pub name: Type<'info>,
    const fieldMatch = trimmed.match(/^pub\s+(\w+)\s*:\s*(.+?)\s*,?\s*$/);
    if (fieldMatch) {
      const fieldName = fieldMatch[1];
      const rawType = fieldMatch[2].replace(/<'info>/, "").trim();

      const { accountType, stateType } = detectAccountKind(rawType);
      const constraints = pendingAttrs.length > 0
        ? pendingAttrs.flatMap(a => parseConstraints(a))
        : [];

      const isMut = constraints.some((c) => c.type === "mut") || rawType.includes("Mut");
      const isSigner = constraints.some((c) => c.type === "signer") || rawType.includes("Signer");
      const isInit = constraints.some((c) => c.type === "init" || c.type === "init-if-needed");
      const isClose = constraints.some((c) => c.type === "close");
      const isExecutable = constraints.some((c) => c.type === "custom" && c.expression === "executable");

      const seeds = constraints
        .filter((c) => c.type === "seeds")
        .flatMap((c) => (c as { type: "seeds"; seeds: Array<{ type: string; value: string }> }).seeds);

      accounts.push({
        name: fieldName,
        accountType,
        stateType,
        isMut,
        isSigner,
        isInit,
        isClose,
        isExecutable,
        constraints,
        description: pendingDoc || undefined,
        seeds: seeds.length > 0 ? seeds : undefined,
      });

      pendingDoc = undefined;
      pendingAttrs = [];
      accumulating = undefined;
      continue;
    }

    // Reset on non-attribute, non-field lines (but not blank lines)
    if (trimmed !== "" && !docMatch && !trimmed.startsWith("#[")) {
      pendingDoc = undefined;
      pendingAttrs = [];
      accumulating = undefined;
    }
  }

  return accounts;
}
