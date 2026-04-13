// Quasar code generator — IR → Quasar Rust source files.
// Quasar is a zero-copy, no_std Solana framework similar to Anchor but with:
//   - quasar_lang::prelude::* instead of anchor_lang::prelude::*
//   - Ctx instead of Context
//   - &'info mut in type instead of #[account(mut)] attribute
//   - #[account(discriminator = N)] required (explicit)
//   - #[instruction(discriminator = N)] required (explicit)
//   - seeds use field name directly (not .key().as_ref())
//   - Address instead of Pubkey
//   - bumps.name_seeds() for auto-generated PDA seed helpers
//   - method-style CPI: .transfer(...).invoke() instead of CpiContext::new(...)

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
// Primitives in accounts become PodU64, PodBool, etc.
function solanaTypeToQuasarAccount(type: import("@solflow/ir").SolanaType, maxLen?: number): string {
  if (typeof type === "string") {
    switch (type) {
      case "bool":   return "PodBool";
      case "u8":     return "PodU8";
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
      case "String": return `String<${maxLen ?? 64}>`;  // zero-copy, configurable max bytes
      case "Pubkey": return "Address";
    }
  }
  if (typeof type === "object") {
    if ("array" in type) {
      const [inner, size] = type.array;
      return `[${solanaTypeToQuasarAccount(inner)}; ${size}]`;
    }
    if ("vec" in type) {
      return `Vec<${solanaTypeToQuasarAccount(type.vec)}, ${maxLen ?? 128}>`;
    }
    if ("option" in type) {
      return `Option<${solanaTypeToQuasarAccount(type.option)}>`;
    }
    if ("defined" in type) {
      return type.defined;
    }
  }
  return "u64"; // safe fallback
}

// Quasar event fields only support: bool, u8-u64, i8-i64, u128/i128, Address.
// String, Vec, and complex types are NOT supported.
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
      default:       return "u64"; // fallback for unsupported types
    }
  }
  return "u64"; // fallback
}

// For instruction args and non-account contexts, use standard Rust types
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

  const programName = ir.program.name; // snake_case
  const programId = ir.program.programId;
  const version = ir.program.version;

  // Determine if any instruction uses SPL token accounts
  const usesSpl = ir.instructions.some((ix) =>
    ix.accounts.some(
      (a) =>
        a.accountType === "token-account" ||
        a.accountType === "mint" ||
        a.accountType === "associated-token" ||
        a.accountType === "token-program" ||
        a.accountType === "associated-token-program",
    ),
  );

  // Sort everything deterministically
  const instructions = [...ir.instructions].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const states = [...ir.states].sort((a, b) => a.name.localeCompare(b.name));
  const errors_ = [...ir.errors].sort((a, b) => a.code - b.code);
  const events = [...ir.events].sort((a, b) => a.name.localeCompare(b.name));

  // ── Cargo.toml ─────────────────────────────────────────────────────────────
  files.push({
    path: `programs/${programName}/Cargo.toml`,
    content: generateCargoToml(programName, version),
    language: "toml",
  });

  // ── src/lib.rs ─────────────────────────────────────────────────────────────
  files.push({
    path: `programs/${programName}/src/lib.rs`,
    content: generateLibRs(
      programName,
      programId,
      instructions,
      states,
      errors_,
      events,
    ),
    language: "rust",
  });

  // ── src/instructions/mod.rs ────────────────────────────────────────────────
  files.push({
    path: `programs/${programName}/src/instructions/mod.rs`,
    content: generateModRs(instructions.map((ix) => ix.name)),
    language: "rust",
  });

  // ── src/instructions/<name>.rs ────────────────────────────────────────────
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

  // ── src/state/mod.rs + <name>.rs ──────────────────────────────────────────
  if (states.length > 0) {
    files.push({
      path: `programs/${programName}/src/state/mod.rs`,
      content: generateModRs(states.map((s) => toSnakeFilename(s.name))),
      language: "rust",
    });
    for (const state of states) {
      files.push({
        path: `programs/${programName}/src/state/${toSnakeFilename(state.name)}.rs`,
        content: generateStateRs(state.name, state.fields, state.customDiscriminator),
        language: "rust",
      });
    }
  }

  // ── src/errors.rs ─────────────────────────────────────────────────────────
  if (errors_.length > 0) {
    const enumName = toPascalCase(programName) + "Error";
    files.push({
      path: `programs/${programName}/src/errors.rs`,
      content: generateErrorsRs(enumName, errors_),
      language: "rust",
    });
  }

  // ── src/events.rs ─────────────────────────────────────────────────────────
  if (events.length > 0) {
    files.push({
      path: `programs/${programName}/src/events.rs`,
      content: generateEventsRs(events),
      language: "rust",
    });
  }

  // ── src/constants.rs ──────────────────────────────────────────────────────
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
description = "Created with SolFlow (Quasar)"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "${name}"

[features]
no-entrypoint = []
cpi = ["no-entrypoint"]
default = []

[dependencies]
quasar-lang = "0.1"

[profile.release]
opt-level = "z"
overflow-checks = true
lto = "fat"
codegen-units = 1
`;
}

// ─── src/lib.rs ───────────────────────────────────────────────────────────────

function generateLibRs(
  programName: string,
  programId: string | undefined,
  instructions: Instruction[],
  states: ReturnType<ProgramIR["states"]["map"]>[number][],
  errors: ProgramIR["errors"],
  events: ProgramIR["events"],
): string {
  const modules: string[] = ["instructions"];
  if (states.length > 0) modules.push("state");
  if (errors.length > 0) modules.push("errors");
  if (events.length > 0) modules.push("events");

  const modLines = modules.map((m) => `pub mod ${m};`).join("\n");
  const idLine = programId
    ? `quasar_lang::declare_id!("${programId}");`
    : `quasar_lang::declare_id!("11111111111111111111111111111111");`;

  // Quasar: #[program] is just dispatch, logic lives in impl methods
  const ixLines = instructions
    .map((ix, idx) => {
      const ctx = toPascalCase(ix.name);
      const args = ix.args
        .map((a) => `${a.name}: ${solanaTypeToRust(a.type)}`)
        .join(", ");
      const extraArgs = args ? `, ${args}` : "";
      // Quasar requires explicit discriminator
      return `    #[instruction(discriminator = ${idx})]\n    pub fn ${ix.name}(ctx: Ctx<${ctx}>${extraArgs}) -> Result<()> {\n        instructions::${ix.name}::handler(ctx${extraArgs})\n    }`;
    })
    .join("\n\n");

  return `#![cfg_attr(not(test), no_std)]
use quasar_lang::prelude::*;

${modLines}

${idLine}

#[program]
pub mod ${programName} {
    use super::*;

${ixLines}
}
`;
}

// ─── src/instructions/mod.rs  or  src/state/mod.rs ────────────────────────────

function generateModRs(names: string[]): string {
  return names.map((n) => `pub mod ${n};`).join("\n") + "\n";
}

// ─── src/instructions/<name>.rs ──────────────────────────────────────────────

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

  // Collect what state types and events this instruction references
  const usedStates = new Set<string>();
  const usedEvents = new Set<string>();
  let hasErrors = false;

  for (const a of ix.accounts) {
    if (a.stateType) usedStates.add(a.stateType);
  }
  for (const op of ix.body) {
    if (op.type === "emit-event") usedEvents.add(op.event);
    if (op.type === "require" || op.type === "return-error") hasErrors = true;
  }

  const errorEnum = toPascalCase(programName) + "Error";

  // Build imports — Quasar uses quasar_lang instead of anchor_lang
  const importLines: string[] = ["use quasar_lang::prelude::*;"];
  for (const s of [...usedStates].sort())
    importLines.push(`use crate::state::${s};`);
  if (hasErrors && ir.errors.length > 0)
    importLines.push(`use crate::errors::${errorEnum};`);
  for (const e of [...usedEvents].sort())
    importLines.push(`use crate::events::${e};`);

  // Build instruction body
  const bodyLines = generateInstructionBody(ix);

  // Build args signature
  const argSig = ix.args
    .map((a) => `${a.name}: ${solanaTypeToRust(a.type)}`)
    .join(", ");
  const extraArgs = argSig ? `, ${argSig}` : "";

  // Build accounts struct — Quasar style
  const accountFields = ix.accounts
    .map((a) => buildQuasarAccountField(a, ix, ir))
    .join("\n\n");

  const content = `${importLines.join("\n")}

pub fn handler(ctx: Ctx<${toPascalCase(ix.name)}>${extraArgs}) -> Result<()> {
${bodyLines.map((l) => `    ${l}`).join("\n")}

    Ok(())
}

#[derive(Accounts)]
pub struct ${ctx}<'info> {
${accountFields}
}
`;

  return { content, warns, errs };
}

// ─── Instruction body builder ────────────────────────────────────────────────

function generateInstructionBody(ix: Instruction): string[] {
  const lines: string[] = [];

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
    lines.push(...emitLogicOp(op));
  }

  return lines;
}

function emitLogicOp(op: LogicOperation): string[] {
  switch (op.type) {
    case "set-field":
      return [`${op.account}.${op.field} = ${op.value};`];

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
      const then_ = op.thenBody.flatMap(emitLogicOp).map((l) => `    ${l}`);
      const else_ =
        op.elseBody?.flatMap(emitLogicOp).map((l) => `    ${l}`) ?? [];
      const result = [`if ${op.condition} {`, ...then_];
      if (else_.length) result.push("} else {", ...else_);
      result.push("}");
      return result;
    }

    case "emit-event": {
      const fields = Object.entries(op.fields)
        .map(([k, v]) => `    ${k}: ${v},`)
        .join("\n");
      return [`emit!(${op.event} {`, fields, "});"];
    }

    case "return-error":
      return [`return err!(${op.errorCode});`];

    case "math": {
      const checked = op.checked;
      const opMap: Record<string, string> = {
        add: checked ? "checked_add" : "+",
        sub: checked ? "checked_sub" : "-",
        mul: checked ? "checked_mul" : "*",
        div: checked ? "checked_div" : "/",
        mod: checked ? "checked_rem" : "%",
      };
      if (checked) {
        return [
          `let ${op.result} = ${op.left}.${opMap[op.operation]}(${op.right}).ok_or(ErrorCode::AccountDidNotDeserialize)?;`,
        ];
      }
      return [
        `let ${op.result} = ${op.left} ${opMap[op.operation]} ${op.right};`,
      ];
    }

    case "cpi": {
      const prog = op.targetProgram;
      const ix = op.instruction;
      const accountMappings = op.accounts
        .map((a) => `    ${a.to}: ctx.accounts.${a.from},`)
        .join("\n");
      const dataArgs = op.data.map((d) => `${d.value}`).join(", ");
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
      return [`// WARNING: unimplemented logic operation type — add a handler in codegen`];
  }
}

function buildQuasarSeeds(seeds: Seed[]): string {
  // Quasar uses field name directly instead of .key().as_ref()
  const parts = seeds.map((s) => {
    if (s.type === "literal") return `b"${s.value}"`;
    // Quasar: field name directly, no .key().as_ref()
    if (s.type === "pubkey") return s.value;
    return s.value;
  });
  return `&[${parts.join(", ")}]`;
}

// ─── Account struct field builder (Quasar style) ────────────────────────────
// Key difference: mutability is in the type (&'info mut) not in #[account(mut)]

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

/** Compute the space for an account by looking up its state type's fields. */
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

  const initPayers = new Set<string>();
  for (const a of ix.accounts) {
    for (const c of a.constraints) {
      if ((c.type === "init" || c.type === "init-if-needed") && c.payer) {
        initPayers.add(c.payer);
      }
    }
  }

  // In Quasar, mut is expressed in the type, not as a constraint attribute.
  // We only need non-mut attributes here.
  if (!constraints.length) return [];

  const parts: string[] = [];

  for (const c of constraints) {
    switch (c.type) {
      case "mut":
        // mut is in the type in Quasar, skip
        break;
      case "signer":
        // signer is in the type in Quasar, skip
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
        // Quasar: seeds use field name directly
        const seedParts = c.seeds.map((s) => {
          if (s.type === "literal") return `b"${s.value}"`;
          // Quasar: just the field name, not .key().as_ref()
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
  // In Quasar, mutability is expressed via &'info mut in the type
  const isMut = account.constraints.some((c) => c.type === "mut");

  switch (account.accountType) {
    case "signer":
      // Quasar: &'info mut Signer or &'info Signer
      return isMut ? `&'info mut Signer` : `&'info Signer`;
    case "system-account":
      return isMut ? `&'info mut AccountInfo<'info>` : `&'info AccountInfo<'info>`;
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
      return isMut ? `&'info mut Mint` : `&'info Mint`;
    case "token-account":
    case "associated-token":
      return isMut ? `&'info mut TokenAccount` : `&'info TokenAccount`;
    case "unchecked-account":
      return `/// CHECK: validated by constraint\n    &'info AccountInfo<'info>`;
    case "program":
      return account.stateType
        ? `&'info Program<${account.stateType}>`
        : `&'info AccountInfo<'info>`;
    case "account":
      return account.stateType
        ? isMut
          ? `&'info mut Account<${account.stateType}>`
          : `&'info Account<${account.stateType}>`
        : isMut
          ? `&'info mut AccountInfo<'info>`
          : `&'info AccountInfo<'info>`;
    case "custom":
      return account.stateType ?? `&'info AccountInfo<'info>`;
    default:
      return `&'info AccountInfo<'info>`;
  }
}

// ─── src/state/<name>.rs ──────────────────────────────────────────────────────
// Quasar: #[account(discriminator = N)] is required, fields read zero-copy

function generateStateRs(
  name: string,
  fields: Field[],
  customDiscriminator?: number[],
): string {
  // Quasar requires explicit discriminator
  const discBytes = customDiscriminator ?? [1]; // default to 1 if not specified
  const derive = `#[account(discriminator = [${discBytes.join(", ")}])]\n#[derive(Debug)]`;

  const fieldLines = fields
    .map((f) => {
      const rustType = solanaTypeToQuasarAccount(f.type, f.maxLen);
      const doc = f.description ? `    /// ${f.description}\n` : "";
      const comment = sizeComment(f.type);
      const sizeStr = comment ? `  // zero-copy: ${comment}` : "";
      return `${doc}    pub ${f.name}: ${rustType},${sizeStr}`;
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
// Quasar: same pattern as Anchor but with quasar import
// Error codes offset is 6000

function generateErrorsRs(
  enumName: string,
  errors: ProgramIR["errors"],
): string {
  const variants = errors
    .map((e) => `    #[msg("${e.message}")]\n    ${e.name} = ${e.code + 6000},`)
    .join("\n");
  return `use quasar_lang::prelude::*;

#[error_code]
pub enum ${enumName} {
${variants}
}
`;
}

// ─── src/events.rs ────────────────────────────────────────────────────────────
// Quasar: same as Anchor but with explicit discriminator

function generateEventsRs(events: ProgramIR["events"]): string {
  const structs = events
    .map((e, idx) => {
      const fields = e.fields
        .map((f) => {
          // Quasar events only support primitives + Address
          const rustType = solanaTypeToQuasarEvent(f.type);
          return `    pub ${f.name}: ${rustType},`;
        })
        .join("\n");
      // Quasar events need explicit discriminator
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

/** PascalCase struct name -> snake_case filename (e.g. VaultState -> vault_state) */
function toSnakeFilename(name: string): string {
  return name
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}
