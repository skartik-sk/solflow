// Anchor code generator — IR → Anchor Rust source files.
// Uses @solflow/anchor-templates for Handlebars rendering (server/Node.js context)
// and falls back to inline string building when fs is unavailable (browser).

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

// ─── Public entry point ────────────────────────────────────────────────────────

export function generateAnchor(ir: ProgramIR): {
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
    content: generateCargoToml(programName, version, usesSpl),
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
        content: generateStateRs(state.name, state.fields),
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

function generateCargoToml(
  name: string,
  version: string,
  usesSpl: boolean,
): string {
  const kebab = toKebabCase(name);
  const spl = usesSpl ? '\nanchor-spl = "0.32.0"' : "";
  return `[package]
name = "${kebab}"
version = "${version}"
description = "Created with SolFlow"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "${name}"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = []
idl-build = ["anchor-lang/idl-build"]

[dependencies]
anchor-lang = { version = "0.32.0", features = ["init-if-needed"] }${spl}

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
    ? `declare_id!("${programId}");`
    : 'declare_id!("11111111111111111111111111111111");';

  const ixLines = instructions
    .map((ix) => {
      const ctx = toPascalCase(ix.name);
      const args = ix.args
        .map((a) => `${a.name}: ${solanaTypeToRust(a.type)}`)
        .join(", ");
      const argPass = ix.args.map((a) => a.name).join(", ");
      const extraArgs = args ? `, ${args}` : "";
      const extraPass = argPass ? `, ${argPass}` : "";
      return `    pub fn ${ix.name}(ctx: Context<${ctx}>${extraArgs}) -> Result<()> {\n        instructions::${ix.name}::handler(ctx${extraPass})\n    }`;
    })
    .join("\n\n");

  return `use anchor_lang::prelude::*;

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

  // Build imports
  const importLines: string[] = ["use anchor_lang::prelude::*;"];
  for (const s of [...usedStates].sort())
    importLines.push(`use crate::state::${s};`);
  if (hasErrors && ir.errors.length > 0)
    importLines.push(`use crate::errors::${errorEnum};`);
  for (const e of [...usedEvents].sort())
    importLines.push(`use crate::events::${e};`);

  // Build instruction body
  const bodyLines = generateInstructionBody(ix, programName);

  // Build args signature
  const argSig = ix.args
    .map((a) => `${a.name}: ${solanaTypeToRust(a.type)}`)
    .join(", ");
  const extraArgs = argSig ? `, ${argSig}` : "";

  const argAttr = ix.args.length > 0 ? `#[instruction(${argSig})]\n` : "";

  // Build accounts struct
  const accountFields = ix.accounts
    .map((a) => buildAccountField(a, ix, ir))
    .join("\n\n");

  // When there are no accounts, omit the 'info lifetime to avoid E0392
  const lifetime = ix.accounts.length > 0 ? "<'info>" : "";

  const content = `${importLines.join("\n")}

pub fn handler(ctx: Context<${ctx}>${extraArgs}) -> Result<()> {
${bodyLines.map((l) => `    ${l}`).join("\n")}

    Ok(())
}

#[derive(Accounts)]
${argAttr}pub struct ${ctx}${lifetime} {
${accountFields}
}
`;

  return { content, warns, errs };
}

// ─── Instruction body builder ────────────────────────────────────────────────

function generateInstructionBody(ix: Instruction, programName?: string): string[] {
  const lines: string[] = [];
  const errorEnum = programName ? toPascalCase(programName) + "Error" : undefined;

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
    lines.push(...emitLogicOp(op, errorEnum));
  }

  return lines;
}

function emitLogicOp(op: LogicOperation, errorEnum?: string): string[] {
  switch (op.type) {
    case "set-field":
      return [`${op.account}.${op.field} = ${op.value};`];

    case "transfer-sol":
      return [
        `let cpi_accounts = anchor_lang::system_program::Transfer {`,
        `    from: ctx.accounts.${op.from}.to_account_info(),`,
        `    to: ctx.accounts.${op.to}.to_account_info(),`,
        `};`,
        `let cpi_ctx = CpiContext::new(ctx.accounts.system_program.to_account_info(), cpi_accounts);`,
        `anchor_lang::system_program::transfer(cpi_ctx, ${op.amount})?;`,
      ];

    case "transfer-token": {
      const seeds = op.signerSeeds ? buildSignerSeeds(op.signerSeeds) : null;
      if (seeds) {
        return [
          `let seeds = ${seeds[0]};`,
          `let signer_seeds = &[&seeds[..]];`,
          `let cpi_accounts = anchor_spl::token::Transfer {`,
          `    from: ctx.accounts.${op.from}.to_account_info(),`,
          `    to: ctx.accounts.${op.to}.to_account_info(),`,
          `    authority: ctx.accounts.${op.authority}.to_account_info(),`,
          `};`,
          `let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer_seeds);`,
          `anchor_spl::token::transfer(cpi_ctx, ${op.amount})?;`,
        ];
      }
      return [
        `let cpi_accounts = anchor_spl::token::Transfer {`,
        `    from: ctx.accounts.${op.from}.to_account_info(),`,
        `    to: ctx.accounts.${op.to}.to_account_info(),`,
        `    authority: ctx.accounts.${op.authority}.to_account_info(),`,
        `};`,
        `let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);`,
        `anchor_spl::token::transfer(cpi_ctx, ${op.amount})?;`,
      ];
    }

    case "mint-to": {
      const seeds = op.signerSeeds ? buildSignerSeeds(op.signerSeeds) : null;
      const extra = seeds
        ? [`let seeds = ${seeds[0]};`, `let signer_seeds = &[&seeds[..]];`]
        : [];
      const cpiNew = seeds
        ? `CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer_seeds)`
        : `CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts)`;
      return [
        ...extra,
        `let cpi_accounts = anchor_spl::token::MintTo {`,
        `    mint: ctx.accounts.${op.mint}.to_account_info(),`,
        `    to: ctx.accounts.${op.to}.to_account_info(),`,
        `    authority: ctx.accounts.${op.authority}.to_account_info(),`,
        `};`,
        `let cpi_ctx = ${cpiNew};`,
        `anchor_spl::token::mint_to(cpi_ctx, ${op.amount})?;`,
      ];
    }

    case "burn":
      return [
        `let cpi_accounts = anchor_spl::token::Burn {`,
        `    mint: ctx.accounts.${op.mint}.to_account_info(),`,
        `    from: ctx.accounts.${op.from}.to_account_info(),`,
        `    authority: ctx.accounts.${op.authority}.to_account_info(),`,
        `};`,
        `let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);`,
        `anchor_spl::token::burn(cpi_ctx, ${op.amount})?;`,
      ];

    case "require":
      return [`require!(${op.condition}, ${errorEnum ? `${errorEnum}::` : ""}${op.errorCode});`];

    case "if-else": {
      const then_ = op.thenBody.flatMap((o) => emitLogicOp(o, errorEnum)).map((l) => `    ${l}`);
      const else_ =
        op.elseBody?.flatMap((o) => emitLogicOp(o, errorEnum)).map((l) => `    ${l}`) ?? [];
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
      return [`return err!(${errorEnum ? `${errorEnum}::` : ""}${op.errorCode});`];

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
          `let ${op.result} = ${op.left}.${opMap[op.operation]}(${op.right}).ok_or(anchor_lang::error::ErrorCode::ArithmeticOverflow)?;`,
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
        .map((a) => `${a.to}: ctx.accounts.${a.from}.to_account_info(),`)
        .join("\n            ");
      const dataArgs = op.data.map((d) => d.value).join(", ");
      const hasSignerSeeds = op.signerSeeds && op.signerSeeds.length > 0;
      const seedParts = hasSignerSeeds
        ? op.signerSeeds!.map((s) => {
            if (s.type === "literal") return `b"${s.value}"`;
            if (s.type === "pubkey") return `ctx.accounts.${s.value}.key().as_ref()`;
            return `ctx.accounts.${s.value}.key().as_ref()`;
          }).join(", ")
        : null;

      const lines: string[] = [
        `// CPI: ${prog}::${ix}`,
        `{`,
        `    let cpi_program = ctx.accounts.${prog}.to_account_info();`,
        `    let cpi_accounts = ${toPascalCase(ix)}Cpi {`,
        `            ${accountMappings}`,
        `    };`,
      ];

      if (hasSignerSeeds) {
        lines.push(
          `    let seeds = &[&[${seedParts}][..]];`,
          `    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts).with_signer(seeds);`,
        );
      } else {
        lines.push(
          `    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);`,
        );
      }

      if (dataArgs) {
        lines.push(`    ${ix}(cpi_ctx, ${dataArgs})?;`);
      } else {
        lines.push(`    ${ix}(cpi_ctx)?;`);
      }
      lines.push(`}`);
      return lines;
    }

    case "custom-code":
      return op.code.split("\n");

    default:
      return [`// WARNING: unimplemented logic operation type — add a handler in codegen`];
  }
}

function buildSignerSeeds(seeds: Seed[]): string[] {
  const parts = seeds.map((s) => {
    if (s.type === "literal") return `b"${s.value}"`;
    if (s.type === "pubkey") return `ctx.accounts.${s.value}.key().as_ref()`;
    return s.value;
  });
  return [`&[${parts.join(", ")}]`];
}

// ─── Account struct field builder ─────────────────────────────────────────────

function buildAccountField(
  account: Account,
  ix: Instruction,
  ir: ProgramIR,
): string {
  const lines: string[] = [];
  const attrs = buildAccountAttributes(account, ix, ir);
  for (const attr of attrs) lines.push(`    ${attr}`);

  const rustType = accountToRustType(account);
  lines.push(`    pub ${account.name}: ${rustType},`);
  return lines.join("\n");
}

function buildAccountAttributes(
  account: Account,
  ix: Instruction,
  _ir: ProgramIR,
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

  const needsMut =
    initPayers.has(account.name) &&
    !constraints.some(
      (c) =>
        c.type === "mut" || c.type === "init" || c.type === "init-if-needed",
    );

  if (!constraints.length && !needsMut) return [];

  const parts: string[] = [];

  if (needsMut) parts.push("mut");

  for (const c of constraints) {
    switch (c.type) {
      case "mut":
        parts.push("mut");
        break;
      case "signer":
        // signer is expressed in the type (Signer<'info>), not a constraint
        break;
      case "init": {
        const spaceStr =
          c.space === "auto"
            ? `8 + ${account.stateType ?? "Self"}::INIT_SPACE`
            : String(c.space);
        parts.push(`init, payer = ${c.payer}, space = ${spaceStr}`);
        break;
      }
      case "init-if-needed": {
        const spaceStr =
          c.space === "auto"
            ? `8 + ${account.stateType ?? "Self"}::INIT_SPACE`
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
          if (s.type === "pubkey") return `${s.value}.key().as_ref()`;
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

function accountToRustType(account: Account): string {
  switch (account.accountType) {
    case "signer":
      return `Signer<'info>`;
    case "system-account":
      return `SystemAccount<'info>`;
    case "system-program":
      return `Program<'info, System>`;
    case "token-program":
      return `Program<'info, anchor_spl::token::Token>`;
    case "associated-token-program":
      return `Program<'info, anchor_spl::associated_token::AssociatedToken>`;
    case "rent":
      return `Sysvar<'info, Rent>`;
    case "clock":
      return `Sysvar<'info, Clock>`;
    case "mint":
      return `Account<'info, anchor_spl::token::Mint>`;
    case "token-account":
      return `Account<'info, anchor_spl::token::TokenAccount>`;
    case "associated-token":
      return `Account<'info, anchor_spl::token::TokenAccount>`;
    case "unchecked-account":
      return `/// CHECK: validated by constraint\n    UncheckedAccount<'info>`;
    case "program":
      return account.stateType
        ? `Program<'info, ${account.stateType}>`
        : `AccountInfo<'info>`;
    case "account":
      return account.stateType
        ? `Account<'info, ${account.stateType}>`
        : `AccountInfo<'info>`;
    case "custom":
      return account.stateType ?? `AccountInfo<'info>`;
    default:
      return `AccountInfo<'info>`;
  }
}

// ─── src/state/<name>.rs ──────────────────────────────────────────────────────

function generateStateRs(name: string, fields: Field[]): string {
  const derive = "#[account]\n#[derive(InitSpace)]";

  const hasDynamic = fields.some((f) => isDynamic(f.type));
  const fieldLines = fields
    .map((f) => {
      const rustType = solanaTypeToRust(f.type);
      const maxLenAttr =
        hasDynamic && f.maxLen != null ? `    #[max_len(${f.maxLen})]\n` : "";
      const doc = f.description ? `    /// ${f.description}\n` : "";
      const comment = sizeComment(f.type);
      const sizeStr = comment ? `  // ${comment}` : "";
      return `${doc}${maxLenAttr}    pub ${f.name}: ${rustType},${sizeStr}`;
    })
    .join("\n");

  return `use anchor_lang::prelude::*;

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
    .map((e) => `    #[msg("${e.message}")]\n    ${e.name},`)
    .join("\n");
  return `use anchor_lang::prelude::*;

#[error_code]
pub enum ${enumName} {
${variants}
}
`;
}

// ─── src/events.rs ────────────────────────────────────────────────────────────

function generateEventsRs(events: ProgramIR["events"]): string {
  const structs = events
    .map((e) => {
      const fields = e.fields
        .map((f) => `    pub ${f.name}: ${solanaTypeToRust(f.type)},`)
        .join("\n");
      return `#[event]\npub struct ${e.name} {\n${fields}\n}`;
    })
    .join("\n\n");
  return `use anchor_lang::prelude::*;\n\n${structs}\n`;
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

/** PascalCase struct name → snake_case filename (e.g. VaultState → vault_state) */
function toSnakeFilename(name: string): string {
  return name
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}
