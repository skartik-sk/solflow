// @solflow/flow-nodes — public API
//
// IMPORTANT: nodeTypes must be defined outside of any React component
// (at module level) to prevent React Flow from remounting nodes on every
// render. See: https://reactflow.dev/learn/customization/custom-nodes

export { BaseNodeShell } from "./base-node";
export type { HandleDef, HandleKind } from "./base-node";

export { ProgramNode } from "./program-node";
export type { ProgramNodeData } from "./program-node";

export { InstructionNode } from "./instruction-node";
export type { InstructionNodeData, InstructionField } from "./instruction-node";

export { AccountNode } from "./account-node";
export type { AccountNodeData, AccountType, SeedDefinition, HasOneConstraint } from "./account-node";

export { StateNode } from "./state-node";
export type { StateNodeData, StateField, SolanaType, SolanaTypePrimitive } from "./state-node";

export { ConstraintNode } from "./constraint-node";
export type { ConstraintNodeData, ConstraintType } from "./constraint-node";

export { ErrorNode } from "./error-node";
export type { ErrorNodeData } from "./error-node";

export { EventNode } from "./event-node";
export type { EventNodeData, EventField } from "./event-node";

export { LogicNode } from "./logic-node";
export type { LogicNodeData, LogicType } from "./logic-node";

export { CustomCodeNode } from "./custom-code-node";
export type { CustomCodeNodeData } from "./custom-code-node";

export { IntegrationNode } from "./integration-node";
export type { IntegrationNodeData } from "./integration-node";

// ─── nodeTypes map (pass directly to <ReactFlow nodeTypes={nodeTypes}>) ────

import { ProgramNode } from "./program-node";
import { InstructionNode } from "./instruction-node";
import { AccountNode } from "./account-node";
import { StateNode } from "./state-node";
import { ConstraintNode } from "./constraint-node";
import { ErrorNode } from "./error-node";
import { EventNode } from "./event-node";
import { LogicNode } from "./logic-node";
import { CustomCodeNode } from "./custom-code-node";
import { IntegrationNode } from "./integration-node";

export const nodeTypes = {
  program:       ProgramNode,
  instruction:   InstructionNode,
  account:       AccountNode,
  state:         StateNode,
  constraint:    ConstraintNode,
  error:         ErrorNode,
  event:         EventNode,
  logic:         LogicNode,
  "custom-code": CustomCodeNode,
  integration:   IntegrationNode,
} as const;

export type NodeTypeName = keyof typeof nodeTypes;

// ─── Node color map (for MiniMap + palette) ────────────────────────

export const NODE_COLOR_MAP: Record<string, string> = {
  program:       "#4a47a3",
  instruction:   "#2563eb",
  account:       "#16a34a",
  state:         "#7c3aed",
  constraint:    "#ea580c",
  error:         "#dc2626",
  event:         "#eab308",
  logic:         "#0d9488",
  "custom-code": "#374151",
  integration:   "#6b7280",
};

// ─── Connection validation ─────────────────────────────────────────

export const CONNECTION_RULES: Record<string, string[]> = {
  program:       ["instruction"],
  instruction:   ["account", "error", "event", "logic", "custom-code", "integration"],
  account:       ["constraint", "state"],
  state:         ["account"],
  constraint:    [],
  error:         [],
  event:         [],
  logic:         ["logic", "custom-code", "account"],
  "custom-code": ["account", "logic"],
  integration:   ["instruction", "account"],
};

/** Returns true if the proposed source→target connection is valid. */
export function isValidNodeConnection(
  sourceType: string,
  targetType: string
): boolean {
  return CONNECTION_RULES[sourceType]?.includes(targetType) ?? false;
}

// ─── Factory helpers ───────────────────────────────────────────────

import type { Node } from "@xyflow/react";

let _nodeCounter = 1;

export function createNodeFromType(
  type: NodeTypeName,
  position: { x: number; y: number }
): Node {
  const id = `${type}-${_nodeCounter++}`;

  const defaults: Record<NodeTypeName, Record<string, unknown>> = {
    program: {
      name: "my_program",
      version: "0.1.0",
      description: "",
      license: "MIT",
    },
    instruction: {
      name: "instruction",
      description: "",
      instructionData: [],
      accessControl: "none",
    },
    account: {
      name: "account",
      accountType: "account",
      isMut: false,
      isSigner: false,
      isInit: false,
      isClose: false,
    },
    state: {
      name: "State",
      fields: [],
      isZeroCopy: false,
    },
    constraint: {
      constraintType: "mut",
    },
    error: {
      name: "MyError",
      code: 6000,
      message: "An error occurred",
    },
    event: {
      name: "MyEvent",
      fields: [],
    },
    logic: {
      logicType: "set-field",
    },
    "custom-code": {
      code: "",
      inputs: [],
      outputs: [],
    },
    integration: {
      name: "Integration",
      pluginId: "",
      integrationId: "",
      config: {},
    },
  };

  return {
    id,
    type,
    position,
    data: defaults[type],
  };
}
