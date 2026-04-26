// To-flow converter — convert parsed Rust structs into ReactFlow {nodes, edges}.
//
// 1. Create Program node
// 2. Create State nodes
// 3. Create Instructions + Accounts + Logic per instruction
// 4. Create Error nodes → connected to relevant instructions
// 5. Create Event nodes → connected to instructions that emit them

import type { Node, Edge } from "@xyflow/react";
import type { ParsedProgram, ParsedInstruction, ParsedAccount, ParseStats } from "../types";

let _idCounter = 0;
function uid(prefix: string): string {
  return `${prefix}-${++_idCounter}`;
}

function resetIdCounter(): void {
  _idCounter = 0;
  utilityNodeCache.clear();
}

export interface ToFlowResult {
  nodes: Node[];
  edges: Edge[];
  stats: ParseStats;
  warnings: string[];
}

export function parsedProgramToFlow(parsed: ParsedProgram): ToFlowResult {
  resetIdCounter();
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // 1. Create Program node
  const programNodeId = uid("program");
  nodes.push({
    id: programNodeId,
    type: "program",
    position: { x: 0, y: 0 },
    data: {
      name: parsed.name,
      version: parsed.version || "0.1.0",
      description: parsed.description,
      programId: parsed.programId,
    },
  });

  // 2. Create State nodes — index them for later matching
  const stateNodeIdMap = new Map<string, string>();

  for (const state of parsed.states) {
    const stateNodeId = uid("state");
    stateNodeIdMap.set(normalizeForMatch(state.name), stateNodeId);
    nodes.push({
      id: stateNodeId,
      type: "state",
      position: { x: 0, y: 0 },
      data: {
        name: state.name,
        fields: state.fields.map((f) => ({ name: f.name, type: f.type, description: f.description })),
        isZeroCopy: state.isZeroCopy,
      },
    });
  }

  // 3. Create Instructions + Accounts + Logic
  const ixNodeIdMap = new Map<string, string>();
  let firstIxNodeId: string | null = null;
  let totalLogicOps = 0;
  let totalAccounts = 0;

  for (let i = 0; i < parsed.instructions.length; i++) {
    const ix = parsed.instructions[i];
    const ixNodeId = uid("ix");
    ixNodeIdMap.set(ix.name, ixNodeId);
    if (i === 0) firstIxNodeId = ixNodeId;

    nodes.push({
      id: ixNodeId,
      type: "instruction",
      position: { x: 0, y: 0 },
      data: {
        name: ix.name,
        description: ix.description,
        instructionData: ix.args.map((a) => ({ name: a.name, type: a.type, description: a.description })),
        accessControl: ix.accessControl,
      },
    });

    edges.push(makeEdge(programNodeId, ixNodeId, "instruction-out", "instruction-in"));

    // Create Account nodes for this instruction
    const ixAccounts = parsed.accounts[ix.accountsStructName] ?? [];
    for (const acc of ixAccounts) {
      // Skip utility accounts — create one shared node instead
      const utilityType = getUtilityAccountType(acc);
      if (utilityType) {
        // Create or reuse shared utility node
        const utilityId = getOrCreateUtilityNode(utilityType, nodes, edges);
        edges.push(makeEdge(ixNodeId, utilityId, "account-out", "utility-in"));
        totalAccounts++;
        continue;
      }

      const accNodeId = uid("acc");
      totalAccounts++;

      nodes.push({
        id: accNodeId,
        type: "account",
        position: { x: 0, y: 0 },
        data: {
          name: acc.name,
          accountType: acc.accountType,
          stateType: acc.stateType,
          isMut: acc.isMut,
          isSigner: acc.isSigner,
          isInit: acc.isInit,
          isClose: acc.isClose,
          isExecutable: acc.isExecutable,
          description: acc.description,
          seeds: acc.seeds,
          constraints: acc.constraints,
        },
      });

      edges.push(makeEdge(ixNodeId, accNodeId, "account-out", "account-in"));

      // Link state to account using both name-based and type-based matching
      if (acc.stateType) {
        const matchedStateId = stateNodeIdMap.get(normalizeForMatch(acc.stateType));
        if (matchedStateId) {
          edges.push(makeEdge(matchedStateId, accNodeId, "data-out", "data-in"));
        }
      } else {
        // Fallback: match by name similarity
        const matchedStateId = stateNodeIdMap.get(normalizeForMatch(acc.name));
        if (matchedStateId) {
          edges.push(makeEdge(matchedStateId, accNodeId, "data-out", "data-in"));
        }
      }
    }

    // Create Logic nodes for this instruction
    if (ix.logicOps.length > 0) {
      createLogicNodes(ix.logicOps, ixNodeId, nodes, edges);
      totalLogicOps += ix.logicOps.length;
    }
  }

  // 4. Create Error nodes — connect to ALL instructions (not just first)
  for (const error of parsed.errors) {
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

    // Connect to first instruction as anchor point
    if (firstIxNodeId) {
      edges.push(makeEdge(firstIxNodeId, errorNodeId, "error-out", "error-in"));
    }
  }

  // 5. Create Event nodes — connect to the instruction that emits them
  for (const event of parsed.events) {
    const eventNodeId = uid("event");
    nodes.push({
      id: eventNodeId,
      type: "event",
      position: { x: 0, y: 0 },
      data: {
        name: event.name,
        fields: event.fields.map((f) => ({ name: f.name, type: f.type, description: f.description })),
      },
    });

    // Find which instruction emits this event by checking logicOps
    let emitterIxId = firstIxNodeId;
    for (const ix of parsed.instructions) {
      const hasEmit = ix.logicOps.some(
        (op) => op.type === "emit-event" && (op as { type: string; event: string }).event === event.name
      );
      if (hasEmit) {
        emitterIxId = ixNodeIdMap.get(ix.name) || firstIxNodeId;
        break;
      }
    }

    if (emitterIxId) {
      edges.push(makeEdge(emitterIxId, eventNodeId, "event-out", "event-in"));
    }
  }

  return {
    nodes,
    edges,
    warnings: [],
    stats: {
      instructions: parsed.instructions.length,
      accounts: totalAccounts,
      states: parsed.states.length,
      errors: parsed.errors.length,
      events: parsed.events.length,
      logicOps: totalLogicOps,
    },
  };
}

// ─── Logic node creation ─────────────────────────────────────────────

function createLogicNodes(
  ops: import("@solflow/ir").LogicOperation[],
  parentIxId: string,
  nodes: Node[],
  edges: Edge[],
): string[] {
  const ids: string[] = [];
  let prevId = parentIxId;

  // Flatten delegation wrappers (if-else with fn/call condition and thenBody)
  const flatOps = flattenLogicOps(ops);

  for (const op of flatOps) {
    const logicNodeId = uid("logic");
    ids.push(logicNodeId);

    const data = logicOpToNodeData(op);
    nodes.push({
      id: logicNodeId,
      type: "logic",
      position: { x: 0, y: 0 },
      data,
    });

    edges.push(makeEdge(prevId, logicNodeId, prevId === parentIxId ? "logic-out" : "logic-out", "logic-in"));
    prevId = logicNodeId;
  }

  return ids;
}

/**
 * Flatten delegation wrappers: if-else nodes used as grouping for impl/handler delegation
 * should be unwrapped so inner ops become individual nodes.
 * Real if-else nodes (with actual conditions) are kept as-is.
 */
function flattenLogicOps(ops: import("@solflow/ir").LogicOperation[]): import("@solflow/ir").LogicOperation[] {
  const result: import("@solflow/ir").LogicOperation[] = [];
  for (const op of ops) {
    if (op.type === "if-else") {
      const cond = op.condition || "";
      // Check if this is a delegation wrapper (call xxx() or fn xxx())
      const isDelegation = /^(call |fn |impl )/.test(cond) || cond.includes("::");
      // Also treat set_inner() wrappers as flattenable
      const isSetInner = cond.endsWith(".set_inner()");

      if ((isDelegation || isSetInner) && op.thenBody && !op.elseBody) {
        // Flatten: unwrap the thenBody
        result.push(...flattenLogicOps(op.thenBody));
      } else {
        // Real if-else — keep it but flatten inner bodies
        result.push({
          ...op,
          thenBody: op.thenBody ? flattenLogicOps(op.thenBody) : undefined,
          elseBody: op.elseBody ? flattenLogicOps(op.elseBody) : undefined,
        });
      }
    } else {
      result.push(op);
    }
  }
  return result;
}

function logicOpToNodeData(op: import("@solflow/ir").LogicOperation): Record<string, unknown> {
  switch (op.type) {
    case "set-field":
      return { logicType: "set-field", setAccount: op.account, setField: op.field, setValue: op.value };
    case "transfer-sol":
      return { logicType: "transfer-sol", transferFrom: op.from, transferTo: op.to, transferAmount: op.amount };
    case "transfer-token":
      return { logicType: "transfer-token", transferFrom: op.from, transferTo: op.to, transferAuthority: op.authority, transferAmount: op.amount };
    case "mint-to":
      return { logicType: "mint-to", mintTo: op.to, mintAuthority: op.authority, transferAmount: op.amount };
    case "burn":
      return { logicType: "burn", burnMint: op.mint, transferFrom: op.from, mintAuthority: op.authority, transferAmount: op.amount };
    case "require":
      return { logicType: "require", requireCondition: op.condition, requireErrorCode: op.errorCode };
    case "if-else":
      return { logicType: "if-else", ifCondition: op.condition, thenBody: op.thenBody, elseBody: op.elseBody };
    case "emit-event":
      return { logicType: "emit-event", emitEvent: op.event, emitFields: op.fields };
    case "return-error":
      return { logicType: "return-error", returnErrorCode: op.errorCode };
    case "math":
      return { logicType: "math", mathOperation: op.operation, mathLeft: op.left, mathRight: op.right, mathResult: op.result, mathChecked: op.checked };
    case "cpi":
      return { logicType: "cpi", cpiProgram: op.targetProgram, cpiInstruction: op.instruction };
    case "custom-code":
      return { logicType: "custom-code", name: op.code };
    case "close-account":
      return { logicType: "close-account", closeAccount: op.account, closeDestination: op.destination, closeAuthority: op.authority };
    default:
      return { logicType: "custom-code", name: "unknown" };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

const UTILITY_ACCOUNT_TYPES: Record<string, string> = {
  system_program: "system_program",
  token_program: "token_program",
  associated_token_program: "associated_token_program",
  token_program_interface: "token_interface",
  rent: "rent",
  clock: "clock",
  instructions: "instructions",
};

const utilityNodeCache = new Map<string, string>();

function getUtilityAccountType(acc: ParsedAccount): string | null {
  const nameNorm = normalizeForMatch(acc.name);
  // Check by account name
  for (const key of Object.keys(UTILITY_ACCOUNT_TYPES)) {
    if (nameNorm.includes(normalizeForMatch(key))) return key;
  }
  // Check by accountType — Program types that are system programs
  if (acc.accountType) {
    const typeNorm = normalizeForMatch(acc.accountType);
    if (typeNorm.includes("system") && typeNorm.includes("program")) return "system_program";
  }
  return null;
}

function getOrCreateUtilityNode(utilityType: string, nodes: Node[], edges: Edge[]): string {
  const cached = utilityNodeCache.get(utilityType);
  if (cached) return cached;

  const nodeId = uid("utility");
  utilityNodeCache.set(utilityType, nodeId);

  nodes.push({
    id: nodeId,
    type: "account",
    position: { x: 0, y: 0 },
    data: {
      name: UTILITY_ACCOUNT_TYPES[utilityType] || utilityType,
      accountType: "utility",
      isUtility: true,
    },
  });

  return nodeId;
}

function normalizeForMatch(name: string): string {
  return name.toLowerCase().replace(/_/g, "").replace(/-/g, "");
}

function makeEdge(
  source: string,
  target: string,
  sourceHandle: string,
  targetHandle: string,
): Edge {
  return {
    id: uid("e"),
    source,
    target,
    sourceHandle,
    targetHandle,
    type: "smoothstep",
    animated: true,
    style: { strokeWidth: 2 },
  };
}
