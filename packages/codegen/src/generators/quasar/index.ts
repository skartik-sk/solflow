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

import type {
  ProgramIR,
  Instruction,
  Account,
  Field,
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
  );

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
    content: generateCargoToml(programName, version, usesSpl),
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

  return { files, warnings, errors };
}

// ─── Cargo.toml ───────────────────────────────────────────────────────────────

function generateCargoToml(name: string, version: string, usesSpl: boolean): string {
  const kebab = toKebabCase(name);
  const splDep = usesSpl ? '\nquasar-spl = "0.0"' : "";
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
quasar-lang = "0.0"${splDep}

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

  // Build a map of accountName -> stateTypeName from the instruction's accounts
  const accountToStateType = new Map<string, string>();
  for (const a of ix.accounts) {
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
  for (const a of ix.accounts) {
    if (a.name === programName) {
      renameMap.set(a.name, `${a.name}_account`);
    }
  }

  const rename = (s: string): string => {
    let result = s;
    for (const [old, new_] of renameMap) {
      // Only rename standalone references to the account, not ctx.accounts.old or ctx.bumps.old
      result = result.replace(new RegExp(`(?<!ctx\\.accounts\\.)(?<!ctx\\.bumps\\.)\\b${old}\\b(?!_)`, "g"), new_);
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
  const renamedAccountToState = new Map<string, string>();
  for (const [orig, state] of accountToStateType) {
    renamedAccountToState.set(renameMap.get(orig) ?? orig, state);
  }

  // Create a wrapped rename function that also handles PodExpr translation
  const renameAndPod = (s: string): string => {
    return translateQuasarPodExpr(translateQuasarValue(rename(s)), renamedAccountToState, fieldTypeMap);
  };

  const mutBorrowed = new Set<string>();
  const readOnlyBound = new Set<string>();

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
    lines.push(...emitLogicOp(op, errorEnum, accountToStateType, fieldTypeMap, rename, renameAndPod, ir));
  }

  return lines;
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
  // ctx.bumps.X → ctx.bumps.X (Quasar Ctx has .bumps just like Anchor)
  return result;
}

/// Translate state field expressions to account for Pod type wrapping.
/// PodU64 fields need `.into()` when used in comparisons or arithmetic with native types.
function translateQuasarPodExpr(expr: string, accountToStateType?: Map<string, string>, fieldTypeMap?: Map<string, string>): string {
  if (!accountToStateType || !fieldTypeMap) return expr;
  // Match account.field patterns and wrap Pod fields with native type conversion
  return expr.replace(/\b(\w+)\.(\w+)\b/g, (_match: string, account: string, field: string) => {
    const stateType = accountToStateType.get(account);
    if (stateType) {
      const fieldKey = `${stateType}.${field}`;
      const fieldType = fieldTypeMap.get(fieldKey);
      if (fieldType && POD_TYPES.has(fieldType)) {
        // Determine the native Rust type from the Pod type name
        const nativeType = fieldType.replace("Pod", "").toLowerCase();
        // PodBool → bool, PodU64 → u64, PodI64 → i64, etc.
        return `${nativeType}::from(${account}.${field})`;
      }
    }
    return `${account}.${field}`;
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

function emitLogicOp(op: LogicOperation, errorEnum: string, accountToStateType?: Map<string, string>, fieldTypeMap?: Map<string, string>, rename?: (s: string) => string, renameAndPod?: (s: string) => string, ir?: ProgramIR): string[] {
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

    case "transfer-sol":
      return [
        `ctx.accounts.system_program.transfer(ctx.accounts.${op.from}, ctx.accounts.${op.to}, ${op.amount}).invoke()?;`,
      ];

    case "transfer-token": {
      const seeds = op.signerSeeds ? buildQuasarSeeds(op.signerSeeds) : null;
      if (seeds) {
        return [
          `let seeds = ${seeds};`,
          `ctx.accounts.token_program`,
          `    .transfer(ctx.accounts.${op.from}, ctx.accounts.${op.to}, ctx.accounts.${op.authority}, ${op.amount})`,
          `    .invoke_signed(&seeds)?;`,
        ];
      }
      return [
        `ctx.accounts.token_program`,
        `    .transfer(ctx.accounts.${op.from}, ctx.accounts.${op.to}, ctx.accounts.${op.authority}, ${op.amount})`,
        `    .invoke()?;`,
      ];
    }

    case "mint-to": {
      const seeds = op.signerSeeds ? buildQuasarSeeds(op.signerSeeds) : null;
      const invokeCall = seeds ? ".invoke_signed(&seeds)" : ".invoke()";
      return [
        ...(seeds ? [`let seeds = ${seeds};`] : []),
        `ctx.accounts.token_program`,
        `    .mint_to(ctx.accounts.${op.mint}, ctx.accounts.${op.to}, ctx.accounts.${op.authority}, ${op.amount})`,
        `    ${invokeCall}?;`,
      ];
    }

    case "burn": {
      const seeds = op.signerSeeds ? buildQuasarSeeds(op.signerSeeds) : null;
      if (seeds) {
        return [
          `let seeds = ${seeds};`,
          `ctx.accounts.token_program`,
          `    .burn(ctx.accounts.${op.mint}, ctx.accounts.${op.from}, ctx.accounts.${op.authority}, ${op.amount})`,
          `    .invoke_signed(&seeds)?;`,
        ];
      }
      return [
        `ctx.accounts.token_program`,
        `    .burn(ctx.accounts.${op.mint}, ctx.accounts.${op.from}, ctx.accounts.${op.authority}, ${op.amount})`,
        `    .invoke()?;`,
      ];
    }

    case "require": {
      const cond = renameAndPod ? renameAndPod(op.condition) : translateQuasarPodExpr(translateQuasarValue(rename?.(op.condition) ?? op.condition), accountToStateType, fieldTypeMap);
      return [`require!(${cond}, ${errorEnum}::${op.errorCode});`];
    }

    case "if-else": {
      const cond = renameAndPod ? renameAndPod(op.condition) : translateQuasarPodExpr(translateQuasarValue(rename?.(op.condition) ?? op.condition), accountToStateType, fieldTypeMap);
      const then_ = op.thenBody.flatMap((o) => emitLogicOp(o, errorEnum, accountToStateType, fieldTypeMap, rename, renameAndPod, ir)).map((l) => `        ${l}`);
      const else_ =
        op.elseBody?.flatMap((o) => emitLogicOp(o, errorEnum, accountToStateType, fieldTypeMap, rename, renameAndPod, ir)).map((l) => `        ${l}`) ?? [];
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
      return [`return Err(${errorEnum}::${op.errorCode}.into());`];

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

function buildQuasarSeeds(seeds: Seed[]): string {
  const parts = seeds.map((s) => {
    if (s.type === "literal") return `b"${s.value}"`;
    if (s.type === "pubkey") return s.value;
    return s.value;
  });
  return `&[${parts.join(", ")}]`;
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

  if (ix.accounts.length === 0) {
    warns.push({
      message: `Instruction "${ix.name}" has no accounts`,
      nodeId: ix.id,
    });
  }

  // Collect state types referenced by accounts (for imports)
  const usedStates = new Set<string>();
  for (const a of ix.accounts) {
    if (a.stateType) usedStates.add(a.stateType);
  }

  // Build imports
  const importLines: string[] = ["use quasar_lang::prelude::*;"];
  // Add quasar-spl import if mint/token accounts are present
  const needsSpl = ix.accounts.some((a) =>
    a.accountType === "mint" || a.accountType === "token-account" || a.accountType === "associated-token"
  );
  if (needsSpl) importLines.push("use quasar_spl::*;");
  for (const s of [...usedStates].sort()) {
    importLines.push(`use crate::state::${toSnakeFilename(s)}::${s};`);
  }

  // Build accounts struct — Quasar style
  const accountFields = ix.accounts
    .map((a) => buildQuasarAccountField(a, ix, ir))
    .join("\n\n");

  // Auto-add token_program if mint init is present but no token_program account exists
  const hasMintInit = ix.accounts.some(
    (a) => a.accountType === "mint" && a.constraints.some((c) => c.type === "init")
  );
  const hasTokenProgram = ix.accounts.some((a) => a.accountType === "token-program");
  const extraFields = hasMintInit && !hasTokenProgram
    ? "\n    pub token_program: &'info Program<Token>,"
    : "";

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
        const err = c.errorCode ? ` @ ${c.errorCode}` : "";
        parts.push(`has_one = ${c.field}${err}`);
        break;
      }
      case "seeds": {
        const seedParts = c.seeds.map((s) => {
          if (s.type === "literal") return `b"${s.value}"`;
          // Quasar derive macro handles field-to-bytes conversion
          if (s.type === "pubkey" || s.type === "account-field") return s.value;
          if (s.type === "instruction-arg") return s.value;
          return s.value;
        });
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
      case "token-authority":
        parts.push(`token::authority = ${c.authority}`);
        break;
      case "token-mint":
        parts.push(`token::mint = ${c.mint}`);
        break;
      case "realloc": {
        const z = c.zeroInit ? "true" : "false";
        parts.push(
          `realloc = ${c.space}, realloc::payer = ${c.payer}, realloc::zero = ${z}`,
        );
        break;
      }
      case "custom": {
        const err = c.errorCode ? ` @ ${c.errorCode}` : "";
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
      // Quasar's derive macro only supports specific types.
      // For non-mut system accounts (often seed metadata), use Signer type.
      return needsMut ? `&'info mut Signer` : `&'info Signer`;
    case "system-program":
      return `&'info Program<System>`;
    case "token-program":
      return `&'info Program<Token>`;
    case "associated-token-program":
      return `&'info Program<AssociatedToken>`;
    case "rent":
      // Quasar derive macro doesn't support Sysvar or AccountView directly
      // UseUncheckedAccount with safety comment for rent
      return `&'info quasar_lang::accounts::UncheckedAccount`;
    case "clock":
      return `Sysvar<'info, Clock>`;
    case "mint":
      // Quasar's Mint type doesn't work with Account<>. Use InterfaceAccount for compatibility.
      return needsMut ? `&'info mut InterfaceAccount<Mint>` : `&'info InterfaceAccount<Mint>`;
    case "token-account":
      // quasar_spl doesn't export a standalone TokenAccount type.
      // Use InterfaceAccount<Token> which derefs to TokenAccountState.
      return needsMut ? `&'info mut InterfaceAccount<Token>` : `&'info InterfaceAccount<Token>`;
    case "associated-token":
      return needsMut ? `&'info mut InterfaceAccount<TokenAccount>` : `&'info InterfaceAccount<TokenAccount>`;
    case "unchecked-account": {
      // Quasar uses AccountView for unchecked accounts (not AccountInfo)
      return needsMut ? `&'info mut AccountView` : `&'info AccountView`;
    }
    case "program":
      return account.stateType
        ? `&'info Program<${account.stateType}>`
        : `&'info AccountInfo<'info>`;
    case "account":
      return account.stateType
        ? needsMut
          ? `&'info mut Account<${account.stateType}>`
          : `&'info Account<${account.stateType}>`
        : needsMut
          ? `&'info mut AccountInfo<'info>`
          : `&'info AccountInfo<'info>`;
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
