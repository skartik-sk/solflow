// Normalizer — converts UnifiedIdl into ReactFlow nodes and edges.
//
// Maps:
//   program   → 1 ProgramNode
//   instructions → N InstructionNodes
//   instruction.accounts → N AccountNodes (per instruction)
//   accounts[] → N StateNodes (linked to matching account nodes)
//   errors[] → N ErrorNodes (linked to first instruction)
//   events[] → N EventNodes (linked to first instruction)

import type { Node, Edge } from "@xyflow/react";
import type { UnifiedIdl } from "./types";

// ─── Account type detection ──────────────────────────────────────────────

type AccountNodeType =
  | "account"
  | "system-account"
  | "signer"
  | "program"
  | "token-account"
  | "mint"
  | "associated-token"
  | "unchecked-account"
  | "system-program"
  | "token-program"
  | "rent"
  | "clock"
  | "custom";

function detectAccountType(
  name: string,
  isSigner: boolean,
  isMut: boolean,
): AccountNodeType {
  const lower = name.toLowerCase().replace(/_/g, "-");

  if (lower === "system-program") return "system-program";
  if (lower === "token-program") return "token-program";
  if (lower === "associated-token-program") return "token-program";
  if (lower === "rent") return "rent";
  if (lower === "clock") return "clock";

  if (lower.endsWith("-token-account") || lower.endsWith("-ata"))
    return "token-account";
  if (lower.endsWith("-mint")) return "mint";

  if (isSigner && !isMut) return "signer";

  return "account";
}

// ─── Result type ─────────────────────────────────────────────────────────

export interface FlowResult {
  nodes: Node[];
  edges: Edge[];
}

// ─── Main normalizer ─────────────────────────────────────────────────────

export function normalizeIdl(idl: UnifiedIdl): FlowResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Counter for unique IDs (avoids crypto.randomUUID() for determinism in tests)
  let _idCounter = 0;
  function uid(prefix: string): string {
    return `${prefix}-${++_idCounter}`;
  }

  // 1. Create Program node
  const programNodeId = uid("program");
  nodes.push({
    id: programNodeId,
    type: "program",
    position: { x: 0, y: 0 }, // layout will fix positions
    data: {
      name: idl.program.name,
      version: idl.program.version,
      description: idl.program.description,
      programId: idl.program.programId,
      license: "MIT",
    },
  });

  // Build a lookup: state name → state node id (case-insensitive for matching)
  const stateNodeIdMap = new Map<string, string>();

  /** Normalize a name for fuzzy matching between snake_case and PascalCase. */
  function normalizeForMatch(name: string): string {
    return name.toLowerCase().replace(/_/g, "").replace(/-/g, "");
  }

  // 2. Create State nodes (account data structs)
  for (const state of idl.accounts) {
    const stateNodeId = uid("state");
    stateNodeIdMap.set(normalizeForMatch(state.name), stateNodeId);

    nodes.push({
      id: stateNodeId,
      type: "state",
      position: { x: 0, y: 0 },
      data: {
        name: state.name,
        fields: state.fields.map((f) => ({
          name: f.name,
          type: f.type,
          description: f.description,
        })),
        isZeroCopy: false,
      },
    });
  }

  // 3. Create Instruction + Account nodes
  let firstIxNodeId: string | null = null;
  for (let iIdx = 0; iIdx < idl.instructions.length; iIdx++) {
    const ix = idl.instructions[iIdx];
    const ixNodeId = uid("ix");
    if (iIdx === 0) firstIxNodeId = ixNodeId;

    nodes.push({
      id: ixNodeId,
      type: "instruction",
      position: { x: 0, y: 0 },
      data: {
        name: ix.name,
        description: ix.description,
        instructionData: ix.args.map((arg) => ({
          name: arg.name,
          type: arg.type,
          description: arg.description,
        })),
        accessControl: "none",
      },
    });

    // Edge: Program → Instruction
    edges.push(
      makeEdge(programNodeId, ixNodeId, "instruction-out", "instruction-in", () => uid("e")),
    );

    // 4. Create Account nodes for each account in this instruction
    for (let aIdx = 0; aIdx < ix.accounts.length; aIdx++) {
      const acc = ix.accounts[aIdx];
      const accNodeId = uid("acc");

      const accountType = detectAccountType(acc.name, acc.isSigner, acc.isMut);

      nodes.push({
        id: accNodeId,
        type: "account",
        position: { x: 0, y: 0 },
        data: {
          name: acc.name,
          accountType,
          isMut: acc.isMut,
          isSigner: acc.isSigner,
          isInit: false,
          isClose: false,
          description: acc.description,
          seeds: acc.seeds,
        },
      });

      // Edge: Instruction → Account
      edges.push(
        makeEdge(ixNodeId, accNodeId, "account-out", "account-in", () => uid("e")),
      );

      // If this account name matches a state struct (fuzzy: snake_case ↔ PascalCase)
      const matchedStateId = stateNodeIdMap.get(normalizeForMatch(acc.name));
      if (matchedStateId) {
        edges.push(
          makeEdge(
            matchedStateId,
            accNodeId,
            "data-out",
            "data-in",
            () => uid("e"),
          ),
        );
      }
    }
  }

  // 5. Create Error nodes — link to first instruction (most common pattern)
  for (const error of idl.errors) {
    const errorNodeId = uid("error");
    nodes.push({
      id: errorNodeId,
      type: "error",
      position: { x: 0, y: 0 },
      data: {
        name: error.name,
        code: error.code,
        message: error.message,
      },
    });

    if (firstIxNodeId) {
      edges.push(
        makeEdge(firstIxNodeId, errorNodeId, "error-out", "error-in", () => uid("e")),
      );
    }
  }

  // 6. Create Event nodes — link to first instruction
  for (const event of idl.events) {
    const eventNodeId = uid("event");
    nodes.push({
      id: eventNodeId,
      type: "event",
      position: { x: 0, y: 0 },
      data: {
        name: event.name,
        fields: event.fields.map((f) => ({
          name: f.name,
          type: f.type,
          description: f.description,
        })),
      },
    });

    if (firstIxNodeId) {
      edges.push(
        makeEdge(firstIxNodeId, eventNodeId, "event-out", "event-in", () => uid("e")),
      );
    }
  }

  return { nodes, edges };
}

// ─── Edge helper ─────────────────────────────────────────────────────────

function makeEdge(
  source: string,
  target: string,
  sourceHandle: string,
  targetHandle: string,
  nextId: () => string,
): Edge {
  return {
    id: nextId(),
    source,
    target,
    sourceHandle,
    targetHandle,
    type: "smoothstep",
    animated: true,
    style: { strokeWidth: 2 },
  };
}
