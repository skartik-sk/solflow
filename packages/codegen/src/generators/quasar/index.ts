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
      case "u16":    return "u16";
      case "u32":    return "PodU32";
      case "u64":    return "PodU64";
      case "u128":   return "u128";
      case "i8":     return "i8";
      case "i16":    return "i16";
      case "i32":    return "i32";
      case "i64":    return "i64";
      case "i128":   return "i128";
      case "f32":    return "f32";
      case "f64":    return "f64";
      case "String": return `String<'a, ${maxLen ?? 64}>`;
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
      default:       return "u64";
    }
  }
  return "u64";
}

// For instruction args: standard Rust types with Pubkey → Address
function solanaTypeToQuasar(type: import("@solflow/ir").SolanaType): string {
  const rust = solanaTypeToRust(type);
  if (rust === "Pubkey") return "Address";
  return rust;
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
    const disc = states[i].customDiscriminator ?? [i + 1];
    stateDiscriminators.set(states[i].name, disc);
  }

  // ── Cargo.toml
  files.push({
    path: `programs/${programName}/Cargo.toml`,
    content: generateCargoToml(programName, version),
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

function generateCargoToml(name: string, version: string): string {
  const kebab = toKebabCase(name);
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
quasar-lang = "0.0"

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
): string {
  const modules: string[] = ["instructions"];
  if (states.length > 0) modules.push("state");
  if (errors.length > 0) modules.push("errors");
  if (events.length > 0) modules.push("events");

  const modLines = modules.map((m) => `pub mod ${m};`).join("\n");

  // Re-export instruction account structs at crate root (required by #[program])
  const reExports = instructions
    .map((ix) => {
      const ctx = toPascalCase(ix.name);
      return `pub use instructions::${ix.name}::${ctx};`;
    })
    .join("\n");

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

  return `#![cfg_attr(not(test), no_std)]
use quasar_lang::prelude::*;

${modLines}

${reExports}

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

  // Emit a mutable borrow for accounts that get set-field'd
  const mutAccounts = new Set<string>();
  for (const op of ix.body) {
    if (op.type === "set-field") mutAccounts.add(op.account);
  }
  for (const acc of [...mutAccounts].sort()) {
    lines.push(`let ${acc} = &mut ctx.accounts.${acc};`);
  }
  if (mutAccounts.size > 0) lines.push("");

  for (const op of ix.body) {
    lines.push(...emitLogicOp(op, errorEnum, accountToStateType, fieldTypeMap));
  }

  return lines;
}

// Pod types that need wrapping with PodType::from()
const POD_TYPES = new Set(["PodBool", "PodU16", "PodU32", "PodU64", "PodU128", "PodI16", "PodI32", "PodI64", "PodI128"]);

function emitLogicOp(op: LogicOperation, errorEnum: string, accountToStateType?: Map<string, string>, fieldTypeMap?: Map<string, string>): string[] {
  switch (op.type) {
    case "set-field": {
      // Look up the field type to wrap Pod values correctly
      const stateType = accountToStateType?.get(op.account);
      const fieldKey = stateType ? `${stateType}.${op.field}` : null;
      const fieldType = fieldKey ? fieldTypeMap?.get(fieldKey) : null;
      const isPod = fieldType && POD_TYPES.has(fieldType);
      const value = isPod ? `${fieldType}::from(${op.value})` : op.value;
      return [`ctx.accounts.${op.account}.${op.field} = ${value};`];
    }

    case "transfer-sol":
      return [
        `ctx.accounts.${op.from}.transfer(ctx.accounts.${op.to}, ${op.amount})?.invoke()?;`,
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

    case "burn":
      return [
        `ctx.accounts.token_program`,
        `    .burn(ctx.accounts.${op.mint}, ctx.accounts.${op.from}, ctx.accounts.${op.authority}, ${op.amount})`,
        `    .invoke()?;`,
      ];

    case "require":
      return [`require!(${op.condition}, ${op.errorCode});`];

    case "if-else": {
      const then_ = op.thenBody.flatMap((o) => emitLogicOp(o, errorEnum, accountToStateType, fieldTypeMap)).map((l) => `        ${l}`);
      const else_ =
        op.elseBody?.flatMap((o) => emitLogicOp(o, errorEnum, accountToStateType, fieldTypeMap)).map((l) => `        ${l}`) ?? [];
      const result = [`if ${op.condition} {`, ...then_];
      if (else_.length) result.push("} else {", ...else_);
      result.push("}");
      return result;
    }

    case "emit-event": {
      const fields = Object.entries(op.fields)
        .map(([k, v]) => `            ${k}: ${v},`)
        .join("\n");
      return [`emit!(${op.event} {`, fields, `});`];
    }

    case "return-error":
      return [`return Err(${op.errorCode}.into());`];

    case "math": {
      const checked = op.checked;
      if (checked) {
        const opMap: Record<string, string> = {
          add: "checked_add", sub: "checked_sub",
          mul: "checked_mul", div: "checked_div", mod: "checked_rem",
        };
        return [
          `let ${op.result} = ${op.left}.${opMap[op.operation] ?? "checked_add"}(${op.right}).ok_or(ProgramError::ArithmeticOverflow)?;`,
        ];
      }
      const opSym: Record<string, string> = { add: "+", sub: "-", mul: "*", div: "/", mod: "%" };
      return [`let ${op.result} = ${op.left} ${opSym[op.operation] ?? "+"} ${op.right};`];
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

      const lines: string[] = [
        `// CPI: ${prog}::${ix}`,
        `ctx.accounts.${prog}`,
        `    .${ix}(${toPascalCase(ix)}Cpi {`,
        `${accountMappings}`,
        `    })`,
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
  for (const s of [...usedStates].sort()) {
    importLines.push(`use crate::state::${toSnakeFilename(s)}::${s};`);
  }

  // Build accounts struct — Quasar style
  const accountFields = ix.accounts
    .map((a) => buildQuasarAccountField(a, ix, ir))
    .join("\n\n");

  const content = `${importLines.join("\n")}

#[derive(Accounts)]
pub struct ${ctx}<'info> {
${accountFields}
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
        const autoSpace = computeAccountSpace(account, ir);
        const spaceStr =
          c.space === "auto"
            ? String(autoSpace > 0 ? autoSpace : 8 + 32)
            : String(c.space);
        parts.push(`init, payer = ${c.payer}, space = ${spaceStr}`);
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
          if (s.type === "pubkey") return s.value;
          return s.value;
        });
        parts.push(`seeds = [${seedParts.join(", ")}]`);
        parts.push("bump");
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
      return needsMut ? `&'info mut AccountInfo<'info>` : `&'info AccountInfo<'info>`;
    case "system-program":
      return `&'info Program<System>`;
    case "token-program":
      return `&'info Program<Token>`;
    case "associated-token-program":
      return `&'info Program<AssociatedToken>`;
    case "rent":
      return `Sysvar<'info, Rent>`;
    case "clock":
      return `Sysvar<'info, Clock>`;
    case "mint":
      return needsMut ? `&'info mut Mint` : `&'info Mint`;
    case "token-account":
    case "associated-token":
      return needsMut ? `&'info mut TokenAccount` : `&'info TokenAccount`;
    case "unchecked-account":
      return `/// CHECK: validated by constraint\n    &'info AccountInfo<'info>`;
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
      return account.stateType ?? `&'info AccountInfo<'info>`;
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

  const fieldLines = fields
    .map((f) => {
      const rustType = solanaTypeToQuasarAccount(f.type, f.maxLen);
      const doc = f.description ? `    /// ${f.description}\n` : "";
      return `${doc}    pub ${f.name}: ${rustType},`;
    })
    .join("\n");

  return `use quasar_lang::prelude::*;

${derive}
pub struct ${name} {
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
    .map((e) => `    ${e.name} = ${e.code + 6000},`)
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
      return `#[event(discriminator = ${idx})]\npub struct ${e.name} {\n${fields}\n}`;
    })
    .join("\n\n");
  return `use quasar_lang::prelude::*;\n\n${structs}\n`;
}

// ─── src/constants.rs ─────────────────────────────────────────────────────────

function generateConstantsRs(constants: ProgramIR["constants"]): string {
  const lines = constants
    .map(
      (c) => `pub const ${c.name}: ${solanaTypeToRust(c.type)} = ${c.value};`,
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
