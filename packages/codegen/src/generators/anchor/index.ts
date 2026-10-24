// Anchor code generator — IR → Anchor Rust source files.
// Uses @solflow/anchor-templates for Handlebars rendering (server/Node.js context)
// and falls back to inline string building when fs is unavailable (browser).

import { errorRef } from "../../utils/error-ref";
import { addMissingCrateImports } from "../../utils/crate-imports";
import { isExternalType, METADATA_TYPES, usesMetadata } from "../../utils/external-accounts";
import { solTransferKind, splitSignerSeeds } from "../../utils/signer-seeds";
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
  ) || ir.integrations.some((integration) =>
    integration.pluginId === "spl-token" || integration.pluginId === "metaplex"
  ) || usesMetadata(ir);

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
    content: generateCargoToml(programName, version, usesSpl, ir.integrations, usesMetadata(ir)),
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
      ir.constants,
    ),
    language: "rust",
  });

  // ── src/instructions/mod.rs ────────────────────────────────────────────────
  files.push({
    path: `programs/${programName}/src/instructions/mod.rs`,
    content: generateInstructionsModRs(instructions.map((ix) => ix.name)),
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
        content: generateStateRs(state.name, state.fields, state.isZeroCopy, state.customDiscriminator),
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
  const spl = usesSpl
    ? metadata
      ? '\nanchor-spl = { version = "0.32.1", features = ["metadata"] }'
      : '\nanchor-spl = "0.32.1"'
    : "";
  const hasPyth = integrations.some((integration) => integration.pluginId === "pyth");
  const pyth = hasPyth ? '\npyth-solana-receiver-sdk = "0.3"' : "";
  const hasMetaplex = integrations.some((integration) => integration.pluginId === "metaplex");
  const metaplex = hasMetaplex ? '\nmpl-token-metadata = "4.1"' : "";
  return `[package]
name = "${kebab}"
version = "${version}"
description = "Created with SolStudio (Anchor)"
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
anchor-lang = { version = "0.32.1", features = ["init-if-needed"] }${spl}${pyth}${metaplex}

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
  constants: ProgramIR["constants"],
): string {
  const modules: string[] = ["instructions"];
  if (states.length > 0) modules.push("state");
  if (errors.length > 0) modules.push("errors");
  if (events.length > 0) modules.push("events");
  if (constants.length > 0) modules.push("constants");

  // #[program] looks up each instruction's Accounts struct (and its generated client module)
  // at the crate root.
  const modLines = `${modules.map((m) => `pub mod ${m};`).join("\n")}\n\npub use instructions::*;`;

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

/** Instruction modules, re-exported so their Accounts structs reach the crate root. */
function generateInstructionsModRs(names: string[]): string {
  // Every module has its own `handler`; lib.rs calls them by full path.
  return `${generateModRs(names)}\n${names.map((n) => `#[allow(ambiguous_glob_reexports)]\npub use ${n}::*;`).join("\n")}\n`;
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
    if (a.stateType && !isExternalType(a.stateType, ir)) usedStates.add(a.stateType);
  }
  for (const op of ix.body) {
    if (op.type === "emit-event") usedEvents.add(op.event);
    if (op.type === "require" || op.type === "return-error") hasErrors = true;
  }

  const errorEnum = toPascalCase(programName) + "Error";
  const pluginIntegrations = integrationsForInstruction(ir, ix);
  const pluginBlocks = pluginIntegrations.map((integration) =>
    renderAnchorIntegration(integration),
  );

  // Build imports
  const importLines: string[] = ["use anchor_lang::prelude::*;"];
  for (const s of [...usedStates].sort())
    importLines.push(`use crate::state::${toSnakeFilename(s)}::${s};`);
  if (hasErrors && ir.errors.length > 0)
    importLines.push(`use crate::errors::${errorEnum};`);
  for (const e of [...usedEvents].sort())
    importLines.push(`use crate::events::${e};`);
  for (const block of pluginBlocks) {
    importLines.push(...block.imports);
  }

  // Build instruction body
  const beforeBody = pluginBlocks
    .filter((block) => block.position === "before-body")
    .flatMap((block) => block.bodyLines);
  const afterBody = pluginBlocks
    .filter((block) => block.position === "after-body")
    .flatMap((block) => block.bodyLines);
  const bodyLines = [
    ...beforeBody,
    ...generateInstructionBody(ix, programName),
    ...afterBody,
  ];

  // Build args signature
  const argSig = ix.args
    .map((a) => `${a.name}: ${solanaTypeToRust(a.type)}`)
    .join(", ");
  const extraArgs = argSig ? `, ${argSig}` : "";

  // Anchor 0.32 requires type-annotated #[instruction] attributes
  const argAttr = ix.args.length > 0
    ? `#[instruction(${ix.args.map((a) => `${a.name}: ${solanaTypeToRust(a.type)}`).join(", ")})]\n`
    : "";

  // Build accounts struct
  const pluginAccountFields = pluginBlocks
    .flatMap((block) => block.accountFields)
    .filter((field) => !ix.accounts.some((account) => account.name === field.name))
    .map((field) => field.code)
    .join("\n\n");
  const accountFields = ix.accounts
    .map((a) => buildAccountField(a, ix, ir))
    .join("\n\n");
  const allAccountFields = [accountFields, pluginAccountFields]
    .filter(Boolean)
    .join("\n\n");

  // Auto-add token_program for mint init when not already present
  const hasMintInit = ix.accounts.some(
    (a) => a.accountType === "mint" && a.constraints.some((c) => c.type === "init")
  );
  const hasTokenProgram = ix.accounts.some((a) => a.accountType === "token-program");
  const extraAnchorField = hasMintInit && !hasTokenProgram
    ? "\n    pub token_program: Program<'info, anchor_spl::token::Token>,"
    : "";

  // When there are no account fields, omit the 'info lifetime to avoid E0392.
  const lifetime = allAccountFields.trim().length > 0 ? "<'info>" : "";

  const content = `${unique(importLines).join("\n")}

pub fn handler(ctx: Context<${ctx}>${extraArgs}) -> Result<()> {
${bodyLines.map((l) => `    ${l}`).join("\n")}

    Ok(())
}

#[derive(Accounts)]
${argAttr}pub struct ${ctx}${lifetime} {
${allAccountFields}${extraAnchorField}
}
`;

  for (const block of pluginBlocks) {
    for (const warning of block.warnings) {
      warns.push({ message: warning, nodeId: ix.id });
    }
  }

  return { content, warns, errs };
}

interface AnchorPluginBlock {
  position: Integration["attachedTo"]["position"];
  imports: string[];
  bodyLines: string[];
  accountFields: Array<{ name: string; code: string }>;
  warnings: string[];
}

function integrationsForInstruction(
  ir: ProgramIR,
  ix: Instruction,
): Integration[] {
  return ir.integrations.filter(
    (integration) => integration.attachedTo.instructionId === ix.id,
  );
}

function renderAnchorIntegration(integration: Integration): AnchorPluginBlock {
  const position = integration.attachedTo.position;
  const config = integration.config;
  const empty: AnchorPluginBlock = {
    position,
    imports: [],
    bodyLines: [],
    accountFields: [],
    warnings: [],
  };

  if (integration.pluginId === "spl-token") {
    return renderAnchorSplTokenIntegration(integration, config);
  }

  if (integration.pluginId === "pyth") {
    return renderAnchorPythIntegration(integration, config);
  }

  if (integration.pluginId === "metaplex") {
    return renderAnchorMetaplexIntegration(integration, config);
  }

  return {
    ...empty,
    warnings: [
      `Plugin integration "${integration.pluginId}:${integration.integrationId}" does not have Anchor codegen yet`,
    ],
  };
}

function renderAnchorSplTokenIntegration(
  integration: Integration,
  config: Record<string, unknown>,
): AnchorPluginBlock {
  const position = integration.attachedTo.position;
  const amount = numberLiteral(config.amount, "0");

  if (integration.integrationId === "create-mint") {
    const decimals = numberLiteral(config.decimals, "9");
    return {
      position,
      imports: ["use anchor_spl::token::{Mint, Token};"],
      bodyLines: [
        "// SPL Token mint is initialized by the Anchor account constraint.",
      ],
      accountFields: [
        {
          name: "mint",
          code: `    #[account(init, payer = payer, mint::decimals = ${decimals}, mint::authority = mint_authority)]\n    pub mint: Account<'info, Mint>,`,
        },
        {
          name: "payer",
          code: "    #[account(mut)]\n    pub payer: Signer<'info>,",
        },
        {
          name: "mint_authority",
          code: "    pub mint_authority: Signer<'info>,",
        },
        {
          name: "token_program",
          code: "    pub token_program: Program<'info, Token>,",
        },
        {
          name: "system_program",
          code: "    pub system_program: Program<'info, System>,",
        },
        {
          name: "rent",
          code: "    pub rent: Sysvar<'info, Rent>,",
        },
      ],
      warnings: [],
    };
  }

  if (integration.integrationId === "mint-tokens") {
    return {
      position,
      imports: [
        "use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};",
      ],
      bodyLines: [
        "token::mint_to(",
        "    CpiContext::new(",
        "        ctx.accounts.token_program.to_account_info(),",
        "        MintTo {",
        "            mint: ctx.accounts.mint.to_account_info(),",
        "            to: ctx.accounts.destination.to_account_info(),",
        "            authority: ctx.accounts.authority.to_account_info(),",
        "        },",
        "    ),",
        `    ${amount},`,
        ")?;",
      ],
      accountFields: [
        {
          name: "mint",
          code: "    #[account(mut)]\n    pub mint: Account<'info, Mint>,",
        },
        {
          name: "destination",
          code: "    #[account(mut)]\n    pub destination: Account<'info, TokenAccount>,",
        },
        {
          name: "authority",
          code: "    pub authority: Signer<'info>,",
        },
        {
          name: "token_program",
          code: "    pub token_program: Program<'info, Token>,",
        },
      ],
      warnings: [],
    };
  }

  if (integration.integrationId === "transfer") {
    return {
      position,
      imports: [
        "use anchor_spl::token::{self, Token, TokenAccount, Transfer};",
      ],
      bodyLines: [
        "token::transfer(",
        "    CpiContext::new(",
        "        ctx.accounts.token_program.to_account_info(),",
        "        Transfer {",
        "            from: ctx.accounts.source.to_account_info(),",
        "            to: ctx.accounts.destination.to_account_info(),",
        "            authority: ctx.accounts.authority.to_account_info(),",
        "        },",
        "    ),",
        `    ${amount},`,
        ")?;",
      ],
      accountFields: [
        {
          name: "source",
          code: "    #[account(mut)]\n    pub source: Account<'info, TokenAccount>,",
        },
        {
          name: "destination",
          code: "    #[account(mut)]\n    pub destination: Account<'info, TokenAccount>,",
        },
        {
          name: "authority",
          code: "    pub authority: Signer<'info>,",
        },
        {
          name: "token_program",
          code: "    pub token_program: Program<'info, Token>,",
        },
      ],
      warnings: [],
    };
  }

  return {
    position,
    imports: [],
    bodyLines: [],
    accountFields: [],
    warnings: [
      `SPL Token integration "${integration.integrationId}" does not have Anchor codegen yet`,
    ],
  };
}

function renderAnchorPythIntegration(
  integration: Integration,
  config: Record<string, unknown>,
): AnchorPluginBlock {
  const outputVar = safeRustIdentifier(config.outputVar, "price");
  const maxAge = numberLiteral(config.maxAge, "30");

  return {
    position: integration.attachedTo.position,
    imports: ["use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;"],
    bodyLines: [
      "let price_feed = &ctx.accounts.price_feed;",
      "let current_price = price_feed.get_price_no_older_than(",
      "    &Clock::get()?,",
      `    ${maxAge},`,
      ").ok_or(ProgramError::InvalidAccountData)?;",
      `let ${outputVar} = current_price.price;`,
      `let ${outputVar}_conf = current_price.conf;`,
      `let ${outputVar}_expo = current_price.expo;`,
    ],
    accountFields: [
      {
        name: "price_feed",
        code: "    pub price_feed: Account<'info, PriceUpdateV2>,",
      },
    ],
    warnings: [],
  };
}

function renderAnchorMetaplexIntegration(
  integration: Integration,
  config: Record<string, unknown>,
): AnchorPluginBlock {
  const name = stringLiteral(config.name, integration.integrationId === "create-collection" ? "SolStudio Collection" : "SolStudio NFT");
  const symbol = stringLiteral(config.symbol, integration.integrationId === "create-collection" ? "COLL" : "SOLST");
  const uri = stringLiteral(config.uri, "");
  const sellerFeeBasisPoints = numberLiteral(config.sellerFeeBasisPoints, "0");
  const isMutable = booleanLiteral(config.isMutable, true);
  const collectionDetails =
    integration.integrationId === "create-collection"
      ? "Some(CollectionDetails::V1 { size: 0 })"
      : "None";

  return {
    position: integration.attachedTo.position,
    imports: [
      "use anchor_spl::token::Mint;",
      "use mpl_token_metadata::instructions::CreateMetadataAccountV3CpiBuilder;",
      "use mpl_token_metadata::types::{CollectionDetails, DataV2};",
    ],
    bodyLines: [
      "let metadata_program = ctx.accounts.metadata_program.to_account_info();",
      "let metadata = ctx.accounts.metadata.to_account_info();",
      "let mint = ctx.accounts.mint.to_account_info();",
      "let authority = ctx.accounts.authority.to_account_info();",
      "let payer = ctx.accounts.payer.to_account_info();",
      "let system_program = ctx.accounts.system_program.to_account_info();",
      "let rent = ctx.accounts.rent.to_account_info();",
      "let data = DataV2 {",
      `    name: ${name}.to_string(),`,
      `    symbol: ${symbol}.to_string(),`,
      `    uri: ${uri}.to_string(),`,
      `    seller_fee_basis_points: ${sellerFeeBasisPoints},`,
      "    creators: None,",
      "    collection: None,",
      "    uses: None,",
      "};",
      "CreateMetadataAccountV3CpiBuilder::new(&metadata_program)",
      "    .metadata(&metadata)",
      "    .mint(&mint)",
      "    .mint_authority(&authority)",
      "    .payer(&payer)",
      "    .update_authority(&authority, true)",
      "    .system_program(&system_program)",
      "    .rent(Some(&rent))",
      "    .data(data)",
      `    .is_mutable(${isMutable})`,
      `    .collection_details(${collectionDetails})`,
      "    .invoke()?;",
    ],
    accountFields: [
      {
        name: "metadata",
        code: "    #[account(mut)]\n    pub metadata: UncheckedAccount<'info>,",
      },
      {
        name: "mint",
        code: "    #[account(mut)]\n    pub mint: Account<'info, Mint>,",
      },
      {
        name: "authority",
        code: "    pub authority: Signer<'info>,",
      },
      {
        name: "payer",
        code: "    #[account(mut)]\n    pub payer: Signer<'info>,",
      },
      {
        name: "metadata_program",
        code: "    pub metadata_program: UncheckedAccount<'info>,",
      },
      {
        name: "system_program",
        code: "    pub system_program: Program<'info, System>,",
      },
      {
        name: "rent",
        code: "    pub rent: Sysvar<'info, Rent>,",
      },
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

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

// ─── Instruction body builder ────────────────────────────────────────────────

function generateInstructionBody(ix: Instruction, programName?: string): string[] {
  const lines: string[] = [];
  const errorEnum = programName ? toPascalCase(programName) + "Error" : undefined;

  // Collect accounts that will need mutable access (set-field targets, including inside if-else)
  const mutNeeded = new Set<string>();
  // Collect ALL accounts referenced in the body (including read-only like require)
  const allReferenced = new Set<string>();
  function collectNeeded(ops: LogicOperation[]) {
    for (const op of ops) {
      if (op.type === "set-field") mutNeeded.add(op.account);
      if (op.type === "if-else") {
        collectNeeded(op.thenBody);
        if (op.elseBody) collectNeeded(op.elseBody);
      }
      for (const acc of getAccessedAccounts(op)) allReferenced.add(acc);
    }
  }
  collectNeeded(ix.body);

  // Track which accounts have been bound
  const boundAccounts = new Set<string>();

  // Collect accounts that need early read-only binding (referenced in require before any set-field)
  const needsEarlyReadOnly = new Set<string>();
  const mutNeededSet = new Set(mutNeeded);
  for (const op of ix.body) {
    if (op.type === 'set-field') break; // stop at first set-field
    if (op.type === 'require') {
      for (const acc of getAccessedAccounts(op)) {
        if (!mutNeededSet.has(acc)) needsEarlyReadOnly.add(acc);
      }
    }
  }

  // Bind early read-only accounts (for require before set-field)
  for (const acc of needsEarlyReadOnly) {
    if (!boundAccounts.has(acc)) {
      boundAccounts.add(acc);
      lines.push(`let ${acc} = &ctx.accounts.${acc};`);
    }
  }

  for (const op of ix.body) {
    // Lazy mutable borrow: create `let x = &mut ctx.accounts.x;` right before
    // the first set-field that needs it.
    const accessedAccounts = getAccessedAccounts(op);
    for (const acc of accessedAccounts) {
      if (mutNeeded.has(acc) && !boundAccounts.has(acc)) {
        boundAccounts.add(acc);
        lines.push(`let ${acc} = &mut ctx.accounts.${acc};`);
      }
    }
    lines.push(...emitLogicOp(op, errorEnum, boundAccounts, ix));
  }

  return lines;
}

// Get account names referenced by a logic operation
function getAccessedAccounts(op: LogicOperation): Set<string> {
  const accounts = new Set<string>();
  switch (op.type) {
    case "set-field":
      accounts.add(op.account);
      break;
    case "math":
      collectAccountRefs(op.left, accounts);
      collectAccountRefs(op.right, accounts);
      break;
    case "require":
      collectAccountRefs(op.condition, accounts);
      break;
    case "if-else":
      collectAccountRefs(op.condition, accounts);
      for (const o of op.thenBody) for (const a of getAccessedAccounts(o)) accounts.add(a);
      for (const o of op.elseBody ?? []) for (const a of getAccessedAccounts(o)) accounts.add(a);
      break;
    case "transfer-sol":
      accounts.add(op.from);
      accounts.add(op.to);
      break;
    default:
      break;
  }
  return accounts;
}

// Check if a string value references an account name like "vault.balance"
function collectAccountRefs(value: string, out: Set<string>): void {
  // Match patterns like "vault.balance", "vault.bump", etc.
  const matches = value.matchAll(/\b([a-z_][a-z0-9_]*)\.[a-z_]/g);
  const skip = new Set(['ctx', 'clock', 'solana', 'anchor', 'core', 'std', 'u8', 'u16', 'u32', 'u64', 'u128', 'i8', 'i16', 'i32', 'i64', 'i128', 'bool', 'program_id']);
  for (const m of matches) {
    if (!skip.has(m[1])) out.add(m[1]);
  }
}

function emitLogicOp(op: LogicOperation, errorEnum?: string, boundAccounts?: Set<string>, ix?: Instruction): string[] {
  switch (op.type) {
    case "set-field": {
      // Skip set-field for SPL account types (mint, token-account) — Anchor handles these via constraints
      const accountType = ix?.accounts.find((a) => a.name === op.account)?.accountType;
      if (accountType === "mint" || accountType === "token-account") return [];
      let val = op.value;
      // *ctx.accounts.X.key → ctx.accounts.X.key() for universal compatibility
      val = val.replace(/\*ctx\.accounts\.(\w+)\.key\b(?!\()/g, 'ctx.accounts.$1.key()');
      return [`${op.account}.${op.field} = ${val};`];
    }

    case "transfer-sol": {
      // Use the bound ref if already borrowed, otherwise use ctx.accounts directly
      const fromRef = boundAccounts?.has(op.from) ? op.from : `ctx.accounts.${op.from}`;
      const toRef = boundAccounts?.has(op.to) ? op.to : `ctx.accounts.${op.to}`;
      const amount = qualifyAccountRefs(op.amount, ix, boundAccounts);
      const kind = solTransferKind(op.from, ix);
      if (kind === "program-owned") {
        return [
          `let amount: u64 = ${amount};`,
          `**${fromRef}.to_account_info().try_borrow_mut_lamports()? -= amount;`,
          `**${toRef}.to_account_info().try_borrow_mut_lamports()? += amount;`,
        ];
      }
      const seeds = kind === "pda-signed" ? buildSignerSeeds([], op.from, ix, boundAccounts) : [];
      return [
        `let amount: u64 = ${amount};`,
        ...seeds,
        `let cpi_accounts = anchor_lang::system_program::Transfer {`,
        `    from: ${fromRef}.to_account_info(),`,
        `    to: ${toRef}.to_account_info(),`,
        `};`,
        seeds.length
          ? `let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.system_program.to_account_info(), cpi_accounts, signer_seeds);`
          : `let cpi_ctx = CpiContext::new(ctx.accounts.system_program.to_account_info(), cpi_accounts);`,
        `anchor_lang::system_program::transfer(cpi_ctx, amount)?;`,
      ];
    }

    case "transfer-token":
    case "mint-to":
    case "burn": {
      const acc = (name: string) => (boundAccounts?.has(name) ? name : `ctx.accounts.${name}`);
      const amount = qualifyAccountRefs(op.amount, ix, boundAccounts);
      const seeds = op.signerSeeds?.length ? buildSignerSeeds(op.signerSeeds, op.authority, ix, boundAccounts) : [];
      const [cpi, fn, fields] =
        op.type === "transfer-token"
          ? ["Transfer", "transfer", [["from", op.from], ["to", op.to]]]
          : op.type === "mint-to"
            ? ["MintTo", "mint_to", [["mint", op.mint], ["to", op.to]]]
            : ["Burn", "burn", [["mint", op.mint], ["from", op.from]]];
      return [
        ...seeds,
        `let cpi_accounts = anchor_spl::token::${cpi} {`,
        ...(fields as string[][]).map(([k, v]) => `    ${k}: ${acc(v)}.to_account_info(),`),
        `    authority: ${acc(op.authority)}.to_account_info(),`,
        `};`,
        seeds.length
          ? `let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, signer_seeds);`
          : `let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);`,
        `anchor_spl::token::${fn}(cpi_ctx, ${amount})?;`,
      ];
    }

    case "require":
      return [`require!(${op.condition}, ${errorRef(errorEnum, op.errorCode, "anchor_lang::error::ErrorCode::RequireViolated")});`];

    case "if-else": {
      const then_ = op.thenBody.flatMap((o) => emitLogicOp(o, errorEnum, boundAccounts, ix)).map((l) => `    ${l}`);
      const else_ =
        op.elseBody?.flatMap((o) => emitLogicOp(o, errorEnum, boundAccounts, ix)).map((l) => `    ${l}`) ?? [];
      const result = [`if ${op.condition} {`, ...then_];
      if (else_.length) result.push("} else {", ...else_);
      result.push("}");
      return result;
    }

    case "emit-event": {
      const fields = Object.entries(op.fields)
        .map(([k, v]) => {
          // *ctx.accounts.X.key → ctx.accounts.X.key() (method call, returns Pubkey directly)
          let val = qualifyAccountRefs(v as string, ix, boundAccounts);
          val = val.replace(/\*ctx\.accounts\.(\w+)\.key\b(?!\()/g, 'ctx.accounts.$1.key()');
          return `    ${k}: ${val},`;
        })
        .join("\n");
      return [`emit!(${op.event} {`, fields, "});"];
    }

    case "return-error":
      return [`return err!(${errorRef(errorEnum, op.errorCode, "anchor_lang::error::ErrorCode::RequireViolated")});`];

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
          `let ${op.result} = ${op.left}.${opMap[op.operation]}(${op.right}).ok_or(ProgramError::InvalidArgument)?;`,
        ];
      }
      return [
        `let ${op.result} = ${op.left} ${opMap[op.operation]} ${op.right};`,
      ];
    }

    case "cpi": {
      const prog = op.targetProgram;
      const ixName = op.instruction;
      const accountMappings = op.accounts
        .map((a) => `${a.to}: ctx.accounts.${a.from}.to_account_info(),`)
        .join("\n            ");
      const dataArgs = op.data.map((d) => d.value).join(", ");
      const seeds = op.signerSeeds?.length ? buildSignerSeeds(op.signerSeeds, "", ix, boundAccounts) : [];

      const lines: string[] = [
        `// CPI: ${prog}::${ixName}`,
        `{`,
        `    let cpi_program = ctx.accounts.${prog}.to_account_info();`,
        `    let cpi_accounts = ${toPascalCase(ixName)}Cpi {`,
        `            ${accountMappings}`,
        `    };`,
        ...seeds.map((l) => `    ${l}`),
        seeds.length
          ? `    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts).with_signer(signer_seeds);`
          : `    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);`,
        dataArgs ? `    ${ixName}(cpi_ctx, ${dataArgs})?;` : `    ${ixName}(cpi_ctx)?;`,
        `}`,
      ];
      return lines;
    }

    case "custom-code":
      return op.code.split("\n");

    case "close-account": {
      const acct = op.account || "account";
      const dest = op.destination || "destination";
      return [
        `{`,
        `    let acct_info = ctx.accounts.${acct}.to_account_info();`,
        `    let dest_info = ctx.accounts.${dest}.to_account_info();`,
        `    anchor_spl::token::close_account(CpiContext::new(`,
        `        ctx.accounts.token_program.to_account_info(),`,
        `        CloseAccount {`,
        `            account: acct_info,`,
        `            destination: dest_info,`,
        `            authority: ctx.accounts.${op.authority || "authority"}.to_account_info(),`,
        `        },`,
        `    ))?;`,
        `}`,
      ];
    }

    default:
      return [`// WARNING: unimplemented logic operation type — add a handler in codegen`];
  }
}

/** `let signer_seeds = …;` for a PDA signing a CPI, with its bump appended. */
function buildSignerSeeds(signerSeeds: Seed[], authority: string, ix?: Instruction, bound?: Set<string>): string[] {
  const { seeds, pda } = splitSignerSeeds(signerSeeds, authority, ix);
  const lines: string[] = [];
  const parts = seeds.map((s) =>
    seedBytes(s, {
      literal: (v) => `b"${v}"`,
      key: (account) => {
        // Keys are bound first: `.key()` returns a temporary that the seeds would outlive.
        lines.push(`let ${account}_key = ctx.accounts.${account}.key();`);
        return `${account}_key.as_ref()`;
      },
    }, ix),
  );
  if (pda) {
    // `bump = vault.bump` constraints use the stored bump; ctx.bumps only has bumps Anchor derived.
    const account = ix?.accounts.find((a) => a.name === pda);
    const seedsC = account?.constraints.find((c) => c.type === "seeds");
    const derived = account?.constraints.some((c) => c.type === "init" || c.type === "init-if-needed");
    const stored = seedsC?.type === "seeds" && seedsC.bump && !derived ? seedsC.bump : undefined;
    lines.push(`let ${pda}_bump = [${stored ? qualifyAccountRefs(stored, ix, bound) : `ctx.bumps.${pda}`}];`);
    parts.push(`&${pda}_bump`);
  }
  lines.push(`let signer_seeds: &[&[&[u8]]] = &[&[${parts.join(", ")}]];`);
  return lines;
}

/** `escrow.amount` → `ctx.accounts.escrow.amount` for accounts the handler hasn't bound to a local. */
function qualifyAccountRefs(value: string, ix?: Instruction, bound?: Set<string>): string {
  if (!ix) return value;
  return value.replace(/(?<![.\w])([a-z_][a-z0-9_]*)\.(?=[a-z_])/g, (m, name: string) =>
    ix.accounts.some((a) => a.name === name) && !bound?.has(name) ? `ctx.accounts.${name}.` : m,
  );
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

  if (account.accountType === "unchecked-account") {
    const comment = account.constraints.find(c => c.type === "safety-comment");
    lines.push(`    /// CHECK: ${comment ? comment.comment : "validated by constraint"}`);
  } else {
    const comment = account.constraints.find(c => c.type === "safety-comment");
    if (comment) {
      lines.push(`    /// Safety: ${comment.comment}`);
    }
  }

  const rustType = accountToRustType(account);
  lines.push(`    pub ${account.name}: ${rustType},`);
  return lines.join("\n");
}

function buildAccountAttributes(
  account: Account,
  ix: Instruction,
  ir: ProgramIR,
): string[] {
  const constraints = account.constraints;
  // Constraint errors need a full path: the instruction file may not import the error enum.
  const errorEnum = `crate::errors::${toPascalCase(ir.program.name)}Error`;

  const initPayers = new Set<string>();
  for (const a of ix.accounts) {
    for (const c of a.constraints) {
      if ((c.type === "init" || c.type === "init-if-needed") && c.payer) {
        initPayers.add(c.payer);
      }
    }
  }

  // Anchor automatically handles mutability for init'd accounts and realloc payers.
  // Only add explicit mut when this account is an init-payer or has realloc, but
  // doesn't already have mut/init/init-if-needed constraints.
  const needsMut =
    (initPayers.has(account.name) ||
      constraints.some((c) => c.type === "realloc")) &&
    !constraints.some(
      (c) =>
        c.type === "mut" || c.type === "init" || c.type === "init-if-needed",
    );

  if (!constraints.length && !needsMut) return [];

  const parts: string[] = [];

  if (needsMut) parts.push("mut");

  for (const c of constraints) {
    switch (c.type) {
      case "mut": {
        // Anchor's init/init-if-needed implies mut, so skip redundant mut attribute
        const hasInit = constraints.some((c) => c.type === "init" || c.type === "init-if-needed");
        if (!hasInit) parts.push("mut");
        break;
      }
      case "signer":
        // signer is expressed in the type (Signer<'info>), not a constraint
        break;
      case "init":
      case "init-if-needed": {
        const kw = c.type === "init" ? "init" : "init_if_needed";
        // Anchor sizes SPL mints and token accounts itself and rejects an explicit space.
        // It only creates a mint given its decimals and authority: default to the payer, 0 decimals.
        const mintDefaults =
          account.accountType === "mint" &&
          !account.constraints.some((ac) => ac.type === "mint-authority" || ac.type === "mint-decimals")
            ? `, mint::decimals = 0, mint::authority = ${c.payer}`
            : "";
        if (isSplAccount(account)) {
          parts.push(`${kw}, payer = ${c.payer}${mintDefaults}`);
        } else {
          const spaceStr =
            c.space === "auto"
              ? account.stateType
                ? `8 + ${account.stateType}::INIT_SPACE`
                : "8"
              : String(c.space);
          parts.push(`${kw}, payer = ${c.payer}, space = ${spaceStr}`);
        }
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
        const seedParts = c.seeds.map((s) =>
          seedBytes(s, { literal: (v) => `b"${v}"`, key: (a) => `${a}.key().as_ref()` }, ix),
        );
        parts.push(`seeds = [${seedParts.join(", ")}]`);
        // When init/init-if-needed is present, Anchor requires plain "bump" (no target).
        // Otherwise use the explicit bump target if provided.
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
        // handled in accountToRustType
        break;
    }
  }

  if (!parts.length) return [];
  return [`#[account(${parts.join(", ")})]`];
}

function isSplAccount(account: Account): boolean {
  return account.accountType === "mint" || account.accountType === "token-account" || account.accountType === "associated-token";
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
      return `UncheckedAccount<'info>`;
    case "program":
      return account.stateType
        ? `Program<'info, ${METADATA_TYPES.has(account.stateType) ? `anchor_spl::metadata::${account.stateType}` : account.stateType}>`
        : `AccountInfo<'info>`;
    case "account":
      return account.stateType
        ? `Account<'info, ${METADATA_TYPES.has(account.stateType) ? `anchor_spl::metadata::${account.stateType}` : account.stateType}>`
        : `AccountInfo<'info>`;
    case "custom":
      return account.stateType ?? `AccountInfo<'info>`;
    default:
      return `AccountInfo<'info>`;
  }
}

// ─── src/state/<name>.rs ──────────────────────────────────────────────────────

function generateStateRs(name: string, fields: Field[], isZeroCopy?: boolean, customDiscriminator?: number[]): string {
  let derive: string;
  if (isZeroCopy) {
    derive = "#[account(zero_copy)]\n#[derive(ZeroCopy)]";
  } else {
    derive = "#[account]\n#[derive(InitSpace)]";
  }

  // Custom discriminator support
  const discriminatorAttr = customDiscriminator
    ? `\n#[account(discriminator = [${customDiscriminator.join(", ")}])]`
    : "";

  const hasDynamic = fields.some((f) => isDynamic(f.type));
  const fieldLines = fields
    .map((f) => {
      const rustType = solanaTypeToRust(f.type);
      const maxLenAttr =
        hasDynamic && (f.type === "String" || (typeof f.type === "object" && "vec" in f.type))
          ? `    #[max_len(${f.maxLen ?? 64})]\n`
          : "";
      const doc = f.description ? `    /// ${f.description}\n` : "";
      const comment = sizeComment(f.type);
      const sizeStr = comment ? `  // ${comment}` : "";
      return `${doc}${maxLenAttr}    pub ${f.name}: ${rustType},${sizeStr}`;
    })
    .join("\n");

  return `use anchor_lang::prelude::*;

${derive}${discriminatorAttr}
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
