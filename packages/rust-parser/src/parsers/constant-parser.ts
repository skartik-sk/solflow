// Constant parser — parse const declarations from Rust source.

import { mapRustType } from "../utils/type-mapper";
import type { ParsedConstant } from "../types";

const RE_CONST = /pub\s+const\s+(\w+)\s*:\s*(.+?)\s*=\s*(.+?)\s*;/g;

export function parseConstants(src: string): ParsedConstant[] {
  const constants: ParsedConstant[] = [];
  const re = new RegExp(RE_CONST.source, "g");
  let match;

  while ((match = re.exec(src)) !== null) {
    constants.push({
      name: match[1],
      type: mapRustType(match[2].trim()),
      value: match[3].trim(),
    });
  }

  return constants;
}
