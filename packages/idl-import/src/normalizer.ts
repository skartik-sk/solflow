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
  /** What the import couldn't represent faithfully. */
  warnings: string[];
}

const NON_DATA_ACCOUNTS = new Set<AccountNodeType>(["system-program", "token-program", "rent", "clock", "program"]);

function definedNames(t: unknown): string[] {
  if (!t || typeof t !== "object") return [];
  const o = t as Record<string, unknown>;
  if (typeof o.defined === "string") return [o.defined];
  return Object.values(o).flatMap((v) => (Array.isArray(v) ? v.flatMap(definedNames) : definedNames(v)));
}

// ─── Main normalizer ─────────────────────────────────────────────────────

export function normalizeIdl(idl: UnifiedIdl): FlowResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const warnings: string[] = [...(idl.warnings ?? [])];
  const stateNames = new Set(idl.accounts.map((a) => a.name));
  const warnCustomType = (where: string, t: unknown) => {
    for (const name of definedNames(t)) {
      if (stateNames.has(name)) continue;
      const def = idl.types.find((x) => x.name === name);
      warnings.push(
        `${where} uses the custom ${def?.variants ? "enum" : "type"} "${name}", which the editor can't define yet: ` +
          `code for it won't build until you replace it with a State or primitive type.`,
      );
    }
  };

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
        ...(state.discriminator?.length === 8 ? { customDiscriminator: state.discriminator } : {}),
      },
    });
    for (const f of state.fields) warnCustomType(`${state.name}.${f.name}`, f.type);
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
        ...(ix.discriminator?.length ? { discriminator: ix.discriminator } : {}),
      },
    });
    for (const arg of ix.args) warnCustomType(`${ix.name}(${arg.name})`, arg.type);

    // Edge: Program → Instruction
    edges.push(
      makeEdge(programNodeId, ixNodeId, "instruction-out", "instruction-in", () => uid("e")),
    );

    // 4. Create Account nodes for each account in this instruction
    for (let aIdx = 0; aIdx < ix.accounts.length; aIdx++) {
      const acc = ix.accounts[aIdx];
      const accNodeId = uid("acc");

      const accountType = detectAccountType(acc.name, acc.isSigner, acc.isMut);
      // `relations` are has_one checks; a fixed `address` is an address check (programs and
      // sysvars already get theirs from their type).
      const constraints = [
        ...(acc.relations ?? []).map((r) => ({ type: "has-one", field: r, target: r })),
        ...(acc.address && !NON_DATA_ACCOUNTS.has(accountType) ? [{ type: "address", address: acc.address }] : []),
      ];
      if (acc.isOptional) {
        warnings.push(`${ix.name}: account "${acc.name}" is optional in the IDL but is imported as required.`);
      }

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
          description: acc.isOptional ? `${acc.description ?? ""} (optional in the IDL)`.trim() : acc.description,
          seeds: acc.seeds,
          ...(constraints.length ? { constraints } : {}),
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

  return { nodes, edges, warnings };
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
