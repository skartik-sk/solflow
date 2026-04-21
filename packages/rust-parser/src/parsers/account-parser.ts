// Account parser — parse #[derive(Accounts)] structs.

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

  // Use a fresh regex each time to avoid state issues
  let searchFrom = 0;
  while (searchFrom < src.length) {
    const remaining = src.slice(searchFrom);
    const re = new RegExp(RE_ACCOUNTS_STRUCT.source);
    const match = re.exec(remaining);
    if (!match) break;

    const docComment = match[2]?.trim();
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

function parseAccountFields(body: string): ParsedAccount[] {
  const accounts: ParsedAccount[] = [];
  let pendingDoc: string | undefined;
  let pendingAttr: string | undefined;

  const lines = body.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Collect doc comments
    const docMatch = trimmed.match(/^\/\/\/\s*(.*)/);
    if (docMatch) {
      pendingDoc = (pendingDoc ? pendingDoc + " " : "") + docMatch[1].trim();
      continue;
    }

    // Collect #[account(...)] attributes
    const attrMatch = trimmed.match(/^#\[account\(([^)]*)\)\]$/);
    if (attrMatch) {
      pendingAttr = attrMatch[1];
      continue;
    }

    // Collect individual #[signer], #[mut] attributes
    const singleAttrMatch = trimmed.match(/^#\[(signer|mut)\]$/);
    if (singleAttrMatch) {
      pendingAttr = singleAttrMatch[1];
      continue;
    }

    // Match field: pub name: Type<'info>,
    const fieldMatch = trimmed.match(/^pub\s+(\w+)\s*:\s*(.+?)\s*,?\s*$/);
    if (fieldMatch) {
      const fieldName = fieldMatch[1];
      const rawType = fieldMatch[2].replace(/<'info>/, "").trim();

      const { accountType, stateType } = detectAccountKind(rawType);
      const constraints = pendingAttr ? parseConstraints(pendingAttr) : [];

      const isMut = constraints.some((c) => c.type === "mut") || rawType.includes("Mut");
      const isSigner = constraints.some((c) => c.type === "signer") || rawType.includes("Signer");
      const isInit = constraints.some((c) => c.type === "init" || c.type === "init-if-needed");
      const isClose = constraints.some((c) => c.type === "close");

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
        constraints,
        description: pendingDoc || undefined,
        seeds: seeds.length > 0 ? seeds : undefined,
      });

      pendingDoc = undefined;
      pendingAttr = undefined;
      continue;
    }

    // Reset on non-attribute, non-field lines (but not blank lines)
    if (trimmed !== "" && !docMatch && !attrMatch && !singleAttrMatch && !fieldMatch) {
      pendingDoc = undefined;
      pendingAttr = undefined;
    }
  }

  return accounts;
}
