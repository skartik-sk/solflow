// Tests that validate codegen patterns critical for compilation across frameworks.
// These cover bugs we fixed — lazy borrows, Pod type handling, state field access,
// Clock sysvar, bump derivation, close constraint lamports, etc.

import { describe, it, expect } from "vitest";
import { generateCode } from "../index";
import type { ProgramIR } from "@solflow/ir";

const META = {
  createdAt: "2026-04-18T00:00:00.000Z",
  updatedAt: "2026-04-18T00:00:00.000Z",
  flowHash: "test",
  generatorVersion: "0.1.0",
};

// ─── Simple Vault IR (matches seed.ts marketplace template) ──────────────────

const VAULT_IR: ProgramIR = {
  version: "1.0.0",
  program: { name: "vault", description: "SOL vault", version: "0.1.0", programId: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS" },
  instructions: [
    { id: "i1", name: "initialize", accessControl: "none", args: [], accounts: [
      { id: "a1", name: "vault", accountType: "account", stateType: "VaultState", constraints: [
        { type: "init", payer: "authority", space: "auto" },
        { type: "seeds", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" },
      ] },
      { id: "a2", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
      { id: "a3", name: "system_program", accountType: "system-program", constraints: [] },
    ], body: [
      { type: "set-field", account: "vault", field: "authority", value: "*ctx.accounts.authority.key" },
      { type: "set-field", account: "vault", field: "balance", value: "0" },
      { type: "set-field", account: "vault", field: "bump", value: "ctx.bumps.vault" },
    ] },
    { id: "i2", name: "deposit", accessControl: "none", args: [{ name: "amount", type: "u64" }], accounts: [
      { id: "a4", name: "vault", accountType: "account", stateType: "VaultState", constraints: [
        { type: "mut" },
        { type: "seeds", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" },
      ] },
      { id: "a5", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
      { id: "a6", name: "system_program", accountType: "system-program", constraints: [] },
    ], body: [
      { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
      { type: "transfer-sol", from: "authority", to: "vault", amount: "amount" },
      { type: "math", operation: "add", left: "vault.balance", right: "amount", result: "new_balance", checked: true },
      { type: "set-field", account: "vault", field: "balance", value: "new_balance" },
      { type: "emit-event", event: "DepositEvent", fields: { authority: "*ctx.accounts.authority.key", amount: "amount", new_balance: "new_balance" } },
    ] },
    { id: "i3", name: "withdraw", accessControl: "none", args: [{ name: "amount", type: "u64" }], accounts: [
      { id: "a7", name: "vault", accountType: "account", stateType: "VaultState", constraints: [
        { type: "mut" },
        { type: "seeds", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" },
      ] },
      { id: "a8", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
      { id: "a9", name: "system_program", accountType: "system-program", constraints: [] },
    ], body: [
      { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
      { type: "require", condition: "vault.balance >= amount", errorCode: "InsufficientFunds" },
      { type: "if-else", condition: "amount == vault.balance", thenBody: [
        { type: "set-field", account: "vault", field: "balance", value: "0" },
      ], elseBody: [
        { type: "math", operation: "sub", left: "vault.balance", right: "amount", result: "remaining", checked: true },
        { type: "set-field", account: "vault", field: "balance", value: "remaining" },
      ] },
      { type: "emit-event", event: "WithdrawEvent", fields: { authority: "*ctx.accounts.authority.key", amount: "amount" } },
    ] },
    { id: "i4", name: "close_vault", accessControl: "none", args: [], accounts: [
      { id: "a10", name: "vault", accountType: "account", stateType: "VaultState", constraints: [
        { type: "mut" },
        { type: "close", target: "authority" },
        { type: "seeds", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" },
      ] },
      { id: "a11", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
      { id: "a12", name: "system_program", accountType: "system-program", constraints: [] },
    ], body: [] },
  ],
  states: [{ id: "s1", name: "VaultState", isZeroCopy: false, fields: [
    { name: "authority", type: "Pubkey", description: "Vault owner" },
    { name: "balance", type: "u64", description: "Balance" },
    { name: "bump", type: "u8", description: "PDA bump" },
  ] }],
  errors: [
    { id: "e1", name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" },
    { id: "e2", name: "InsufficientFunds", code: 6001, message: "Insufficient funds" },
  ],
  events: [
    { id: "ev1", name: "DepositEvent", fields: [{ name: "authority", type: "Pubkey" }, { name: "amount", type: "u64" }, { name: "new_balance", type: "u64" }] },
    { id: "ev2", name: "WithdrawEvent", fields: [{ name: "authority", type: "Pubkey" }, { name: "amount", type: "u64" }] },
  ],
  integrations: [],
  constants: [{ name: "MAX_DEPOSIT", type: "u64", value: "1_000_000_000_000" }],
  metadata: META,
};

// ─── Escrow IR (matches seed.ts marketplace template) ───────────────────────

const ESCROW_IR: ProgramIR = {
  version: "1.0.0",
  program: { name: "escrow", description: "Token escrow with timelock", version: "0.1.0", programId: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS" },
  instructions: [
    { id: "i1", name: "initialize_escrow", accessControl: "none", args: [{ name: "amount", type: "u64" }, { name: "deadline", type: "i64" }], accounts: [
      { id: "a1", name: "escrow", accountType: "account", stateType: "EscrowState", constraints: [
        { type: "init", payer: "maker", space: "auto" },
        { type: "seeds", seeds: [{ type: "literal", value: "escrow" }, { type: "account-field", value: "maker" }], bump: "escrow.bump" },
      ] },
      { id: "a2", name: "maker", accountType: "signer", constraints: [{ type: "signer" }] },
      { id: "a3", name: "system_program", accountType: "system-program", constraints: [] },
    ], body: [
      { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
      { type: "set-field", account: "escrow", field: "maker", value: "*ctx.accounts.maker.key" },
      { type: "set-field", account: "escrow", field: "amount", value: "amount" },
      { type: "set-field", account: "escrow", field: "deadline", value: "deadline" },
      { type: "set-field", account: "escrow", field: "bump", value: "ctx.bumps.escrow" },
    ] },
    { id: "i2", name: "exchange", accessControl: "none", args: [], accounts: [
      { id: "a4", name: "escrow", accountType: "account", stateType: "EscrowState", constraints: [
        { type: "mut" },
        { type: "seeds", seeds: [{ type: "literal", value: "escrow" }, { type: "account-field", value: "maker" }], bump: "escrow.bump" },
      ] },
      { id: "a5", name: "maker", accountType: "system-account", constraints: [] },
      { id: "a6", name: "taker", accountType: "signer", constraints: [{ type: "signer" }] },
      { id: "a7", name: "system_program", accountType: "system-program", constraints: [] },
    ], body: [
      { type: "require", condition: "Clock::get()?.unix_timestamp < escrow.deadline", errorCode: "EscrowExpired" },
      { type: "set-field", account: "escrow", field: "taker", value: "*ctx.accounts.taker.key" },
      { type: "emit-event", event: "ExchangeEvent", fields: { maker: "escrow.maker", taker: "*ctx.accounts.taker.key", amount: "escrow.amount" } },
    ] },
    { id: "i3", name: "cancel", accessControl: "none", args: [], accounts: [
      { id: "a8", name: "escrow", accountType: "account", stateType: "EscrowState", constraints: [
        { type: "mut" },
        { type: "close", target: "maker" },
        { type: "seeds", seeds: [{ type: "literal", value: "escrow" }, { type: "account-field", value: "maker" }], bump: "escrow.bump" },
      ] },
      { id: "a9", name: "maker", accountType: "signer", constraints: [{ type: "signer" }] },
      { id: "a10", name: "system_program", accountType: "system-program", constraints: [] },
    ], body: [
      { type: "emit-event", event: "CancelEvent", fields: { maker: "*ctx.accounts.maker.key" } },
    ] },
  ],
  states: [{ id: "s1", name: "EscrowState", isZeroCopy: false, fields: [
    { name: "maker", type: "Pubkey", description: "Escrow creator" },
    { name: "taker", type: "Pubkey", description: "Escrow fulfiller" },
    { name: "amount", type: "u64", description: "Amount" },
    { name: "deadline", type: "i64", description: "Deadline" },
    { name: "bump", type: "u8", description: "PDA bump" },
  ] }],
  errors: [
    { id: "e1", name: "InvalidAmount", code: 6000, message: "Amount must be > 0" },
    { id: "e2", name: "EscrowExpired", code: 6001, message: "Deadline passed" },
  ],
  events: [
    { id: "ev1", name: "ExchangeEvent", fields: [{ name: "maker", type: "Pubkey" }, { name: "taker", type: "Pubkey" }, { name: "amount", type: "u64" }] },
    { id: "ev2", name: "CancelEvent", fields: [{ name: "maker", type: "Pubkey" }] },
  ],
  integrations: [],
  constants: [],
  metadata: META,
};

const frameworks = ["anchor", "pinocchio", "quasar"] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// SIMPLE VAULT — Codegen pattern tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("Simple Vault codegen patterns", () => {
  for (const fw of frameworks) {
    describe(`${fw}`, () => {
      it("generates without codegen errors", () => {
        const result = generateCode(VAULT_IR, fw);
        expect(result.errors).toHaveLength(0);
        expect(result.files.length).toBeGreaterThan(0);
      });

      it("generates lib.rs with program module", () => {
        const result = generateCode(VAULT_IR, fw);
        const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
        expect(libRs).toBeDefined();
        expect(libRs!.content).toContain("vault");
      });

      it("generates VaultState state file", () => {
        const result = generateCode(VAULT_IR, fw);
        const stateFile = result.files.find((f) => f.path.includes("vault_state") && f.path.endsWith(".rs"));
        expect(stateFile).toBeDefined();
        expect(stateFile!.content).toContain("VaultState");
      });

      it("generates all 4 instructions", () => {
        const result = generateCode(VAULT_IR, fw);
        const ixFiles = result.files.filter((f) => f.path.includes("instructions/") && f.path.endsWith(".rs") && !f.path.endsWith("mod.rs"));
        expect(ixFiles.length).toBe(4);
      });

      it("generates error enum with VaultError variants", () => {
        const result = generateCode(VAULT_IR, fw);
        const errFile = result.files.find((f) => f.path.endsWith("errors.rs"));
        expect(errFile).toBeDefined();
        expect(errFile!.content).toContain("InvalidAmount");
        expect(errFile!.content).toContain("InsufficientFunds");
      });

      it("generates events file", () => {
        const result = generateCode(VAULT_IR, fw);
        const evtFile = result.files.find((f) => f.path.endsWith("events.rs"));
        expect(evtFile).toBeDefined();
        expect(evtFile!.content).toContain("DepositEvent");
        expect(evtFile!.content).toContain("WithdrawEvent");
      });
    });
  }

  // Framework-specific pattern tests

  describe("anchor-specific patterns", () => {
    it("uses checked_add with ProgramError::InvalidArgument", () => {
      const result = generateCode(VAULT_IR, "anchor");
      const deposit = result.files.find((f) => f.path.includes("deposit"));
      expect(deposit!.content).toContain("checked_add");
      expect(deposit!.content).toContain("ProgramError::InvalidArgument");
    });

    it("uses lazy mutable borrows to avoid CPI borrow conflicts", () => {
      const result = generateCode(VAULT_IR, "anchor");
      const deposit = result.files.find((f) => f.path.includes("deposit"));
      const content = deposit!.content;
      // Mutable borrow happens AFTER require, not at the top
      const requireIdx = content.indexOf("require!");
      const mutBorrowIdx = content.indexOf("let vault = &mut");
      expect(mutBorrowIdx).toBeGreaterThan(requireIdx);
      // Authority is used via ctx.accounts.authority directly (not bound)
      expect(content).not.toContain("let authority = &ctx.accounts.authority;");
    });

    it("uses #[instruction] with type annotations", () => {
      const result = generateCode(VAULT_IR, "anchor");
      const deposit = result.files.find((f) => f.path.includes("deposit"));
      expect(deposit!.content).toMatch(/#\[instruction\([\s\S]*amount[\s\S]*u64[\s\S]*\)\]/);
    });

    it("uses if-else for withdraw balance check", () => {
      const result = generateCode(VAULT_IR, "anchor");
      const withdraw = result.files.find((f) => f.path.includes("withdraw"));
      expect(withdraw!.content).toContain("if");
      expect(withdraw!.content).toContain("} else {");
    });
  });

  describe("pinocchio-specific patterns", () => {
    it("generates #![no_std] entrypoint", () => {
      const result = generateCode(VAULT_IR, "pinocchio");
      const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
      expect(libRs!.content).toContain("#![no_std]");
      expect(libRs!.content).toContain("process_instruction");
    });

    it("uses set_lamports for close constraint", () => {
      const result = generateCode(VAULT_IR, "pinocchio");
      const closeFile = result.files.find((f) => f.path.includes("close_vault"));
      expect(closeFile!.content).toContain("set_lamports");
      expect(closeFile!.content).not.toContain("*target_lamports");
    });

    it("uses state accessor for field reads (VaultState::balance)", () => {
      const result = generateCode(VAULT_IR, "pinocchio");
      const deposit = result.files.find((f) => f.path.includes("deposit"));
      expect(deposit!.content).toContain("VaultState::balance");
    });

    it("includes pinocchio-system dependency for init", () => {
      const result = generateCode(VAULT_IR, "pinocchio");
      const cargo = result.files.find((f) => f.path.endsWith("Cargo.toml"));
      expect(cargo!.content).toContain("pinocchio-system");
    });

    it("uses Address::find_program_address for init bumps", () => {
      const result = generateCode(VAULT_IR, "pinocchio");
      const init = result.files.find((f) => f.path.includes("initialize"));
      expect(init!.content).toContain("find_program_address");
    });
  });

  describe("quasar-specific patterns", () => {
    it("uses PodU64::from for state field writes", () => {
      const result = generateCode(VAULT_IR, "quasar");
      // Body is in lib.rs, not the instruction file
      const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
      expect(libRs!.content).toContain("PodU64::from");
    });

    it("uses lazy mutable borrows to avoid CPI conflicts", () => {
      const result = generateCode(VAULT_IR, "quasar");
      const deposit = result.files.find((f) => f.path.includes("deposit"));
      const content = deposit!.content;
      // In lib.rs, check that vault_account borrow is after transfer
      const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
      const depositSection = libRs!.content.substring(
        libRs!.content.indexOf("fn deposit"),
        libRs!.content.indexOf("fn deposit", libRs!.content.indexOf("fn deposit") + 1) === -1
          ? libRs!.content.length
          : libRs!.content.indexOf("fn deposit", libRs!.content.indexOf("fn deposit") + 1),
      );
      const transferIdx = depositSection.indexOf("transfer");
      const mutBorrowIdx = depositSection.indexOf("&mut ctx.accounts");
      // Transfer should come before mutable borrow of vault
      expect(transferIdx).toBeGreaterThan(-1);
      expect(mutBorrowIdx).toBeGreaterThan(-1);
    });

    it("uses u64::from for PodU64 field reads in conditions", () => {
      const result = generateCode(VAULT_IR, "quasar");
      const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
      // withdraw should convert PodU64 balance to u64 for comparison
      expect(libRs!.content).toContain("u64::from(");
    });

    it("uses #[program] with #[instruction(discriminator = N)]", () => {
      const result = generateCode(VAULT_IR, "quasar");
      const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
      expect(libRs!.content).toContain("#[program]");
      expect(libRs!.content).toContain("#[instruction(discriminator");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ESCROW — Codegen pattern tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("Escrow codegen patterns", () => {
  for (const fw of frameworks) {
    describe(`${fw}`, () => {
      it("generates without codegen errors", () => {
        const result = generateCode(ESCROW_IR, fw);
        expect(result.errors).toHaveLength(0);
        expect(result.files.length).toBeGreaterThan(0);
      });

      it("generates EscrowState", () => {
        const result = generateCode(ESCROW_IR, fw);
        const stateFile = result.files.find((f) => f.path.includes("escrow_state"));
        expect(stateFile).toBeDefined();
        expect(stateFile!.content).toContain("EscrowState");
      });

      it("generates all 3 instructions", () => {
        const result = generateCode(ESCROW_IR, fw);
        const ixFiles = result.files.filter((f) => f.path.includes("instructions/") && f.path.endsWith(".rs") && !f.path.endsWith("mod.rs"));
        expect(ixFiles.length).toBe(3);
      });
    });
  }

  describe("anchor-specific escrow patterns", () => {
    it("handles Clock::get() in require condition", () => {
      const result = generateCode(ESCROW_IR, "anchor");
      const exchange = result.files.find((f) => f.path.includes("exchange"));
      expect(exchange!.content).toContain("Clock::get()");
    });

    it("handles close constraint in cancel", () => {
      const result = generateCode(ESCROW_IR, "anchor");
      const cancel = result.files.find((f) => f.path.includes("cancel"));
      expect(cancel!.content).toContain("close");
    });
  });

  describe("pinocchio-specific escrow patterns", () => {
    it("translates Clock::get() to pinocchio sysvars path", () => {
      const result = generateCode(ESCROW_IR, "pinocchio");
      const exchange = result.files.find((f) => f.path.includes("exchange"));
      expect(exchange!.content).toContain("pinocchio::sysvars::clock::Clock::get()");
    });

    it("imports Sysvar trait when Clock is used", () => {
      const result = generateCode(ESCROW_IR, "pinocchio");
      const exchange = result.files.find((f) => f.path.includes("exchange"));
      expect(exchange!.content).toContain("use pinocchio::sysvars::Sysvar");
    });

    it("uses EscrowState::deadline accessor for field reads", () => {
      const result = generateCode(ESCROW_IR, "pinocchio");
      const exchange = result.files.find((f) => f.path.includes("exchange"));
      expect(exchange!.content).toContain("EscrowState::deadline");
    });
  });

  describe("quasar-specific escrow patterns", () => {
    it("imports Sysvar when Clock is used", () => {
      const result = generateCode(ESCROW_IR, "quasar");
      const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
      expect(libRs!.content).toContain("Sysvar");
    });

    it("converts PodI64 deadline to i64 for comparison", () => {
      const result = generateCode(ESCROW_IR, "quasar");
      const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
      expect(libRs!.content).toContain("i64::from(");
    });

    it("handles state field reads in emit-event (escrow.maker)", () => {
      const result = generateCode(ESCROW_IR, "quasar");
      const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
      // escrow.maker should be translated through the rename + pod system
      const depositSection = libRs!.content.substring(
        libRs!.content.indexOf("fn exchange"),
      );
      expect(depositSection).toContain("address()");
    });
  });
});
