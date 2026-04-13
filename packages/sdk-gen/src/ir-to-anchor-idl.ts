// packages/sdk-gen/src/ir-to-anchor-idl.ts
// Converts ProgramIR to a standard Anchor IDL JSON structure.
// The Anchor IDL format is the de-facto standard for Solana program ABIs.

import type { ProgramIR, SolanaType } from "@solflow/ir";

// ─── Anchor IDL types (simplified, matching Anchor v0.30 format) ─────────────

interface AnchorIdlType {
  kind: "struct" | "enum";
  fields?: AnchorIdlField[];
  variants?: { name: string }[];
}

interface AnchorIdlField {
  name: string;
  type: unknown;
}

interface AnchorIdlAccountDef {
  name: string;
  type: AnchorIdlType;
}

interface AnchorIdlInstructionArg {
  name: string;
  type: unknown;
}

interface AnchorIdlInstructionAccount {
  name: string;
  isMut: boolean;
  isSigner: boolean;
  docs?: string[];
}

interface AnchorIdlInstruction {
  name: string;
  accounts: AnchorIdlInstructionAccount[];
  args: AnchorIdlInstructionArg[];
  docs?: string[];
  discriminator?: number[];
}

interface AnchorIdlError {
  code: number;
  name: string;
  msg: string;
}

export interface AnchorIDL {
  address: string;
  metadata: {
    name: string;
    version: string;
    spec: string;
    description?: string;
  };
  instructions: AnchorIdlInstruction[];
  accounts: AnchorIdlAccountDef[];
  errors: AnchorIdlError[];
  types: AnchorIdlAccountDef[];
}

// ─── Main converter ──────────────────────────────────────────────────────────

export function irToAnchorIDL(ir: ProgramIR): AnchorIDL {
  const instructions: AnchorIdlInstruction[] = ir.instructions.map((ix) => {
    const accounts: AnchorIdlInstructionAccount[] = ix.accounts.map((acc) => ({
      name: camelCase(acc.name),
      isMut: acc.constraints.some(
        (c) =>
          c.type === "mut" ||
          c.type === "init" ||
          c.type === "init-if-needed" ||
          c.type === "realloc",
      ),
      isSigner:
        acc.accountType === "signer" ||
        acc.constraints.some((c) => c.type === "signer"),
      docs: acc.description ? [acc.description] : undefined,
    }));

    const args: AnchorIdlInstructionArg[] = ix.args.map((arg) => ({
      name: camelCase(arg.name),
      type: solanaTypeToAnchorIdlType(arg.type),
    }));

    return {
      name: camelCase(ix.name),
      accounts,
      args,
      docs: ix.description ? [ix.description] : undefined,
    };
  });

  const accounts: AnchorIdlAccountDef[] = ir.states.map((state) => ({
    name: pascalCase(state.name),
    type: {
      kind: "struct",
      fields: state.fields.map((f) => ({
        name: camelCase(f.name),
        type: solanaTypeToAnchorIdlType(f.type),
      })),
    },
  }));

  // Anchor IDL requires account struct definitions in both `accounts` and `types`.
  // Also include event struct definitions as types.
  const eventTypes: AnchorIdlAccountDef[] = ir.events.map((ev) => ({
    name: pascalCase(ev.name),
    type: {
      kind: "struct",
      fields: ev.fields.map((f) => ({
        name: camelCase(f.name),
        type: solanaTypeToAnchorIdlType(f.type),
      })),
    },
  }));

  const errors: AnchorIdlError[] = ir.errors.map((e) => ({
    code: e.code,
    name: pascalCase(e.name),
    msg: e.message,
  }));

  return {
    address: ir.program.programId ?? "11111111111111111111111111111111",
    metadata: {
      name: camelCase(ir.program.name),
      version: ir.program.version,
      spec: "0.1.0",
      description: ir.program.description,
    },
    instructions,
    accounts,
    errors,
    types: [...accounts, ...eventTypes],
  };
}

// ─── Type conversion ─────────────────────────────────────────────────────────

function solanaTypeToAnchorIdlType(type: SolanaType): unknown {
  if (typeof type === "string") {
    // Map to Anchor IDL primitive names
    const map: Record<string, string> = {
      bool: "bool",
      u8: "u8",
      u16: "u16",
      u32: "u32",
      u64: "u64",
      u128: "u128",
      i8: "i8",
      i16: "i16",
      i32: "i32",
      i64: "i64",
      i128: "i128",
      f32: "f32",
      f64: "f64",
      String: "string",
      Pubkey: "publicKey",
    };
    return map[type] ?? type;
  }

  if (typeof type === "object") {
    if ("vec" in type) {
      return { vec: solanaTypeToAnchorIdlType(type.vec) };
    }
    if ("array" in type) {
      const [inner, size] = type.array;
      return { array: [solanaTypeToAnchorIdlType(inner), size] };
    }
    if ("option" in type) {
      return { option: solanaTypeToAnchorIdlType(type.option) };
    }
    if ("defined" in type) {
      return { defined: { name: type.defined } };
    }
    if ("hashMap" in type) {
      const [k, v] = type.hashMap;
      return {
        hashMap: [solanaTypeToAnchorIdlType(k), solanaTypeToAnchorIdlType(v)],
      };
    }
    if ("enum" in type) {
      return {
        defined: { name: type.enum },
      };
    }
  }

  return "bytes";
}

// ─── String case helpers ─────────────────────────────────────────────────────

function camelCase(s: string): string {
  return s
    .replace(/[_-](.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

function pascalCase(s: string): string {
  return s
    .replace(/[_-](.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (_, c: string) => c.toUpperCase());
}
