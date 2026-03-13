// Pinocchio code generator — IR → Pinocchio Rust source files.
//
// Pinocchio programs are zero-dependency, compute-optimized Solana programs.
// Key differences from Anchor:
//  - Manual entrypoint! + discriminator-based dispatch
//  - No derive macros; manual account destructuring from &[AccountInfo]
//  - Zero-copy state access via byte offsets
//  - Explicit signer/writable checks
//  - ProgramError::Custom(code) for errors
//
// This generator is browser-safe (no fs, no Node.js builtins).

import type { ProgramIR, Instruction, Account, Field, LogicOperation, Seed } from '@solflow/ir';
import type { GeneratedFile, CodegenWarning, CodegenError } from '../../index';
import {
  solanaTypeToRust,
  getTypeSize,
  toPascalCase,
  toKebabCase,
  toSnakeCase,
} from '../../utils/type-mapper';

// ─── Public entry point ────────────────────────────────────────────────────────

export function generatePinocchio(ir: ProgramIR): {
  files: GeneratedFile[];
  warnings: CodegenWarning[];
  errors: CodegenError[];
} {
  const warnings: CodegenWarning[] = [];
  const errors: CodegenError[]   = [];
  const files: GeneratedFile[]   = [];

  const programName = ir.program.name;   // snake_case
  const version     = ir.program.version;

  // Determine if any instruction references SPL tokens
  const usesSpl = ir.instructions.some((ix) =>
    ix.accounts.some((a) =>
      a.accountType === 'token-account' ||
      a.accountType === 'mint' ||
      a.accountType === 'associated-token' ||
      a.accountType === 'token-program' ||
      a.accountType === 'associated-token-program'
    )
  );

  // Sort deterministically
  const instructions = [...ir.instructions].sort((a, b) => a.name.localeCompare(b.name));
  const states       = [...ir.states].sort((a, b) => a.name.localeCompare(b.name));
  const errors_      = [...ir.errors].sort((a, b) => a.code - b.code);
  const events       = [...ir.events].sort((a, b) => a.name.localeCompare(b.name));

  // Precompute discriminators (deterministic djb2 of "global:<ix_name>")
  const discriminators = new Map<string, number[]>();
  for (const ix of instructions) {
    discriminators.set(ix.name, djb2Discriminator(`global:${ix.name}`));
  }

  // ── Cargo.toml ─────────────────────────────────────────────────────────────
  files.push({
    path: `programs/${programName}/Cargo.toml`,
    content: generateCargoToml(programName, version, usesSpl),
    language: 'toml',
  });

  // ── src/lib.rs ─────────────────────────────────────────────────────────────
  files.push({
    path: `programs/${programName}/src/lib.rs`,
    content: generateLibRs(programName, instructions, states, errors_, events, discriminators),
    language: 'rust',
  });

  // ── src/instructions/mod.rs ────────────────────────────────────────────────
  files.push({
    path: `programs/${programName}/src/instructions/mod.rs`,
    content: instructions.map((ix) => `pub mod ${ix.name};`).join('\n') + '\n',
    language: 'rust',
  });

  // ── src/instructions/<name>.rs ────────────────────────────────────────────
  for (const ix of instructions) {
    const { content, warns, errs } = generateInstructionRs(ix, ir);
    for (const w of warns) warnings.push(w);
    for (const e of errs)  errors.push(e);
    files.push({
      path: `programs/${programName}/src/instructions/${ix.name}.rs`,
      content,
      language: 'rust',
    });
  }

  // ── src/state/mod.rs + <name>.rs ──────────────────────────────────────────
  if (states.length > 0) {
    files.push({
      path: `programs/${programName}/src/state/mod.rs`,
      content: states.map((s) => `pub mod ${toSnakeCase(s.name)};`).join('\n') + '\n',
      language: 'rust',
    });
    for (const state of states) {
      const disc = djb2Discriminator(`account:${state.name}`);
      files.push({
        path: `programs/${programName}/src/state/${toSnakeCase(state.name)}.rs`,
        content: generateStateRs(state.name, state.fields, disc),
        language: 'rust',
      });
    }
  }

  // ── src/errors.rs ─────────────────────────────────────────────────────────
  if (errors_.length > 0) {
    const enumName = toPascalCase(programName) + 'Error';
    files.push({
      path: `programs/${programName}/src/errors.rs`,
      content: generateErrorsRs(enumName, errors_),
      language: 'rust',
    });
  }

  // ── src/events.rs ─────────────────────────────────────────────────────────
  if (events.length > 0) {
    files.push({
      path: `programs/${programName}/src/events.rs`,
      content: generateEventsRs(events),
      language: 'rust',
    });
  }

  // ── src/constants.rs ──────────────────────────────────────────────────────
  if (ir.constants.length > 0) {
    files.push({
      path: `programs/${programName}/src/constants.rs`,
      content: generateConstantsRs(ir.constants),
      language: 'rust',
    });
  }

  // ── src/utils.rs ──────────────────────────────────────────────────────────
  files.push({
    path: `programs/${programName}/src/utils.rs`,
    content: generateUtilsRs(),
    language: 'rust',
  });

  return { files, warnings, errors };
}

// ─── Discriminator (browser-safe) ────────────────────────────────────────────
// Mimics SHA-256("global:name")[..8] using djb2 to stay browser-safe.
// Output is deterministic but NOT identical to real Anchor discriminators
// (which use actual SHA-256). For production use, swap with Node crypto.

function djb2Discriminator(input: string): number[] {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) + input.charCodeAt(i);
    h = h & h;
  }
  const u = h >>> 0;
  const bytes: number[] = [];
  for (let i = 0; i < 8; i++) {
    bytes.push((u >>> (i % 4 * 8)) & 0xff);
  }
  return bytes;
}

function formatDiscriminator(disc: number[]): string {
  return `[${disc.join(', ')}]`;
}

// ─── Cargo.toml ───────────────────────────────────────────────────────────────

function generateCargoToml(name: string, version: string, usesSpl: boolean): string {
  const kebab = toKebabCase(name);
  const spl = usesSpl
    ? '\npinocchio-token = "0.3"'
    : '';
  return `[package]
name = "${kebab}"
version = "${version}"
description = "Created with SolFlow (Pinocchio)"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "${name}"

[features]
no-entrypoint = []
default = []

[dependencies]
pinocchio = "0.7"
pinocchio-system = "0.3"${spl}

[profile.release]
opt-level = "z"
overflow-checks = true
lto = "fat"
codegen-units = 1
strip = true
`;
}

// ─── src/lib.rs ───────────────────────────────────────────────────────────────

function generateLibRs(
  programName: string,
  instructions: Instruction[],
  states: ProgramIR['states'],
  errors: ProgramIR['errors'],
  events: ProgramIR['events'],
  discriminators: Map<string, number[]>,
): string {
  const mods: string[] = ['instructions'];
  if (states.length > 0) mods.push('state');
  if (errors.length > 0) mods.push('errors');
  if (events.length > 0) mods.push('events');
  mods.push('utils');

  const modLines = mods.map((m) => `pub mod ${m};`).join('\n');

  const matchArms = instructions.map((ix) => {
    const disc = formatDiscriminator(discriminators.get(ix.name) ?? [0,0,0,0,0,0,0,0]);
    const comment = `// discriminator for "${ix.name}"`;
    return `        ${disc} => {\n            ${comment}\n            instructions::${ix.name}::process(program_id, accounts, data)\n        }`;
  }).join('\n');

  return `use pinocchio::{
    account_info::AccountInfo,
    entrypoint,
    program_error::ProgramError,
    pubkey::Pubkey,
    ProgramResult,
};

${modLines}

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    // Discriminator-based dispatch (first 8 bytes)
    if instruction_data.len() < 8 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let discriminator: &[u8; 8] = instruction_data[..8]
        .try_into()
        .map_err(|_| ProgramError::InvalidInstructionData)?;
    let data = &instruction_data[8..];

    match discriminator {
${matchArms}
        _ => Err(ProgramError::InvalidInstructionData),
    }
}
`;
}

// ─── src/instructions/<name>.rs ──────────────────────────────────────────────

function generateInstructionRs(
  ix: Instruction,
  ir: ProgramIR,
): { content: string; warns: CodegenWarning[]; errs: CodegenError[] } {
  const warns: CodegenWarning[] = [];
  const errs: CodegenError[]   = [];

  if (ix.accounts.length === 0) {
    warns.push({ message: `Instruction "${ix.name}" has no accounts`, nodeId: ix.id });
  }

  const hasErrors = ir.errors.length > 0 &&
    ix.body.some((op) => op.type === 'require' || op.type === 'return-error');

  const errorEnum  = toPascalCase(ir.program.name) + 'Error';

  // Build account destructuring
  const accountNames = ix.accounts.map((a) => a.name);
  const destructure  = accountNames.length > 0
    ? `    let [${accountNames.join(', ')}, _remaining @ ..] = accounts else {\n        return Err(ProgramError::NotEnoughAccountKeys);\n    };\n`
    : '';

  // Build validation checks
  const validationLines = buildValidationChecks(ix.accounts, errorEnum, hasErrors);

  // Parse instruction args
  const argParseLines = buildArgParsing(ix.args);
  const hasArgs = ix.args.length > 0;

  // Build body
  const bodyLines = buildInstructionBody(ix, ir.program.name);

  // State imports
  const usedStates = new Set<string>();
  for (const a of ix.accounts) {
    if (a.stateType) usedStates.add(a.stateType);
  }

  const imports: string[] = [
    'use pinocchio::{',
    '    account_info::AccountInfo,',
    '    program_error::ProgramError,',
    '    pubkey::Pubkey,',
    '    ProgramResult,',
    '};',
  ];
  for (const s of [...usedStates].sort()) {
    imports.push(`use crate::state::${toSnakeCase(s)}::${s};`);
  }
  if (hasErrors) {
    imports.push(`use crate::errors::${errorEnum};`);
  }

  const content = `${imports.join('\n')}

pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
${destructure}${validationLines}${hasArgs ? '\n' + argParseLines : ''}
${bodyLines.map((l) => `    ${l}`).join('\n')}

    Ok(())
}
`;

  return { content, warns, errs };
}

// ─── Account validation ───────────────────────────────────────────────────────

function buildValidationChecks(
  accounts: Account[],
  errorEnum: string,
  hasErrors: boolean,
): string {
  const lines: string[] = [];

  for (const a of accounts) {
    for (const c of a.constraints) {
      if (c.type === 'signer') {
        lines.push(`    // Validate ${a.name} is signer`);
        lines.push(`    if !${a.name}.is_signer() {`);
        lines.push(`        return Err(ProgramError::MissingRequiredSignature);`);
        lines.push(`    }`);
      }
      if (c.type === 'mut') {
        lines.push(`    // Validate ${a.name} is writable`);
        lines.push(`    if !${a.name}.is_writable() {`);
        lines.push(`        return Err(ProgramError::InvalidAccountData);`);
        lines.push(`    }`);
      }
    }
  }

  return lines.length > 0 ? lines.join('\n') + '\n' : '';
}

// ─── Arg parsing ─────────────────────────────────────────────────────────────

function buildArgParsing(
  args: Instruction['args'],
): string {
  const lines: string[] = [`    // Parse instruction arguments`];
  let offset = 0;

  for (const arg of args) {
    const size = getTypeSize(arg.type);
    if (size > 0) {
      const rustType = solanaTypeToRust(arg.type);
      if (rustType === 'u64' || rustType === 'i64' ||
          rustType === 'u32' || rustType === 'i32' ||
          rustType === 'u128' || rustType === 'i128' ||
          rustType === 'u16' || rustType === 'i16' ||
          rustType === 'u8' || rustType === 'i8') {
        lines.push(`    let ${arg.name} = ${rustType}::from_le_bytes(`);
        lines.push(`        data[${offset}..${offset + size}].try_into().map_err(|_| ProgramError::InvalidInstructionData)?`);
        lines.push(`    );`);
      } else if (rustType === 'bool') {
        lines.push(`    let ${arg.name} = data[${offset}] != 0;`);
      } else if (rustType === 'Pubkey') {
        lines.push(`    let ${arg.name}: &Pubkey = unsafe {`);
        lines.push(`        &*(data[${offset}..${offset + size}].as_ptr() as *const Pubkey)`);
        lines.push(`    };`);
      } else {
        lines.push(`    // TODO: parse ${arg.name}: ${rustType} from data[${offset}..]`);
      }
      offset += size;
    } else {
      lines.push(`    // TODO: parse dynamic-length arg '${arg.name}' from data[${offset}..]`);
    }
  }

  return lines.join('\n');
}

// ─── Instruction body ─────────────────────────────────────────────────────────

function buildInstructionBody(ix: Instruction, programName: string): string[] {
  const lines: string[] = [];
  const errorEnum = toPascalCase(programName) + 'Error';

  for (const op of ix.body) {
    lines.push(...emitPinocchioOp(op, errorEnum));
  }

  return lines;
}

function emitPinocchioOp(op: LogicOperation, errorEnum: string): string[] {
  switch (op.type) {
    case 'set-field': {
      // Zero-copy write pattern: borrow mut data and write at field offset
      return [
        `// Set ${op.account}.${op.field} = ${op.value}`,
        `{`,
        `    let data = &mut ${op.account}.try_borrow_mut_data()?;`,
        `    // TODO: write ${op.field} at correct byte offset`,
        `    let _ = (data, ${op.value});`,
        `}`,
      ];
    }

    case 'transfer-sol':
      return [
        `{`,
        `    use pinocchio_system::instructions::Transfer;`,
        `    Transfer {`,
        `        from: ${op.from},`,
        `        to: ${op.to},`,
        `        lamports: ${op.amount}.parse::<u64>().unwrap_or(0),`,
        `    }`,
        `    .invoke()?;`,
        `}`,
      ];

    case 'transfer-token': {
      const seeds = op.signerSeeds ? buildSignerSeeds(op.signerSeeds) : null;
      if (seeds) {
        return [
          `{`,
          `    use pinocchio_token::instructions::Transfer as TokenTransfer;`,
          `    let signer_seeds = ${seeds[0]};`,
          `    TokenTransfer {`,
          `        from: ${op.from},`,
          `        to: ${op.to},`,
          `        authority: ${op.authority},`,
          `        amount: ${op.amount}.parse::<u64>().unwrap_or(0),`,
          `    }`,
          `    .invoke_signed(&[&signer_seeds])?;`,
          `}`,
        ];
      }
      return [
        `{`,
        `    use pinocchio_token::instructions::Transfer as TokenTransfer;`,
        `    TokenTransfer {`,
        `        from: ${op.from},`,
        `        to: ${op.to},`,
        `        authority: ${op.authority},`,
        `        amount: ${op.amount}.parse::<u64>().unwrap_or(0),`,
        `    }`,
        `    .invoke()?;`,
        `}`,
      ];
    }

    case 'mint-to':
      return [
        `{`,
        `    use pinocchio_token::instructions::MintTo;`,
        `    MintTo {`,
        `        mint: ${op.mint},`,
        `        account: ${op.to},`,
        `        mint_authority: ${op.authority},`,
        `        amount: ${op.amount}.parse::<u64>().unwrap_or(0),`,
        `    }`,
        `    .invoke()?;`,
        `}`,
      ];

    case 'burn':
      return [
        `{`,
        `    use pinocchio_token::instructions::Burn;`,
        `    Burn {`,
        `        account: ${op.from},`,
        `        mint: ${op.mint},`,
        `        authority: ${op.authority},`,
        `        amount: ${op.amount}.parse::<u64>().unwrap_or(0),`,
        `    }`,
        `    .invoke()?;`,
        `}`,
      ];

    case 'require':
      return [
        `if !(${op.condition}) {`,
        `    return Err(${errorEnum}::${op.errorCode}.into());`,
        `}`,
      ];

    case 'if-else': {
      const then_ = op.thenBody.flatMap((o) => emitPinocchioOp(o, errorEnum)).map((l) => `    ${l}`);
      const else_ = op.elseBody?.flatMap((o) => emitPinocchioOp(o, errorEnum)).map((l) => `    ${l}`) ?? [];
      const result = [`if ${op.condition} {`, ...then_];
      if (else_.length) result.push('} else {', ...else_);
      result.push('}');
      return result;
    }

    case 'emit-event':
      return [
        `// emit! is not available in Pinocchio — log as msg instead`,
        `pinocchio::msg!("event:${op.event}");`,
      ];

    case 'return-error':
      return [`return Err(${errorEnum}::${op.errorCode}.into());`];

    case 'math': {
      const checked = op.checked;
      if (checked) {
        const opMap: Record<string, string> = {
          add: 'checked_add', sub: 'checked_sub',
          mul: 'checked_mul', div: 'checked_div', mod: 'checked_rem',
        };
        return [
          `let ${op.result} = ${op.left}.${opMap[op.operation] ?? 'checked_add'}(${op.right})`,
          `    .ok_or(ProgramError::ArithmeticOverflow)?;`,
        ];
      }
      const opSym: Record<string, string> = { add: '+', sub: '-', mul: '*', div: '/', mod: '%' };
      return [`let ${op.result} = ${op.left} ${opSym[op.operation] ?? '+'} ${op.right};`];
    }

    case 'cpi':
      return [
        `// CPI: ${op.targetProgram}::${op.instruction}`,
        `// TODO: build Pinocchio CPI for ${op.targetProgram}`,
      ];

    case 'custom-code':
      return op.code.split('\n');

    default:
      return [`// TODO: unimplemented op type`];
  }
}

function buildSignerSeeds(seeds: Seed[]): string[] {
  const parts = seeds.map((s) => {
    if (s.type === 'literal') return `b"${s.value}"`;
    if (s.type === 'pubkey')  return `${s.value}.key().as_ref()`;
    return s.value;
  });
  return [`&[${parts.join(', ')}]`];
}

// ─── src/state/<name>.rs — zero-copy layout ───────────────────────────────────

function generateStateRs(name: string, fields: Field[], discriminator: number[]): string {
  const DISC = 8;
  let offset = DISC;

  // Calculate field offsets and sizes
  const fieldMeta: Array<{ name: string; type: string; size: number; offset: number; comment: string }> = [];

  for (const f of fields) {
    const size = getTypeSize(f.type);
    const rustType = solanaTypeToRust(f.type);
    fieldMeta.push({
      name: f.name,
      type: rustType,
      size: size > 0 ? size : 0,
      offset,
      comment: f.description ?? '',
    });
    if (size > 0) offset += size;
  }

  const totalLen = offset;

  const layoutComment = fieldMeta.map((fm) =>
    `/// [${fm.offset}..${fm.offset + fm.size}] - ${fm.name}: ${fm.type} (${fm.size} bytes)`
  ).join('\n');

  const constOffsets = fieldMeta.map((fm) =>
    `    const ${fm.name.toUpperCase()}_OFFSET: usize = ${fm.offset};`
  ).join('\n');

  const accessors = fieldMeta.map((fm) => {
    if (fm.type === 'Pubkey') {
      return [
        `    /// Read ${fm.name} from raw account data`,
        `    #[inline(always)]`,
        `    pub fn ${fm.name}(data: &[u8]) -> &Pubkey {`,
        `        unsafe {`,
        `            &*(data[Self::${fm.name.toUpperCase()}_OFFSET..Self::${fm.name.toUpperCase()}_OFFSET + 32].as_ptr() as *const Pubkey)`,
        `        }`,
        `    }`,
        ``,
        `    /// Write ${fm.name} to raw account data`,
        `    #[inline(always)]`,
        `    pub fn set_${fm.name}(data: &mut [u8], value: &Pubkey) {`,
        `        data[Self::${fm.name.toUpperCase()}_OFFSET..Self::${fm.name.toUpperCase()}_OFFSET + 32]`,
        `            .copy_from_slice(value.as_ref());`,
        `    }`,
      ].join('\n');
    }
    if (fm.size > 0 && fm.size <= 16) {
      return [
        `    /// Read ${fm.name} from raw account data`,
        `    #[inline(always)]`,
        `    pub fn ${fm.name}(data: &[u8]) -> ${fm.type} {`,
        `        ${fm.type}::from_le_bytes(`,
        `            data[Self::${fm.name.toUpperCase()}_OFFSET..Self::${fm.name.toUpperCase()}_OFFSET + ${fm.size}]`,
        `                .try_into()`,
        `                .unwrap()`,
        `        )`,
        `    }`,
        ``,
        `    /// Write ${fm.name} to raw account data`,
        `    #[inline(always)]`,
        `    pub fn set_${fm.name}(data: &mut [u8], value: ${fm.type}) {`,
        `        data[Self::${fm.name.toUpperCase()}_OFFSET..Self::${fm.name.toUpperCase()}_OFFSET + ${fm.size}]`,
        `            .copy_from_slice(&value.to_le_bytes());`,
        `    }`,
      ].join('\n');
    }
    if (fm.type === 'bool') {
      return [
        `    #[inline(always)] pub fn ${fm.name}(data: &[u8]) -> bool { data[Self::${fm.name.toUpperCase()}_OFFSET] != 0 }`,
        `    #[inline(always)] pub fn set_${fm.name}(data: &mut [u8], v: bool) { data[Self::${fm.name.toUpperCase()}_OFFSET] = v as u8; }`,
      ].join('\n');
    }
    return `    // TODO: accessor for ${fm.name}: ${fm.type} (dynamic size)`;
  }).join('\n\n');

  const discArr = `[${discriminator.join(', ')}]`;

  return `use pinocchio::pubkey::Pubkey;

/// ${name} state account
///
/// Layout (${totalLen - DISC} bytes + 8 byte discriminator = ${totalLen} bytes):
/// [0..8]   - Discriminator
${layoutComment}
pub struct ${name};

impl ${name} {
    pub const LEN: usize = ${totalLen};
    pub const DISCRIMINATOR: [u8; 8] = ${discArr};

    // Field offsets (after 8-byte discriminator)
${constOffsets}

    /// Validate discriminator
    #[inline(always)]
    pub fn validate_discriminator(data: &[u8]) -> bool {
        data.len() >= 8 && data[0..8] == Self::DISCRIMINATOR
    }

${accessors}
}
`;
}

// ─── src/errors.rs ────────────────────────────────────────────────────────────

function generateErrorsRs(enumName: string, errors: ProgramIR['errors']): string {
  const variants = errors.map((e) => `    ${e.name} = ${e.code},`).join('\n');
  const messages = errors
    .map((e) => `            Self::${e.name} => "${e.message}",`)
    .join('\n');

  return `use pinocchio::program_error::ProgramError;

#[derive(Debug, Clone, Copy)]
pub enum ${enumName} {
${variants}
}

impl From<${enumName}> for ProgramError {
    fn from(e: ${enumName}) -> Self {
        ProgramError::Custom(e as u32)
    }
}

impl ${enumName} {
    pub fn message(&self) -> &str {
        match self {
${messages}
        }
    }
}
`;
}

// ─── src/events.rs ────────────────────────────────────────────────────────────

function generateEventsRs(events: ProgramIR['events']): string {
  const structs = events.map((e) => {
    const fields = e.fields
      .map((f) => `    pub ${f.name}: ${solanaTypeToRust(f.type)},`)
      .join('\n');
    return `/// ${e.name} event\n/// Logged via pinocchio::msg! as "event:${e.name}:{{borsh_encoded}}"\npub struct ${e.name} {\n${fields}\n}`;
  }).join('\n\n');
  return `use pinocchio::pubkey::Pubkey;\n\n${structs}\n`;
}

// ─── src/constants.rs ─────────────────────────────────────────────────────────

function generateConstantsRs(constants: ProgramIR['constants']): string {
  return constants
    .map((c) => `pub const ${c.name}: ${solanaTypeToRust(c.type)} = ${c.value};`)
    .join('\n') + '\n';
}

// ─── src/utils.rs ─────────────────────────────────────────────────────────────

function generateUtilsRs(): string {
  return `use pinocchio::{program_error::ProgramError, pubkey::Pubkey};

/// Verify a PDA and return its bump
pub fn verify_pda(
    expected: &Pubkey,
    seeds: &[&[u8]],
    program_id: &Pubkey,
) -> Result<u8, ProgramError> {
    let (derived, bump) = Pubkey::find_program_address(seeds, program_id);
    if &derived != expected {
        return Err(ProgramError::InvalidSeeds);
    }
    Ok(bump)
}
`;
}
