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

/**
 * Collect all logic + custom-code nodes reachable from a source node,
 * following chains (A→B→C). Excludes nodes reached via if-else "else"
 * handle (those are handled inside buildLogicBody for if-else children).
 */
function collectAllLogicNodes(
  sourceId: string,
  nodes: Node[],
  edges: Edge[],
): Node[] {
  const visited = new Set<string>();
  const result: Node[] = [];

  function walk(id: string) {
    const targets = edges
      .filter((e) => e.source === id)
      .map((e) => e.target);

    for (const targetId of targets) {
      if (visited.has(targetId)) continue;
      const targetNode = nodes.find((n) => n.id === targetId);
      if (!targetNode) continue;

      if (targetNode.type === "logic" || targetNode.type === "custom-code") {
        visited.add(targetId);
        result.push(targetNode);
        // Follow the chain — but skip children reached via if-else else handle
        // (those are handled recursively inside buildLogicBody)
        const edge = edges.find((e) => e.source === id && e.target === targetId);
        if (!(edge?.sourceHandle === "else" || edge?.sourceHandle === "else-out")) {
          walk(targetId);
        }
      }
    }
  }

  walk(sourceId);
  return result;
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
      case "mint-authority":
        return {
          type: "mint-authority" as const,
          authority: (d.mintAuthority as string) ?? (d.authority as string) ?? "",
        };
      case "mint-decimals":
        return {
          type: "mint-decimals" as const,
          decimals: (d.mintDecimals as number) ?? (d.decimals as number) ?? 0,
        };
      case "associated-token-authority":
        return {
          type: "associated-token-authority" as const,
          authority: (d.associatedAuthority as string) ?? (d.authority as string) ?? "",
        };
      case "associated-token-mint":
        return {
          type: "associated-token-mint" as const,
          mint: (d.associatedMint as string) ?? (d.mint as string) ?? "",
        };
      case "safety-comment":
        return {
          type: "safety-comment" as const,
          comment: (d.safetyComment as string) ?? (d.comment as string) ?? "",
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
      payer: (data.payer as string) ?? "payer",
      space: (data.space as number | "auto") ?? "auto",
    });
  } else if (data.isInitIfNeeded) {
    constraints.push({
      type: "init-if-needed" as const,
      payer: (data.payer as string) ?? "payer",
      space: (data.space as number | "auto") ?? "auto",
    });
  }
  if (data.isMut) {
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

  // Token account constraints
  if (data.accountType === "token-account" && data.isInit) {
    if (data.tokenAuthority) {
      constraints.push({ type: "token-authority" as const, authority: data.tokenAuthority as string });
    }
    if (data.tokenMint) {
      constraints.push({ type: "token-mint" as const, mint: data.tokenMint as string });
    }
  }

  // Mint constraints
  if (data.accountType === "mint" && data.isInit) {
    if (data.mintAuthority) {
      constraints.push({ type: "mint-authority" as const, authority: data.mintAuthority as string });
    }
    if (data.mintDecimals !== undefined) {
      constraints.push({ type: "mint-decimals" as const, decimals: data.mintDecimals as number });
    }
  }

  // Associated token constraints (auto-init if not already init'd)
  if (data.accountType === "associated-token") {
    const hasInit = data.isInit || data.isInitIfNeeded;
    if (!hasInit) {
      constraints.push({
        type: "init" as const,
        payer: (data.payer as string) ?? "payer",
        space: "auto",
      });
    }
    if (data.associatedAuthority) {
      constraints.push({ type: "associated-token-authority" as const, authority: data.associatedAuthority as string });
    }
    if (data.associatedMint) {
      constraints.push({ type: "associated-token-mint" as const, mint: data.associatedMint as string });
    }
  }

  // Unchecked account safety comment
  if (data.accountType === "unchecked-account" && data.safetyComment) {
    constraints.push({ type: "safety-comment" as const, comment: data.safetyComment as string });
  }

  // PDA seeds (flag-based — when user sets seeds directly on the account node)
  if (Array.isArray(data.seeds) && (data.seeds as unknown[]).length > 0) {
    constraints.push({
      type: "seeds" as const,
      seeds: data.seeds as Seed[],
      bump: (data.bump as string) || undefined,
      programId: (data.programId as string) || undefined,
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
  const flagConstraints = buildConstraintsFromFlags(data);
  const explicitConstraints = constraintNodes.length > 0
    ? buildConstraints(constraintNodes)
    : [];

  // Merge: flag-based constraints provide defaults, but explicit constraint
  // nodes override them (the user explicitly configured those parameters).
  const merged: Constraint[] = [...flagConstraints];
  const seenTypes = new Set(flagConstraints.map((c) => c.type));
  for (const c of explicitConstraints) {
    const existingIdx = merged.findIndex((m) => m.type === c.type);
    if (existingIdx >= 0) {
      // Override flag-based with explicit constraint node parameters
      merged[existingIdx] = c;
    } else {
      merged.push(c);
      seenTypes.add(c.type);
    }
  }

  return {
    id: toUuid(accNode.id),
    name: (data.name as string) ?? "account",
    accountType:
      (data.accountType as Account["accountType"]) ?? "system-account",
    stateType: stateNode
      ? ((stateNode.data as Record<string, unknown>).name as string)
      : (data.stateType as string | undefined),
    constraints: merged,
    description: data.description as string | undefined,
  };
}

// ─── Logic Body Builder ────────────────────────────────────────────

function buildLogicBody(
  logicNodes: Node[],
  allNodes: Node[],
  edges: Edge[],
): LogicOperation[] {
  return logicNodes
    .sort((a, b) => {
      const aOrder = ((a.data as Record<string, unknown>).order as number) ?? 0;
      const bOrder = ((b.data as Record<string, unknown>).order as number) ?? 0;
      return aOrder - bOrder;
    })
    .map((n) => {
      const data = n.data as Record<string, unknown>;
      const op = buildLogicOpFromNodeData(data);
      if (op && op.type === "if-else") {
        // Collect child logic nodes connected to this if-else node
        const childLogicNodes = getConnectedNodes(n.id, "logic", allNodes, edges);
        const childCustomCodeNodes = getConnectedNodes(n.id, "custom-code", allNodes, edges);
        const allChildren = [...childLogicNodes, ...childCustomCodeNodes];
        // Separate children into then/else based on handle
        const thenNodes: Node[] = [];
        const elseNodes: Node[] = [];
        for (const child of allChildren) {
          const edge = edges.find(
            (e) => e.source === n.id && e.target === child.id,
          );
          // Check which handle the connection comes from
          const sourceHandle = edge?.sourceHandle;
          if (sourceHandle === "else" || sourceHandle === "else-out") {
            elseNodes.push(child);
          } else {
            thenNodes.push(child);
          }
        }
        op.thenBody = buildLogicBody(thenNodes, allNodes, edges);
        op.elseBody =
          elseNodes.length > 0
            ? buildLogicBody(elseNodes, allNodes, edges)
            : undefined;
      }
      return op;
    })
    .filter((op): op is LogicOperation => op !== null);
}

function buildLogicOpFromNodeData(data: Record<string, unknown>): LogicOperation | null {
  // If data.operation exists, use it directly (backward compat)
  if (data.operation) return data.operation as LogicOperation;

  const lt = data.logicType as string;
  switch (lt) {
    case "set-field":
      return {
        type: "set-field",
        account: (data.setAccount as string) ?? "",
        field: (data.setField as string) ?? "",
        value: (data.setValue as string) ?? "",
      };
    case "transfer-sol":
      return {
        type: "transfer-sol",
        from: (data.transferFrom as string) ?? "",
        to: (data.transferTo as string) ?? "",
        amount: (data.transferAmount as string) ?? "",
      };
    case "transfer-token":
      return {
        type: "transfer-token",
        from: (data.transferFrom as string) ?? "",
        to: (data.transferTo as string) ?? "",
        authority: (data.transferAuthority as string) ?? "",
        amount: (data.transferAmount as string) ?? "",
        ...(data.signerSeeds ? { signerSeeds: data.signerSeeds as Seed[] } : {}),
      };
    case "mint-to":
      return {
        type: "mint-to",
        mint: (data.mintTo as string) ?? "",
        to: (data.transferTo as string) ?? "",
        authority: (data.mintAuthority as string) ?? "",
        amount: (data.transferAmount as string) ?? "",
        ...(data.signerSeeds ? { signerSeeds: data.signerSeeds as Seed[] } : {}),
      };
    case "burn":
      return {
        type: "burn",
        mint: (data.burnMint as string) ?? "",
        from: (data.transferFrom as string) ?? "",
        authority: (data.burnAuthority as string) ?? "",
        amount: (data.transferAmount as string) ?? "",
        ...(data.signerSeeds ? { signerSeeds: data.signerSeeds as Seed[] } : {}),
      };
    case "require":
      return {
        type: "require",
        condition: (data.requireCondition as string) ?? "",
        errorCode: (data.requireErrorCode as string) ?? "",
      };
    case "emit-event":
      return {
        type: "emit-event",
        event: (data.emitEvent as string) ?? "",
        fields: (data.emitFields as Record<string, string>) ?? {},
      };
    case "return-error":
      return {
        type: "return-error",
        errorCode: (data.returnErrorCode as string) ?? "",
      };
    case "if-else":
      // thenBody and elseBody are populated by buildLogicBodyFromTree when
      // processing nested logic connections. Here we only store the condition.
      // The caller will merge child nodes into these arrays.
      return {
        type: "if-else",
        condition: (data.ifCondition as string) ?? "",
        thenBody: [],
        elseBody: undefined,
      };
    case "math":
      return {
        type: "math",
        operation: (data.mathOperation as "add" | "sub" | "mul" | "div" | "mod") ?? "add",
        left: (data.mathLeft as string) ?? "",
        right: (data.mathRight as string) ?? "",
        result: (data.mathResult as string) ?? "",
        checked: (data.mathChecked as boolean) ?? false,
      };
    case "cpi":
      return {
        type: "cpi",
        targetProgram: (data.cpiProgram as string) ?? "",
        instruction: (data.cpiInstruction as string) ?? "",
        accounts: (data.cpiAccounts as Array<{ from: string; to: string }>) ?? [],
        data: (data.cpiData as Array<{ name: string; value: string }>) ?? [],
        ...(data.signerSeeds ? { signerSeeds: data.signerSeeds as Seed[] } : {}),
      };
    case "custom-code":
      return {
        type: "custom-code",
        code: (data.customCode as string) ?? "",
        inputs: (data.customInputs as string[]) ?? [],
        outputs: (data.customOutputs as string[]) ?? [],
      };
    default:
      return null;
  }
}

// ─── Instruction Builder ───────────────────────────────────────────

function normalizeInstructionArgs(data: Record<string, unknown>): Instruction["args"] {
  const raw = (data.args ?? data.instructionData ?? []) as Array<Record<string, unknown>>;
  return raw.map((a) => ({
    name: a.name as string,
    type: normalizeType(a.type) as import("./schema").SolanaType,
    description: a.description as string | undefined,
  }));
}

function buildInstructionIR(
  ixNode: Node,
  nodes: Node[],
  edges: Edge[],
): Instruction {
  const data = ixNode.data as Record<string, unknown>;

  const accountNodes = getConnectedNodes(ixNode.id, "account", nodes, edges);
  // Collect ALL logic + custom-code nodes, following chains (A→B→C)
  const allLogicNodes = collectAllLogicNodes(ixNode.id, nodes, edges);

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

  const body = buildLogicBody(allLogicNodes, nodes, edges);

  // Post-process: fix init/init-if-needed constraints where payer name doesn't
  // match any account. Default to the first signer account in the instruction.
  const accountNames = new Set(resolvedAccounts.map((a) => a.name));
  const firstSigner = resolvedAccounts.find((a) =>
    a.accountType === "signer" ||
    a.constraints.some((c) => c.type === "signer"),
  );
  for (const acc of resolvedAccounts) {
    for (const c of acc.constraints) {
      if ((c.type === "init" || c.type === "init-if-needed") && c.payer && !accountNames.has(c.payer)) {
        c.payer = firstSigner?.name ?? c.payer;
      }
    }
  }

  return {
    id: toUuid(ixNode.id),
    name: (data.name as string) ?? "instruction",
    description: data.description as string | undefined,
    discriminator: data.discriminator as number[] | undefined,
    args: normalizeInstructionArgs(data),
    accounts: resolvedAccounts,
    body,
    accessControl: (data.accessControl as "none" | "admin_only" | "custom") ?? "none",
  };
}

// ─── State Collector ───────────────────────────────────────────────

function collectStates(nodes: Node[]): State[] {
  return nodes
    .filter((n) => n.type === "state")
    .map((n) => {
      const data = n.data as Record<string, unknown>;
      const rawFields = (data.fields as Array<Record<string, unknown>>) ?? [];
      const fields: Field[] = rawFields.map((f) => ({
        name: f.name as string,
        type: normalizeType(f.type) as Field["type"],
        ...(f.description ? { description: f.description as string } : {}),
        ...(f.maxLen ? { maxLen: f.maxLen as number } : {}),
        ...(f.defaultValue ? { defaultValue: f.defaultValue as string } : {}),
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

function parsePluginType(type: string | undefined): {
  pluginId: string;
  integrationId: string;
} | null {
  if (!type || !type.includes(":")) return null;
  const [pluginId, integrationId] = type.split(":", 2);
  if (!pluginId || !integrationId) return null;
  return { pluginId, integrationId };
}

function findAttachedInstructionId(
  integrationNode: Node,
  nodes: Node[],
  edges: Edge[],
): string {
  const incoming = edges.find((edge) => {
    if (edge.target !== integrationNode.id) return false;
    return nodes.find((node) => node.id === edge.source)?.type === "instruction";
  });
  if (incoming) return incoming.source;

  const outgoing = edges.find((edge) => {
    if (edge.source !== integrationNode.id) return false;
    return nodes.find((node) => node.id === edge.target)?.type === "instruction";
  });
  return outgoing?.target ?? "";
}

function collectIntegrations(nodes: Node[], edges: Edge[]): Integration[] {
  return nodes
    .filter((n) => n.type === "integration" || parsePluginType(n.type))
    .map((n) => {
      const data = n.data as Record<string, unknown>;
      const parsedType = parsePluginType(n.type);
      const pluginId = (data.pluginId as string | undefined) ?? parsedType?.pluginId ?? "";
      const integrationId =
        (data.integrationId as string | undefined) ??
        parsedType?.integrationId ??
        "";
      const attachedTo = (data.attachedTo as Record<string, unknown>) ?? {};
      const attachedInstructionId =
        (attachedTo.instructionId as string | undefined) ??
        findAttachedInstructionId(n, nodes, edges);
      const config = {
        ...((data.config as Record<string, unknown> | undefined) ?? {}),
      };

      return {
        id: toUuid(n.id),
        pluginId,
        integrationId,
        config,
        attachedTo: {
          instructionId: toUuid(attachedInstructionId),
          position:
            (attachedTo.position as Integration["attachedTo"]["position"]) ??
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
