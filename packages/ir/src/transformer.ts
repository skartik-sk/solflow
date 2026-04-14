import type { Node, Edge } from "@xyflow/react";

// djb2 hash — browser-safe, no Node.js crypto needed
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
    hash = hash & hash;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// Deterministic UUID v4 from any string — same input always gives same UUID.
// Uses djb2 to fill the bits so it's pure and doesn't need crypto.
// Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx where y ∈ {8,9,a,b}
function deterministicUuid(seed: string): string {
  const h1 = djb2Hash(seed);
  const h2 = djb2Hash(seed + ":salt1");
  const h3 = djb2Hash(seed + ":salt2");
  const h4 = djb2Hash(seed + ":salt3");
  const h5 = djb2Hash(seed + ":salt4");

  // time_low (8 hex) + time_mid (4 hex)
  const timeLow = h1; // 8 hex chars
  const timeMid = h2.slice(0, 4);

  // time_hi_and_version: version=4, then 3 hex from h2
  const timeHi = "4" + h2.slice(4, 7); // "4xxx" — 1+3=4 chars

  // clock_seq_hi_and_reserved + clock_seq_low: variant (8/9/a/b) + 3 hex from h3
  const v = parseInt(h3.slice(0, 1), 16); // 0-15
  const variant = (8 + (v % 4)).toString(16); // 8,9,a,b
  const clockSeq = variant + h3.slice(1, 4); // "yxxx" — 1+3=4 chars

  // node: 12 hex from h4 + h5
  const node = (h4 + h5).padStart(12, "0").slice(0, 12);

  return `${timeLow}-${timeMid}-${timeHi}-${clockSeq}-${node}`;
}

// Map flow node IDs to stable UUIDs — deterministic, no cache needed.
function toUuid(nodeId: string): string {
  return deterministicUuid(nodeId);
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
  Seed,
} from "./schema";
import { ProgramIRSchema } from "./schema";

export const SOLFLOW_VERSION = "0.1.0";

// ─── Type normalization ────────────────────────────────────────────

const TYPE_ALIASES: Record<string, string> = {
  pubkey: "Pubkey",
  Pubkey: "Pubkey",
  publickey: "Pubkey",
  string: "String",
  String: "String",
};

/** Normalize a Solana type string to the exact casing the IR schema expects. */
function normalizeType(t: unknown): unknown {
  if (typeof t === "string") {
    return TYPE_ALIASES[t] ?? t;
  }
  // Object types like { option: ... }, { vec: ... } — recurse
  if (t && typeof t === "object") {
    const obj = t as Record<string, unknown>;
    if ("option" in obj) return { option: normalizeType(obj.option) };
    if ("vec" in obj) return { vec: normalizeType(obj.vec) };
    if ("array" in obj && Array.isArray(obj.array))
      return {
        array: [normalizeType(obj.array[0]), obj.array[1]] as [unknown, number],
      };
    if ("defined" in obj) return { defined: obj.defined };
    if ("hashMap" in obj && Array.isArray(obj.hashMap))
      return {
        hashMap: [
          normalizeType(obj.hashMap[0]),
          normalizeType(obj.hashMap[1]),
        ] as [unknown, unknown],
      };
    if ("enum" in obj) return { enum: obj.enum };
    return obj;
  }
  return t;
}

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
  return constraintNodes.map((n) => {
    const d = n.data as Record<string, unknown>;
    const t = (d.constraintType as string) ?? (d.type as string) ?? "signer";

    switch (t) {
      case "signer":
        return { type: "signer" as const };
      case "mut":
        return { type: "mut" as const };
      case "init":
        return {
          type: "init" as const,
          payer: (d.payer as string) ?? "payer",
          space: (d.space as number | "auto") ?? "auto",
        };
      case "init-if-needed":
        return {
          type: "init-if-needed" as const,
          payer: (d.payer as string) ?? "payer",
          space: (d.space as number | "auto") ?? "auto",
        };
      case "close":
        return {
          type: "close" as const,
          target: (d.closeTarget as string) ?? (d.target as string) ?? "",
        };
      case "has-one":
        return {
          type: "has-one" as const,
          field: (d.hasOneField as string) ?? (d.field as string) ?? "",
          target: (d.hasOneTarget as string) ?? (d.target as string) ?? "",
          errorCode:
            (d.hasOneErrorCode as string | undefined) ??
            (d.errorCode as string | undefined),
        };
      case "seeds": {
        // Seeds can come as a Seed[] array or comma-separated string
        const rawSeeds = d.seeds;
        let seeds: {
          type: "literal" | "account-field" | "instruction-arg" | "pubkey";
          value: string;
        }[] = [];
        if (Array.isArray(rawSeeds)) {
          seeds = rawSeeds as typeof seeds;
        } else if (typeof rawSeeds === "string" && rawSeeds.length > 0) {
          seeds = rawSeeds.split(",").map((s: string) => ({
            type: "literal" as const,
            value: s.trim(),
          }));
        }
        return {
          type: "seeds" as const,
          seeds,
          bump: d.bump as string | undefined,
          programId: d.programId as string | undefined,
        };
      }
      case "owner":
        return { type: "owner" as const, owner: (d.owner as string) ?? "" };
      case "address":
        return {
          type: "address" as const,
          address: (d.address as string) ?? "",
        };
      case "token-authority":
        return {
          type: "token-authority" as const,
          authority:
            (d.tokenAuthority as string) ?? (d.authority as string) ?? "",
        };
      case "token-mint":
        return {
          type: "token-mint" as const,
          mint: (d.tokenMint as string) ?? (d.mint as string) ?? "",
        };
      case "realloc":
        return {
          type: "realloc" as const,
          space: (d.reallocSpace as number) ?? (d.space as number) ?? 0,
          payer: (d.reallocPayer as string) ?? (d.payer as string) ?? "",
          zeroInit:
            (d.reallocZeroInit as boolean) ?? (d.zeroInit as boolean) ?? false,
        };
      case "custom":
        return {
          type: "custom" as const,
          expression: (d.expression as string) ?? "",
          errorCode: d.errorCode as string | undefined,
        };
      default:
        return { type: "signer" as const };
    }
  });
}

function buildConstraintsFromFlags(
  data: Record<string, unknown>,
): Constraint[] {
  const constraints: Constraint[] = [];
  if (data.isInit) {
    constraints.push({
      type: "init" as const,
      payer: (data.payer as string) ?? "authority",
      space: (data.space as number | "auto") ?? "auto",
    });
  } else if (data.isInitIfNeeded) {
    constraints.push({
      type: "init-if-needed" as const,
      payer: (data.payer as string) ?? "authority",
      space: (data.space as number | "auto") ?? "auto",
    });
  }
  if (data.isMut && !data.isInit) {
    constraints.push({ type: "mut" as const });
  }
  if (data.isSigner) {
    constraints.push({ type: "signer" as const });
  }
  if (data.isClose) {
    constraints.push({
      type: "close" as const,
      target: (data.closeTarget as string) ?? (data.target as string) ?? "",
    });
  }
  return constraints;
}

function buildAccountIR(
  accNode: Node,
  constraintNodes: Node[],
  stateNode: Node | undefined,
): Account {
  const data = accNode.data as Record<string, unknown>;
  const constraints =
    constraintNodes.length > 0
      ? buildConstraints(constraintNodes)
      : buildConstraintsFromFlags(data);

  return {
    id: toUuid(accNode.id),
    name: (data.name as string) ?? "account",
    accountType:
      (data.accountType as Account["accountType"]) ?? "system-account",
    stateType: stateNode
      ? ((stateNode.data as Record<string, unknown>).name as string)
      : (data.stateType as string | undefined),
    constraints,
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
    const stateNode =
      getConnectedNodesReverse(accNode.id, "state", nodes, edges)[0] ??
      getConnectedNodes(accNode.id, "state", nodes, edges)[0];
    return buildAccountIR(accNode, constraintNodes, stateNode);
  });

  const body = buildLogicBody([...logicNodes, ...customCodeNodes]);

  return {
    id: toUuid(ixNode.id),
    name: (data.name as string) ?? "instruction",
    description: data.description as string | undefined,
    discriminator: data.discriminator as number[] | undefined,
    args:
      (data.args as Instruction["args"]) ??
      (data.instructionData as Instruction["args"]) ??
      [],
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
      // Strip fields not in IR schema (e.g. defaultValue) and normalize types
      const rawFields = (data.fields as Array<Record<string, unknown>>) ?? [];
      const fields: Field[] = rawFields.map((f) => ({
        name: f.name as string,
        type: normalizeType(f.type) as Field["type"],
        ...(f.description ? { description: f.description as string } : {}),
        ...(f.maxLen ? { maxLen: f.maxLen as number } : {}),
      }));
      return {
        id: toUuid(n.id),
        name: (data.name as string) ?? "State",
        fields,
        description: data.description as string | undefined,
        isZeroCopy: (data.isZeroCopy as boolean) ?? false,
        customDiscriminator: data.customDiscriminator as number[] | undefined,
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
        id: toUuid(n.id),
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
      const rawFields = (data.fields as Array<Record<string, unknown>>) ?? [];
      const fields: Field[] = rawFields.map((f) => ({
        name: f.name as string,
        type: normalizeType(f.type) as Field["type"],
        ...(f.description ? { description: f.description as string } : {}),
        ...(f.maxLen ? { maxLen: f.maxLen as number } : {}),
      }));
      return {
        id: toUuid(n.id),
        name: (data.name as string) ?? "Event",
        fields,
        description: data.description as string | undefined,
      };
    });
}

// ─── Integration Collector ─────────────────────────────────────────

function collectIntegrations(nodes: Node[], _edges: Edge[]): Integration[] {
  return nodes
    .filter((n) => n.type === "integration")
    .map((n) => {
      const data = n.data as Record<string, unknown>;
      return {
        id: toUuid(n.id),
        pluginId: (data.pluginId as string) ?? "",
        integrationId: (data.integrationId as string) ?? "",
        config: (data.config as Record<string, unknown>) ?? {},
        attachedTo: {
          instructionId: toUuid(
            ((data.attachedTo as Record<string, unknown>)
              ?.instructionId as string) ?? "",
          ),
          position:
            ((data.attachedTo as Record<string, unknown>)
              ?.position as Integration["attachedTo"]["position"]) ??
            "before-body",
        },
      };
    });
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
