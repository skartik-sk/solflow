// Codama IDL Parser
// Converts Codama IDL JSON (tree-based with `kind` discriminators) into unified IDL.

import type {
  UnifiedIdl,
  UnifiedInstruction,
  UnifiedAccountRef,
  UnifiedAccountState,
  UnifiedError,
  UnifiedEvent,
  UnifiedTypeDef,
  SolanaType,
} from "../types";

// ─── Codama node interfaces ──────────────────────────────────────────────

interface CodamaNode {
  kind: string;
  [key: string]: unknown;
}

// ─── Type resolver ───────────────────────────────────────────────────────

function resolveCodamaType(node: unknown): SolanaType {
  if (!node || typeof node !== "object") return { defined: "unknown" };
  const n = node as CodamaNode;

  switch (n.kind) {
    case "numberTypeNode": {
      const format = (n.format as string) ?? "u32";
      const map: Record<string, SolanaType> = {
        u8: "u8", u16: "u16", u32: "u32", u64: "u64", u128: "u128",
        i8: "i8", i16: "i16", i32: "i32", i64: "i64", i128: "i128",
        f32: "f32", f64: "f64", shortU16: "u16",
      };
      return map[format] ?? format as SolanaType;
    }
    case "publicKeyTypeNode":
      return "Pubkey";
    case "stringTypeNode":
      return "String";
    case "booleanTypeNode":
      return "bool";
    case "bytesTypeNode":
      return { array: ["u8", 0] }; // variable-length bytes
    case "arrayTypeNode": {
      const item = resolveCodamaType(n.item);
      const count = n.count as CodamaNode | undefined;
      if (count?.kind === "fixedCountNode") {
        return { array: [item, count.value as number] };
      }
      // prefixed or remainder → vec
      return { vec: item };
    }
    case "optionTypeNode":
      return { option: resolveCodamaType(n.item) };
    case "mapTypeNode":
      return { hashMap: [resolveCodamaType(n.key), resolveCodamaType(n.value)] };
    case "definedTypeLinkNode":
      return { defined: n.name as string };
    case "enumTypeNode":
    case "structTypeNode":
    case "tupleTypeNode":
      return { defined: "composite" };
    case "fixedSizeTypeNode":
      return resolveCodamaType(n.type);
    case "sizePrefixTypeNode":
      return resolveCodamaType(n.type);
    case "solAmountTypeNode":
      return "u64";
    case "amountTypeNode":
      return "u64";
    case "dateTimeTypeNode":
      return "u64";
    default:
      if (typeof n.name === "string") return { defined: n.name };
      return { defined: "unknown" };
  }
}

// ─── Instruction parsing ─────────────────────────────────────────────────

function parseCodamaInstruction(node: CodamaNode): UnifiedInstruction {
  const accounts: UnifiedAccountRef[] = ((node.accounts as CodamaNode[]) ?? []).map((acc) => ({
    name: (acc.name as string) ?? "account",
    isMut: acc.isWritable === true,
    isSigner: acc.isSigner === true || acc.isSigner === "either",
    isOptional: acc.isOptional === true,
    description: ((acc.docs as string[]) ?? []).join(" "),
  }));

  const args = ((node.arguments as CodamaNode[]) ?? []).map((arg) => ({
    name: (arg.name as string) ?? "arg",
    type: resolveCodamaType(arg.type) as SolanaType,
    description: ((arg.docs as string[]) ?? []).join(" "),
  }));

  return {
    name: (node.name as string) ?? "instruction",
    args,
    accounts,
    description: ((node.docs as string[]) ?? []).join(" "),
  };
}

// ─── Account parsing ─────────────────────────────────────────────────────

function parseStructFields(fields: CodamaNode[]): { name: string; type: SolanaType; description?: string }[] {
  return fields.map((f) => ({
    name: (f.name as string) ?? "field",
    type: resolveCodamaType(f.type),
    description: ((f.docs as string[]) ?? []).join(" "),
  }));
}

function parseCodamaAccount(node: CodamaNode): UnifiedAccountState {
  const data = node.data as CodamaNode | undefined;
  let fields: { name: string; type: SolanaType; description?: string }[] = [];

  if (data?.kind === "structTypeNode" && Array.isArray(data.fields)) {
    // Filter out discriminator fields
    fields = parseStructFields(
      (data.fields as CodamaNode[]).filter(
        (f) => f.name !== "discriminator",
      ),
    );
  }

  return {
    name: (node.name as string) ?? "Account",
    fields,
  };
}

// ─── Event parsing ───────────────────────────────────────────────────────

function parseCodamaEvent(node: CodamaNode): UnifiedEvent {
  const data = node.data as CodamaNode | undefined;
  let fields: { name: string; type: SolanaType; description?: string }[] = [];

  if (data?.kind === "structTypeNode" && Array.isArray(data.fields)) {
    fields = parseStructFields(data.fields as CodamaNode[]);
  }

  return {
    name: (node.name as string) ?? "Event",
    fields,
  };
}

// ─── Defined type parsing ────────────────────────────────────────────────

function parseCodamaDefinedType(node: CodamaNode): UnifiedTypeDef {
  const type = node.type as CodamaNode | undefined;
  const result: UnifiedTypeDef = {
    name: (node.name as string) ?? "Type",
    fields: [],
  };

  if (!type) return result;

  if (type.kind === "structTypeNode" && Array.isArray(type.fields)) {
    result.fields = parseStructFields(type.fields as CodamaNode[]);
  } else if (type.kind === "enumTypeNode" && Array.isArray(type.variants)) {
    result.variants = (type.variants as CodamaNode[]).map((v) => ({
      name: (v.name as string) ?? "variant",
      fields:
        v.kind === "enumStructVariantTypeNode" && v.struct
          ? parseStructFields(((v.struct as CodamaNode).fields as CodamaNode[]) ?? [])
          : v.kind === "enumTupleVariantTypeNode" && v.tuple
            ? ((v.tuple as CodamaNode).items as unknown[])?.map((item: unknown, i: number) => ({
                name: `field${i}`,
                type: resolveCodamaType(item),
              }))
            : undefined,
    }));
  }

  return result;
}

// ─── Main parser ─────────────────────────────────────────────────────────

export function parseCodamaIdl(json: unknown): UnifiedIdl {
  const root = json as Record<string, unknown>;

  // Handle both rootNode wrapper and bare programNode
  let program: CodamaNode;
  if (root.kind === "rootNode" && root.program) {
    program = root.program as CodamaNode;
  } else if (root.kind === "programNode") {
    program = root as CodamaNode;
  } else {
    throw new Error("Invalid Codama IDL: expected rootNode or programNode at top level");
  }

  const instructions: UnifiedInstruction[] =
    ((program.instructions as CodamaNode[]) ?? []).map(parseCodamaInstruction);

  const accounts: UnifiedAccountState[] =
    ((program.accounts as CodamaNode[]) ?? []).map(parseCodamaAccount);

  const errors: UnifiedError[] =
    ((program.errors as CodamaNode[]) ?? []).map((e) => ({
      code: (e.code as number) ?? 0,
      name: (e.name as string) ?? "Error",
      message: (e.message as string) ?? "",
    }));

  const events: UnifiedEvent[] =
    ((program.events as CodamaNode[]) ?? []).map(parseCodamaEvent);

  const types: UnifiedTypeDef[] =
    ((program.definedTypes as CodamaNode[]) ?? []).map(parseCodamaDefinedType);

  if (instructions.length === 0 && accounts.length === 0) {
    throw new Error("Invalid Codama IDL: no instructions or accounts found");
  }

  return {
    program: {
      name: (program.name as string) ?? "unknown_program",
      version: (program.version as string) ?? "0.1.0",
      programId: program.publicKey as string | undefined,
      description: ((program.docs as string[]) ?? []).join(" "),
    },
    instructions,
    accounts,
    errors,
    events,
    types,
  };
}
