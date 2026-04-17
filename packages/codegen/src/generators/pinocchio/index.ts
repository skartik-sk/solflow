// Pinocchio v0.11 code generator — IR → Pinocchio Rust source files.
//
// Pinocchio programs are no_std, zero-dependency, compute-optimized Solana programs.
// Key concepts (v0.11 API):
//  - #![no_std] with entrypoint! macro (sets up allocator + panic handler)
//  - AccountView (zero-copy account access, replaces AccountInfo)
//  - Address (32-byte program/address type, replaces Pubkey)
//  - error::ProgramError for error handling
//  - Manual discriminator-based instruction dispatch
//  - Zero-copy state access via byte offsets
//  - Explicit signer/writable checks on AccountView
//  - CPI via pinocchio::cpi module (Signer + Seed for PDA signing)
//  - pinocchio-system for system program CPI (Transfer, CreateAccount, etc.)
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

// ─── Pinocchio-specific type mapping ──────────────────────────────────────────
// Pinocchio v0.11 uses different type names than Anchor/standard Solana SDK.

function pinocchioType(type: string | object): string {
  const rust = solanaTypeToRust(type as any);
  // Pinocchio v0.11 uses Address instead of Pubkey
  if (rust === 'Pubkey') return 'Address';
  return rust;
}

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
  const programId   = ir.program.programId; // base58 public key (may be undefined)

  // Determine if any instruction uses CPI operations
  const usesCpi = ir.instructions.some((ix) =>
    ix.body.some((op) =>
      op.type === 'transfer-sol' ||
      op.type === 'transfer-token' ||
      op.type === 'mint-to' ||
      op.type === 'burn' ||
      op.type === 'cpi'
    )
  );

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

  // Precompute discriminators (deterministic index-based)
  const discriminators = new Map<string, number[]>();
  for (let i = 0; i < instructions.length; i++) {
    discriminators.set(instructions[i].name, pinocchioDiscriminator(i));
  }

  // ── Cargo.toml ─────────────────────────────────────────────────────────────
  files.push({
    path: `programs/${programName}/Cargo.toml`,
    content: generateCargoToml(programName, version, usesCpi, usesSpl),
    language: 'toml',
  });

  // ── src/lib.rs ─────────────────────────────────────────────────────────────
  files.push({
    path: `programs/${programName}/src/lib.rs`,
    content: generateLibRs(programName, programId, instructions, states, errors_, events, discriminators, ir.constants),
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
      content: states.map((s) => `pub mod ${s.name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')};`).join('\n') + '\n',
      language: 'rust',
    });
    for (let si = 0; si < states.length; si++) {
      const state = states[si];
      const disc = pinocchioDiscriminator(si + 1000); // Offset to avoid collision with instruction discriminators
      files.push({
        path: `programs/${programName}/src/state/${state.name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')}.rs`,
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
  // Only generate utils.rs when PDA seeds are actually used
  const usesPda = ir.instructions.some((ix) =>
    ix.accounts.some((a) =>
      a.constraints.some((c) => c.type === 'seeds')
    )
  );
  if (usesPda) {
    files.push({
      path: `programs/${programName}/src/utils.rs`,
      content: generateUtilsRs(),
      language: 'rust',
    });
  }

  return { files, warnings, errors };
}

// ─── Discriminator ─────────────────────────────────────────────────────────────

function pinocchioDiscriminator(index: number): number[] {
  // Pinocchio programs define their own discriminators (no Anchor dependency).
  // We use the index encoded as 8-byte little-endian. Deterministic and unique.
  return [
    index & 0xff,
    (index >> 8) & 0xff,
    (index >> 16) & 0xff,
    (index >> 24) & 0xff,
    0, 0, 0, 0,
  ];
}

function formatDiscriminator(disc: number[]): string {
  return `[${disc.join(', ')}]`;
}

// ─── Cargo.toml ───────────────────────────────────────────────────────────────

function generateCargoToml(name: string, version: string, usesCpi: boolean, usesSpl: boolean): string {
  const kebab = toKebabCase(name);

  // pinocchio-system is needed for system program CPI (Transfer, CreateAccount, etc.)
  const systemDep = usesCpi
    ? '\npinocchio-system = "0.6"'
    : '';

  // pinocchio-token is needed for SPL token operations
  const tokenDep = usesSpl
    ? '\npinocchio-token = "0.4"'
    : '';

  // pinocchio with cpi feature if needed
  const pinocchioDep = usesCpi
    ? 'pinocchio = { version = "0.11", features = ["cpi"] }'
    : 'pinocchio = "0.11"';

  return `[package]
name = "${kebab}"
version = "${version}"
description = "Created with SolStudio (Pinocchio)"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "${name}"

[features]
no-entrypoint = []
default = []

[dependencies]
${pinocchioDep}
solana-address = { version = "2.0", features = ["decode"] }${systemDep}${tokenDep}

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
  programId: string | undefined,
  instructions: Instruction[],
  states: ProgramIR['states'],
  errors: ProgramIR['errors'],
  events: ProgramIR['events'],
  discriminators: Map<string, number[]>,
  constants: ProgramIR['constants'],
): string {
  const mods: string[] = ['instructions'];
  if (states.length > 0) mods.push('state');
  if (errors.length > 0) mods.push('errors');
  if (events.length > 0) mods.push('events');
  if (constants.length > 0) mods.push('constants');
  // Only include utils if PDA seeds are used
  const usesPda = instructions.some((ix) =>
    ix.accounts.some((a) =>
      a.constraints.some((c) => c.type === 'seeds')
    )
  );
  if (usesPda) mods.push('utils');

  const modLines = mods.map((m) => `pub mod ${m};`).join('\n');

  // Use programId from IR (same pattern as Anchor codegen)
  const idLine = programId
    ? `solana_address::declare_id!("${programId}");`
    : 'solana_address::declare_id!("11111111111111111111111111111112");';

  const matchArms = instructions.map((ix) => {
    const disc = formatDiscriminator(discriminators.get(ix.name) ?? [0,0,0,0,0,0,0,0]);
    return `        ${disc} => {\n            instructions::${ix.name}::process(program_id, accounts, data)\n        }`;
  }).join('\n');

  return `#![no_std]

use pinocchio::{
    AccountView,
    Address,
    error::ProgramError,
    ProgramResult,
};

${modLines}

${idLine}

pinocchio::program_entrypoint!(process_instruction);
pinocchio::default_allocator!();
pinocchio::nostd_panic_handler!();

pub fn process_instruction(
    program_id: &Address,
    accounts: &mut [AccountView],
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
  const validationLines = buildValidationChecks(ix.accounts, errorEnum);

  // Parse instruction args
  const argParseLines = buildArgParsing(ix.args);
  const hasArgs = ix.args.length > 0;

  // Build body — pass account→stateType mapping so set-field uses correct struct names
  const accountToStateType = new Map<string, string>();
  for (const a of ix.accounts) {
    if (a.stateType) accountToStateType.set(a.name, a.stateType);
  }
  const bodyLines = buildInstructionBody(ix, ir.program.name, accountToStateType);

  // State imports — only import states actually referenced in the body
  const usedStates = new Set<string>();
  for (const op of ix.body) {
    collectUsedStates(op, accountToStateType, usedStates);
  }

  const imports: string[] = [
    'use pinocchio::{',
    '    AccountView,',
    '    Address,',
    '    ProgramResult,',
    '    error::ProgramError,',
    '};',
  ];
  for (const s of [...usedStates].sort()) {
    const snakeModule = s.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
    imports.push(`use crate::state::${snakeModule}::${s};`);
  }
  if (hasErrors) {
    imports.push(`use crate::errors::${errorEnum};`);
  }

  const content = `${imports.join('\n')}

pub fn process(
    program_id: &Address,
    accounts: &mut [AccountView],
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

function buildValidationChecks(accounts: Account[], errorEnum: string): string {
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
      if (c.type === 'seeds') {
        const seedParts = c.seeds.map((s) => {
          if (s.type === 'literal') return `b"${s.value}" as &[u8]`;
          if (s.type === 'pubkey' || s.type === 'account-field') return `${s.value}.address().as_ref()`;
          return `${s.value}.as_ref()`;
        });
        // Include bump seed if specified
        if (c.bump) {
          // Bump can be a literal, account field, or instruction arg
          if (/^\d+$/.test(c.bump)) {
            seedParts.push(`b"${c.bump}" as &[u8]`);
          } else {
            seedParts.push(`&[${c.bump}][..]`);
          }
        }
        lines.push(`    // Validate ${a.name} is a valid PDA`);
        lines.push(`    crate::utils::verify_pda(`);
        lines.push(`        ${a.name}.address(),`);
        lines.push(`        &[${seedParts.join(', ')}],`);
        lines.push(`        program_id,`);
        lines.push(`    )?;`);
      }
      if (c.type === 'has-one') {
        lines.push(`    // Validate ${a.name}.${c.field} == ${c.target}`);
        lines.push(`    {`);
        lines.push(`        let data = ${a.name}.try_borrow_data()?;`);
        lines.push(`        let stored = &data[32..64]; // field offset depends on account layout`);
        lines.push(`        if stored != ${c.target}.address().as_ref() {`);
        lines.push(`            return Err(ProgramError::InvalidAccountData);`);
        lines.push(`        }`);
        lines.push(`    }`);
      }
      if (c.type === 'owner') {
        lines.push(`    // Validate ${a.name} owner is ${c.owner}`);
        lines.push(`    if ${a.name}.owner() != ${c.owner}.address() {`);
        lines.push(`        return Err(ProgramError::IncorrectProgramId);`);
        lines.push(`    }`);
      }
      if (c.type === 'address') {
        lines.push(`    // Validate ${a.name} address matches ${c.address}`);
        lines.push(`    if ${a.name}.address() != &Address::from_str("${c.address}").unwrap() {`);
        lines.push(`        return Err(ProgramError::InvalidArgument);`);
        lines.push(`    }`);
      }
      if (c.type === 'close') {
        lines.push(`    // Close ${a.name}: transfer all lamports to ${c.target}`);
        lines.push(`    {`);
        lines.push(`        let target_lamports = ${c.target}.lamports();`);
        lines.push(`        let src_lamports = ${a.name}.lamports();`);
        lines.push(`        **${c.target}.lamports.borrow_mut() = target_lamports.checked_add(src_lamports).ok_or(ProgramError::ArithmeticOverflow)?;`);
        lines.push(`        **${a.name}.lamports.borrow_mut() = 0;`);
        lines.push(`    }`);
      }
      if (c.type === 'token-authority' || c.type === 'token-mint') {
        lines.push(`    // Token validation for ${a.name}: ${c.type}`);
        lines.push(`    {`);
        lines.push(`        let data = ${a.name}.try_borrow_data()?;`);
        if (c.type === 'token-authority') {
          lines.push(`        // Token account owner field is at offset 32`);
          lines.push(`        let owner = &data[32..64];`);
          lines.push(`        if owner != ${c.authority}.address().as_ref() {`);
          lines.push(`            return Err(ProgramError::InvalidAccountData);`);
          lines.push(`        }`);
        } else {
          lines.push(`        // Token account mint field is at offset 0`);
          lines.push(`        let mint = &data[0..32];`);
          lines.push(`        if mint != ${c.mint}.address().as_ref() {`);
          lines.push(`            return Err(ProgramError::InvalidAccountData);`);
          lines.push(`        }`);
        }
        lines.push(`    }`);
      }
      if (c.type === 'mint-authority' || c.type === 'mint-decimals') {
        lines.push(`    // Mint validation for ${a.name}: ${c.type}`);
        lines.push(`    {`);
        lines.push(`        let data = ${a.name}.try_borrow_data()?;`);
        if (c.type === 'mint-authority') {
          lines.push(`        // Mint authority field is at offset 0..32`);
          lines.push(`        let authority = &data[0..32];`);
          lines.push(`        if authority != ${c.authority}.address().as_ref() {`);
          lines.push(`            return Err(ProgramError::InvalidAccountData);`);
          lines.push(`        }`);
        } else {
          lines.push(`        // Mint decimals is at offset 44 (u8)`);
          lines.push(`        let decimals = data[44];`);
          lines.push(`        if decimals != ${c.decimals} {`);
          lines.push(`            return Err(ProgramError::InvalidAccountData);`);
          lines.push(`        }`);
        }
        lines.push(`    }`);
      }
      if (c.type === 'init' || c.type === 'init-if-needed') {
        lines.push(`    // Create account ${a.name} via system program`);
        lines.push(`    {`);
        lines.push(`        use pinocchio_system::instructions::CreateAccount;`);
        const spaceStr = c.space === 'auto' ? '0' : String(c.space);
        lines.push(`        CreateAccount {`);
        lines.push(`            payer: ${c.payer},`);
        lines.push(`            new_account: ${a.name},`);
        lines.push(`            lamports: 0, // rent exempt minimum calculated at runtime`);
        lines.push(`            space: ${spaceStr} as u64,`);
        lines.push(`            owner: program_id,`);
        lines.push(`        }`);
        lines.push(`        .invoke()?;`);
        lines.push(`    }`);
      }
      if (c.type === 'realloc') {
        lines.push(`    // Realloc ${a.name} to ${c.space} bytes`);
        lines.push(`    {`);
        lines.push(`        let new_len = ${c.space};`);
        lines.push(`        let data = &mut ${a.name}.try_borrow_mut_data()?;`);
        lines.push(`        data.resize(new_len, ${c.zeroInit ? 'true' : 'false'});`);
        lines.push(`    }`);
      }
      if (c.type === 'custom') {
        const errCode = c.errorCode ? `${errorEnum}::${c.errorCode}` : 'ProgramError::Custom(0)';
        lines.push(`    // Custom constraint`);
        lines.push(`    if !(${c.expression}) {`);
        lines.push(`        return Err(${errCode}.into());`);
        lines.push(`    }`);
      }
      if (c.type === 'associated-token-authority') {
        lines.push(`    // Validate associated token authority for ${a.name}`);
        lines.push(`    {`);
        lines.push(`        let data = ${a.name}.try_borrow_data()?;`);
        lines.push(`        let owner = &data[32..64];`);
        lines.push(`        if owner != ${c.authority}.address().as_ref() {`);
        lines.push(`            return Err(ProgramError::InvalidAccountData);`);
        lines.push(`        }`);
        lines.push(`    }`);
      }
      if (c.type === 'associated-token-mint') {
        lines.push(`    // Validate associated token mint for ${a.name}`);
        lines.push(`    {`);
        lines.push(`        let data = ${a.name}.try_borrow_data()?;`);
        lines.push(`        let mint = &data[0..32];`);
        lines.push(`        if mint != ${c.mint}.address().as_ref() {`);
        lines.push(`            return Err(ProgramError::InvalidAccountData);`);
        lines.push(`        }`);
        lines.push(`    }`);
      }
      if (c.type === 'safety-comment') {
        lines.push(`    // Safety: ${c.comment}`);
      }
    }
  }

  return lines.length > 0 ? lines.join('\n') + '\n' : '';
}

// ─── Arg parsing ─────────────────────────────────────────────────────────────

function buildArgParsing(args: Instruction['args']): string {
  const lines: string[] = [`    // Parse instruction arguments`];

  // Calculate total fixed size needed for upfront bounds check
  let totalFixedSize = 0;
  let hasDynamic = false;
  for (const arg of args) {
    const size = getTypeSize(arg.type);
    if (size > 0) {
      if (!hasDynamic) totalFixedSize += size;
    } else {
      hasDynamic = true;
    }
  }

  if (totalFixedSize > 0 && !hasDynamic) {
    lines.push(`    if data.len() < ${totalFixedSize} {`);
    lines.push(`        return Err(ProgramError::InvalidInstructionData);`);
    lines.push(`    }`);
  }

  let offset = 0;
  let dynamicVarName = ''; // Track the variable holding end of last dynamic arg

  for (const arg of args) {
    const size = getTypeSize(arg.type);
    const rustType = pinocchioType(arg.type);

    if (size > 0) {
      if (offset === -1) {
        // After a dynamic arg, use the tracked variable to calculate offset
        lines.push(`    let ${arg.name}_start = ${dynamicVarName};`);
        lines.push(`    let ${arg.name} = ${rustType}::from_le_bytes(`);
        lines.push(`        data[${arg.name}_start..${arg.name}_start + ${size}].try_into().map_err(|_| ProgramError::InvalidInstructionData)?`);
        lines.push(`    );`);
        dynamicVarName = `${arg.name}_start + ${size}`;
        offset = -1; // Keep tracking as dynamic
        continue;
      }
      // Fixed-size types
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
      } else if (rustType === 'Address') {
        lines.push(`    let ${arg.name}: &Address = unsafe {`);
        lines.push(`        &*(data[${offset}..${offset + 32}].as_ptr() as *const Address)`);
        lines.push(`    };`);
      } else if (rustType === 'f32' || rustType === 'f64') {
        lines.push(`    let ${arg.name} = ${rustType}::from_le_bytes(`);
        lines.push(`        data[${offset}..${offset + size}].try_into().map_err(|_| ProgramError::InvalidInstructionData)?`);
        lines.push(`    );`);
      } else {
        // Fixed-size unknown — try from_le_bytes for numeric-like types
        lines.push(`    let ${arg.name}_bytes = &data[${offset}..${offset + size}];`);
        lines.push(`    // TODO: deserialize ${arg.name}: ${rustType} from ${size} bytes`);
      }
      offset += size;
    } else {
      // Dynamic-size types
      if (typeof arg.type === 'string' && arg.type === 'String') {
        const startOffset = offset === -1 ? dynamicVarName : String(offset);
        const lenOffset = offset === -1 ? `${dynamicVarName}` : String(offset);
        lines.push(`    let ${arg.name}_len = u32::from_le_bytes(`);
        lines.push(`        data[${lenOffset}..${lenOffset} + 4].try_into().map_err(|_| ProgramError::InvalidInstructionData)?`);
        lines.push(`    ) as usize;`);
        lines.push(`    let ${arg.name}_start = ${lenOffset} + 4;`);
        lines.push(`    let ${arg.name}_end = ${arg.name}_start + ${arg.name}_len;`);
        lines.push(`    let ${arg.name} = core::str::from_utf8(`);
        lines.push(`        &data[${arg.name}_start..${arg.name}_end]`);
        lines.push(`    ).map_err(|_| ProgramError::InvalidInstructionData)?;`);
        dynamicVarName = `${arg.name}_end`;
        offset = -1;
      } else if (typeof arg.type === 'object' && 'vec' in (arg.type as object)) {
        const lenOffset = offset === -1 ? dynamicVarName : String(offset);
        lines.push(`    let ${arg.name}_len = u32::from_le_bytes(`);
        lines.push(`        data[${lenOffset}..${lenOffset} + 4].try_into().map_err(|_| ProgramError::InvalidInstructionData)?`);
        lines.push(`    ) as usize;`);
        lines.push(`    let ${arg.name}_start = ${lenOffset} + 4;`);
        lines.push(`    let ${arg.name}_end = ${arg.name}_start + ${arg.name}_len;`);
        lines.push(`    let ${arg.name}_data = &data[${arg.name}_start..${arg.name}_end];`);
        dynamicVarName = `${arg.name}_end`;
        offset = -1;
      } else if (typeof arg.type === 'object' && 'option' in (arg.type as object)) {
        const innerType = (arg.type as { option: unknown }).option as import("@solflow/ir").SolanaType;
        const innerSize = getTypeSize(innerType);
        if (innerSize > 0) {
          const innerRust = pinocchioType(innerType);
          const optOffset = offset >= 0 ? String(offset) : dynamicVarName;
          lines.push(`    let ${arg.name} = match data[${optOffset}] {`);
          lines.push(`        0 => None,`);
          lines.push(`        1 => {`);
          lines.push(`            Some(${innerRust}::from_le_bytes(`);
          lines.push(`                data[${optOffset} + 1..${optOffset} + 1 + ${innerSize}].try_into().map_err(|_| ProgramError::InvalidInstructionData)?`);
          lines.push(`            ))`);
          lines.push(`        }`);
          lines.push(`        _ => return Err(ProgramError::InvalidInstructionData),`);
          lines.push(`    };`);
          if (offset >= 0) {
            offset += 1 + innerSize;
          } else {
            dynamicVarName = `${optOffset} + 1 + ${innerSize}`;
          }
        } else {
          lines.push(`    // TODO: deserialize ${arg.name}: Option<${rustType}> — inner type is dynamic`);
          offset = -1;
        }
      } else {
        lines.push(`    // WARNING: dynamic-length arg '${arg.name}': ${rustType} — manual deserialization needed`);
        offset = -1;
      }
    }
  }

  return lines.join('\n');
}

// ─── Instruction body ─────────────────────────────────────────────────────────

function buildInstructionBody(ix: Instruction, programName: string, accountToStateType: Map<string, string>): string[] {
  const lines: string[] = [];
  const errorEnum = toPascalCase(programName) + 'Error';

  for (const op of ix.body) {
    lines.push(...emitPinocchioOp(op, errorEnum, accountToStateType));
  }

  return lines;
}

function emitPinocchioOp(op: LogicOperation, errorEnum: string, accountToStateType?: Map<string, string>): string[] {
  switch (op.type) {
    case 'set-field': {
      const stateStruct = accountToStateType?.get(op.account) ?? toPascalCase(op.account);
      return [
        `// Set ${op.account}.${op.field} = ${op.value}`,
        `{`,
        `    let data = &mut ${op.account}.try_borrow_mut_data()?;`,
        `    ${stateStruct}::set_${op.field}(data, ${op.value});`,
        `}`,
      ];
    }

    case 'transfer-sol': {
      // Use pinocchio_system for type-safe system program CPI
      return [
        `{`,
        `    use pinocchio_system::instructions::Transfer;`,
        `    Transfer {`,
        `        from: ${op.from},`,
        `        to: ${op.to},`,
        `        lamports: ${op.amount},`,
        `    }`,
        `    .invoke()?;`,
        `}`,
      ];
    }

    case 'transfer-token': {
      const seedsCode = op.signerSeeds ? buildSignerSeeds(op.signerSeeds) : null;
      if (seedsCode) {
        return [
          `{`,
          `    use pinocchio_token::instructions::Transfer as TokenTransfer;`,
          `    use pinocchio::cpi::{Signer, Seed};`,
          `    let seeds: [Seed; ${op.signerSeeds!.length}] = ${seedsCode};`,
          `    let signer = Signer::from(&seeds);`,
          `    TokenTransfer {`,
          `        from: ${op.from},`,
          `        to: ${op.to},`,
          `        authority: ${op.authority},`,
          `        amount: ${op.amount},`,
          `    }`,
          `    .invoke_signed(&[signer])?;`,
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
        `        amount: ${op.amount},`,
        `    }`,
        `    .invoke()?;`,
        `}`,
      ];
    }

    case 'mint-to': {
      const seedsCode = op.signerSeeds ? buildSignerSeeds(op.signerSeeds) : null;
      if (seedsCode) {
        return [
          `{`,
          `    use pinocchio_token::instructions::MintTo;`,
          `    use pinocchio::cpi::{Signer, Seed};`,
          `    let seeds: [Seed; ${op.signerSeeds!.length}] = ${seedsCode};`,
          `    let signer = Signer::from(&seeds);`,
          `    MintTo {`,
          `        mint: ${op.mint},`,
          `        account: ${op.to},`,
          `        mint_authority: ${op.authority},`,
          `        amount: ${op.amount},`,
          `    }`,
          `    .invoke_signed(&[signer])?;`,
          `}`,
        ];
      }
      return [
        `{`,
        `    use pinocchio_token::instructions::MintTo;`,
        `    MintTo {`,
        `        mint: ${op.mint},`,
        `        account: ${op.to},`,
        `        mint_authority: ${op.authority},`,
        `        amount: ${op.amount},`,
        `    }`,
        `    .invoke()?;`,
        `}`,
      ];
    }

    case 'burn': {
      const seedsCode = op.signerSeeds ? buildSignerSeeds(op.signerSeeds) : null;
      if (seedsCode) {
        return [
          `{`,
          `    use pinocchio_token::instructions::Burn;`,
          `    use pinocchio::cpi::{Signer, Seed};`,
          `    let seeds: [Seed; ${op.signerSeeds!.length}] = ${seedsCode};`,
          `    let signer = Signer::from(&seeds);`,
          `    Burn {`,
          `        account: ${op.from},`,
          `        mint: ${op.mint},`,
          `        authority: ${op.authority},`,
          `        amount: ${op.amount},`,
          `    }`,
          `    .invoke_signed(&[signer])?;`,
          `}`,
        ];
      }
      return [
        `{`,
        `    use pinocchio_token::instructions::Burn;`,
        `    Burn {`,
        `        account: ${op.from},`,
        `        mint: ${op.mint},`,
        `        authority: ${op.authority},`,
        `        amount: ${op.amount},`,
        `    }`,
        `    .invoke()?;`,
        `}`,
      ];
    }

    case 'require':
      return [
        `if !(${op.condition}) {`,
        `    return Err(${errorEnum}::${op.errorCode}.into());`,
        `}`,
      ];

    case 'if-else': {
      const then_ = op.thenBody.flatMap((o) => emitPinocchioOp(o, errorEnum, accountToStateType)).map((l) => `    ${l}`);
      const else_ = op.elseBody?.flatMap((o) => emitPinocchioOp(o, errorEnum, accountToStateType)).map((l) => `    ${l}`) ?? [];
      const result = [`if ${op.condition} {`, ...then_];
      if (else_.length) result.push('} else {', ...else_);
      result.push('}');
      return result;
    }

    case 'emit-event': {
      // Pinocchio uses sol_log_data for event emission
      const fieldEntries = Object.entries(op.fields);
      const serializeLines = fieldEntries.map(([k, v]) =>
        `        // ${k}: ${v}`
      );
      return [
        `// Event: ${op.event}`,
        `{`,
        `    // Event emission via sol_log_data`,
        `    // Fields: ${fieldEntries.map(([k]) => k).join(', ')}`,
        ...serializeLines,
        `    pinocchio::log::sol_log_data(&[&[]]);`,
        `}`,
      ];
    }

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

    case 'cpi': {
      const prog = op.targetProgram;
      const ix = op.instruction;
      const hasSignerSeeds = op.signerSeeds && op.signerSeeds.length > 0;
      const accountArgs = op.accounts
        .map((a) => `            ${a.to}: ${a.from},`)
        .join('\n');
      const dataFields = op.data.map((d) => d.value).join(', ');

      const lines: string[] = [
        `// CPI: ${prog}::${ix}`,
        `{`,
        `    let cpi_program = ${prog};`,
      ];

      if (hasSignerSeeds) {
        const seedParts = op.signerSeeds!.map((s) => {
          if (s.type === 'literal') return `Seed::from(b"${s.value}" as &[u8])`;
          if (s.type === 'pubkey') return `Seed::from(${s.value}.address().as_ref())`;
          return `Seed::from(${s.value}.as_ref())`;
        });
        lines.push(`    use pinocchio::cpi::{Signer, Seed};`);
        lines.push(`    let seeds: [Seed; ${op.signerSeeds!.length}] = [${seedParts.join(', ')}];`);
        lines.push(`    let signer = Signer::from(&seeds);`);
      }

      lines.push(
        `    // Build instruction data`,
        `    let ix_data = [${dataFields || '0u8; 0'}];`,
        `    // CPI invocation — adapt to target program's instruction layout`,
        `    // pinocchio::cpi::invoke_signed(&instruction, &[...accounts...], &[signer])?;`,
        `}`,
      );
      return lines;
    }

    case 'custom-code':
      return op.code.split('\n');

    default:
      return [`// WARNING: unimplemented logic operation type — add a handler in codegen`];
  }
}

/// Collect state struct names actually used in instruction body ops
function collectUsedStates(op: LogicOperation, accountToStateType: Map<string, string>, out: Set<string>): void {
  if (op.type === 'set-field') {
    const stateType = accountToStateType.get(op.account);
    if (stateType) out.add(stateType);
  }
  if (op.type === 'if-else') {
    for (const o of op.thenBody) collectUsedStates(o, accountToStateType, out);
    for (const o of (op.elseBody ?? [])) collectUsedStates(o, accountToStateType, out);
  }
}

/// Build Pinocchio v0.11 Seed array for PDA signing
function buildSignerSeeds(seeds: Seed[]): string {
  const parts = seeds.map((s) => {
    if (s.type === 'literal') return `Seed::from(b"${s.value}" as &[u8])`;
    if (s.type === 'pubkey')  return `Seed::from(${s.value}.address().as_ref())`;
    return `Seed::from(${s.value}.as_ref())`;
  });
  return `[${parts.join(', ')}]`;
}

// ─── src/state/<name>.rs — zero-copy layout ───────────────────────────────────

function generateStateRs(name: string, fields: Field[], discriminator: number[]): string {
  const DISC = 8;
  let offset = DISC;

  // Calculate field offsets and sizes
  const fieldMeta: Array<{ name: string; type: string; size: number; offset: number; comment: string }> = [];

  for (const f of fields) {
    const size = getTypeSize(f.type);
    const rustType = pinocchioType(f.type);
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
    `/// [${fm.offset}..${fm.offset + fm.size}] - ${fm.name}: ${fm.type} (${fm.size} bytes)${fm.comment ? ` — ${fm.comment}` : ''}`
  ).join('\n');

  const constOffsets = fieldMeta.map((fm) =>
    `    const ${fm.name.toUpperCase()}_OFFSET: usize = ${fm.offset};`
  ).join('\n');

  const accessors = fieldMeta.map((fm) => {
    if (fm.type === 'Address') {
      return [
        `    /// Read ${fm.name} from raw account data`,
        `    #[inline(always)]`,
        `    pub fn ${fm.name}(data: &[u8]) -> &Address {`,
        `        unsafe {`,
        `            &*(data[Self::${fm.name.toUpperCase()}_OFFSET..Self::${fm.name.toUpperCase()}_OFFSET + 32].as_ptr() as *const Address)`,
        `        }`,
        `    }`,
        ``,
        `    /// Write ${fm.name} to raw account data`,
        `    #[inline(always)]`,
        `    pub fn set_${fm.name}(data: &mut [u8], value: &Address) {`,
        `        data[Self::${fm.name.toUpperCase()}_OFFSET..Self::${fm.name.toUpperCase()}_OFFSET + 32]`,
        `            .copy_from_slice(value.as_ref());`,
        `    }`,
      ].join('\n');
    }
    // Handle Option<T> where T is a fixed-size primitive
    if (fm.type.startsWith('Option<') && fm.size > 0) {
      const innerMatch = fm.type.match(/^Option<(.+)>$/);
      if (innerMatch) {
        const innerType = innerMatch[1];
        const innerSize = fm.size - 1; // 1 byte discriminant + inner
        return [
          `    /// Read ${fm.name} from raw account data`,
          `    #[inline(always)]`,
          `    pub fn ${fm.name}(data: &[u8]) -> ${fm.type} {`,
          `        match data[Self::${fm.name.toUpperCase()}_OFFSET] {`,
          `            0 => None,`,
          `            1 => Some(${innerType}::from_le_bytes(`,
          `                data[Self::${fm.name.toUpperCase()}_OFFSET + 1..Self::${fm.name.toUpperCase()}_OFFSET + 1 + ${innerSize}]`,
          `                    .try_into().unwrap()`,
          `            )),`,
          `            _ => None,`,
          `        }`,
          `    }`,
          ``,
          `    /// Write ${fm.name} to raw account data`,
          `    #[inline(always)]`,
          `    pub fn set_${fm.name}(data: &mut [u8], value: ${fm.type}) {`,
          `        match value {`,
          `            Some(v) => {`,
          `                data[Self::${fm.name.toUpperCase()}_OFFSET] = 1;`,
          `                data[Self::${fm.name.toUpperCase()}_OFFSET + 1..Self::${fm.name.toUpperCase()}_OFFSET + 1 + ${innerSize}]`,
          `                    .copy_from_slice(&v.to_le_bytes());`,
          `            }`,
          `            None => {`,
          `                data[Self::${fm.name.toUpperCase()}_OFFSET] = 0;`,
          `            }`,
          `        }`,
          `    }`,
        ].join('\n');
      }
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
    return [
      `    /// Read ${fm.name} from raw account data (dynamic size — length-prefixed)`,
      `    #[inline(always)]`,
      `    pub fn ${fm.name}_len(data: &[u8]) -> usize {`,
      `        u32::from_le_bytes(data[Self::${fm.name.toUpperCase()}_OFFSET..Self::${fm.name.toUpperCase()}_OFFSET + 4].try_into().unwrap()) as usize`,
      `    }`,
      ``,
      `    /// Read ${fm.name} slice from raw account data`,
      `    #[inline(always)]`,
      `    pub fn ${fm.name}_data(data: &[u8]) -> &[u8] {`,
      `        let len = Self::${fm.name}_len(data);`,
      `        &data[Self::${fm.name.toUpperCase()}_OFFSET + 4..Self::${fm.name.toUpperCase()}_OFFSET + 4 + len]`,
      `    }`,
      ``,
      `    /// Write ${fm.name} to raw account data`,
      `    #[inline(always)]`,
      `    pub fn set_${fm.name}(data: &mut [u8], value: &[u8]) {`,
      `        let len = value.len() as u32;`,
      `        data[Self::${fm.name.toUpperCase()}_OFFSET..Self::${fm.name.toUpperCase()}_OFFSET + 4]`,
      `            .copy_from_slice(&len.to_le_bytes());`,
      `        data[Self::${fm.name.toUpperCase()}_OFFSET + 4..Self::${fm.name.toUpperCase()}_OFFSET + 4 + value.len()]`,
      `            .copy_from_slice(value);`,
      `    }`,
    ].join('\n');
  }).join('\n\n');

  const discArr = `[${discriminator.join(', ')}]`;

  return `use pinocchio::Address;

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

  return `use pinocchio::error::ProgramError;

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
      .map((f) => `    pub ${f.name}: ${pinocchioType(f.type)},`)
      .join('\n');
    return `/// ${e.name} event\n/// NOTE: Pinocchio events must be serialized and emitted via sol_log_data\n#[allow(dead_code)]\npub struct ${e.name} {\n${fields}\n}`;
  }).join('\n\n');
  return `use pinocchio::Address;\n\n${structs}\n`;
}

// ─── src/constants.rs ─────────────────────────────────────────────────────────

function generateConstantsRs(constants: ProgramIR['constants']): string {
  return constants
    .map((c) => `pub const ${c.name}: ${pinocchioType(c.type)} = ${c.value};`)
    .join('\n') + '\n';
}

// ─── src/utils.rs ─────────────────────────────────────────────────────────────

function generateUtilsRs(): string {
  return `use pinocchio::{Address, error::ProgramError};

/// Verify that an address is a valid PDA derived from the given seeds and program_id.
///
/// The bump seed should be included in the seeds array.
/// Uses Address::create_program_address which is available when pinocchio's
/// default features are enabled (includes sha2).
#[inline(always)]
pub fn verify_pda(
    expected: &Address,
    seeds: &[&[u8]],
    program_id: &Address,
) -> Result<(), ProgramError> {
    match Address::create_program_address(seeds, program_id) {
        Ok(derived) if &derived == expected => Ok(()),
        _ => Err(ProgramError::InvalidSeeds),
    }
}
`;
}
