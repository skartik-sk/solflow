// Quasar code generator — IR → Quasar Rust source files.
// Quasar v0.0.0 (beta) — zero-copy, no_std Solana framework.
//
// Architecture (from studying quasar-lang crate source + official docs):
//   - Logic lives in the #[program] block in lib.rs (inline, not delegated)
//   - Instruction files contain ONLY the #[derive(Accounts)] struct
//   - Account structs are re-exported at crate root (required by #[program])
//   - declare_id! is re-exported via quasar_lang::prelude (call directly)
//   - Ctx<T> instead of Context<T>
//   - Result<(), ProgramError> (no Result alias in Quasar)
//   - &'info mut in type instead of #[account(mut)] attribute
//   - #[account(discriminator = [N])] required (explicit byte array)
//   - #[instruction(discriminator = N)] required (explicit number)
//   - seeds use field name directly (not .key().as_ref())
//   - Address instead of Pubkey
//   - No #[msg("...")] on error variants
//   - No PodU8 (u8 is already alignment 1)
//   - PodBool, PodU16, PodU32, PodU64, PodU128, PodI16, PodI32, PodI64, PodI128

import { errorRef } from "../../utils/error-ref";
import { addMissingCrateImports } from "../../utils/crate-imports";
import { isExternalType, usesMetadata } from "../../utils/external-accounts";
import { splitSignerSeeds } from "../../utils/signer-seeds";
import { seedBytes } from "../../utils/seed-bytes";
import type {
  ProgramIR,
  Instruction,
  Account,
  Field,
  Integration,
  LogicOperation,
  Seed,
} from "@solflow/ir";
import type { GeneratedFile, CodegenWarning, CodegenError } from "../../index";
import {
  solanaTypeToRust,
  isDynamic,
  calculateSpace,
  sizeComment,
  toPascalCase,
  toKebabCase,
} from "../../utils/type-mapper";

// ─── Quasar-specific type mapper ────────────────────────────────────────────

// Quasar account structs use Pod types for zero-copy access.
// Only types that need alignment guarantee get Pod wrappers:
// PodBool, PodU16, PodU32, PodU64, PodU128, PodI16, PodI32, PodI64, PodI128
// u8, i8, u16, i16, u128, i128, f32, f64 are kept as-is.
function solanaTypeToQuasarAccount(type: import("@solflow/ir").SolanaType, maxLen?: number): string {
  if (typeof type === "string") {
    switch (type) {
      case "bool":   return "PodBool";
      case "u8":     return "u8";
      case "u16":    return "PodU16";
      case "u32":    return "PodU32";
      case "u64":    return "PodU64";
      case "u128":   return "u128";
      case "i8":     return "i8";
      case "i16":    return "PodI16";
      case "i32":    return "PodI32";
      case "i64":    return "PodI64";
      case "i128":   return "i128";
      case "f32":    return "f32";
      case "f64":    return "f64";
      case "String": return `[u8; ${maxLen ?? 64}]`;
      case "Pubkey": return "Address";
    }
  }
  if (typeof type === "object") {
    if ("array" in type) {
      const [inner, size] = type.array;
      return `[${solanaTypeToQuasarAccount(inner)}; ${size}]`;
    }
    if ("vec" in type) {
      return `Vec<'a, ${solanaTypeToQuasarAccount(type.vec)}, ${maxLen ?? 128}>`;
    }
    if ("option" in type) {
      return `Option<${solanaTypeToQuasarAccount(type.option)}>`;
    }
    if ("defined" in type) {
      return type.defined;
    }
    if ("hashMap" in type) {
      const [k, v] = type.hashMap;
      return `HashMap<${solanaTypeToQuasarAccount(k, maxLen)}, ${solanaTypeToQuasarAccount(v, maxLen)}>`;
    }
    if ("enum" in type) {
      return type.enum.name;
    }
  }
  return "u64";
}

// Quasar event fields only support: bool, u8-u128, i8-i128, Address.
function solanaTypeToQuasarEvent(type: import("@solflow/ir").SolanaType): string {
  if (typeof type === "string") {
    switch (type) {
      case "bool":   return "bool";
      case "u8":     return "u8";
      case "u16":    return "u16";
      case "u32":    return "u32";
      case "u64":    return "u64";
      case "u128":   return "u128";
      case "i8":     return "i8";
      case "i16":    return "i16";
      case "i32":    return "i32";
      case "i64":    return "i64";
      case "i128":   return "i128";
      case "Pubkey": return "Address";
      case "String": return "Address"; // Quasar events don't support String — skip in emit
      case "f32":    return "f32";
      case "f64":    return "f64";
      default:       return "u64 /* WARNING: unsupported event field type */";
    }
  }
  return "u64 /* WARNING: complex types not supported in Quasar events */";
}

// For instruction args: standard Rust types with Pubkey → Address
function solanaTypeToQuasar(type: import("@solflow/ir").SolanaType): string {
  const rust = solanaTypeToRust(type);
  if (rust === "Pubkey") return "Address";
  // Handle nested Pubkey inside container types (Vec<Pubkey>, Option<Pubkey>, etc.)
  return rust.replace(/Pubkey/g, "Address");
}

// ─── Public entry point ────────────────────────────────────────────────────────

export function generateQuasar(ir: ProgramIR): {
  files: GeneratedFile[];
  warnings: CodegenWarning[];
  errors: CodegenError[];
} {
  const warnings: CodegenWarning[] = [];
  const errors: CodegenError[] = [];
  const files: GeneratedFile[] = [];

  const programName = ir.program.name;
  const programId = ir.program.programId;
  const version = ir.program.version;

  // Determine if any instruction uses SPL tokens
  const usesSpl = ir.instructions.some((ix) =>
    ix.accounts.some(
      (a) =>
        a.accountType === "token-account" ||
        a.accountType === "mint" ||
        a.accountType === "associated-token" ||
        a.accountType === "token-program" ||
        a.accountType === "associated-token-program",
    ) ||
    ix.body.some(
      (op) =>
        op.type === "transfer-token" ||
        op.type === "mint-to" ||
        op.type === "burn",
    )
  ) || ir.integrations.some((integration) => integration.pluginId === "spl-token");

  // Sort everything deterministically
  const instructions = [...ir.instructions].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const states = [...ir.states].sort((a, b) => a.name.localeCompare(b.name));
  const errors_ = [...ir.errors].sort((a, b) => a.code - b.code);
  const events = [...ir.events].sort((a, b) => a.name.localeCompare(b.name));

  // Pre-compute state discriminators (index + 1, since 0 is reserved)
  const stateDiscriminators = new Map<string, number[]>();
  for (let i = 0; i < states.length; i++) {
    const disc = states[i].customDiscriminator ?? [(i + 1) & 0xff, ((i + 1) >> 8) & 0xff, 0, 0, 0, 0, 0, 0];
    stateDiscriminators.set(states[i].name, disc);
  }

  // ── Cargo.toml
  files.push({
    path: `programs/${programName}/Cargo.toml`,
    content: generateCargoToml(programName, version, usesSpl || usesMetadata(ir), ir.integrations, usesMetadata(ir)),
    language: "toml",
  });

  // ── src/lib.rs — contains #[program] block with ALL instruction logic
  files.push({
    path: `programs/${programName}/src/lib.rs`,
    content: generateLibRs(
      programName,
      programId,
      instructions,
      states,
      errors_,
      events,
      ir,
      usesSpl,
    ),
    language: "rust",
  });

  // ── src/instructions/mod.rs
  files.push({
    path: `programs/${programName}/src/instructions/mod.rs`,
    content: generateModRs(instructions.map((ix) => ix.name)),
    language: "rust",
  });

  // ── src/instructions/<name>.rs — ONLY the #[derive(Accounts)] struct
  for (const ix of instructions) {
    const { content, warns, errs } = generateInstructionRs(ix, ir, programName);
    for (const w of warns) warnings.push(w);
    for (const e of errs) errors.push(e);
    files.push({
      path: `programs/${programName}/src/instructions/${ix.name}.rs`,
      content,
      language: "rust",
    });
  }

  // ── src/state/mod.rs + <name>.rs
  if (states.length > 0) {
    files.push({
      path: `programs/${programName}/src/state/mod.rs`,
      content: generateModRs(states.map((s) => toSnakeFilename(s.name))),
      language: "rust",
    });
    for (const state of states) {
      const disc = stateDiscriminators.get(state.name) ?? [1];
      files.push({
        path: `programs/${programName}/src/state/${toSnakeFilename(state.name)}.rs`,
        content: generateStateRs(state.name, state.fields, disc),
        language: "rust",
      });
    }
  }

  // ── src/errors.rs
  if (errors_.length > 0) {
    const enumName = toPascalCase(programName) + "Error";
    files.push({
      path: `programs/${programName}/src/errors.rs`,
      content: generateErrorsRs(enumName, errors_),
      language: "rust",
    });
  }

  // ── src/events.rs
  if (events.length > 0) {
    files.push({
      path: `programs/${programName}/src/events.rs`,
      content: generateEventsRs(events),
      language: "rust",
    });
  }

  // ── src/constants.rs
  if (ir.constants.length > 0) {
    files.push({
      path: `programs/${programName}/src/constants.rs`,
      content: generateConstantsRs(ir.constants),
      language: "rust",
    });
  }

  return { files: addMissingCrateImports(files, ir), warnings, errors };
}

// ─── Cargo.toml ───────────────────────────────────────────────────────────────

function generateCargoToml(
  name: string,
  version: string,
  usesSpl: boolean,
  integrations: Integration[],
  metadata = false,
): string {
  const kebab = toKebabCase(name);
  const splDep = usesSpl
    ? metadata
      ? '\nquasar-spl = { version = "0.0", features = ["metadata"] }'
      : '\nquasar-spl = "0.0"'
    : "";
  const metaplexDep = integrations.some((integration) => integration.pluginId === "metaplex")
    ? '\nmpl-token-metadata = "4.1"'
    : "";
  return `[package]
name = "${kebab}"
version = "${version}"
description = "Created with SolStudio (Quasar)"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "${name}"

[features]
no-entrypoint = []
cpi = ["no-entrypoint"]
default = ["alloc"]
alloc = []

[dependencies]
quasar-lang = "0.0"${splDep}${metaplexDep}

[profile.release]
opt-level = "z"
overflow-checks = true
lto = "fat"
codegen-units = 1
strip = true
`;
}

// ─── src/lib.rs ───────────────────────────────────────────────────────────────
// This is the main file — contains #[program] with ALL instruction logic.
// Instruction files only contain the Accounts structs.

function generateLibRs(
  programName: string,
  programId: string | undefined,
  instructions: Instruction[],
  states: ProgramIR["states"],
  errors: ProgramIR["errors"],
  events: ProgramIR["events"],
  ir: ProgramIR,
  usesSpl: boolean,
): string {
  const modules: string[] = ["instructions"];
  if (states.length > 0) modules.push("state");
  if (errors.length > 0) modules.push("errors");
  if (events.length > 0) modules.push("events");
  if (ir.constants.length > 0) modules.push("constants");

  const modLines = modules.map((m) => `pub mod ${m};`).join("\n");

  // Add Sysvar import when Clock is used in any instruction body
  const usesClock = instructions.some((ix) =>
    ix.body.some((op) => JSON.stringify(op).includes("Clock::get()"))
  );
  const sysvarImport = usesClock ? "\nuse quasar_lang::sysvars::Sysvar;" : "";

  // Re-export instruction account structs at crate root (required by #[program])
  const reExports = instructions
    .map((ix) => {
      const ctx = toPascalCase(ix.name);
      return `pub use instructions::${ix.name}::${ctx};`;
    })
    .join("\n");

  // Re-export event types and error enum at crate root for use in #[program]
  const eventReExports = events.length > 0
    ? `pub use events::{${events.map((e) => e.name).join(", ")}};`
    : "";
  const errorReExport = errors.length > 0
    ? `pub use errors::${toPascalCase(programName)}Error;`
    : "";

  const address = programId ?? "11111111111111111111111111111111";

  // Build instruction functions — logic is INLINE (Quasar pattern)
  const errorEnum = toPascalCase(programName) + "Error";
  const ixLines = instructions
    .map((ix, idx) => {
      const ctx = toPascalCase(ix.name);
      const args = ix.args
        .map((a) => `${a.name}: ${solanaTypeToQuasar(a.type)}`)
        .join(", ");
      const extraArgs = args ? `, ${args}` : "";

      // Build body lines
      const bodyLines = generateInstructionBody(ix, ir, programName);
      const bodyStr = bodyLines.map((l) => `        ${l}`).join("\n");

      return `    #[instruction(discriminator = ${idx})]
    pub fn ${ix.name}(ctx: Ctx<${ctx}>${extraArgs}) -> Result<(), ProgramError> {
${bodyStr}
        Ok(())
    }`;
    })
    .join("\n\n");

  const reExportLines = [
    reExports,
    eventReExports,
    errorReExport,
  ].filter(Boolean).join("\n");

  const splImportLib = usesSpl ? "\nuse quasar_spl::*;" : "";

  return `#![cfg_attr(not(test), no_std)]
use quasar_lang::prelude::*;${sysvarImport}${splImportLib}

${modLines}

${reExportLines}

declare_id!("${address}");

#[program]
pub mod ${programName} {
    use super::*;

${ixLines}
}
`;
}

// ─── Instruction body builder ────────────────────────────────────────────────

function generateInstructionBody(ix: Instruction, ir: ProgramIR, programName: string): string[] {
  const lines: string[] = [];
  const errorEnum = toPascalCase(programName) + "Error";
  const pluginBlocks = integrationsForInstruction(ir, ix).map((integration) =>
    renderQuasarIntegration(integration),
  );
  const accounts = withPluginAccounts(
    ix.accounts,
    pluginBlocks.flatMap((block) => block.accounts),
  );

  // Build a map of accountName -> stateTypeName from the instruction's accounts
  const accountToStateType = new Map<string, string>();
  for (const a of accounts) {
    if (a.stateType) accountToStateType.set(a.name, a.stateType);
  }

  // Build a map of stateType.fieldName -> quasar type for Pod wrapping
  const fieldTypeMap = new Map<string, string>();
  for (const state of ir.states) {
    for (const f of state.fields) {
      fieldTypeMap.set(`${state.name}.${f.name}`, solanaTypeToQuasarAccount(f.type, f.maxLen));
    }
  }

  // Build rename map: if account name collides with program module name, rename it
  const renameMap = new Map<string, string>();
  for (const a of accounts) {
    if (a.name === programName) {
      renameMap.set(a.name, `${a.name}_account`);
    }
  }

  const rename = (s: string): string => {
    let result = s;
    for (const [old, new_] of renameMap) {
      // Only rename standalone references to the account, not ctx.accounts.old or ctx.bumps.old
      result = result.replace(new RegExp(`(?<!ctx\\.accounts\\.)(?<!bumps\\.)\\b${old}\\b(?!_)`, "g"), new_);
    }
    return result;
  };

  // Track accounts that need mutable binding — use lazy borrows to avoid
  // borrow conflicts when ctx.accounts.X is used in CPI calls.
  const mutNeeded = new Set<string>();
  function collectMutNeeded(ops: LogicOperation[]) {
    for (const op of ops) {
      if (op.type === "set-field") mutNeeded.add(op.account);
      if (op.type === "if-else") {
        collectMutNeeded(op.thenBody);
        if (op.elseBody) collectMutNeeded(op.elseBody);
      }
    }
  }
  collectMutNeeded(ix.body);

  // Build the account-to-state-type map using RENAMED names so PodExpr lookup works
  const renamedAccountToState = new Map<string, string>(accountToStateType);
  for (const [orig, state] of accountToStateType) {
    renamedAccountToState.set(renameMap.get(orig) ?? orig, state);
  }

  const mutBorrowed = new Set<string>();
  const readOnlyBound = new Set<string>();

  // `escrow.amount` → `ctx.accounts.escrow.amount` when the handler hasn't bound `escrow` to a local.
  const qualify = (s: string): string =>
    s.replace(/(?<![.\w])([a-z_][a-z0-9_]*)\.(?=[a-z_])/g, (m, name: string) =>
      accounts.some((a) => a.name === name) && !mutBorrowed.has(name) && !readOnlyBound.has(name)
        ? `ctx.accounts.${name}.`
        : m,
    );

  // An account as a CPI argument: through its local if the handler bound one (it holds the borrow).
  const accRef = (name: string): string =>
    mutBorrowed.has(name) || readOnlyBound.has(name) ? `*${renameMap.get(name) ?? name}` : `ctx.accounts.${name}`;

  // Create a wrapped rename function that also handles PodExpr translation
  const renameAndPod = (s: string): string => {
    return translateQuasarPodExpr(translateQuasarValue(rename(qualify(s))), renamedAccountToState, fieldTypeMap);
  };

  // Collect accounts that need early read-only binding (referenced in require before any set-field)
  // These must be bound to avoid "cannot find value" errors
  const needsEarlyReadOnly = new Set<string>();
  const mutNeededSet = new Set(mutNeeded);
  for (const op of ix.body) {
    if (op.type === 'set-field') break; // stop at first set-field
    if (op.type === 'require') {
      for (const acc of getAccessedAccountsQuasar(op)) {
        if (!mutNeededSet.has(acc)) needsEarlyReadOnly.add(acc);
      }
    }
  }

  // Bind early read-only accounts (for require before set-field)
  for (const origName of needsEarlyReadOnly) {
    const localName = renameMap.get(origName) ?? origName;
    lines.push(`let ${localName} = &ctx.accounts.${origName};`);
    readOnlyBound.add(origName);
  }

  for (const op of ix.body) {
    // Lazy mutable borrow: create `let x = &mut ctx.accounts.x;` right before
    // the first operation that needs it.
    const accessedAccounts = getAccessedAccountsQuasar(op);
    for (const acc of accessedAccounts) {
      const origName = acc;
      if (mutNeeded.has(origName) && !mutBorrowed.has(origName) && !readOnlyBound.has(origName)) {
        const localName = renameMap.get(origName) ?? origName;
        lines.push(`let ${localName} = &mut ctx.accounts.${origName};`);
        mutBorrowed.add(origName);
      }
    }
    lines.push(...emitLogicOp(op, errorEnum, accountToStateType, fieldTypeMap, rename, renameAndPod, ir, ix, accRef));
  }

  return [
    ...pluginBlocks
      .filter((block) => block.position === "before-body")
      .flatMap((block) => block.bodyLines),
    ...lines,
    ...pluginBlocks
      .filter((block) => block.position === "after-body")
      .flatMap((block) => block.bodyLines),
  ];
}

/// Translate Anchor-style value expressions to Quasar equivalents
function translateQuasarValue(value: string): string {
  // *ctx.accounts.X.key() → *ctx.accounts.X.address()
  let result = value.replace(/\*ctx\.accounts\.(\w+)\.key\(\)/g, '*ctx.accounts.$1.address()');
  // *ctx.accounts.X.key → *ctx.accounts.X.address() (no parens)
  result = result.replace(/\*ctx\.accounts\.(\w+)\.key\b/g, '*ctx.accounts.$1.address()');
  // ctx.accounts.X.key() → ctx.accounts.X.address()
  result = result.replace(/ctx\.accounts\.(\w+)\.key\(\)/g, 'ctx.accounts.$1.address()');
  // ctx.accounts.X.key → ctx.accounts.X.address()
  result = result.replace(/ctx\.accounts\.(\w+)\.key\b/g, 'ctx.accounts.$1.address()');
  // Clock::get()?.unix_timestamp → i64::from(Clock::get()?.unix_timestamp) (PodI64 → i64)
  result = result.replace(/Clock::get\(\)\?\.unix_timestamp/g, 'i64::from(Clock::get()?.unix_timestamp)');
  result = result.replace(/\bPubkey::default\(\)/g, "Address::default()");
  // bumps.X (Anchor handler param) → ctx.bumps.X (Quasar Ctx has .bumps)
  result = result.replace(/(?<![\w.])bumps\./g, 'ctx.bumps.');
  return result;
}

/// Translate state field expressions to account for Pod type wrapping.
/// PodU64 fields need `.into()` when used in comparisons or arithmetic with native types.
function translateQuasarPodExpr(expr: string, accountToStateType?: Map<string, string>, fieldTypeMap?: Map<string, string>): string {
  if (!accountToStateType || !fieldTypeMap) return expr;
  // Match account.field patterns and wrap Pod fields with native type conversion
  return expr.replace(/\b((?:ctx\.accounts\.)?)(\w+)\.(\w+)\b/g, (_match: string, prefix: string, account: string, field: string) => {
    const stateType = accountToStateType.get(account);
    if (stateType) {
      const fieldKey = `${stateType}.${field}`;
      const fieldType = fieldTypeMap.get(fieldKey);
      if (fieldType && POD_TYPES.has(fieldType)) {
        // Determine the native Rust type from the Pod type name
        const nativeType = fieldType.replace("Pod", "").toLowerCase();
        // PodBool → bool, PodU64 → u64, PodI64 → i64, etc.
        return `${nativeType}::from(${prefix}${account}.${field})`;
      }
    }
    return `${prefix}${account}.${field}`;
  });
}

// Pod types that need wrapping with PodType::from()
const POD_TYPES = new Set(["PodBool", "PodU16", "PodU32", "PodU64", "PodU128", "PodI16", "PodI32", "PodI64", "PodI128"]);

/// Extract account names referenced in a logic operation (for lazy borrow tracking).
/// Only accounts that will be accessed via local mutable variable trigger borrows.
/// transfer-sol uses ctx.accounts.X directly, so those don't count.
function getAccessedAccountsQuasar(op: LogicOperation): string[] {
  const refs = new Set<string>();

  function collectRefs(s: string) {
    const matches = s.matchAll(/\b([a-z_][a-z0-9_]*)\.[a-z_]/g);
    const skip = new Set(['ctx', 'clock', 'solana', 'pinocchio', 'quasar', 'core', 'std', 'u8', 'u16', 'u32', 'u64', 'u128', 'i8', 'i16', 'i32', 'i64', 'i128', 'bool', 'program_id']);
    for (const m of matches) {
      if (!skip.has(m[1])) refs.add(m[1]);
    }
  }

  switch (op.type) {
    case "set-field":
      refs.add(op.account);
      collectRefs(op.value);
      break;
    case "require":
      collectRefs(op.condition);
      break;
    case "if-else":
      collectRefs(op.condition);
      for (const o of op.thenBody) for (const a of getAccessedAccountsQuasar(o)) refs.add(a);
      if (op.elseBody) for (const o of op.elseBody) for (const a of getAccessedAccountsQuasar(o)) refs.add(a);
      break;
    case "emit-event":
      for (const v of Object.values(op.fields)) collectRefs(v as string);
      break;
    case "math":
      collectRefs(op.left);
      collectRefs(op.right);
      break;
    // transfer-sol, transfer-token, mint-to, burn all use ctx.accounts.X directly
    // and should NOT trigger mutable borrows
  }

  return [...refs];
}

function emitLogicOp(op: LogicOperation, errorEnum: string, accountToStateType?: Map<string, string>, fieldTypeMap?: Map<string, string>, rename?: (s: string) => string, renameAndPod?: (s: string) => string, ir?: ProgramIR, ix?: Instruction, accRef?: (name: string) => string): string[] {
  switch (op.type) {
    case "set-field": {
      // Skip set-field for SPL account types — these have private fields / use CPI
      const accType = ir?.instructions.flatMap((ix) => ix.accounts).find((a) => a.name === op.account)?.accountType;
      if (accType === "mint" || accType === "token-account") return [];
      // Look up the field type to wrap Pod values correctly
      const stateType = accountToStateType?.get(op.account);
      const fieldKey = stateType ? `${stateType}.${op.field}` : null;
      const fieldType = fieldKey ? fieldTypeMap?.get(fieldKey) : null;
      const isPod = fieldType && POD_TYPES.has(fieldType);
      const isByteArray = fieldType && fieldType.startsWith("[u8;");
      const account = rename?.(op.account) ?? op.account;
      const rawValue = translateQuasarValue(rename?.(op.value) ?? op.value);
      if (isByteArray) {
        // [u8; N] field — need to copy bytes from string value
        const sizeMatch = fieldType.match(/\[u8; (\d+)\]/);
        const size = sizeMatch ? sizeMatch[1] : "64";
        return [
          `${account}.${op.field} = [0u8; ${size}];`,
          `let ${op.field}_bytes = ${rawValue}.as_bytes();`,
          `${account}.${op.field}[..${op.field}_bytes.len()].copy_from_slice(${op.field}_bytes);`,
        ];
      }
      const value = isPod ? `${fieldType}::from(${rawValue})` : rawValue;
      return [`${account}.${op.field} = ${value};`];
    }

    case "transfer-sol": {
      // An amount like `vault.lamports()` reads an account: go through ctx.accounts and
      // evaluate it first, so it doesn't overlap the &mut borrows passed to transfer().
      const accountNames = new Set(ir?.instructions.flatMap((i) => i.accounts.map((a) => a.name)) ?? []);
      const amount = op.amount
        .replace(/(?<![\w.])([a-z_][a-z0-9_]*)\./g, (m, name: string) =>
          accountNames.has(name) ? `ctx.accounts.${name}.` : m)
        // Quasar account wrappers expose lamports through their AccountView
        .replace(/(ctx\.accounts\.\w+)\.lamports\(\)/g, "$1.to_account_view().lamports()");
      const lines: string[] = [];
      let amountExpr = amount;
      if (amount !== op.amount) {
        lines.push(`let transfer_amount = ${amount};`);
        amountExpr = "transfer_amount";
      }
      // A PDA source can only be debited with its seeds (generated as ctx.bumps.<field>_seeds()).
      const fromIsPda = ir?.instructions.some((i) =>
        i.accounts.some((a) => a.name === op.from && a.constraints.some((c) => c.type === "seeds")));
      const transfer = `ctx.accounts.system_program.transfer(ctx.accounts.${op.from}, ctx.accounts.${op.to}, ${amountExpr})`;
      if (fromIsPda) {
        const signer = buildQuasarSignerSeeds([], op.from, ix, ir);
        lines.push(...signer.setup, `let seeds = ${signer.seeds};`, `${transfer}.invoke_signed(&seeds)?;`);
      } else {
        lines.push(`${transfer}.invoke()?;`);
      }
      return lines;
    }

    case "transfer-token":
    case "mint-to":
    case "burn": {
      const amount = renameAndPod ? renameAndPod(op.amount) : op.amount;
      const acc = accRef ?? ((name: string) => `ctx.accounts.${name}`);
      const call =
        op.type === "transfer-token"
          ? `.transfer(${acc(op.from)}, ${acc(op.to)}, ${acc(op.authority)}, ${amount})`
          : op.type === "mint-to"
            ? `.mint_to(${acc(op.mint)}, ${acc(op.to)}, ${acc(op.authority)}, ${amount})`
            : `.burn(${acc(op.mint)}, ${acc(op.from)}, ${acc(op.authority)}, ${amount})`;
      const signer = op.signerSeeds?.length ? buildQuasarSignerSeeds(op.signerSeeds, op.authority, ix, ir) : null;
      const seeds = signer?.seeds;
      return [
        ...(signer ? [...signer.setup, `let seeds = ${signer.seeds};`] : []),
        `ctx.accounts.token_program`,
        `    ${call}`,
        seeds ? `    .invoke_signed(&seeds)?;` : `    .invoke()?;`,
      ];
    }

    case "require": {
      const cond = renameAndPod ? renameAndPod(op.condition) : translateQuasarPodExpr(translateQuasarValue(rename?.(op.condition) ?? op.condition), accountToStateType, fieldTypeMap);
      return [`require!(${cond}, ${errorRef(errorEnum, op.errorCode, "ProgramError::InvalidArgument")});`];
    }

    case "if-else": {
      const cond = renameAndPod ? renameAndPod(op.condition) : translateQuasarPodExpr(translateQuasarValue(rename?.(op.condition) ?? op.condition), accountToStateType, fieldTypeMap);
      const then_ = op.thenBody.flatMap((o) => emitLogicOp(o, errorEnum, accountToStateType, fieldTypeMap, rename, renameAndPod, ir, ix, accRef)).map((l) => `        ${l}`);
      const else_ =
        op.elseBody?.flatMap((o) => emitLogicOp(o, errorEnum, accountToStateType, fieldTypeMap, rename, renameAndPod, ir, ix, accRef)).map((l) => `        ${l}`) ?? [];
      const result = [`if ${cond} {`, ...then_];
      if (else_.length) result.push("} else {", ...else_);
      result.push("}");
      return result;
    }

    case "emit-event": {
      // Quasar events only support primitives and Address. String fields use Address as placeholder.
      const evt = ir?.events.find((e) => e.name === op.event);
      const fields = Object.entries(op.fields)
        .map(([k, v]) => {
          const evtField = evt?.fields.find((f) => f.name === k);
          const isStringField = evtField?.type === "String";
          if (isStringField) {
            return `            ${k}: Address::default(), // String not supported in Quasar events`;
          }
          const val = renameAndPod ? renameAndPod(v as string) : translateQuasarValue(rename?.(v as string) ?? (v as string));
          return `            ${k}: ${val},`;
        })
        .join("\n");
      return [`emit!(${op.event} {`, fields, `});`];
    }

    case "return-error":
      return [`return Err(${errorRef(errorEnum, op.errorCode, "ProgramError::InvalidArgument")}.into());`];

    case "math": {
      const checked = op.checked;
      const left = renameAndPod ? renameAndPod(op.left) : translateQuasarValue(rename?.(op.left) ?? op.left);
      const right = rename?.(op.right) ?? op.right;
      if (checked) {
        const opMap: Record<string, string> = {
          add: "checked_add", sub: "checked_sub",
          mul: "checked_mul", div: "checked_div", mod: "checked_rem",
        };
        return [
          `let ${op.result} = ${left}.${opMap[op.operation] ?? "checked_add"}(${right}).ok_or(ProgramError::InvalidArgument)?;`,
        ];
      }
      const opSym: Record<string, string> = { add: "+", sub: "-", mul: "*", div: "/", mod: "%" };
      return [`let ${op.result} = ${left} ${opSym[op.operation] ?? "+"} ${right};`];
    }

    case "cpi": {
      const prog = op.targetProgram;
      const ix = op.instruction;
      const accountMappings = op.accounts
        .map((a) => `            ${a.to}: ctx.accounts.${a.from},`)
        .join("\n");
      const hasSignerSeeds = op.signerSeeds && op.signerSeeds.length > 0;
      const seedParts = hasSignerSeeds
        ? op.signerSeeds!.map((s) => {
            if (s.type === "literal") return `b"${s.value}"`;
            if (s.type === "pubkey") return s.value;
            return s.value;
          }).join(", ")
        : null;

      const dataArgs = op.data.map((d) => d.value).join(", ");
      const lines: string[] = [
        `// CPI: ${prog}::${ix}`,
        `ctx.accounts.${prog}`,
        `    .${ix}(${toPascalCase(ix)}Cpi {`,
        `${accountMappings}`,
        `    }${dataArgs ? `, ${dataArgs}` : ""})`,
      ];

      if (hasSignerSeeds) {
        lines.push(`    .invoke_signed(&[${seedParts}])?;`);
      } else {
        lines.push(`    .invoke()?;`);
      }
      return lines;
    }

    case "custom-code":
      return op.code.split("\n");

    default:
      return [`// WARNING: unimplemented logic operation type`];
  }
}


/**
 * PDA seeds that read the PDA's own data (`seeds = [b"escrow", escrow.maker.as_ref()]`).
 * Quasar's derive evaluates seeds before the account exists, so these are verified by hand.
 */
function selfReferentialSeeds(account: Account | undefined): { seeds: Seed[]; bump?: string } | undefined {
  const c = account?.constraints.find((x) => x.type === "seeds");
  if (!account || c?.type !== "seeds") return undefined;
  const self = c.seeds.some((sd) => sd.type !== "literal" && sd.value.trim().startsWith(`${account.name}.`));
  return self ? { seeds: c.seeds, bump: c.bump } : undefined;
}

/** State field types (`State.field` → Quasar type), for Pod conversions. */
function quasarFieldTypes(ir: ProgramIR): Map<string, string> {
  return new Map(ir.states.flatMap((st) => st.fields.map((f) => [`${st.name}.${f.name}`, solanaTypeToQuasarAccount(f.type, f.maxLen)] as [string, string])));
}

/**
 * One self-referential seed as bytes. `at` prefixes account names (`""` inside the accounts
 * struct, `ctx.accounts.` in a handler). Returns an owned value to bind, if one is needed.
 */
function quasarSelfSeed(seed: Seed, ix: Instruction, ir: ProgramIR, at: string): { owned?: string; bytes: (v: string) => string; expr: string } {
  if (seed.type === "literal") return { bytes: () => "", expr: `b"${seed.value}" as &[u8]` };
  const value = seed.value.trim().replace(/\.key\(\)(?:\.to_bytes\(\))?(?:\.as_ref\(\))?$/, "").replace(/\.as_ref\(\)$/, "");
  if (/^[A-Z][A-Z0-9_]*$/.test(value)) return { bytes: () => "", expr: value };
  const account = ix.accounts.find((a) => a.name === value);
  if (account) return { owned: `${at}${value}.to_account_view().address().clone()`, bytes: (v) => `${v}.as_ref()`, expr: `${at}${value}.to_account_view().address().as_ref()` };
  const states = new Map(ix.accounts.filter((a) => a.stateType).map((a) => [a.name, a.stateType!]));
  const field = value.match(/^(\w+)\.(\w+)$/);
  if (field && quasarFieldTypes(ir).get(`${states.get(field[1])}.${field[2]}`) === "Address") {
    return { owned: `${at}${value}.clone()`, bytes: (v) => `${v}.as_ref()`, expr: `${at}${value}.as_ref()` };
  }
  // Numbers: Pod fields convert to native first (`u64::from(escrow.ids).to_le_bytes()`).
  const native = translateQuasarPodExpr(value.replace(/(?<![.\w])(\w+)\./g, (m, n: string) => (states.has(n) ? `${at}${n}.` : m)), new Map([...states].map(([k, v]) => [`${at}${k}`.replace(/\.$/, ""), v])), quasarFieldTypes(ir));
  return { owned: native, bytes: (v) => `&${v}[..]`, expr: `&${native}[..]` };
}

/** Seeds for a PDA signing a CPI: Quasar's generated `<pda>_seeds()` carries the bump. */
function buildQuasarSignerSeeds(signerSeeds: Seed[], authority: string, ix?: Instruction, ir?: ProgramIR): { setup: string[]; seeds: string } {
  const { seeds, pda } = splitSignerSeeds(signerSeeds, authority, ix);
  const account = ix?.accounts.find((a) => a.name === pda);
  const self = selfReferentialSeeds(account);
  if (pda && ix && ir && self) {
    // Bind each seed to a local first: the seeds borrow them.
    const setup: string[] = [];
    const parts = self.seeds.map((sd, i) => {
      const seed = quasarSelfSeed(sd, ix, ir, "ctx.accounts.");
      if (!seed.owned) return `Seed::from(${seed.expr})`;
      setup.push(`let ${pda}_seed_${i} = ${seed.owned};`);
      return `Seed::from(${seed.bytes(`${pda}_seed_${i}`)})`;
    });
    setup.push(`let ${pda}_bump = [${self.bump ? `ctx.accounts.${self.bump.replace(/^\w+\./, `${pda}.`)}` : `ctx.bumps.${pda}`}];`);
    parts.push(`Seed::from(&${pda}_bump[..])`);
    return { setup, seeds: `[${parts.join(", ")}]` };
  }
  const isPda = account?.constraints.some((c) => c.type === "seeds");
  return { setup: [], seeds: pda && isPda ? `ctx.bumps.${pda}_seeds()` : buildQuasarSeeds(seeds, ix) };
}

function buildQuasarSeeds(seeds: Seed[], ix?: Instruction): string {
  const parts = seeds.map((s) =>
    seedBytes(s, { literal: (v) => `b"${v}" as &[u8]`, key: (a) => `ctx.accounts.${a}.address().as_ref()` }, ix),
  );
  return `&[${parts.join(", ")}]`;
}

interface QuasarPluginBlock {
  position: Integration["attachedTo"]["position"];
  imports: string[];
  bodyLines: string[];
  accounts: Account[];
  warnings: string[];
}

function integrationsForInstruction(ir: ProgramIR, ix: Instruction): Integration[] {
  return ir.integrations.filter((integration) =>
    integration.attachedTo.instructionId === ix.id
  );
}

function withPluginAccounts(baseAccounts: Account[], pluginAccounts: Account[]): Account[] {
  const seen = new Set(baseAccounts.map((account) => account.name));
  const merged = [...baseAccounts];
  for (const account of pluginAccounts) {
    if (seen.has(account.name)) continue;
    seen.add(account.name);
    merged.push(account);
  }
  return merged;
}

function pluginAccount(
  name: string,
  accountType: Account["accountType"],
  constraints: Account["constraints"] = [],
  stateType?: string,
): Account {
  return {
    id: `plugin-${name}`,
    name,
    accountType,
    stateType,
    constraints,
  };
}

function renderQuasarIntegration(integration: Integration): QuasarPluginBlock {
  const position = integration.attachedTo.position;
  const empty: QuasarPluginBlock = {
    position,
    imports: [],
    bodyLines: [],
    accounts: [],
    warnings: [],
  };

  if (integration.pluginId === "spl-token") {
    return renderQuasarSplTokenIntegration(integration, integration.config);
  }
  if (integration.pluginId === "pyth") {
    return renderQuasarPythIntegration(integration, integration.config);
  }
  if (integration.pluginId === "metaplex") {
    return renderQuasarMetaplexIntegration(integration, integration.config);
  }

  return {
    ...empty,
    warnings: [
      `Plugin integration "${integration.pluginId}:${integration.integrationId}" does not have Quasar codegen yet`,
    ],
  };
}

function renderQuasarSplTokenIntegration(
  integration: Integration,
  config: Record<string, unknown>,
): QuasarPluginBlock {
  const position = integration.attachedTo.position;
  const amount = numberLiteral(config.amount, "0");

  if (integration.integrationId === "create-mint") {
    const decimals = Number(numberLiteral(config.decimals, "9"));
    return {
      position,
      imports: ["use quasar_spl::*;"],
      bodyLines: [],
      accounts: [
        pluginAccount("mint", "mint", [
          { type: "init", payer: "payer", space: 82 },
          { type: "mint-decimals", decimals },
          { type: "mint-authority", authority: "mint_authority" },
        ]),
        pluginAccount("payer", "signer", [{ type: "mut" }, { type: "signer" }]),
        pluginAccount("mint_authority", "signer", [{ type: "signer" }]),
        pluginAccount("token_program", "token-program"),
        pluginAccount("system_program", "system-program"),
        pluginAccount("rent", "rent"),
      ],
      warnings: [],
    };
  }

  if (integration.integrationId === "mint-tokens") {
    return {
      position,
      imports: ["use quasar_spl::*;"],
      bodyLines: [
        "ctx.accounts.token_program",
        `    .mint_to(ctx.accounts.mint, ctx.accounts.destination, ctx.accounts.authority, ${amount})`,
        "    .invoke()?;",
      ],
      accounts: [
        pluginAccount("mint", "mint", [{ type: "mut" }]),
        pluginAccount("destination", "token-account", [{ type: "mut" }]),
        pluginAccount("authority", "signer", [{ type: "signer" }]),
        pluginAccount("token_program", "token-program"),
      ],
      warnings: [],
    };
  }

  if (integration.integrationId === "transfer") {
    return {
      position,
      imports: ["use quasar_spl::*;"],
      bodyLines: [
        "ctx.accounts.token_program",
        `    .transfer(ctx.accounts.source, ctx.accounts.destination, ctx.accounts.authority, ${amount})`,
        "    .invoke()?;",
      ],
      accounts: [
        pluginAccount("source", "token-account", [{ type: "mut" }]),
        pluginAccount("destination", "token-account", [{ type: "mut" }]),
        pluginAccount("authority", "signer", [{ type: "signer" }]),
        pluginAccount("token_program", "token-program"),
      ],
      warnings: [],
    };
  }

  return {
    position,
    imports: [],
    bodyLines: [],
    accounts: [],
    warnings: [
      `SPL Token integration "${integration.integrationId}" does not have Quasar codegen yet`,
    ],
  };
}

function renderQuasarPythIntegration(
  integration: Integration,
  config: Record<string, unknown>,
): QuasarPluginBlock {
  const outputVar = safeRustIdentifier(config.outputVar, "price");
  const maxAge = numberLiteral(config.maxAge, "30");

  return {
    position: integration.attachedTo.position,
    imports: [],
    bodyLines: [
      `let ${outputVar}_data = ctx.accounts.price_feed.try_borrow_data()?;`,
      `if ${outputVar}_data.len() < 240 {`,
      "    return Err(ProgramError::InvalidAccountData);",
      "}",
      `let ${outputVar} = i64::from_le_bytes(${outputVar}_data[208..216].try_into().map_err(|_| ProgramError::InvalidAccountData)?);`,
      `let ${outputVar}_conf = u64::from_le_bytes(${outputVar}_data[216..224].try_into().map_err(|_| ProgramError::InvalidAccountData)?);`,
      `let ${outputVar}_expo = i32::from_le_bytes(${outputVar}_data[224..228].try_into().map_err(|_| ProgramError::InvalidAccountData)?);`,
      `let _${outputVar}_max_age_seconds = ${maxAge};`,
    ],
    accounts: [
      pluginAccount("price_feed", "unchecked-account", [
        { type: "safety-comment", comment: "Pyth price feed account; raw layout checked before reads" },
      ]),
    ],
    warnings: [],
  };
}

function renderQuasarMetaplexIntegration(
  integration: Integration,
  config: Record<string, unknown>,
): QuasarPluginBlock {
  const isCollection = integration.integrationId === "create-collection";
  const name = stringLiteral(config.name, isCollection ? "SolStudio Collection" : "SolStudio NFT");
  const symbol = stringLiteral(config.symbol, isCollection ? "COLL" : "SOLST");
  const uri = stringLiteral(config.uri, "");
  const sellerFeeBasisPoints = numberLiteral(config.sellerFeeBasisPoints, "0");
  const isMutable = booleanLiteral(config.isMutable, true);
  const collectionDetails = isCollection ? "Some(CollectionDetails::V1 { size: 0 })" : "None";

  return {
    position: integration.attachedTo.position,
    imports: [],
    bodyLines: [
      "use mpl_token_metadata::instructions::CreateMetadataAccountV3CpiBuilder;",
      "use mpl_token_metadata::types::{CollectionDetails, DataV2};",
      "let data = DataV2 {",
      `    name: ${name}.to_string(),`,
      `    symbol: ${symbol}.to_string(),`,
      `    uri: ${uri}.to_string(),`,
      `    seller_fee_basis_points: ${sellerFeeBasisPoints},`,
      "    creators: None,",
      "    collection: None,",
      "    uses: None,",
      "};",
      "CreateMetadataAccountV3CpiBuilder::new(ctx.accounts.metadata_program)",
      "    .metadata(ctx.accounts.metadata)",
      "    .mint(ctx.accounts.mint)",
      "    .mint_authority(ctx.accounts.authority)",
      "    .payer(ctx.accounts.payer)",
      "    .update_authority(ctx.accounts.authority, true)",
      "    .system_program(ctx.accounts.system_program)",
      "    .rent(Some(ctx.accounts.rent))",
      "    .data(data)",
      `    .is_mutable(${isMutable})`,
      `    .collection_details(${collectionDetails})`,
      "    .invoke()?;",
    ],
    accounts: [
      pluginAccount("metadata", "unchecked-account", [{ type: "mut" }]),
      pluginAccount("mint", "mint", [{ type: "mut" }]),
      pluginAccount("authority", "signer", [{ type: "signer" }]),
      pluginAccount("payer", "signer", [{ type: "mut" }, { type: "signer" }]),
      pluginAccount("metadata_program", "program"),
      pluginAccount("system_program", "system-program"),
      pluginAccount("rent", "rent"),
    ],
    warnings: [],
  };
}

function numberLiteral(value: unknown, fallback: string): string {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : fallback;
}

function booleanLiteral(value: unknown, fallback: boolean): string {
  return typeof value === "boolean" ? String(value) : String(fallback);
}

function stringLiteral(value: unknown, fallback: string): string {
  return JSON.stringify(typeof value === "string" ? value : fallback);
}

function safeRustIdentifier(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return /^[a-z_][a-z0-9_]*$/.test(value) ? value : fallback;
}

// ─── src/instructions/mod.rs  or  src/state/mod.rs ────────────────────────────

function generateModRs(names: string[]): string {
  return names.map((n) => `pub mod ${n};`).join("\n") + "\n";
}

// ─── src/instructions/<name>.rs ──────────────────────────────────────────────
// ONLY contains the #[derive(Accounts)] struct — no handler function.

function generateInstructionRs(
  ix: Instruction,
  ir: ProgramIR,
  programName: string,
): { content: string; warns: CodegenWarning[]; errs: CodegenError[] } {
  const warns: CodegenWarning[] = [];
  const errs: CodegenError[] = [];
  const ctx = toPascalCase(ix.name);
  const pluginBlocks = integrationsForInstruction(ir, ix).map((integration) =>
    renderQuasarIntegration(integration),
  );
  const accounts = withPluginAccounts(
    ix.accounts,
    pluginBlocks.flatMap((block) => block.accounts),
  );

  if (accounts.length === 0) {
    warns.push({
      message: `Instruction "${ix.name}" has no accounts`,
      nodeId: ix.id,
    });
  }

  // Quasar's Accounts derive evaluates seeds without the instruction's arguments.
  for (const a of accounts) {
    const seeds = a.constraints.find((c) => c.type === "seeds");
    if (seeds?.type !== "seeds") continue;
    const arg = ix.args.find((x) => seeds.seeds.some((sd) => sd.type !== "literal" && new RegExp(`(?<![.\\w])${x.name}\\b`).test(sd.value)));
    if (arg) {
      errs.push({
        message: `${ix.name}: the PDA "${a.name}" is derived from the instruction argument "${arg.name}", which Quasar can't do. Seed it from accounts or constants, or use Anchor or Pinocchio.`,
        nodeId: ix.id,
      });
    }
  }

  // Collect state types referenced by accounts (for imports)
  const usedStates = new Set<string>();
  for (const a of accounts) {
    if (a.stateType && !isExternalType(a.stateType, ir)) usedStates.add(a.stateType);
  }

  // Build imports
  const importLines: string[] = ["use quasar_lang::prelude::*;"];
  // Add quasar-spl import if mint/token accounts are present
  const needsSpl = accounts.some((a) =>
    a.accountType === "mint" || a.accountType === "token-account" || a.accountType === "associated-token" ||
    a.accountType === "token-program" || a.accountType === "associated-token-program" || isExternalType(a.stateType, ir)
  ) || pluginBlocks.some((block) => block.imports.includes("use quasar_spl::*;"));
  if (needsSpl) importLines.push("use quasar_spl::*;");
  if (accounts.some((a) => isExternalType(a.stateType, ir))) importLines.push("use quasar_spl::metadata::*;");
  for (const s of [...usedStates].sort()) {
    importLines.push(`use crate::state::${toSnakeFilename(s)}::${s};`);
  }

  // Build accounts struct — Quasar style
  const accountFields = accounts
    .map((a) => buildQuasarAccountField(a, ix, ir))
    .join("\n\n");

  // Auto-add token_program if mint init is present but no token_program account exists
  const hasMintInit = accounts.some(
    (a) => a.accountType === "mint" && a.constraints.some((c) => c.type === "init")
  );
  const hasTokenProgram = accounts.some((a) => a.accountType === "token-program");
  const extraFields = hasMintInit && !hasTokenProgram
    ? "\n    pub token_program: &'info Program<Token>,"
    : "";

  for (const block of pluginBlocks) {
    for (const warning of block.warnings) {
      warns.push({ message: warning, nodeId: ix.id });
    }
  }

  const content = `${importLines.join("\n")}

#[derive(Accounts)]
pub struct ${ctx}<'info> {
${accountFields}${extraFields}
}
`;

  return { content, warns, errs };
}

// ─── Account struct field builder (Quasar style) ────────────────────────────

function buildQuasarAccountField(
  account: Account,
  ix: Instruction,
  ir: ProgramIR,
): string {
  const lines: string[] = [];
  const attrs = buildQuasarAccountAttributes(account, ix, ir);
  for (const attr of attrs) lines.push(`    ${attr}`);

  if (account.accountType === "unchecked-account") {
    const comment = account.constraints.find(c => c.type === "safety-comment");
    lines.push(`    /// CHECK: ${comment ? comment.comment : "validated by constraint"}`);
  } else {
    const comment = account.constraints.find(c => c.type === "safety-comment");
    if (comment) {
      lines.push(`    /// Safety: ${comment.comment}`);
    }
  }

  const rustType = accountToQuasarType(account);
  lines.push(`    pub ${account.name}: ${rustType},`);
  return lines.join("\n");
}

function computeAccountSpace(account: Account, ir: ProgramIR): number {
  if (!account.stateType) return 0;
  const state = ir.states.find((s) => s.name === account.stateType);
  if (!state) return 0;
  return calculateSpace(state.fields);
}

function buildQuasarAccountAttributes(
  account: Account,
  ix: Instruction,
  ir: ProgramIR,
): string[] {
  const constraints = account.constraints;
  if (!constraints.length) return [];

  const parts: string[] = [];
  const isInit = constraints.some((x) => x.type === "init" || x.type === "init-if-needed");
  // Constraint errors need a full path: the instruction file doesn't import the error enum.
  const errorEnum = `crate::errors::${toPascalCase(ir.program.name)}Error`;

  for (const c of constraints) {
    switch (c.type) {
      case "mut":
      case "signer":
        // Expressed in the type in Quasar, not as attribute
        break;
      case "init": {
        if (account.accountType === "mint") {
          // If explicit mint-authority/mint-decimals constraints exist, skip defaults
          const hasExplicitMintConstraints = account.constraints.some(
            (ac) => ac.type === "mint-authority" || ac.type === "mint-decimals"
          );
          if (hasExplicitMintConstraints) {
            parts.push(`init, payer = ${c.payer}`);
          } else {
            parts.push(`init, payer = ${c.payer}, mint::decimals = 0, mint::authority = ${c.payer}`);
          }
        } else if (account.accountType === "token-account" || account.accountType === "associated-token") {
          // Quasar sizes token accounts itself.
          parts.push(`init, payer = ${c.payer}`);
        } else {
          const autoSpace = computeAccountSpace(account, ir);
          const spaceStr =
            c.space === "auto"
              ? String(autoSpace > 0 ? autoSpace : 8 + 32)
              : String(c.space);
          parts.push(`init, payer = ${c.payer}, space = ${spaceStr}`);
        }
        break;
      }
      case "init-if-needed": {
        const autoSpace = computeAccountSpace(account, ir);
        const spaceStr =
          c.space === "auto"
            ? String(autoSpace > 0 ? autoSpace : 8 + 32)
            : String(c.space);
        parts.push(`init_if_needed, payer = ${c.payer}, space = ${spaceStr}`);
        break;
      }
      case "close":
        parts.push(`close = ${c.target}`);
        break;
      case "has-one": {
        const err = c.errorCode ? ` @ ${errorRef(errorEnum, c.errorCode, "")}` : "";
        parts.push(`has_one = ${c.field}${err}`);
        break;
      }
      case "seeds": {
        const self = selfReferentialSeeds(account);
        if (self) {
          // Check the address against the seeds once the account is loaded (needs the stored bump).
          if (self.bump && /^\w+\.\w+$/.test(self.bump)) {
            const seedExprs = [...self.seeds.map((sd) => quasarSelfSeed(sd, ix, ir, "").expr), `&[${self.bump}]`];
            parts.push(`constraint = quasar_lang::pda::verify_program_address(&[${seedExprs.join(", ")}], &crate::ID, ${account.name}.to_account_view().address()).is_ok()`);
          }
          break;
        }
        // Quasar's derive turns a bare account field into its address bytes itself.
        const seedParts = c.seeds.map((s) => seedBytes(s, { literal: (v) => `b"${v}"`, key: (a) => a }, ix));
        parts.push(`seeds = [${seedParts.join(", ")}]`);
        // With init, use plain bump (derive macro finds it). Without init, use bump from struct field.
        const hasInit = constraints.some((x) => x.type === "init" || x.type === "init-if-needed");
        if (hasInit) {
          parts.push("bump");
        } else {
          parts.push(c.bump ? `bump = ${c.bump}` : "bump");
        }
        if (c.programId) parts.push(`seeds::program = ${c.programId}`);
        break;
      }
      case "owner":
        parts.push(`owner = ${c.owner}`);
        break;
      case "address":
        parts.push(`address = ${c.address}`);
        break;
      // Quasar only takes token::* when creating the account; existing ones are checked by constraint.
      case "token-authority":
        parts.push(isInit
          ? `token::authority = ${c.authority}`
          : `constraint = ${account.name}.owner() == ${c.authority}.to_account_view().address()`);
        break;
      case "token-mint":
        parts.push(isInit
          ? `token::mint = ${c.mint}`
          : `constraint = ${account.name}.mint() == ${c.mint}.to_account_view().address()`);
        break;
      case "realloc": {
        const z = c.zeroInit ? "true" : "false";
        parts.push(
          `realloc = ${c.space}, realloc::payer = ${c.payer}, realloc::zero = ${z}`,
        );
        break;
      }
      case "custom": {
        const err = c.errorCode ? ` @ ${errorRef(errorEnum, c.errorCode, "")}` : "";
        parts.push(`constraint = ${c.expression}${err}`);
        break;
      }
      case "mint-authority":
        parts.push(`mint::authority = ${c.authority}`);
        break;
      case "mint-decimals":
        parts.push(`mint::decimals = ${c.decimals}`);
        break;
      case "associated-token-authority":
        parts.push(`associated_token::authority = ${c.authority}`);
        break;
      case "associated-token-mint":
        parts.push(`associated_token::mint = ${c.mint}`);
        break;
      case "safety-comment":
        // handled in type
        break;
    }
  }

  if (!parts.length) return [];
  return [`#[account(${parts.join(", ")})]`];
}

function accountToQuasarType(account: Account): string {
  const isMut = account.constraints.some((c) => c.type === "mut");
  const hasInit = account.constraints.some((c) => c.type === "init" || c.type === "init-if-needed");
  const needsMut = isMut || hasInit;

  switch (account.accountType) {
    case "signer":
      return needsMut ? `&'info mut Signer` : `&'info Signer`;
    case "system-account":
      // quasar-lang's SystemAccount checks the owner is the System Program (like Anchor's SystemAccount),
      // without requiring a signature.
      return needsMut ? `&'info mut SystemAccount` : `&'info SystemAccount`;
    case "system-program":
      return `&'info Program<System>`;
    case "token-program":
      return `&'info Program<Token>`;
    case "associated-token-program":
      return `&'info Program<AssociatedTokenProgram>`;
    case "rent":
      return `&'info Sysvar<Rent>`;
    case "clock":
      return `&'info Sysvar<Clock>`;
    case "mint":
      // Quasar's Mint type doesn't work with Account<>. Use InterfaceAccount for compatibility.
      return needsMut ? `&'info mut InterfaceAccount<Mint>` : `&'info InterfaceAccount<Mint>`;
    case "token-account":
      // quasar_spl doesn't export a standalone TokenAccount type.
      // Use InterfaceAccount<Token> which derefs to TokenAccountState.
      return needsMut ? `&'info mut InterfaceAccount<Token>` : `&'info InterfaceAccount<Token>`;
    case "associated-token":
      return needsMut ? `&'info mut InterfaceAccount<Token>` : `&'info InterfaceAccount<Token>`;
    case "unchecked-account":
      return needsMut ? `&'info mut AccountView` : `&'info AccountView`;
    case "program":
      // Token Metadata's program type is MetadataProgram in quasar-spl.
      return account.stateType
        ? `&'info Program<${account.stateType === "Metadata" ? "MetadataProgram" : account.stateType}>`
        : `&'info UncheckedAccount`;
    case "account":
      return account.stateType
        ? needsMut
          ? `&'info mut Account<${account.stateType}>`
          : `&'info Account<${account.stateType}>`
        : needsMut
          ? `&'info mut UncheckedAccount`
          : `&'info UncheckedAccount`;
    case "custom":
      if (account.stateType) {
        return needsMut
          ? `&'info mut ${account.stateType}`
          : `&'info ${account.stateType}`;
      }
      return needsMut
        ? `&'info mut AccountInfo<'info>`
        : `&'info AccountInfo<'info>`;
    default:
      return `&'info AccountInfo<'info>`;
  }
}

// ─── src/state/<name>.rs ──────────────────────────────────────────────────────

function generateStateRs(
  name: string,
  fields: Field[],
  discriminator: number[],
): string {
  const derive = `#[account(discriminator = [${discriminator.join(", ")}])]`;

  // Quasar requires fixed-size fields BEFORE dynamic fields (String/Vec)
  const fixedFields = fields.filter((f) => !isDynamic(f.type));
  const dynamicFields = fields.filter((f) => isDynamic(f.type));
  const orderedFields = [...fixedFields, ...dynamicFields];

  const fieldLines = orderedFields
    .map((f) => {
      const rustType = solanaTypeToQuasarAccount(f.type, f.maxLen);
      const doc = f.description ? `    /// ${f.description}\n` : "";
      return `${doc}    pub ${f.name}: ${rustType},`;
    })
    .join("\n");

  // Check if any field needs lifetime (Vec<'a, T, N>)
  const needsLifetime = fields.some((f) => {
    const t = solanaTypeToQuasarAccount(f.type, f.maxLen);
    return t.includes("'a");
  });
  const lifetime = needsLifetime ? "<'a>" : "";

  return `use quasar_lang::prelude::*;

${derive}
pub struct ${name}${lifetime} {
${fieldLines}
}
`;
}

// ─── src/errors.rs ────────────────────────────────────────────────────────────

function generateErrorsRs(
  enumName: string,
  errors: ProgramIR["errors"],
): string {
  const variants = errors
    .map((e) => `    ${e.name} = ${e.code},`)
    .join("\n");
  return `use quasar_lang::prelude::*;

#[error_code]
pub enum ${enumName} {
${variants}
}
`;
}

// ─── src/events.rs ────────────────────────────────────────────────────────────

function generateEventsRs(events: ProgramIR["events"]): string {
  const structs = events
    .map((e, idx) => {
      const fields = e.fields
        .map((f) => {
          const rustType = solanaTypeToQuasarEvent(f.type);
          return `    pub ${f.name}: ${rustType},`;
        })
        .join("\n");
      const needsLifetime = e.fields.some((f) => solanaTypeToQuasarEvent(f.type).includes("'a"));
      const lifetime = needsLifetime ? "<'a>" : "";
      return `#[event(discriminator = ${idx})]\npub struct ${e.name}${lifetime} {\n${fields}\n}`;
    })
    .join("\n\n");
  return `use quasar_lang::prelude::*;\n\n${structs}\n`;
}

// ─── src/constants.rs ─────────────────────────────────────────────────────────

function generateConstantsRs(constants: ProgramIR["constants"]): string {
  const lines = constants
    .map(
      (c) => `pub const ${c.name}: ${solanaTypeToQuasar(c.type)} = ${c.value};`,
    )
    .join("\n");
  return `${lines}\n`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSnakeFilename(name: string): string {
  return name
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}
