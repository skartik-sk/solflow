// Kinobi IDL Parser
// Converts Kinobi (Metaplex) IDL JSON into the unified IDL format.
// Kinobi uses a tree-based structure with `nodes` instead of flat arrays.

import type {
  UnifiedIdl,
  UnifiedInstruction,
  UnifiedAccountRef,
  UnifiedAccountState,
  UnifiedError,
  UnifiedTypeDef,
  SolanaType,
} from "../types";
import { mapType } from "./type-mapper";

// ─── Kinobi node types ───────────────────────────────────────────────────

interface KinobiNode {
  kind: string;
  name?: string;
  // Program node
  publicKey?: string;
  // Instruction node
  accounts?: KinobiAccountNode[];
  arguments?: KinobiArgNode[];
  // Struct/Account node
  fields?: KinobiFieldNode[];
  // Enum node
  variants?: KinobiVariantNode[];
  // PDA node
  seeds?: KinobiSeedNode[];
  // Error node
  code?: number;
  message?: string;
  // Documentation
  docs?: string[];
  // Children (nested nodes)
  children?: Record<string, KinobiNode>;
}

interface KinobiAccountNode {
  name: string;
  isMut: boolean;
  isSigner: boolean;
  isOptional?: boolean;
  docs?: string[];
}

interface KinobiArgNode {
  name: string;
  type: unknown;
  docs?: string[];
}

interface KinobiFieldNode {
  name: string;
  type: unknown;
  docs?: string[];
}

interface KinobiVariantNode {
  name: string;
  fields?: KinobiFieldNode[];
}

interface KinobiSeedNode {
  kind: string;
  value?: string;
  path?: string;
}

// ─── Parser ──────────────────────────────────────────────────────────────

export function parseKinobiIdl(json: unknown): UnifiedIdl {
  const idl = json as Record<string, unknown>;

  // Kinobi can have `nodes` object or be flat
  const nodes = (idl.nodes ?? idl) as Record<string, KinobiNode>;

  // Try to find the root program node
  let programName = (idl.name as string) ?? "unknown_program";
  let programId: string | undefined;
  const instructions: UnifiedInstruction[] = [];
  const accounts: UnifiedAccountState[] = [];
  const errors: UnifiedError[] = [];
  const types: UnifiedTypeDef[] = [];

  // Walk all nodes
  const nodeEntries = Array.isArray(nodes)
    ? (nodes as KinobiNode[]).map((n, i) => [String(i), n] as [string, KinobiNode])
    : Object.entries(nodes);

  for (const [_key, node] of nodeEntries) {
    if (!node || typeof node !== "object") continue;

    switch (node.kind) {
      case "program":
      case "programNode":
        programName = node.name ?? programName;
        programId = node.publicKey ?? programId;

        // Recurse into children for instructions
        if (node.children && typeof node.children === "object") {
          for (const [childKey, child] of Object.entries(node.children)) {
            if (!child || typeof child !== "object") continue;
            const childNode = child as KinobiNode;
            if (
              childNode.kind === "instruction" ||
              childNode.kind === "instructionNode"
            ) {
              instructions.push(parseKinobiInstruction(childNode));
            }
          }
        }
        break;

      case "instruction":
      case "instructionNode":
        instructions.push(parseKinobiInstruction(node));
        break;

      case "account":
      case "accountNode":
      case "struct":
      case "structNode": {
        const fields = (node.fields ?? []).map((f) => ({
          name: f.name,
          type: mapType(f.type),
          description: f.docs?.join(" "),
        }));
        accounts.push({ name: node.name ?? "Account", fields });
        break;
      }

      case "error":
      case "errorNode":
        if (node.name && node.message) {
          errors.push({
            code: node.code ?? 6000,
            name: node.name,
            message: node.message,
          });
        }
        break;

      case "definedType":
      case "definedTypeNode": {
        const fields = (node.fields ?? []).map((f) => ({
          name: f.name,
          type: mapType(f.type),
        }));
        types.push({
          name: node.name ?? "Type",
          fields,
          variants: node.variants?.map((v) => ({
            name: v.name,
            fields: v.fields?.map((f) => ({
              name: f.name,
              type: mapType(f.type),
            })),
          })),
        });
        break;
      }
    }
  }

  // If name came from top level
  if (idl.name && typeof idl.name === "string") {
    programName = idl.name;
  }

  if (instructions.length === 0 && accounts.length === 0) {
    throw new Error(
      "Invalid Kinobi IDL: could not find any instructions or accounts",
    );
  }

  return {
    program: {
      name: programName,
      version: "0.1.0",
      programId,
    },
    instructions,
    accounts,
    errors,
    events: [],
    types,
  };
}

function parseKinobiInstruction(node: KinobiNode): UnifiedInstruction {
  const accounts: UnifiedAccountRef[] = (node.accounts ?? []).map((acc) => ({
    name: acc.name,
    isMut: acc.isMut ?? false,
    isSigner: acc.isSigner ?? false,
    isOptional: acc.isOptional,
    description: acc.docs?.join(" "),
  }));

  const args = (node.arguments ?? []).map((arg) => ({
    name: arg.name,
    type: mapType(arg.type) as SolanaType,
    description: arg.docs?.join(" "),
  }));

  return {
    name: node.name ?? "instruction",
    args,
    accounts,
    description: node.docs?.join(" "),
  };
}
