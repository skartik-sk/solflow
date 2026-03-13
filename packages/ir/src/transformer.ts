import type { Node, Edge } from "@xyflow/react";

// djb2 hash — browser-safe, no Node.js crypto needed
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
import type {
  ProgramIR,
  Account,
  Constraint,
  Instruction,
  State,
  ErrorVariant,
  IrEvent,
  Integration,
  LogicOperation,
  Field,
} from "./schema";
import { ProgramIRSchema } from "./schema";

export const SOLFLOW_VERSION = "0.1.0";

// ─── Helpers ───────────────────────────────────────────────────────

function getConnectedNodes(
  sourceId: string,
  targetType: string,
  nodes: Node[],
  edges: Edge[],
): Node[] {
  const connectedIds = edges
    .filter((e) => e.source === sourceId)
    .map((e) => e.target);
  return nodes.filter(
    (n) => connectedIds.includes(n.id) && n.type === targetType,
  );
}

function getConnectedNodesReverse(
  targetId: string,
  sourceType: string,
  nodes: Node[],
  edges: Edge[],
): Node[] {
  const connectedIds = edges
    .filter((e) => e.target === targetId)
    .map((e) => e.source);
  return nodes.filter(
    (n) => connectedIds.includes(n.id) && n.type === sourceType,
  );
}

export function computeFlowHash(nodes: Node[], edges: Edge[]): string {
  const normalized = JSON.stringify({
    nodes: nodes
      .map((n) => ({ id: n.id, type: n.type, data: n.data }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges
      .map((e) => ({ source: e.source, target: e.target, id: e.id }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
  return djb2Hash(normalized);
}

// ─── Account Builder ───────────────────────────────────────────────

function buildConstraints(constraintNodes: Node[]): Constraint[] {
  return constraintNodes.map((n) => n.data as Constraint);
}

function buildAccountIR(
  accNode: Node,
  constraintNodes: Node[],
  stateNode: Node | undefined,
): Account {
  const data = accNode.data as Record<string, unknown>;
  return {
    id: accNode.id,
    name: (data.name as string) ?? "account",
    accountType:
      (data.accountType as Account["accountType"]) ?? "system-account",
    stateType: stateNode
      ? (stateNode.data as Record<string, unknown>).name as string
      : (data.stateType as string | undefined),
    constraints: buildConstraints(constraintNodes),
    description: data.description as string | undefined,
  };
}

// ─── Logic Body Builder ────────────────────────────────────────────

function buildLogicBody(logicNodes: Node[]): LogicOperation[] {
  return logicNodes
    .sort((a, b) => {
      const aOrder = ((a.data as Record<string, unknown>).order as number) ?? 0;
      const bOrder = ((b.data as Record<string, unknown>).order as number) ?? 0;
      return aOrder - bOrder;
    })
    .map((n) => {
      const data = n.data as Record<string, unknown>;
      return data.operation as LogicOperation;
    })
    .filter(Boolean);
}

// ─── Instruction Builder ───────────────────────────────────────────

function buildInstructionIR(
  ixNode: Node,
  nodes: Node[],
  edges: Edge[],
): Instruction {
  const data = ixNode.data as Record<string, unknown>;

  const accountNodes = getConnectedNodes(ixNode.id, "account", nodes, edges);
  const logicNodes = getConnectedNodes(ixNode.id, "logic", nodes, edges);
  const customCodeNodes = getConnectedNodes(
    ixNode.id,
    "custom-code",
    nodes,
    edges,
  );

  const resolvedAccounts = accountNodes.map((accNode) => {
    const constraintNodes = getConnectedNodesReverse(
      accNode.id,
      "constraint",
      nodes,
      edges,
    );
    const stateNode = getConnectedNodes(
      accNode.id,
      "state",
      nodes,
      edges,
    )[0];
    return buildAccountIR(accNode, constraintNodes, stateNode);
  });

  const body = buildLogicBody([...logicNodes, ...customCodeNodes]);

  return {
    id: ixNode.id,
    name: (data.name as string) ?? "instruction",
    description: data.description as string | undefined,
    discriminator: data.discriminator as number[] | undefined,
    args: (data.args as Instruction["args"]) ?? [],
    accounts: resolvedAccounts,
    body,
  };
}

// ─── State Collector ───────────────────────────────────────────────

function collectStates(nodes: Node[]): State[] {
  return nodes
    .filter((n) => n.type === "state")
    .map((n) => {
      const data = n.data as Record<string, unknown>;
      return {
        id: n.id,
        name: (data.name as string) ?? "State",
        fields: (data.fields as Field[]) ?? [],
        description: data.description as string | undefined,
        isZeroCopy: (data.isZeroCopy as boolean) ?? false,
        customDiscriminator: data.customDiscriminator as
          | number[]
          | undefined,
      };
    });
}

// ─── Error Collector ───────────────────────────────────────────────

function collectErrors(nodes: Node[]): ErrorVariant[] {
  return nodes
    .filter((n) => n.type === "error")
    .map((n) => {
      const data = n.data as Record<string, unknown>;
      return {
        id: n.id,
        name: (data.name as string) ?? "Error",
        code: (data.code as number) ?? 6000,
        message: (data.message as string) ?? "",
      };
    });
}

// ─── Event Collector ───────────────────────────────────────────────

function collectEvents(nodes: Node[]): IrEvent[] {
  return nodes
    .filter((n) => n.type === "event")
    .map((n) => {
      const data = n.data as Record<string, unknown>;
      return {
        id: n.id,
        name: (data.name as string) ?? "Event",
        fields: (data.fields as Field[]) ?? [],
        description: data.description as string | undefined,
      };
    });
}

// ─── Integration Collector ─────────────────────────────────────────

function collectIntegrations(nodes: Node[], _edges: Edge[]): Integration[] {
  return nodes
    .filter((n) => n.type === "integration")
    .map((n) => n.data as Integration);
}

// ─── Main Transformer ──────────────────────────────────────────────

export function flowToIR(nodes: Node[], edges: Edge[]): ProgramIR {
  const programNode = nodes.find((n) => n.type === "program");
  if (!programNode) throw new Error("Flow must have a Program node");

  const data = programNode.data as Record<string, unknown>;

  const instructionNodes = getConnectedNodes(
    programNode.id,
    "instruction",
    nodes,
    edges,
  );

  if (instructionNodes.length === 0) {
    throw new Error("Program must have at least one Instruction node");
  }

  const instructions = instructionNodes.map((ixNode) =>
    buildInstructionIR(ixNode, nodes, edges),
  );

  const ir: ProgramIR = {
    version: "1.0.0",
    program: {
      name: (data.name as string) ?? "my_program",
      description: data.description as string | undefined,
      version: (data.version as string) ?? "0.1.0",
      programId: data.programId as string | undefined,
      license: (data.license as string) ?? "MIT",
    },
    instructions,
    states: collectStates(nodes),
    errors: collectErrors(nodes),
    events: collectEvents(nodes),
    integrations: collectIntegrations(nodes, edges),
    constants: (data.constants as ProgramIR["constants"]) ?? [],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      flowHash: computeFlowHash(nodes, edges),
      generatorVersion: SOLFLOW_VERSION,
    },
  };

  return ProgramIRSchema.parse(ir);
}
