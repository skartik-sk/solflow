// @solflow/idl-import — Public API
//
// idlToFlow()  — main entry: IDL JSON → { nodes, edges } for ReactFlow
// detectFormat() — detect IDL format from JSON structure

export { detectFormat } from "./types";
export type {
  IdlFormat,
  UnifiedIdl,
  UnifiedInstruction,
  UnifiedAccountRef,
  UnifiedAccountState,
  UnifiedError,
  UnifiedEvent,
  UnifiedTypeDef,
  SolanaType,
  SolanaTypePrimitive,
} from "./types";
export { normalizeIdl } from "./normalizer";
export type { FlowResult } from "./normalizer";
export { autoLayout } from "./layout";

import type { Node, Edge } from "@xyflow/react";
import { detectFormat } from "./types";
import type { IdlFormat } from "./types";
import { parseAnchorIdl } from "./parsers/anchor";
import { parseShankIdl } from "./parsers/shank";
import { parseKinobiIdl } from "./parsers/kinobi";
import { normalizeIdl } from "./normalizer";
import { autoLayout } from "./layout";

export interface ImportResult {
  nodes: Node[];
  edges: Edge[];
  format: IdlFormat;
  stats: {
    instructions: number;
    accounts: number;
    errors: number;
    events: number;
  };
}

/**
 * Import an IDL (Anchor, Shank, or Kinobi) and convert it to ReactFlow
 * nodes and edges ready for the canvas.
 *
 * @throws Error if the JSON is not a valid Solana IDL
 */
export function idlToFlow(json: unknown): ImportResult {
  // 1. Detect format
  const format = detectFormat(json);

  // 2. Parse into unified IDL
  let unified;
  switch (format) {
    case "shank":
      unified = parseShankIdl(json);
      break;
    case "kinobi":
      unified = parseKinobiIdl(json);
      break;
    case "anchor":
    case "unknown":
    default:
      unified = parseAnchorIdl(json);
      break;
  }

  // 3. Normalize to flow nodes + edges
  const { nodes, edges } = normalizeIdl(unified);

  // 4. Apply auto-layout
  autoLayout(nodes, edges);

  return {
    nodes,
    edges,
    format: format === "unknown" ? "anchor" : format,
    stats: {
      instructions: unified.instructions.length,
      accounts: unified.accounts.length,
      errors: unified.errors.length,
      events: unified.events.length,
    },
  };
}
