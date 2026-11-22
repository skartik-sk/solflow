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
export function flowNodeIdToIrId(nodeId: string): string {
  return deterministicUuid(nodeId);
}

function toUuid(nodeId: string): string {
  return flowNodeIdToIrId(nodeId);
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
  SolanaType,
} from "./schema";
import { ProgramIRSchema, LogicOperationSchema } from "./schema";

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

function isElseHandle(handle: string | null | undefined): boolean {
  return handle === "else" || handle === "else-out";
}

function isIfElseNode(n: Node): boolean {
  const d = n.data as Record<string, unknown>;
  const op = d.operation as { type?: string } | undefined;
  return n.type === "logic" && (d.logicType === "if-else" || op?.type === "if-else");
}

/**
 * Imported programs (rust-parser) embed an if-else's branches in the node data
 * (thenBody/elseBody) and chain the next statement off its "logic-out" handle.
 */
function hasEmbeddedBranches(n: Node): boolean {
  const d = n.data as Record<string, unknown>;
  const op = d.operation as { thenBody?: unknown[]; elseBody?: unknown[] } | undefined;
  const nonEmpty = (v: unknown) => Array.isArray(v) && v.length > 0;
  return nonEmpty(d.thenBody) || nonEmpty(d.elseBody) || nonEmpty(op?.thenBody) || nonEmpty(op?.elseBody);
}

/**
 * Which part of an if-else an outgoing edge feeds: "then-out"/"else-out" are the
 * branch handles. Any other handle (the legacy single "logic-out") is the then
 * branch for editor-built nodes, and the next statement for imported nodes.
 */
function branchOf(ifNode: Node, e: Edge): "then" | "else" | "next" {
  if (isElseHandle(e.sourceHandle)) return "else";
  if (e.sourceHandle === "then" || e.sourceHandle === "then-out") return "then";
  return hasEmbeddedBranches(ifNode) ? "next" : "then";
}

/**
 * Collect the logic + custom-code nodes reachable through `startEdges`,
 * following chains (A→B→C). An if-else node is collected but its branch
 * children are NOT walked here: they belong to its then/else bodies (see
 * buildLogicBody), so they must not also appear at this level.
 */
function collectLogicChain(
  startEdges: Edge[],
  nodes: Node[],
  edges: Edge[],
  visited: Set<string>,
): Node[] {
  const result: Node[] = [];

  function visit(targetId: string) {
    if (visited.has(targetId)) return;
    const targetNode = nodes.find((n) => n.id === targetId);
    if (!targetNode) return;
    if (targetNode.type !== "logic" && targetNode.type !== "custom-code") return;
    visited.add(targetId);
    result.push(targetNode);
    const ifElse = isIfElseNode(targetNode);
    for (const e of edges) {
      if (e.source !== targetId) continue;
      if (ifElse && branchOf(targetNode, e) !== "next") continue;
      visit(e.target);
    }
  }

  for (const e of startEdges) visit(e.target);
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
  return constraintNodes.map((n): Constraint | null => {
    const d = n.data as Record<string, unknown>;
    // A new constraint node defaults to "mut" (the editor shows that default too).
    const t = (d.constraintType as string) ?? (d.type as string) ?? "mut";

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
        // Never guess: an unknown type used to silently become `signer`, which
        // adds a signature requirement the user never asked for.
        // globalThis lookup: this package also compiles under configs without DOM/node types (sdk-gen)
        (globalThis as { console?: { warn: (...args: unknown[]) => void } }).console?.warn(
          `[ir] ignoring constraint node ${n.id}: unknown constraintType "${t}"`,
        );
        return null;
    }
  }).filter((c): c is Constraint => c !== null);
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
      // "" is a bare `bump` (canonical) and must survive; only a missing bump is undefined.
      bump: data.bump !== undefined && data.bump !== null ? String(data.bump) : undefined,
      programId: (data.programId as string) || undefined,
    });
  }

  return constraints;
}

const REPEATABLE_CONSTRAINTS = new Set<Constraint["type"]>(["has-one", "custom", "owner"]);

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

  // Merge: flag-based constraints provide defaults, and an explicit constraint
  // node of the same type overrides the flag one (the user configured those
  // parameters). Explicit nodes never override each other for types that can
  // repeat (two has_one, two custom checks, ...): those are all kept.
  const merged: Constraint[] = [...flagConstraints];
  const flagCount = flagConstraints.length;
  for (const c of explicitConstraints) {
    const existingIdx = merged.findIndex((m) => m.type === c.type);
    if (existingIdx >= 0 && (existingIdx < flagCount || !REPEATABLE_CONSTRAINTS.has(c.type))) {
      merged[existingIdx] = c;
    } else {
      merged.push(c);
    }
  }

  // Constraints parsed from source (imported programs) cover what the editor's flags can't
  // express — has_one, owner, address, realloc, `constraint = …`, close targets, token checks
  // on existing accounts. The flags the editor toggles (mut, signer, init, seeds) stay authoritative.
  if (Array.isArray(data.constraints)) {
    const FLAG_OWNED = new Set(["mut", "signer", "init", "init-if-needed", "seeds"]);
    for (const c of data.constraints as Constraint[]) {
      if (!c || typeof c !== "object" || FLAG_OWNED.has(c.type)) continue;
      const existing = merged.find((m) => m.type === c.type);
      if (c.type === "close" && existing?.type === "close") {
        if (!existing.target) existing.target = c.target;
        continue;
      }
      if (c.type === "close" && !data.isClose) continue;
      if (c.type === "has-one" || c.type === "custom" || !existing) merged.push(c);
    }
  }

  return {
    id: toUuid(accNode.id),
    sourceNodeId: accNode.id,
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
  visited: Set<string>,
): LogicOperation[] {
  return logicNodes
    .sort((a, b) => {
      const aOrder = ((a.data as Record<string, unknown>).order as number) ?? 0;
      const bOrder = ((b.data as Record<string, unknown>).order as number) ?? 0;
      return aOrder - bOrder;
    })
    .flatMap((n): LogicOperation[] => {
      const data = n.data as Record<string, unknown>;
      const rawOp = n.type === "custom-code"
        ? customCodeOpFromNodeData(data)
        : buildLogicOpFromNodeData(data);
      const op = rawOp ? ({ ...rawOp, sourceNodeId: n.id } as LogicOperation) : null;
      if (!op) return [];
      if (op.type !== "if-else") return [op];
      // Each branch follows its own chain (then → A → B). A node reached from
      // both branches is where they join: it runs after the if-else.
      const out = edges.filter((e) => e.source === n.id);
      const thenNodes = collectLogicChain(out.filter((e) => branchOf(n, e) === "then"), allNodes, edges, new Set(visited));
      const elseNodes = collectLogicChain(out.filter((e) => branchOf(n, e) === "else"), allNodes, edges, new Set(visited));
      const elseIds = new Set(elseNodes.map((x) => x.id));
      const joinIds = new Set(thenNodes.filter((x) => elseIds.has(x.id)).map((x) => x.id));
      for (const x of [...thenNodes, ...elseNodes]) visited.add(x.id);
      const thenOnly = thenNodes.filter((x) => !joinIds.has(x.id));
      const elseOnly = elseNodes.filter((x) => !joinIds.has(x.id));
      op.thenBody = [...op.thenBody, ...buildLogicBody(thenOnly, allNodes, edges, visited)];
      if (elseOnly.length > 0) op.elseBody = [...(op.elseBody ?? []), ...buildLogicBody(elseOnly, allNodes, edges, visited)];
      const after = buildLogicBody(thenNodes.filter((x) => joinIds.has(x.id)), allNodes, edges, visited);
      return [op, ...after];
    });
}

/** The palette's "Rust Code Block" node stores code/inputs/outputs (no logicType). */
function customCodeOpFromNodeData(data: Record<string, unknown>): LogicOperation | null {
  if (data.logicType && data.logicType !== "custom-code") return buildLogicOpFromNodeData(data);
  return {
    type: "custom-code",
    code: ((data.code ?? data.customCode) as string | undefined) ?? "",
    inputs: ((data.inputs ?? data.customInputs) as string[] | undefined) ?? [],
    outputs: ((data.outputs ?? data.customOutputs) as string[] | undefined) ?? [],
  };
}

/** Branch ops embedded by an importer; anything that isn't a valid IR op is dropped. */
function embeddedOps(v: unknown): LogicOperation[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((o) => {
    const r = LogicOperationSchema.safeParse(o);
    return r.success ? [r.data] : [];
  });
}

/** Signer seeds only apply when the "sign with PDA seeds" box is ticked (undefined = legacy, on). */
function signerSeedsOf(data: Record<string, unknown>): { signerSeeds?: Seed[] } {
  if (data.useSignerSeeds === false) return {};
  const seeds = data.signerSeeds;
  return Array.isArray(seeds) && seeds.length > 0 ? { signerSeeds: seeds as Seed[] } : {};
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
        ...signerSeedsOf(data),
      };
    case "mint-to":
      return {
        type: "mint-to",
        mint: (data.mintTo as string) ?? "",
        to: (data.transferTo as string) ?? "",
        authority: (data.mintAuthority as string) ?? "",
        amount: (data.transferAmount as string) ?? "",
        ...signerSeedsOf(data),
      };
    case "burn":
      return {
        type: "burn",
        mint: (data.burnMint as string) ?? "",
        from: (data.transferFrom as string) ?? "",
        authority: (data.burnAuthority as string) ?? "",
        amount: (data.transferAmount as string) ?? "",
        ...signerSeedsOf(data),
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
      // Editor-built nodes get their branches from the then/else edges (see
      // buildLogicBody); imported ones carry them in thenBody/elseBody.
      return {
        type: "if-else",
        condition: (data.ifCondition as string) ?? "",
        thenBody: embeddedOps(data.thenBody),
        elseBody: embeddedOps(data.elseBody).length > 0 ? embeddedOps(data.elseBody) : undefined,
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
        ...signerSeedsOf(data),
      };
    case "close-account":
      return {
        type: "close-account",
        account: (data.closeAccount as string) ?? "",
        destination: (data.closeDestination as string) ?? "",
        authority: (data.closeAuthority as string) ?? "",
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
    type: normalizeType(a.type) as SolanaType,
    description: a.description as string | undefined,
  }));
}

function buildInstructionIR(
  ixNode: Node,
  nodes: Node[],
  edges: Edge[],
): Instruction {
  const data = ixNode.data as Record<string, unknown>;

  // Imported programs record each account's position in the source struct on its edge (shared
  // nodes like system_program sit at different positions per instruction); that order is ABI.
  const edgeOrder = (accId: string) => {
    const e = edges.find((x) => x.source === ixNode.id && x.target === accId) as (Edge & { data?: { order?: number } }) | undefined;
    return e?.data?.order;
  };
  const accountNodes = getConnectedNodes(ixNode.id, "account", nodes, edges);
  if (accountNodes.some((n) => edgeOrder(n.id) !== undefined)) {
    const index = new Map(accountNodes.map((n, i) => [n.id, i]));
    accountNodes.sort((a, b) => (edgeOrder(a.id) ?? 1e6 + index.get(a.id)!) - (edgeOrder(b.id) ?? 1e6 + index.get(b.id)!));
  }
  // Collect the top-level logic + custom-code nodes, following chains (A→B→C).
  const visitedLogic = new Set<string>();
  const allLogicNodes = collectLogicChain(edges.filter((e) => e.source === ixNode.id), nodes, edges, visitedLogic);

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

  const body = buildLogicBody(allLogicNodes, nodes, edges, visitedLogic);

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

  // Accounts whose lamports or token balances the body moves must be writable,
  // or the transaction fails at runtime (e.g. a deposit's payer without `mut`).
  const written = new Set<string>();
  const collectWritten = (ops: LogicOperation[]) => {
    for (const op of ops) {
      if (op.type === "transfer-sol" || op.type === "transfer-token") written.add(op.from).add(op.to);
      else if (op.type === "mint-to") written.add(op.mint).add(op.to);
      else if (op.type === "burn") written.add(op.mint).add(op.from);
      else if (op.type === "close-account") written.add(op.account).add(op.destination);
      else if (op.type === "if-else") {
        collectWritten(op.thenBody);
        collectWritten(op.elseBody ?? []);
      }
    }
  };
  collectWritten(body);
  const NEVER_MUT = new Set(["system-program", "token-program", "associated-token-program", "program", "rent", "clock"]);
  for (const acc of resolvedAccounts) {
    if (!written.has(acc.name) || NEVER_MUT.has(acc.accountType)) continue;
    if (acc.constraints.some((c) => c.type === "mut" || c.type === "init" || c.type === "init-if-needed")) continue;
    acc.constraints.push({ type: "mut" });
  }

  return {
    id: toUuid(ixNode.id),
    sourceNodeId: ixNode.id,
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
        sourceNodeId: n.id,
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
        sourceNodeId: n.id,
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
        sourceNodeId: n.id,
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
        sourceNodeId: n.id,
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
      // An empty version field (the editor allows it) means the default.
      version: ((data.version as string) || "").trim() || "0.1.0",
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
