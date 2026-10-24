// Constant parser — parse const declarations from Rust source.

import { mapRustType } from "../utils/type-mapper";
import type { ParsedConstant } from "../types";

const RE_CONST = /pub\s+const\s+(\w+)\s*:\s*(.+?)\s*=\s*(.+?)\s*;/g;

/** Blank out `impl … { … }` bodies: their consts (e.g. `Pool::LEN`) are associated items. */
function withoutImplBlocks(src: string): string {
  let out = src;
  const re = /\bimpl\b[^{;]*\{/g;
  let m;
  while ((m = re.exec(out)) !== null) {
    let depth = 0;
    let end = m.index + m[0].length - 1;
    for (; end < out.length; end++) {
      if (out[end] === "{") depth++;
      else if (out[end] === "}" && --depth === 0) break;
    }
    out = out.slice(0, m.index) + " ".repeat(end + 1 - m.index) + out.slice(end + 1);
  }
  return out;
}

export function parseConstants(src: string): ParsedConstant[] {
  const constants: ParsedConstant[] = [];
  const re = new RegExp(RE_CONST.source, "g");
  re.lastIndex = 0;
  let match;
  const topLevel = withoutImplBlocks(src);

  while ((match = re.exec(topLevel)) !== null) {
    if (constants.some((c) => c.name === match![1])) continue;
    constants.push({
      name: match[1],
      type: mapRustType(match[2].trim()),
      value: match[3].trim(),
    });
  }

  return constants;
}
