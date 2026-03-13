// packages/sdk-gen/src/ir-to-codama.ts
// Transforms SolFlow ProgramIR into a Codama RootNode for SDK generation.

import type { ProgramIR, SolanaType } from "@solflow/ir";
import type { TypeNode } from "codama";
import {
  rootNode,
  programNode,
  instructionNode,
  instructionAccountNode,
  instructionArgumentNode,
  accountNode,
  definedTypeNode,
  errorNode,
  structTypeNode,
  structFieldTypeNode,
  enumTypeNode,
  enumEmptyVariantTypeNode,
  arrayTypeNode,
  optionTypeNode,
  numberTypeNode,
  publicKeyTypeNode,
  stringTypeNode,
  booleanTypeNode,
  definedTypeLinkNode,
  fixedCountNode,
  prefixedCountNode,
  mapTypeNode,
} from "codama";

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Convert a SolFlow ProgramIR into a Codama RootNode.
 * The RootNode can then be fed to `@codama/renderers-js` to produce
 * TypeScript client code compatible with Solana Kit (Web3.js 2.0).
 */
export function irToCodamaIDL(ir: ProgramIR) {
  // ── 1. Instructions ──────────────────────────────────────────────
  const instructions = ir.instructions.map((ix) => {
    const accounts = ix.accounts.map((acc) => {
      const isSigner =
        acc.constraints.some((c) => c.type === "signer") ||
        acc.accountType === "signer";
      const isWritable = acc.constraints.some(
        (c) =>
          c.type === "mut" ||
          c.type === "init" ||
          c.type === "init-if-needed" ||
          c.type === "realloc",
      );
      return instructionAccountNode({
        name: acc.name,
        isSigner: isSigner ? "either" : false,
        isWritable,
        isOptional: false,
        docs: acc.description ? [acc.description] : [],
      });
    });

    const args = ix.args.map((arg) =>
      instructionArgumentNode({
        name: arg.name,
        type: mapSolanaTypeToCodama(arg.type),
        docs: arg.description ? [arg.description] : [],
      }),
    );

    return instructionNode({
      name: ix.name,
      accounts,
      arguments: args,
      docs: ix.description ? [ix.description] : [],
    });
  });

  // ── 2. Accounts (on-chain state structs) ─────────────────────────
  const accounts = ir.states.map((state) =>
    accountNode({
      name: state.name,
      data: structTypeNode(
        state.fields.map((f) =>
          structFieldTypeNode({
            name: f.name,
            type: mapSolanaTypeToCodama(f.type),
            docs: f.description ? [f.description] : [],
          }),
        ),
      ),
      docs: state.description ? [state.description] : [],
    }),
  );

  // ── 3. Errors → a single enum DefinedType ────────────────────────
  const definedTypes =
    ir.errors.length > 0
      ? [
          definedTypeNode({
            name: `${toPascalCase(ir.program.name)}Error`,
            type: enumTypeNode(
              ir.errors.map((e) => enumEmptyVariantTypeNode(e.name)),
            ),
          }),
        ]
      : [];

  // ── 4. Error nodes (Codama ErrorNode) ────────────────────────────
  const errors = ir.errors.map((e) =>
    errorNode({
      name: e.name,
      code: e.code,
      message: e.message,
    }),
  );

  // ── 5. Assemble ProgramNode ──────────────────────────────────────
  const program = programNode({
    name: ir.program.name,
    publicKey: ir.program.programId ?? "11111111111111111111111111111111",
    version: toSemver(ir.program.version),
    instructions,
    accounts,
    definedTypes,
    errors,
    docs: ir.program.description ? [ir.program.description] : [],
  });

  return rootNode(program);
}

// ─── Type Mapping ──────────────────────────────────────────────────────────────

export function mapSolanaTypeToCodama(type: SolanaType): TypeNode {
  // Primitive string literals
  if (typeof type === "string") {
    switch (type) {
      case "bool":
        return booleanTypeNode();
      case "u8":
        return numberTypeNode("u8");
      case "u16":
        return numberTypeNode("u16");
      case "u32":
        return numberTypeNode("u32");
      case "u64":
        return numberTypeNode("u64");
      case "u128":
        return numberTypeNode("u128");
      case "i8":
        return numberTypeNode("i8");
      case "i16":
        return numberTypeNode("i16");
      case "i32":
        return numberTypeNode("i32");
      case "i64":
        return numberTypeNode("i64");
      case "i128":
        return numberTypeNode("i128");
      case "f32":
        return numberTypeNode("f32");
      case "f64":
        return numberTypeNode("f64");
      case "String":
        return stringTypeNode("utf8");
      case "Pubkey":
        return publicKeyTypeNode();
    }
  }

  // Fixed-size array: [T; N]
  if (typeof type === "object" && "array" in type) {
    const [inner, size] = type.array;
    return arrayTypeNode(mapSolanaTypeToCodama(inner), fixedCountNode(size));
  }

  // Dynamic vector: Vec<T>
  if (typeof type === "object" && "vec" in type) {
    return arrayTypeNode(
      mapSolanaTypeToCodama(type.vec),
      prefixedCountNode(numberTypeNode("u32")),
    );
  }

  // Option<T>
  if (typeof type === "object" && "option" in type) {
    return optionTypeNode(mapSolanaTypeToCodama(type.option));
  }

  // Named defined type reference
  if (typeof type === "object" && "defined" in type) {
    return definedTypeLinkNode(type.defined);
  }

  // HashMap<K, V>
  if (typeof type === "object" && "hashMap" in type) {
    const [k, v] = type.hashMap;
    return mapTypeNode(
      mapSolanaTypeToCodama(k),
      mapSolanaTypeToCodama(v),
      prefixedCountNode(numberTypeNode("u32")),
    );
  }

  // Inline enum definition
  if (typeof type === "object" && "enum" in type) {
    return enumTypeNode(
      type.enum.variants.map((v) => enumEmptyVariantTypeNode(v.name)),
    );
  }

  // Fallback — treat unknown as bytes
  return stringTypeNode("utf8");
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function toPascalCase(s: string): string {
  return s
    .replace(/[_-](.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (_, c: string) => c.toUpperCase());
}

/**
 * Coerce an arbitrary version string to the semver triple required by Codama
 * (`"${number}.${number}.${number}"`). Falls back to "0.1.0" if unparseable.
 */
function toSemver(v: string): `${number}.${number}.${number}` {
  const match = v.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (match) {
    return `${match[1]}.${match[2]}.${match[3]}` as `${number}.${number}.${number}`;
  }
  // Try "major.minor" only
  const short = v.match(/^(\d+)\.(\d+)/);
  if (short) {
    return `${short[1]}.${short[2]}.0` as `${number}.${number}.${number}`;
  }
  return "0.1.0";
}
