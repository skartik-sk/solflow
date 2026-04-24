// Event parser — parse #[event] structs.
// Handles doc comments between #[event] and struct.

import { RE_EVENT_STRUCT } from "../utils/anchor-patterns";
import { extractBalancedBlock } from "../utils/regex-helpers";
import { mapRustType } from "../utils/type-mapper";
import type { ParsedEvent, ParsedField } from "../types";

export function parseEvents(src: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  let searchFrom = 0;

  while (searchFrom < src.length) {
    const remaining = src.slice(searchFrom);
    const re = new RegExp(RE_EVENT_STRUCT.source);
    const match = re.exec(remaining);
    if (!match) break;

    const structName = match[1];
    const absIndex = searchFrom + match.index;
    const blockStart = src.indexOf("{", absIndex);
    const block = extractBalancedBlock(src, blockStart);
    if (!block) {
      searchFrom = absIndex + match[0].length;
      continue;
    }

    const fields = parseEventFields(block.content);

    events.push({ name: structName, fields });
    searchFrom = block.endPos;
  }

  return events;
}

function parseEventFields(body: string): ParsedField[] {
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
      const fieldType = fieldMatch[2].replace(/<'info>/g, "").trim();
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
