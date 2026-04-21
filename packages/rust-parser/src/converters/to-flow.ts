// To-flow converter — convert parsed Rust structs into ReactFlow {nodes, edges}.
//
// Follows the exact same pattern as packages/idl-import/src/normalizer.ts:
// 1. Create Program node
// 2. Create Instruction nodes → edges from Program
// 3. Create Account nodes → edges from Instruction
// 4. Create State nodes → edges to matching Account nodes
// 5. Create Logic nodes → edges from Instruction (KEY ADDITION vs IDL mode)
// 6. Create Error nodes → edges from first Instruction
// 7. Create Event nodes → edges from first Instruction

import type { Node, Edge } from "@xyflow/react";
import type { ParsedProgram, ParsedInstruction, ParsedAccount, ParseStats } from "../types";

let _idCounter = 0;
function uid(prefix: string): string {
  return `${prefix}-${++_idCounter}`;
}

function resetIdCounter(): void {
  _idCounter = 0;
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
      version: "0.1.0",
      description: parsed.description,
      programId: parsed.programId,
      license: "MIT",
    },
  });

  const stateNodeIdMap = new Map<string, string>();

  // 2. Create State nodes
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
  let firstIxNodeId: string | null = null;
  let totalLogicOps = 0;
  let totalAccounts = 0;

  for (let i = 0; i < parsed.instructions.length; i++) {
    const ix = parsed.instructions[i];
    const ixNodeId = uid("ix");
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
    const ixAccounts = parsed.accounts[ix.accountsStructName] || [];
    for (const acc of ixAccounts) {
      const accNodeId = uid("acc");
      totalAccounts++;

      nodes.push({
        id: accNodeId,
        type: "account",
        position: { x: 0, y: 0 },
        data: {
          name: acc.name,
          accountType: acc.accountType,
          isMut: acc.isMut,
          isSigner: acc.isSigner,
          isInit: acc.isInit,
          isClose: acc.isClose,
          description: acc.description,
          seeds: acc.seeds,
        },
      });

      edges.push(makeEdge(ixNodeId, accNodeId, "account-out", "account-in"));

      // Link state to account
      const matchedStateId = stateNodeIdMap.get(normalizeForMatch(acc.name));
      if (matchedStateId) {
        edges.push(makeEdge(matchedStateId, accNodeId, "data-out", "data-in"));
      }
    }

    // Create Logic nodes for this instruction
    if (ix.logicOps.length > 0) {
      const logicNodeIds = createLogicNodes(ix.logicOps, ixNodeId, nodes, edges);
      totalLogicOps += ix.logicOps.length;
    }
  }

  // 4. Create Error nodes
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

    if (firstIxNodeId) {
      edges.push(makeEdge(firstIxNodeId, errorNodeId, "error-out", "error-in"));
    }
  }

  // 5. Create Event nodes
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

    if (firstIxNodeId) {
      edges.push(makeEdge(firstIxNodeId, eventNodeId, "event-out", "event-in"));
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

  for (const op of ops) {
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
      return { logicType: "if-else", ifCondition: op.condition };
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
    default:
      return { logicType: "custom-code", name: "unknown" };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

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
