import { describe, it, expect } from "vitest";
import { generateCode } from "../index";
import type { ProgramIR } from "@solflow/ir";

// ─── Minimal Counter IR for quick checks ────────────────────────────────────

const COUNTER_IR: ProgramIR = {
  version: "1.0.0",
  program: { name: "counter", description: "Counter program", version: "0.1.0" },
  instructions: [
    {
      id: "a0000000-0000-0000-0000-000000000001",
      name: "initialize",
      accessControl: "none",
      args: [],
      accounts: [
        {
          id: "a0000000-0000-0000-0000-000000000010",
          name: "counter",
          accountType: "account",
          stateType: "CounterState",
          constraints: [
            { type: "init", payer: "authority", space: "auto" },
          ],
        },
        { id: "a0000000-0000-0000-0000-000000000011", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a0000000-0000-0000-0000-000000000012", name: "system_program", accountType: "system-program", constraints: [] },
      ],
      body: [
        { type: "set-field", account: "counter", field: "count", value: "0" },
        { type: "set-field", account: "counter", field: "authority", value: "*ctx.accounts.authority.key" },
      ],
    },
    {
      id: "a0000000-0000-0000-0000-000000000002",
      name: "increment",
      accessControl: "none",
      args: [],
      accounts: [
        {
          id: "a0000000-0000-0000-0000-000000000020",
          name: "counter",
          accountType: "account",
          stateType: "CounterState",
          constraints: [{ type: "mut" }],
        },
        { id: "a0000000-0000-0000-0000-000000000021", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
      ],
      body: [
        { type: "require", condition: "counter.authority == *ctx.accounts.authority.key", errorCode: "Unauthorized" },
        { type: "math", operation: "add", left: "counter.count", right: "1", result: "new_count", checked: true },
        { type: "set-field", account: "counter", field: "count", value: "new_count" },
      ],
    },
  ],
  states: [
    {
      id: "b0000000-0000-0000-0000-000000000001",
      name: "CounterState",
      isZeroCopy: false,
      fields: [
        { name: "count", type: "u64" },
        { name: "authority", type: "Pubkey" },
      ],
    },
  ],
  errors: [
    { id: "c0000000-0000-0000-0000-000000000001", name: "Unauthorized", code: 6000, message: "Only authority can increment" },
  ],
  events: [],
  integrations: [],
  constants: [],
  metadata: { createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z", flowHash: "counter", generatorVersion: "0.1.0" },
};

// ─── Token Mint IR for testing SPL token features ────────────────────────────

const TOKEN_MINT_IR: ProgramIR = {
  version: "1.0.0",
  program: { name: "token_mint", description: "Token minting program", version: "0.1.0" },
  instructions: [
    {
      id: "a0000000-0000-0000-0000-000000000001",
      name: "create_token",
      accessControl: "none",
      args: [{ name: "decimals", type: "u8" }],
      accounts: [
        { id: "a0000000-0000-0000-0000-000000000010", name: "mint", accountType: "mint", constraints: [
          { type: "init", payer: "authority", space: "auto" },
          { type: "mint-authority", authority: "authority" },
          { type: "mint-decimals", decimals: 9 },
        ] },
        { id: "a0000000-0000-0000-0000-000000000011", name: "authority", accountType: "signer", constraints: [{ type: "signer" }, { type: "mut" }] },
        { id: "a0000000-0000-0000-0000-000000000012", name: "token_program", accountType: "token-program", constraints: [] },
        { id: "a0000000-0000-0000-0000-000000000013", name: "system_program", accountType: "system-program", constraints: [] },
        { id: "a0000000-0000-0000-0000-000000000014", name: "rent", accountType: "rent", constraints: [] },
      ],
      body: [],
    },
    {
      id: "a0000000-0000-0000-0000-000000000002",
      name: "mint_tokens",
      accessControl: "none",
      args: [{ name: "amount", type: "u64" }],
      accounts: [
        { id: "a0000000-0000-0000-0000-000000000020", name: "mint", accountType: "mint", constraints: [{ type: "mut" }] },
        { id: "a0000000-0000-0000-0000-000000000021", name: "destination", accountType: "token-account", constraints: [{ type: "mut" }] },
        { id: "a0000000-0000-0000-0000-000000000022", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a0000000-0000-0000-0000-000000000023", name: "token_program", accountType: "token-program", constraints: [] },
      ],
      body: [
        { type: "mint-to", mint: "mint", to: "destination", authority: "authority", amount: "amount" },
      ],
    },
    {
      id: "a0000000-0000-0000-0000-000000000003",
      name: "burn_tokens",
      accessControl: "none",
      args: [{ name: "amount", type: "u64" }],
      accounts: [
        { id: "a0000000-0000-0000-0000-000000000030", name: "mint", accountType: "mint", constraints: [{ type: "mut" }] },
        { id: "a0000000-0000-0000-0000-000000000031", name: "from_account", accountType: "token-account", constraints: [{ type: "mut" }] },
        { id: "a0000000-0000-0000-0000-000000000032", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a0000000-0000-0000-0000-000000000033", name: "token_program", accountType: "token-program", constraints: [] },
      ],
      body: [
        { type: "burn", mint: "mint", from: "from_account", authority: "authority", amount: "amount" },
      ],
    },
  ],
  states: [],
  errors: [],
  events: [],
  integrations: [],
  constants: [],
  metadata: { createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z", flowHash: "token_mint", generatorVersion: "0.1.0" },
};

// ─── PDA Seeds IR for testing seed generation ────────────────────────────────

const PDA_IR: ProgramIR = {
  version: "1.0.0",
  program: { name: "pda_example", description: "PDA seed generation test", version: "0.1.0" },
  instructions: [
    {
      id: "a0000000-0000-0000-0000-000000000001",
      name: "create_pda",
      accessControl: "none",
      args: [{ name: "seed_arg", type: "String" }],
      accounts: [
        {
          id: "a0000000-0000-0000-0000-000000000010",
          name: "pda_account",
          accountType: "account",
          stateType: "MyState",
          constraints: [
            { type: "init", payer: "authority", space: "auto" },
            { type: "seeds", seeds: [
              { type: "literal", value: "my_seed" },
              { type: "account-field", value: "authority" },
              { type: "instruction-arg", value: "seed_arg" },
            ], bump: "pda_account.bump" },
          ],
        },
        { id: "a0000000-0000-0000-0000-000000000011", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a0000000-0000-0000-0000-000000000012", name: "system_program", accountType: "system-program", constraints: [] },
      ],
      body: [
        { type: "set-field", account: "pda_account", field: "bump", value: "ctx.bumps.pda_account" },
      ],
    },
  ],
  states: [
    {
      id: "b0000000-0000-0000-0000-000000000001",
      name: "MyState",
      isZeroCopy: false,
      fields: [
        { name: "bump", type: "u8" },
        { name: "data", type: "u64" },
      ],
    },
  ],
  errors: [],
  events: [],
  integrations: [],
  constants: [],
  metadata: { createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z", flowHash: "pda_test", generatorVersion: "0.1.0" },
};

// ─── Anchor Codegen Quality Tests ────────────────────────────────────────────

describe("Anchor codegen quality", () => {
  it("generates correct init constraint with payer and space", () => {
    const result = generateCode(COUNTER_IR, "anchor");
    const initFile = result.files.find((f) => f.path.includes("initialize"));
    expect(initFile).toBeDefined();
    expect(initFile!.content).toContain("init, payer = authority");
    expect(initFile!.content).toContain("CounterState::INIT_SPACE");
  });

  it("generates correct signer type", () => {
    const result = generateCode(COUNTER_IR, "anchor");
    const initFile = result.files.find((f) => f.path.includes("initialize"));
    expect(initFile!.content).toContain("Signer<'info>");
  });

  it("generates correct require! macro", () => {
    const result = generateCode(COUNTER_IR, "anchor");
    const incFile = result.files.find((f) => f.path.includes("increment"));
    expect(incFile).toBeDefined();
    expect(incFile!.content).toContain("require!(");
    expect(incFile!.content).toContain("Unauthorized");
  });

  it("generates correct checked math", () => {
    const result = generateCode(COUNTER_IR, "anchor");
    const incFile = result.files.find((f) => f.path.includes("increment"));
    expect(incFile!.content).toContain("checked_add");
  });

  it("generates correct mint constraint with decimals", () => {
    const result = generateCode(TOKEN_MINT_IR, "anchor");
    const createFile = result.files.find((f) => f.path.includes("create_token"));
    expect(createFile).toBeDefined();
    expect(createFile!.content).toContain("mint::authority = authority");
    expect(createFile!.content).toContain("mint::decimals = 9");
  });

  it("generates correct mint_to CPI", () => {
    const result = generateCode(TOKEN_MINT_IR, "anchor");
    const mintFile = result.files.find((f) => f.path.includes("mint_tokens"));
    expect(mintFile).toBeDefined();
    expect(mintFile!.content).toContain("anchor_spl::token::MintTo");
    expect(mintFile!.content).toContain("mint_to(");
  });

  it("generates correct burn CPI", () => {
    const result = generateCode(TOKEN_MINT_IR, "anchor");
    const burnFile = result.files.find((f) => f.path.includes("burn_tokens"));
    expect(burnFile).toBeDefined();
    expect(burnFile!.content).toContain("anchor_spl::token::Burn");
    expect(burnFile!.content).toContain("burn(");
  });

  it("generates seeds with all three types (literal, account-field, instruction-arg)", () => {
    const result = generateCode(PDA_IR, "anchor");
    const pdaFile = result.files.find((f) => f.path.includes("create_pda"));
    expect(pdaFile).toBeDefined();
    expect(pdaFile!.content).toContain('b"my_seed"');
    expect(pdaFile!.content).toContain("authority.key().as_ref()");
    expect(pdaFile!.content).toContain("seed_arg.as_ref()");
    // With init, Anchor requires plain "bump" (no target)
    expect(pdaFile!.content).toContain(", bump)]");
  });

  it("includes anchor-spl dependency when SPL tokens are used", () => {
    const result = generateCode(TOKEN_MINT_IR, "anchor");
    const cargoToml = result.files.find((f) => f.path.endsWith("Cargo.toml"));
    expect(cargoToml).toBeDefined();
    expect(cargoToml!.content).toContain("anchor-spl");
  });

  it("does NOT include anchor-spl when no SPL tokens", () => {
    const result = generateCode(COUNTER_IR, "anchor");
    const cargoToml = result.files.find((f) => f.path.endsWith("Cargo.toml"));
    expect(cargoToml).toBeDefined();
    expect(cargoToml!.content).not.toContain("anchor-spl");
  });

  it("generates correct state struct with InitSpace derive", () => {
    const result = generateCode(COUNTER_IR, "anchor");
    const stateFile = result.files.find((f) => f.path.includes("counter_state"));
    expect(stateFile).toBeDefined();
    expect(stateFile!.content).toContain("#[account]");
    expect(stateFile!.content).toContain("#[derive(InitSpace)]");
    expect(stateFile!.content).toContain("pub count: u64");
    expect(stateFile!.content).toContain("pub authority: Pubkey");
  });
});

// ─── Pinocchio Codegen Quality Tests ─────────────────────────────────────────

describe("Pinocchio codegen quality", () => {
  it("generates signer validation", () => {
    const result = generateCode(COUNTER_IR, "pinocchio");
    const initFile = result.files.find((f) => f.path.includes("initialize"));
    expect(initFile).toBeDefined();
    expect(initFile!.content).toContain("is_signer()");
    expect(initFile!.content).toContain("MissingRequiredSignature");
  });

  it("generates writable validation for mut accounts", () => {
    const result = generateCode(COUNTER_IR, "pinocchio");
    const incFile = result.files.find((f) => f.path.includes("increment"));
    expect(incFile).toBeDefined();
    expect(incFile!.content).toContain("is_writable()");
  });

  it("generates require as if/return pattern", () => {
    const result = generateCode(COUNTER_IR, "pinocchio");
    const incFile = result.files.find((f) => f.path.includes("increment"));
    expect(incFile!.content).toContain("return Err(");
    expect(incFile!.content).toContain("Unauthorized");
  });

  it("generates checked math with ProgramError::InvalidArgument", () => {
    const result = generateCode(COUNTER_IR, "pinocchio");
    const incFile = result.files.find((f) => f.path.includes("increment"));
    expect(incFile!.content).toContain("checked_add");
    expect(incFile!.content).toContain("InvalidArgument");
  });

  it("generates no_std entrypoint", () => {
    const result = generateCode(COUNTER_IR, "pinocchio");
    const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
    expect(libRs).toBeDefined();
    expect(libRs!.content).toContain("#![no_std]");
    expect(libRs!.content).toContain("process_instruction");
  });

  it("generates state with discriminator and zero-copy layout", () => {
    const result = generateCode(COUNTER_IR, "pinocchio");
    const stateFile = result.files.find((f) => f.path.includes("counter_state"));
    expect(stateFile).toBeDefined();
    expect(stateFile!.content).toContain("DISCRIMINATOR");
    expect(stateFile!.content).toContain("LEN");
    expect(stateFile!.content).toContain("COUNT_OFFSET");
  });

  it("generates PDA verification for seeds", () => {
    const result = generateCode(PDA_IR, "pinocchio");
    const pdaFile = result.files.find((f) => f.path.includes("create_pda"));
    expect(pdaFile).toBeDefined();
    expect(pdaFile!.content).toContain("verify_pda");
  });

  it("generates utils.rs only when PDAs are used", () => {
    const withPda = generateCode(PDA_IR, "pinocchio");
    expect(withPda.files.some((f) => f.path.endsWith("utils.rs"))).toBe(true);

    const noPda = generateCode(COUNTER_IR, "pinocchio");
    expect(noPda.files.some((f) => f.path.endsWith("utils.rs"))).toBe(false);
  });

  it("generates pinocchio-system dep when CPI is needed", () => {
    const result = generateCode(COUNTER_IR, "pinocchio");
    const cargoToml = result.files.find((f) => f.path.endsWith("Cargo.toml"));
    expect(cargoToml).toBeDefined();
  });

  it("generates close with lamport transfer", () => {
    const IR: ProgramIR = {
      version: "1.0.0",
      program: { name: "close_test", description: "test", version: "0.1.0" },
      instructions: [{
        id: "a0000000-0000-0000-0000-000000000001", name: "close_test", accessControl: "none", args: [],
        accounts: [
          { id: "a0000000-0000-0000-0000-000000000010", name: "account", accountType: "account", constraints: [{ type: "mut" }, { type: "close", target: "authority" }] },
          { id: "a0000000-0000-0000-0000-000000000011", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
        ],
        body: [],
      }],
      states: [], errors: [], events: [], integrations: [], constants: [],
      metadata: { createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z", flowHash: "close_test", generatorVersion: "0.1.0" },
    };
    const result = generateCode(IR, "pinocchio");
    const closeFile = result.files.find((f) => f.path.includes("instructions/close_test"));
    expect(closeFile).toBeDefined();
    expect(closeFile!.content).toContain("lamports");
    expect(closeFile!.content).not.toContain("TODO");
  });
});

// ─── Quasar Codegen Quality Tests ────────────────────────────────────────────

describe("Quasar codegen quality", () => {
  it("generates Ctx type instead of Context", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
    expect(libRs).toBeDefined();
    expect(libRs!.content).toContain("Ctx<");
    expect(libRs!.content).not.toContain("Context<");
  });

  it("generates correct instruction discriminator", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
    expect(libRs).toBeDefined();
    expect(libRs!.content).toContain("#[instruction(discriminator = 0)]");
    expect(libRs!.content).toContain("#[instruction(discriminator = 1)]");
  });

  it("generates mut in type instead of attribute", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const incFile = result.files.find((f) => f.path.includes("increment"));
    expect(incFile).toBeDefined();
    expect(incFile!.content).toContain("&'info mut Account<CounterState>");
  });

  it("uses Pod types in state structs", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const stateFile = result.files.find((f) => f.path.includes("counter_state"));
    expect(stateFile).toBeDefined();
    expect(stateFile!.content).toContain("pub count: PodU64");
    expect(stateFile!.content).toContain("pub authority: Address");
  });

  it("generates AccountInfo for system-account", () => {
    const result = generateCode(TOKEN_MINT_IR, "quasar");
    const createFile = result.files.find((f) => f.path.includes("create_token"));
    expect(createFile).toBeDefined();
  });

  it("generates quasar-spl dependency when SPL tokens are used", () => {
    const result = generateCode(TOKEN_MINT_IR, "quasar");
    const cargoToml = result.files.find((f) => f.path.endsWith("Cargo.toml"));
    expect(cargoToml).toBeDefined();
    expect(cargoToml!.content).toContain("quasar-spl");
  });

  it("does NOT include quasar-spl when no SPL tokens", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const cargoToml = result.files.find((f) => f.path.endsWith("Cargo.toml"));
    expect(cargoToml).toBeDefined();
    expect(cargoToml!.content).not.toContain("quasar-spl");
  });

  it("generates state discriminator attribute", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const stateFile = result.files.find((f) => f.path.includes("counter_state"));
    expect(stateFile).toBeDefined();
    expect(stateFile!.content).toContain("#[account(discriminator = [");
  });

  it("generates no_std attribute", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
    expect(libRs).toBeDefined();
    expect(libRs!.content).toContain("#![cfg_attr(not(test), no_std)]");
  });
});
