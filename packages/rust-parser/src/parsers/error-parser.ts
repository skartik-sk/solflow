// Error parser — parse #[error_code] enums.
// Handles explicit error codes, multi-line messages, doc comments, and offset attribute.

import { RE_ERROR_ENUM, RE_ERROR_VARIANT } from "../utils/anchor-patterns";
import { extractBalancedBlock } from "../utils/regex-helpers";
import type { ParsedError } from "../types";

export function parseErrors(src: string): ParsedError[] {
  const errors: ParsedError[] = [];
  let searchFrom = 0;

  while (searchFrom < src.length) {
    const remaining = src.slice(searchFrom);
    const re = new RegExp(RE_ERROR_ENUM.source);
    const match = re.exec(remaining);
    if (!match) break;

    const absIndex = searchFrom + match.index;
    const blockStart = src.indexOf("{", absIndex);
    const block = extractBalancedBlock(src, blockStart);
    if (!block) {
      searchFrom = absIndex + match[0].length;
      continue;
    }

    // Check for #[error_code(offset = N)] attribute before the enum
    const preceding = src.slice(Math.max(0, absIndex - 100), absIndex);
    const offsetMatch = preceding.match(/#\[error_code(?:\(\s*(?:offset\s*=\s*(\d+))?\s*\))?\]/);
    const baseOffset = offsetMatch && offsetMatch[1] ? parseInt(offsetMatch[1], 10) : 6000;

    const variants = parseErrorVariants(block.content, baseOffset);
    errors.push(...variants);
    searchFrom = block.endPos;
  }

  return errors;
}

function parseErrorVariants(body: string, baseCode: number): ParsedError[] {
  const errors: ParsedError[] = [];
  let code = baseCode;

  // Try #[msg("...")] pattern first
  const re = new RegExp(RE_ERROR_VARIANT.source, "g");
  let match;

  while ((match = re.exec(body)) !== null) {
    // Look backwards for explicit error code: #[error_code(offset = N)] or code = N
    const preceding = body.slice(Math.max(0, match.index - 100), match.index);
    const explicitCode = preceding.match(/(?:code|offset)\s*=\s*(\d+)/);
    errors.push({
      name: match[2],
      code: explicitCode ? parseInt(explicitCode[1], 10) : code++,
      message: match[1],
    });
  }

  // If no #[msg(...)] pattern found, try to parse plain variants
  if (errors.length === 0) {
    // Match variants with optional explicit values: Name = 100, or Name,
    const variantRe = /(\w+)\s*(?:=\s*(\d+)\s*)?,/g;
    let vMatch;
    while ((vMatch = variantRe.exec(body)) !== null) {
      const name = vMatch[1];
      // Skip keywords
      if (["pub", "enum", "fn"].includes(name)) continue;
      const explicitCode = vMatch[2] ? parseInt(vMatch[2], 10) : null;
      if (explicitCode !== null) code = explicitCode;
      // Check if preceded by a doc comment
      const preceding = body.slice(Math.max(0, vMatch.index - 80), vMatch.index);
      const docMatch = preceding.match(/\/\/\/\s*(.+?)\s*$/);
      errors.push({
        name,
        code: code++,
        message: docMatch ? docMatch[1].trim() : name,
      });
    }
  }

  return errors;
}
