// Error parser — parse #[error_code] enums.

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

    const variants = parseErrorVariants(block.content);
    errors.push(...variants);
    searchFrom = block.endPos;
  }

  return errors;
}

function parseErrorVariants(body: string): ParsedError[] {
  const errors: ParsedError[] = [];
  let code = 6000;

  const re = new RegExp(RE_ERROR_VARIANT.source, "g");
  let match;

  while ((match = re.exec(body)) !== null) {
    errors.push({
      name: match[2],
      code: code++,
      message: match[1],
    });
  }

  return errors;
}
