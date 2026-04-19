// packages/db/prisma/seed.ts
// Seed the database with pre-built starter templates from the SolStudio team.
// Run with: bun run db:seed (from monorepo root) or `bun prisma/seed.ts` from packages/db
//
// Each template has a COMPLETE visual flow — every instruction has its accounts,
// logic, errors, events, and states properly connected. Users can fork these
// and immediately generate working code.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SYSTEM_USER_ID = "system-solflow-templates";

function makeFlow(nodes: object[], edges: object[]) {
  return { nodes, edges, viewport: { x: 0, y: 0, zoom: 0.7 } };
}

const META = {
  createdAt: "2026-04-17T00:00:00.000Z",
  updatedAt: "2026-04-17T00:00:00.000Z",
  flowHash: "seed-v3",
  generatorVersion: "0.1.0",
};

// ─── Template definitions ─────────────────────────────────────────────────

const TEMPLATES = [
  // ═══════════════════════════════════════════════════════════════════════
  // 1. SIMPLE VAULT — The flagship demo template
  // ═══════════════════════════════════════════════════════════════════════
  {
    title: "Simple Vault",
    description:
      "SOL deposit/withdraw vault with PDA seeds, bump, checked math, events, and close instruction.",
    longDescription:
      "A production-ready vault program. Initialize a PDA vault, deposit SOL, withdraw with checked arithmetic, emit events, and close. Exercises: PDA seeds + bump, transfer-sol, math (checked add/sub), require, if-else, emit-event, close constraint, constants. Generates valid Anchor, Pinocchio, and Quasar code.",
    category: "DEFI",
    tags: ["vault", "pda", "defi", "deposit", "withdraw", "events", "math"],
    pricingModel: "FREE" as const,

    templateFlowData: makeFlow(
      [
        // ── Program ──
        { id: "prog", type: "program", position: { x: 40, y: 280 }, data: { name: "vault", version: "0.1.0" } },

        // ── Instructions ──
        { id: "ix-init", type: "instruction", position: { x: 260, y: 40 }, data: { name: "initialize", instructionData: [] } },
        { id: "ix-deposit", type: "instruction", position: { x: 260, y: 200 }, data: { name: "deposit", instructionData: [{ name: "amount", type: "u64" }] } },
        { id: "ix-withdraw", type: "instruction", position: { x: 260, y: 400 }, data: { name: "withdraw", instructionData: [{ name: "amount", type: "u64" }] } },
        { id: "ix-close", type: "instruction", position: { x: 260, y: 600 }, data: { name: "close_vault", instructionData: [] } },

        // ── Accounts for initialize ──
        { id: "acc-init-vault", type: "account", position: { x: 520, y: 40 }, data: { name: "vault", accountType: "account", isMut: true, isInit: true, payer: "authority", space: "auto", stateType: "VaultState", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" } },
        { id: "acc-init-auth", type: "account", position: { x: 740, y: 40 }, data: { name: "authority", accountType: "signer", isSigner: true } },
        { id: "acc-init-sys", type: "account", position: { x: 740, y: 120 }, data: { name: "system_program", accountType: "system-program" } },

        // ── Accounts for deposit ──
        { id: "acc-dep-vault", type: "account", position: { x: 520, y: 200 }, data: { name: "vault", accountType: "account", isMut: true, stateType: "VaultState", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" } },
        { id: "acc-dep-auth", type: "account", position: { x: 740, y: 200 }, data: { name: "authority", accountType: "signer", isSigner: true } },
        { id: "acc-dep-sys", type: "account", position: { x: 740, y: 280 }, data: { name: "system_program", accountType: "system-program" } },

        // ── Accounts for withdraw ──
        { id: "acc-wd-vault", type: "account", position: { x: 520, y: 400 }, data: { name: "vault", accountType: "account", isMut: true, stateType: "VaultState", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" } },
        { id: "acc-wd-auth", type: "account", position: { x: 740, y: 400 }, data: { name: "authority", accountType: "signer", isSigner: true } },
        { id: "acc-wd-sys", type: "account", position: { x: 740, y: 480 }, data: { name: "system_program", accountType: "system-program" } },

        // ── Accounts for close_vault ──
        { id: "acc-cl-vault", type: "account", position: { x: 520, y: 600 }, data: { name: "vault", accountType: "account", isMut: true, isClose: true, closeTarget: "authority", stateType: "VaultState", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" } },
        { id: "acc-cl-auth", type: "account", position: { x: 740, y: 600 }, data: { name: "authority", accountType: "signer", isSigner: true } },
        { id: "acc-cl-sys", type: "account", position: { x: 740, y: 680 }, data: { name: "system_program", accountType: "system-program" } },

        // ── Logic for initialize ──
        { id: "log-init-1", type: "logic", position: { x: 520, y: 80 }, data: { logicType: "set-field", setAccount: "vault", setField: "authority", setValue: "*ctx.accounts.authority.key" } },
        { id: "log-init-2", type: "logic", position: { x: 520, y: 110 }, data: { logicType: "set-field", setAccount: "vault", setField: "balance", setValue: "0" } },
        { id: "log-init-3", type: "logic", position: { x: 520, y: 140 }, data: { logicType: "set-field", setAccount: "vault", setField: "bump", setValue: "ctx.bumps.vault" } },

        // ── Logic for deposit ──
        { id: "log-dep-1", type: "logic", position: { x: 520, y: 240 }, data: { logicType: "require", requireCondition: "amount > 0", requireErrorCode: "InvalidAmount" } },
        { id: "log-dep-2", type: "logic", position: { x: 520, y: 270 }, data: { logicType: "transfer-sol", transferFrom: "authority", transferTo: "vault", transferAmount: "amount" } },
        { id: "log-dep-3", type: "logic", position: { x: 520, y: 300 }, data: { logicType: "math", mathOperation: "add", mathLeft: "vault.balance", mathRight: "amount", mathResult: "new_balance", mathChecked: true } },
        { id: "log-dep-4", type: "logic", position: { x: 520, y: 330 }, data: { logicType: "set-field", setAccount: "vault", setField: "balance", setValue: "new_balance" } },
        { id: "log-dep-5", type: "logic", position: { x: 520, y: 360 }, data: { logicType: "emit-event", emitEvent: "DepositEvent", emitFields: { authority: "*ctx.accounts.authority.key", amount: "amount", new_balance: "new_balance" } } },

        // ── Logic for withdraw ──
        { id: "log-wd-1", type: "logic", position: { x: 520, y: 440 }, data: { logicType: "require", requireCondition: "amount > 0", requireErrorCode: "InvalidAmount" } },
        { id: "log-wd-2", type: "logic", position: { x: 520, y: 470 }, data: { logicType: "require", requireCondition: "vault.balance >= amount", requireErrorCode: "InsufficientFunds" } },
        { id: "log-wd-3", type: "logic", position: { x: 520, y: 500 }, data: { logicType: "math", mathOperation: "sub", mathLeft: "vault.balance", mathRight: "amount", mathResult: "remaining", mathChecked: true } },
        { id: "log-wd-4", type: "logic", position: { x: 520, y: 530 }, data: { logicType: "set-field", setAccount: "vault", setField: "balance", setValue: "remaining" } },
        { id: "log-wd-5", type: "logic", position: { x: 520, y: 560 }, data: { logicType: "emit-event", emitEvent: "WithdrawEvent", emitFields: { authority: "*ctx.accounts.authority.key", amount: "amount" } } },

        // ── State ──
        { id: "state-vault", type: "state", position: { x: 960, y: 340 }, data: { name: "VaultState", fields: [{ name: "authority", type: "Pubkey", description: "Vault owner" }, { name: "balance", type: "u64", description: "Current balance" }, { name: "bump", type: "u8", description: "PDA bump" }] } },

        // ── Errors ──
        { id: "err-inv", type: "error", position: { x: 40, y: 440 }, data: { name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" } },
        { id: "err-insuf", type: "error", position: { x: 40, y: 500 }, data: { name: "InsufficientFunds", code: 6001, message: "Insufficient funds in vault" } },

        // ── Events ──
        { id: "evt-deposit", type: "event", position: { x: 40, y: 580 }, data: { name: "DepositEvent", fields: [{ name: "authority", type: "Pubkey" }, { name: "amount", type: "u64" }, { name: "new_balance", type: "u64" }] } },
        { id: "evt-withdraw", type: "event", position: { x: 40, y: 660 }, data: { name: "WithdrawEvent", fields: [{ name: "authority", type: "Pubkey" }, { name: "amount", type: "u64" }] } },
      ],
      [
        // Program -> Instructions
        { id: "e-prog-init", source: "prog", target: "ix-init" },
        { id: "e-prog-dep", source: "prog", target: "ix-deposit" },
        { id: "e-prog-wd", source: "prog", target: "ix-withdraw" },
        { id: "e-prog-cl", source: "prog", target: "ix-close" },

        // init -> accounts
        { id: "e-init-v", source: "ix-init", target: "acc-init-vault" },
        { id: "e-init-a", source: "ix-init", target: "acc-init-auth" },
        { id: "e-init-s", source: "ix-init", target: "acc-init-sys" },

        // init -> logic
        { id: "e-init-l1", source: "ix-init", target: "log-init-1" },
        { id: "e-init-l2", source: "log-init-1", target: "log-init-2" },
        { id: "e-init-l3", source: "log-init-2", target: "log-init-3" },

        // deposit -> accounts
        { id: "e-dep-v", source: "ix-deposit", target: "acc-dep-vault" },
        { id: "e-dep-a", source: "ix-deposit", target: "acc-dep-auth" },
        { id: "e-dep-s", source: "ix-deposit", target: "acc-dep-sys" },

        // deposit -> logic
        { id: "e-dep-l1", source: "ix-deposit", target: "log-dep-1" },
        { id: "e-dep-l2", source: "log-dep-1", target: "log-dep-2" },
        { id: "e-dep-l3", source: "log-dep-2", target: "log-dep-3" },
        { id: "e-dep-l4", source: "log-dep-3", target: "log-dep-4" },
        { id: "e-dep-l5", source: "log-dep-4", target: "log-dep-5" },

        // withdraw -> accounts
        { id: "e-wd-v", source: "ix-withdraw", target: "acc-wd-vault" },
        { id: "e-wd-a", source: "ix-withdraw", target: "acc-wd-auth" },
        { id: "e-wd-s", source: "ix-withdraw", target: "acc-wd-sys" },

        // withdraw -> logic
        { id: "e-wd-l1", source: "ix-withdraw", target: "log-wd-1" },
        { id: "e-wd-l2", source: "log-wd-1", target: "log-wd-2" },
        { id: "e-wd-l3", source: "log-wd-2", target: "log-wd-3" },
        { id: "e-wd-l4", source: "log-wd-3", target: "log-wd-4" },
        { id: "e-wd-l5", source: "log-wd-4", target: "log-wd-5" },

        // close -> accounts
        { id: "e-cl-v", source: "ix-close", target: "acc-cl-vault" },
        { id: "e-cl-a", source: "ix-close", target: "acc-cl-auth" },
        { id: "e-cl-s", source: "ix-close", target: "acc-cl-sys" },

        // deposit -> errors
        { id: "e-dep-err", source: "ix-deposit", target: "err-inv" },
        // withdraw -> errors
        { id: "e-wd-err1", source: "ix-withdraw", target: "err-inv" },
        { id: "e-wd-err2", source: "ix-withdraw", target: "err-insuf" },

        // deposit -> events
        { id: "e-dep-evt", source: "ix-deposit", target: "evt-deposit" },
        // withdraw -> events
        { id: "e-wd-evt", source: "ix-withdraw", target: "evt-withdraw" },

        // State -> account (data binding)
        { id: "e-state-bind", source: "state-vault", target: "acc-init-vault" },
      ],
    ),

    templateIR: {
      version: "1.0.0",
      program: { name: "vault", description: "SOL vault with PDA, deposits, withdrawals, and events", version: "0.1.0" },
      instructions: [
        { id: "a0000000-0000-0000-0000-000000000001", name: "initialize", description: "Initialize a new vault", args: [], accounts: [
          { id: "a0000000-0000-0000-0000-000000000010", name: "vault", accountType: "account", stateType: "VaultState", constraints: [{ type: "init", payer: "authority", space: "auto" }, { type: "seeds", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" }], description: undefined },
          { id: "a0000000-0000-0000-0000-000000000011", name: "authority", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
          { id: "a0000000-0000-0000-0000-000000000012", name: "system_program", accountType: "system-program", constraints: [], description: undefined },
        ], body: [
          { type: "set-field", account: "vault", field: "authority", value: "*ctx.accounts.authority.key" },
          { type: "set-field", account: "vault", field: "balance", value: "0" },
          { type: "set-field", account: "vault", field: "bump", value: "ctx.bumps.vault" },
        ] },
        { id: "a0000000-0000-0000-0000-000000000002", name: "deposit", args: [{ name: "amount", type: "u64" }], accounts: [
          { id: "a0000000-0000-0000-0000-000000000020", name: "vault", accountType: "account", stateType: "VaultState", constraints: [{ type: "mut" }, { type: "seeds", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" }], description: undefined },
          { id: "a0000000-0000-0000-0000-000000000021", name: "authority", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
          { id: "a0000000-0000-0000-0000-000000000022", name: "system_program", accountType: "system-program", constraints: [], description: undefined },
        ], body: [
          { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
          { type: "transfer-sol", from: "authority", to: "vault", amount: "amount" },
          { type: "math", operation: "add", left: "vault.balance", right: "amount", result: "new_balance", checked: true },
          { type: "set-field", account: "vault", field: "balance", value: "new_balance" },
          { type: "emit-event", event: "DepositEvent", fields: { authority: "*ctx.accounts.authority.key", amount: "amount", new_balance: "new_balance" } },
        ], description: undefined },
        { id: "a0000000-0000-0000-0000-000000000003", name: "withdraw", args: [{ name: "amount", type: "u64" }], accounts: [
          { id: "a0000000-0000-0000-0000-000000000030", name: "vault", accountType: "account", stateType: "VaultState", constraints: [{ type: "mut" }, { type: "seeds", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" }], description: undefined },
          { id: "a0000000-0000-0000-0000-000000000031", name: "authority", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
          { id: "a0000000-0000-0000-0000-000000000032", name: "system_program", accountType: "system-program", constraints: [], description: undefined },
        ], body: [
          { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
          { type: "require", condition: "vault.balance >= amount", errorCode: "InsufficientFunds" },
          { type: "math", operation: "sub", left: "vault.balance", right: "amount", result: "remaining", checked: true },
          { type: "set-field", account: "vault", field: "balance", value: "remaining" },
          { type: "emit-event", event: "WithdrawEvent", fields: { authority: "*ctx.accounts.authority.key", amount: "amount" } },
        ], description: undefined },
        { id: "a0000000-0000-0000-0000-000000000004", name: "close_vault", args: [], accounts: [
          { id: "a0000000-0000-0000-0000-000000000040", name: "vault", accountType: "account", stateType: "VaultState", constraints: [{ type: "mut" }, { type: "close", target: "authority" }, { type: "seeds", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" }], description: undefined },
          { id: "a0000000-0000-0000-0000-000000000041", name: "authority", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
          { id: "a0000000-0000-0000-0000-000000000042", name: "system_program", accountType: "system-program", constraints: [], description: undefined },
        ], body: [], description: undefined },
      ],
      states: [{ id: "b0000000-0000-0000-0000-000000000001", name: "VaultState", fields: [{ name: "authority", type: "Pubkey", description: "Vault owner" }, { name: "balance", type: "u64", description: "Current balance" }, { name: "bump", type: "u8", description: "PDA bump" }], description: undefined, isZeroCopy: false }],
      errors: [{ id: "c0000000-0000-0000-0000-000000000001", name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" }, { id: "c0000000-0000-0000-0000-000000000002", name: "InsufficientFunds", code: 6001, message: "Insufficient funds" }],
      events: [{ id: "d0000000-0000-0000-0000-000000000001", name: "DepositEvent", fields: [{ name: "authority", type: "Pubkey" }, { name: "amount", type: "u64" }, { name: "new_balance", type: "u64" }] }, { id: "d0000000-0000-0000-0000-000000000002", name: "WithdrawEvent", fields: [{ name: "authority", type: "Pubkey" }, { name: "amount", type: "u64" }] }],
      integrations: [],
      constants: [{ name: "MAX_DEPOSIT", type: "u64", value: "1_000_000_000_000" }],
      metadata: META,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 2. TOKEN MINT
  // ═══════════════════════════════════════════════════════════════════════
  {
    title: "Token Mint",
    description: "SPL token creation with configurable mint authority, decimals, and supply control.",
    longDescription: "A complete SPL token program built with Anchor. Includes initialize_mint, mint_to, and burn instructions. Great starting point for fungible token projects.",
    category: "TOKEN",
    tags: ["spl-token", "mint", "fungible", "anchor"],
    pricingModel: "FREE" as const,
    templateFlowData: makeFlow(
      [
        { id: "prog", type: "program", position: { x: 40, y: 200 }, data: { name: "token_mint", version: "0.1.0" } },
        { id: "ix-init", type: "instruction", position: { x: 260, y: 40 }, data: { name: "initialize_mint", instructionData: [{ name: "decimals", type: "u8" }] } },
        { id: "ix-mint", type: "instruction", position: { x: 260, y: 220 }, data: { name: "mint_to", instructionData: [{ name: "amount", type: "u64" }] } },
        { id: "ix-burn", type: "instruction", position: { x: 260, y: 400 }, data: { name: "burn", instructionData: [{ name: "amount", type: "u64" }] } },

        // init accounts
        { id: "acc-init-mint", type: "account", position: { x: 520, y: 40 }, data: { name: "mint", accountType: "mint", isMut: true, isInit: true, payer: "authority", space: 82, mintAuthority: "authority", mintDecimals: 9 } },
        { id: "acc-init-auth", type: "account", position: { x: 740, y: 40 }, data: { name: "authority", accountType: "signer", isSigner: true } },
        { id: "acc-init-sys", type: "account", position: { x: 740, y: 120 }, data: { name: "system_program", accountType: "system-program" } },
        { id: "acc-init-rent", type: "account", position: { x: 740, y: 200 }, data: { name: "rent", accountType: "rent" } },

        // mint_to accounts
        { id: "acc-m-mint", type: "account", position: { x: 520, y: 220 }, data: { name: "mint", accountType: "mint", isMut: true, mintAuthority: "authority" } },
        { id: "acc-m-dest", type: "account", position: { x: 740, y: 220 }, data: { name: "destination", accountType: "token-account", isMut: true } },
        { id: "acc-m-auth", type: "account", position: { x: 740, y: 300 }, data: { name: "authority", accountType: "signer", isSigner: true } },
        { id: "acc-m-tp", type: "account", position: { x: 740, y: 380 }, data: { name: "token_program", accountType: "token-program" } },

        // burn accounts
        { id: "acc-b-src", type: "account", position: { x: 520, y: 400 }, data: { name: "source", accountType: "token-account", isMut: true } },
        { id: "acc-b-mint", type: "account", position: { x: 740, y: 400 }, data: { name: "mint", accountType: "mint", isMut: true } },
        { id: "acc-b-auth", type: "account", position: { x: 740, y: 480 }, data: { name: "authority", accountType: "signer", isSigner: true } },
        { id: "acc-b-tp", type: "account", position: { x: 740, y: 560 }, data: { name: "token_program", accountType: "token-program" } },

        // Logic
        { id: "log-init-1", type: "logic", position: { x: 960, y: 80 }, data: { logicType: "set-field", setAccount: "mint", setField: "decimals", setValue: "decimals" } },
        { id: "log-init-2", type: "logic", position: { x: 960, y: 110 }, data: { logicType: "set-field", setAccount: "mint", setField: "authority", setValue: "*ctx.accounts.authority.key" } },

        { id: "log-m-1", type: "logic", position: { x: 960, y: 260 }, data: { logicType: "require", requireCondition: "amount > 0", requireErrorCode: "InvalidAmount" } },
        { id: "log-m-2", type: "logic", position: { x: 960, y: 290 }, data: { logicType: "mint-to", mintTo: "destination", setField: "mint", setValue: "authority", mintAuthority: "authority", transferAmount: "amount" } },
        { id: "log-m-3", type: "logic", position: { x: 960, y: 320 }, data: { logicType: "emit-event", emitEvent: "MintEvent", emitFields: { amount: "amount" } } },

        { id: "log-b-1", type: "logic", position: { x: 960, y: 440 }, data: { logicType: "require", requireCondition: "amount > 0", requireErrorCode: "InvalidAmount" } },
        { id: "log-b-2", type: "logic", position: { x: 960, y: 470 }, data: { logicType: "burn", burnMint: "mint", setAccount: "source", burnAuthority: "authority", transferAmount: "amount" } },

        // Errors & Events
        { id: "err-inv", type: "error", position: { x: 40, y: 360 }, data: { name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" } },
        { id: "evt-mint", type: "event", position: { x: 40, y: 440 }, data: { name: "MintEvent", fields: [{ name: "amount", type: "u64" }, { name: "destination", type: "Pubkey" }] } },
        { id: "evt-burn", type: "event", position: { x: 40, y: 520 }, data: { name: "BurnEvent", fields: [{ name: "amount", type: "u64" }, { name: "source", type: "Pubkey" }] } },
      ],
      [
        { id: "e-p-init", source: "prog", target: "ix-init" },
        { id: "e-p-mint", source: "prog", target: "ix-mint" },
        { id: "e-p-burn", source: "prog", target: "ix-burn" },
        // init
        { id: "e-init-m", source: "ix-init", target: "acc-init-mint" },
        { id: "e-init-a", source: "ix-init", target: "acc-init-auth" },
        { id: "e-init-s", source: "ix-init", target: "acc-init-sys" },
        { id: "e-init-r", source: "ix-init", target: "acc-init-rent" },
        { id: "e-init-l1", source: "ix-init", target: "log-init-1" },
        { id: "e-init-l2", source: "log-init-1", target: "log-init-2" },
        // mint_to
        { id: "e-m-m", source: "ix-mint", target: "acc-m-mint" },
        { id: "e-m-d", source: "ix-mint", target: "acc-m-dest" },
        { id: "e-m-a", source: "ix-mint", target: "acc-m-auth" },
        { id: "e-m-tp", source: "ix-mint", target: "acc-m-tp" },
        { id: "e-m-l1", source: "ix-mint", target: "log-m-1" },
        { id: "e-m-l2", source: "log-m-1", target: "log-m-2" },
        { id: "e-m-l3", source: "log-m-2", target: "log-m-3" },
        // burn
        { id: "e-b-s", source: "ix-burn", target: "acc-b-src" },
        { id: "e-b-m", source: "ix-burn", target: "acc-b-mint" },
        { id: "e-b-a", source: "ix-burn", target: "acc-b-auth" },
        { id: "e-b-tp", source: "ix-burn", target: "acc-b-tp" },
        { id: "e-b-l1", source: "ix-burn", target: "log-b-1" },
        { id: "e-b-l2", source: "log-b-1", target: "log-b-2" },
        // errors
        { id: "e-m-err", source: "ix-mint", target: "err-inv" },
        { id: "e-b-err", source: "ix-burn", target: "err-inv" },
        // events
        { id: "e-m-evt", source: "ix-mint", target: "evt-mint" },
        { id: "e-b-evt", source: "ix-burn", target: "evt-burn" },
      ],
    ),
    templateIR: {
      version: "1.0.0",
      program: { name: "token_mint", description: "SPL token with mint authority and supply control", version: "0.1.0" },
      instructions: [
        { id: "a1000000-0000-0000-0000-000000000001", name: "initialize_mint", description: "Initialize a new SPL token mint", args: [{ name: "decimals", type: "u8" }], accounts: [
          { id: "a1000000-0000-0000-0000-000000000010", name: "mint", accountType: "mint", constraints: [{ type: "init", payer: "authority", space: 82 }, { type: "mint-authority", authority: "authority" }, { type: "mint-decimals", decimals: 9 }], description: undefined },
          { id: "a1000000-0000-0000-0000-000000000011", name: "authority", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
          { id: "a1000000-0000-0000-0000-000000000012", name: "system_program", accountType: "system-program", constraints: [], description: undefined },
          { id: "a1000000-0000-0000-0000-000000000013", name: "rent", accountType: "rent", constraints: [], description: undefined },
        ], body: [
          { type: "set-field", account: "mint", field: "decimals", value: "decimals" },
          { type: "set-field", account: "mint", field: "authority", value: "*ctx.accounts.authority.key" },
        ] },
        { id: "a1000000-0000-0000-0000-000000000002", name: "mint_to", description: "Mint tokens to an account", args: [{ name: "amount", type: "u64" }], accounts: [
          { id: "a1000000-0000-0000-0000-000000000020", name: "mint", accountType: "mint", constraints: [{ type: "mut" }, { type: "mint-authority", authority: "authority" }], description: undefined },
          { id: "a1000000-0000-0000-0000-000000000021", name: "destination", accountType: "token-account", constraints: [{ type: "mut" }], description: undefined },
          { id: "a1000000-0000-0000-0000-000000000022", name: "authority", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
          { id: "a1000000-0000-0000-0000-000000000023", name: "token_program", accountType: "token-program", constraints: [], description: undefined },
        ], body: [
          { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
          { type: "mint-to", mint: "mint", to: "destination", authority: "authority", amount: "amount" },
          { type: "emit-event", event: "MintEvent", fields: { amount: "amount", destination: "*ctx.accounts.destination.key" } },
        ] },
        { id: "a1000000-0000-0000-0000-000000000003", name: "burn", description: "Burn tokens from an account", args: [{ name: "amount", type: "u64" }], accounts: [
          { id: "a1000000-0000-0000-0000-000000000030", name: "source", accountType: "token-account", constraints: [{ type: "mut" }], description: undefined },
          { id: "a1000000-0000-0000-0000-000000000031", name: "mint", accountType: "mint", constraints: [{ type: "mut" }], description: undefined },
          { id: "a1000000-0000-0000-0000-000000000032", name: "authority", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
          { id: "a1000000-0000-0000-0000-000000000033", name: "token_program", accountType: "token-program", constraints: [], description: undefined },
        ], body: [
          { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
          { type: "burn", mint: "mint", from: "source", authority: "authority", amount: "amount" },
          { type: "emit-event", event: "BurnEvent", fields: { amount: "amount", source: "*ctx.accounts.source.key" } },
        ] },
      ],
      states: [],
      errors: [{ id: "c1000000-0000-0000-0000-000000000001", name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" }],
      events: [{ id: "d1000000-0000-0000-0000-000000000001", name: "MintEvent", fields: [{ name: "amount", type: "u64" }, { name: "destination", type: "Pubkey" }] }, { id: "d1000000-0000-0000-0000-000000000002", name: "BurnEvent", fields: [{ name: "amount", type: "u64" }, { name: "source", type: "Pubkey" }] }],
      integrations: [],
      constants: [],
      metadata: META,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 3. ESCROW
  // ═══════════════════════════════════════════════════════════════════════
  {
    title: "Escrow",
    description: "Two-party token escrow with timelock — Party A deposits, Party B fulfills before deadline.",
    longDescription: "A secure escrow program. Party A deposits tokens; Party B has until a deadline to fulfill the trade. Either party can cancel before the deadline. Demonstrates PDA seeds, close constraint, time checks.",
    category: "DEFI",
    tags: ["escrow", "timelock", "swap", "defi"],
    pricingModel: "FREE" as const,
    templateFlowData: makeFlow(
      [
        { id: "prog", type: "program", position: { x: 40, y: 200 }, data: { name: "escrow", version: "0.1.0" } },
        { id: "ix-init", type: "instruction", position: { x: 260, y: 40 }, data: { name: "initialize_escrow", instructionData: [{ name: "amount", type: "u64" }, { name: "deadline", type: "i64" }] } },
        { id: "ix-exchange", type: "instruction", position: { x: 260, y: 260 }, data: { name: "exchange", instructionData: [] } },
        { id: "ix-cancel", type: "instruction", position: { x: 260, y: 480 }, data: { name: "cancel", instructionData: [] } },

        // init accounts
        { id: "acc-init-escrow", type: "account", position: { x: 520, y: 40 }, data: { name: "escrow", accountType: "account", isMut: true, isInit: true, payer: "maker", space: "auto", stateType: "EscrowState", seeds: [{ type: "literal", value: "escrow" }, { type: "account-field", value: "maker" }], bump: "escrow.bump" } },
        { id: "acc-init-maker", type: "account", position: { x: 740, y: 40 }, data: { name: "maker", accountType: "signer", isSigner: true } },
        { id: "acc-init-sys", type: "account", position: { x: 740, y: 120 }, data: { name: "system_program", accountType: "system-program" } },

        // exchange accounts
        { id: "acc-ex-escrow", type: "account", position: { x: 520, y: 260 }, data: { name: "escrow", accountType: "account", isMut: true, stateType: "EscrowState", seeds: [{ type: "literal", value: "escrow" }, { type: "account-field", value: "maker" }], bump: "escrow.bump" } },
        { id: "acc-ex-taker", type: "account", position: { x: 740, y: 260 }, data: { name: "taker", accountType: "signer", isSigner: true } },
        { id: "acc-ex-sys", type: "account", position: { x: 740, y: 340 }, data: { name: "system_program", accountType: "system-program" } },

        // cancel accounts
        { id: "acc-cl-escrow", type: "account", position: { x: 520, y: 480 }, data: { name: "escrow", accountType: "account", isMut: true, isClose: true, closeTarget: "maker", stateType: "EscrowState", seeds: [{ type: "literal", value: "escrow" }, { type: "account-field", value: "maker" }], bump: "escrow.bump" } },
        { id: "acc-cl-maker", type: "account", position: { x: 740, y: 480 }, data: { name: "maker", accountType: "signer", isSigner: true } },
        { id: "acc-cl-sys", type: "account", position: { x: 740, y: 560 }, data: { name: "system_program", accountType: "system-program" } },

        // Logic - init
        { id: "log-init-1", type: "logic", position: { x: 960, y: 60 }, data: { logicType: "require", requireCondition: "amount > 0", requireErrorCode: "InvalidAmount" } },
        { id: "log-init-2", type: "logic", position: { x: 960, y: 90 }, data: { logicType: "set-field", setAccount: "escrow", setField: "maker", setValue: "*ctx.accounts.maker.key" } },
        { id: "log-init-3", type: "logic", position: { x: 960, y: 120 }, data: { logicType: "set-field", setAccount: "escrow", setField: "amount", setValue: "amount" } },
        { id: "log-init-4", type: "logic", position: { x: 960, y: 150 }, data: { logicType: "set-field", setAccount: "escrow", setField: "deadline", setValue: "deadline" } },
        { id: "log-init-5", type: "logic", position: { x: 960, y: 180 }, data: { logicType: "set-field", setAccount: "escrow", setField: "bump", setValue: "ctx.bumps.escrow" } },

        // Logic - exchange
        { id: "log-ex-1", type: "logic", position: { x: 960, y: 280 }, data: { logicType: "require", requireCondition: "Clock::get()?.unix_timestamp < escrow.deadline", requireErrorCode: "EscrowExpired" } },
        { id: "log-ex-2", type: "logic", position: { x: 960, y: 310 }, data: { logicType: "set-field", setAccount: "escrow", setField: "taker", setValue: "*ctx.accounts.taker.key" } },
        { id: "log-ex-3", type: "logic", position: { x: 960, y: 340 }, data: { logicType: "emit-event", emitEvent: "ExchangeEvent", emitFields: { maker: "*ctx.accounts.escrow.maker", taker: "*ctx.accounts.taker.key", amount: "escrow.amount" } } },

        // State
        { id: "state-escrow", type: "state", position: { x: 960, y: 440 }, data: { name: "EscrowState", fields: [{ name: "maker", type: "Pubkey", description: "Escrow creator" }, { name: "taker", type: "Pubkey", description: "Escrow fulfiller" }, { name: "amount", type: "u64", description: "Escrow amount" }, { name: "deadline", type: "i64", description: "Unix timestamp deadline" }, { name: "bump", type: "u8", description: "PDA bump" }] } },

        // Errors & Events
        { id: "err-inv", type: "error", position: { x: 40, y: 360 }, data: { name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" } },
        { id: "err-exp", type: "error", position: { x: 40, y: 420 }, data: { name: "EscrowExpired", code: 6001, message: "Escrow deadline has passed" } },
        { id: "evt-exchange", type: "event", position: { x: 40, y: 500 }, data: { name: "ExchangeEvent", fields: [{ name: "maker", type: "Pubkey" }, { name: "taker", type: "Pubkey" }, { name: "amount", type: "u64" }] } },
        { id: "evt-cancel", type: "event", position: { x: 40, y: 580 }, data: { name: "CancelEvent", fields: [{ name: "maker", type: "Pubkey" }] } },
      ],
      [
        { id: "e-p-init", source: "prog", target: "ix-init" },
        { id: "e-p-ex", source: "prog", target: "ix-exchange" },
        { id: "e-p-cl", source: "prog", target: "ix-cancel" },
        // init
        { id: "e-init-e", source: "ix-init", target: "acc-init-escrow" },
        { id: "e-init-m", source: "ix-init", target: "acc-init-maker" },
        { id: "e-init-s", source: "ix-init", target: "acc-init-sys" },
        { id: "e-init-l1", source: "ix-init", target: "log-init-1" },
        { id: "e-init-l2", source: "log-init-1", target: "log-init-2" },
        { id: "e-init-l3", source: "log-init-2", target: "log-init-3" },
        { id: "e-init-l4", source: "log-init-3", target: "log-init-4" },
        { id: "e-init-l5", source: "log-init-4", target: "log-init-5" },
        // exchange
        { id: "e-ex-e", source: "ix-exchange", target: "acc-ex-escrow" },
        { id: "e-ex-t", source: "ix-exchange", target: "acc-ex-taker" },
        { id: "e-ex-s", source: "ix-exchange", target: "acc-ex-sys" },
        { id: "e-ex-l1", source: "ix-exchange", target: "log-ex-1" },
        { id: "e-ex-l2", source: "log-ex-1", target: "log-ex-2" },
        { id: "e-ex-l3", source: "log-ex-2", target: "log-ex-3" },
        // cancel
        { id: "e-cl-e", source: "ix-cancel", target: "acc-cl-escrow" },
        { id: "e-cl-m", source: "ix-cancel", target: "acc-cl-maker" },
        { id: "e-cl-s", source: "ix-cancel", target: "acc-cl-sys" },
        // errors & events
        { id: "e-init-err", source: "ix-init", target: "err-inv" },
        { id: "e-ex-err", source: "ix-exchange", target: "err-exp" },
        { id: "e-ex-evt", source: "ix-exchange", target: "evt-exchange" },
        { id: "e-cl-evt", source: "ix-cancel", target: "evt-cancel" },
        // state
        { id: "e-state", source: "state-escrow", target: "acc-init-escrow" },
      ],
    ),
    templateIR: {
      version: "1.0.0",
      program: { name: "escrow", description: "Two-party token escrow with timelock", version: "0.1.0" },
      instructions: [
        { id: "a2000000-0000-0000-0000-000000000001", name: "initialize_escrow", description: "Initialize a new escrow", accessControl: "none", args: [{ name: "amount", type: "u64" }, { name: "deadline", type: "i64" }], accounts: [
          { id: "a2000000-0000-0000-0000-000000000010", name: "escrow", accountType: "account", stateType: "EscrowState", constraints: [{ type: "init", payer: "maker", space: "auto" }, { type: "seeds", seeds: [{ type: "literal", value: "escrow" }, { type: "account-field", value: "maker" }], bump: "escrow.bump" }], description: undefined },
          { id: "a2000000-0000-0000-0000-000000000011", name: "maker", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
          { id: "a2000000-0000-0000-0000-000000000012", name: "system_program", accountType: "system-program", constraints: [], description: undefined },
        ], body: [
          { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
          { type: "set-field", account: "escrow", field: "maker", value: "*ctx.accounts.maker.key" },
          { type: "set-field", account: "escrow", field: "amount", value: "amount" },
          { type: "set-field", account: "escrow", field: "deadline", value: "deadline" },
          { type: "set-field", account: "escrow", field: "bump", value: "ctx.bumps.escrow" },
        ] },
        { id: "a2000000-0000-0000-0000-000000000002", name: "exchange", description: "Fulfill the escrow trade", accessControl: "none", args: [], accounts: [
          { id: "a2000000-0000-0000-0000-000000000020", name: "escrow", accountType: "account", stateType: "EscrowState", constraints: [{ type: "mut" }, { type: "seeds", seeds: [{ type: "literal", value: "escrow" }, { type: "account-field", value: "maker" }], bump: "escrow.bump" }], description: undefined },
          { id: "a2000000-0000-0000-0000-000000000023", name: "maker", accountType: "system-account", constraints: [], description: undefined },
          { id: "a2000000-0000-0000-0000-000000000021", name: "taker", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
          { id: "a2000000-0000-0000-0000-000000000022", name: "system_program", accountType: "system-program", constraints: [], description: undefined },
        ], body: [
          { type: "require", condition: "Clock::get()?.unix_timestamp < escrow.deadline", errorCode: "EscrowExpired" },
          { type: "set-field", account: "escrow", field: "taker", value: "*ctx.accounts.taker.key" },
          { type: "emit-event", event: "ExchangeEvent", fields: { maker: "escrow.maker", taker: "*ctx.accounts.taker.key", amount: "escrow.amount" } },
        ] },
        { id: "a2000000-0000-0000-0000-000000000003", name: "cancel", description: "Cancel the escrow", accessControl: "none", args: [], accounts: [
          { id: "a2000000-0000-0000-0000-000000000030", name: "escrow", accountType: "account", stateType: "EscrowState", constraints: [{ type: "mut" }, { type: "close", target: "maker" }, { type: "seeds", seeds: [{ type: "literal", value: "escrow" }, { type: "account-field", value: "maker" }], bump: "escrow.bump" }], description: undefined },
          { id: "a2000000-0000-0000-0000-000000000031", name: "maker", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
          { id: "a2000000-0000-0000-0000-000000000032", name: "system_program", accountType: "system-program", constraints: [], description: undefined },
        ], body: [
          { type: "emit-event", event: "CancelEvent", fields: { maker: "*ctx.accounts.maker.key" } },
        ] },
      ],
      states: [{ id: "b2000000-0000-0000-0000-000000000001", name: "EscrowState", fields: [{ name: "maker", type: "Pubkey", description: "Escrow creator" }, { name: "taker", type: "Pubkey", description: "Escrow fulfiller" }, { name: "amount", type: "u64", description: "Escrow amount" }, { name: "deadline", type: "i64", description: "Unix timestamp deadline" }, { name: "bump", type: "u8", description: "PDA bump" }], description: undefined, isZeroCopy: false }],
      errors: [{ id: "c2000000-0000-0000-0000-000000000001", name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" }, { id: "c2000000-0000-0000-0000-000000000002", name: "EscrowExpired", code: 6001, message: "Escrow deadline has passed" }],
      events: [{ id: "d2000000-0000-0000-0000-000000000001", name: "ExchangeEvent", fields: [{ name: "maker", type: "Pubkey" }, { name: "taker", type: "Pubkey" }, { name: "amount", type: "u64" }] }, { id: "d2000000-0000-0000-0000-000000000002", name: "CancelEvent", fields: [{ name: "maker", type: "Pubkey" }] }],
      integrations: [],
      constants: [],
      metadata: META,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 4. NFT COLLECTION
  // ═══════════════════════════════════════════════════════════════════════
  {
    title: "NFT Collection",
    description: "Metaplex-compatible NFT collection with mint, verify collection, and update metadata.",
    longDescription: "A full NFT minting program. Covers collection creation, NFT minting with metadata, collection verification.",
    category: "NFT",
    tags: ["nft", "metaplex", "collection", "metadata"],
    pricingModel: "FREE" as const,
    templateFlowData: makeFlow(
      [
        { id: "prog", type: "program", position: { x: 40, y: 180 }, data: { name: "nft_collection", version: "0.1.0" } },
        { id: "ix-create", type: "instruction", position: { x: 260, y: 40 }, data: { name: "create_collection", instructionData: [{ name: "name", type: "String" }, { name: "symbol", type: "String" }] } },
        { id: "ix-mint", type: "instruction", position: { x: 260, y: 240 }, data: { name: "mint_nft", instructionData: [{ name: "uri", type: "String" }] } },
        { id: "ix-verify", type: "instruction", position: { x: 260, y: 440 }, data: { name: "verify_collection", instructionData: [] } },

        // create_collection accounts
        { id: "acc-cr-col", type: "account", position: { x: 520, y: 40 }, data: { name: "collection", accountType: "account", isMut: true, isInit: true, payer: "authority", space: "auto", stateType: "CollectionState" } },
        { id: "acc-cr-auth", type: "account", position: { x: 740, y: 40 }, data: { name: "authority", accountType: "signer", isSigner: true } },
        { id: "acc-cr-sys", type: "account", position: { x: 740, y: 120 }, data: { name: "system_program", accountType: "system-program" } },

        // mint_nft accounts
        { id: "acc-m-col", type: "account", position: { x: 520, y: 240 }, data: { name: "collection", accountType: "account", isMut: true, stateType: "CollectionState" } },
        { id: "acc-m-mint", type: "account", position: { x: 740, y: 240 }, data: { name: "mint", accountType: "mint", isMut: true, isInit: true, payer: "payer", space: 82 } },
        { id: "acc-m-payer", type: "account", position: { x: 960, y: 240 }, data: { name: "payer", accountType: "signer", isSigner: true } },
        { id: "acc-m-sys", type: "account", position: { x: 960, y: 320 }, data: { name: "system_program", accountType: "system-program" } },

        // verify_collection accounts
        { id: "acc-v-col", type: "account", position: { x: 520, y: 440 }, data: { name: "collection", accountType: "account", stateType: "CollectionState" } },
        { id: "acc-v-auth", type: "account", position: { x: 740, y: 440 }, data: { name: "authority", accountType: "signer", isSigner: true } },

        // Logic - create
        { id: "log-cr-1", type: "logic", position: { x: 960, y: 60 }, data: { logicType: "set-field", setAccount: "collection", setField: "authority", setValue: "*ctx.accounts.authority.key" } },
        { id: "log-cr-2", type: "logic", position: { x: 960, y: 90 }, data: { logicType: "set-field", setAccount: "collection", setField: "mint_count", setValue: "0" } },
        { id: "log-cr-3", type: "logic", position: { x: 960, y: 120 }, data: { logicType: "set-field", setAccount: "collection", setField: "name", setValue: "name" } },
        { id: "log-cr-4", type: "logic", position: { x: 960, y: 150 }, data: { logicType: "set-field", setAccount: "collection", setField: "symbol", setValue: "symbol" } },

        // Logic - mint
        { id: "log-m-1", type: "logic", position: { x: 960, y: 380 }, data: { logicType: "math", mathOperation: "add", mathLeft: "collection.mint_count", mathRight: "1", mathResult: "new_count", mathChecked: true } },
        { id: "log-m-2", type: "logic", position: { x: 960, y: 410 }, data: { logicType: "set-field", setAccount: "collection", setField: "mint_count", setValue: "new_count" } },
        { id: "log-m-3", type: "logic", position: { x: 960, y: 440 }, data: { logicType: "emit-event", emitEvent: "NFTMintedEvent", emitFields: { mint: "*ctx.accounts.mint.key", uri: "uri" } } },

        // Logic - verify
        { id: "log-v-1", type: "logic", position: { x: 740, y: 500 }, data: { logicType: "require", requireCondition: "collection.authority == *ctx.accounts.authority.key", requireErrorCode: "Unauthorized" } },

        // State
        { id: "state-col", type: "state", position: { x: 40, y: 340 }, data: { name: "CollectionState", fields: [{ name: "authority", type: "Pubkey", description: "Collection authority" }, { name: "mint_count", type: "u64", description: "Total NFTs minted" }, { name: "name", type: "String", description: "Collection name" }, { name: "symbol", type: "String", description: "Collection symbol" }] } },

        // Errors & Events
        { id: "err-unauth", type: "error", position: { x: 40, y: 440 }, data: { name: "Unauthorized", code: 6000, message: "Not authorized" } },
        { id: "evt-minted", type: "event", position: { x: 40, y: 520 }, data: { name: "NFTMintedEvent", fields: [{ name: "mint", type: "Pubkey" }, { name: "uri", type: "String" }] } },
      ],
      [
        { id: "e-p-cr", source: "prog", target: "ix-create" },
        { id: "e-p-m", source: "prog", target: "ix-mint" },
        { id: "e-p-v", source: "prog", target: "ix-verify" },
        // create
        { id: "e-cr-col", source: "ix-create", target: "acc-cr-col" },
        { id: "e-cr-auth", source: "ix-create", target: "acc-cr-auth" },
        { id: "e-cr-sys", source: "ix-create", target: "acc-cr-sys" },
        { id: "e-cr-l1", source: "ix-create", target: "log-cr-1" },
        { id: "e-cr-l2", source: "log-cr-1", target: "log-cr-2" },
        { id: "e-cr-l3", source: "log-cr-2", target: "log-cr-3" },
        { id: "e-cr-l4", source: "log-cr-3", target: "log-cr-4" },
        // mint
        { id: "e-m-col", source: "ix-mint", target: "acc-m-col" },
        { id: "e-m-mint", source: "ix-mint", target: "acc-m-mint" },
        { id: "e-m-payer", source: "ix-mint", target: "acc-m-payer" },
        { id: "e-m-sys", source: "ix-mint", target: "acc-m-sys" },
        { id: "e-m-l1", source: "ix-mint", target: "log-m-1" },
        { id: "e-m-l2", source: "log-m-1", target: "log-m-2" },
        { id: "e-m-l3", source: "log-m-2", target: "log-m-3" },
        // verify
        { id: "e-v-col", source: "ix-verify", target: "acc-v-col" },
        { id: "e-v-auth", source: "ix-verify", target: "acc-v-auth" },
        { id: "e-v-l1", source: "ix-verify", target: "log-v-1" },
        // errors & events
        { id: "e-v-err", source: "ix-verify", target: "err-unauth" },
        { id: "e-m-evt", source: "ix-mint", target: "evt-minted" },
        // state
        { id: "e-state", source: "state-col", target: "acc-cr-col" },
      ],
    ),
    templateIR: {
      version: "1.0.0",
      program: { name: "nft_collection", description: "NFT collection with mint and verify", version: "0.1.0" },
      instructions: [
        { id: "a3000000-0000-0000-0000-000000000001", name: "create_collection", description: "Create a new NFT collection", args: [{ name: "name", type: "String" }, { name: "symbol", type: "String" }], accounts: [
          { id: "a3000000-0000-0000-0000-000000000010", name: "collection", accountType: "account", stateType: "CollectionState", constraints: [{ type: "init", payer: "authority", space: "auto" }], description: undefined },
          { id: "a3000000-0000-0000-0000-000000000011", name: "authority", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
          { id: "a3000000-0000-0000-0000-000000000012", name: "system_program", accountType: "system-program", constraints: [], description: undefined },
        ], body: [
          { type: "set-field", account: "collection", field: "authority", value: "*ctx.accounts.authority.key" },
          { type: "set-field", account: "collection", field: "mint_count", value: "0" },
          { type: "set-field", account: "collection", field: "name", value: "name" },
          { type: "set-field", account: "collection", field: "symbol", value: "symbol" },
        ] },
        { id: "a3000000-0000-0000-0000-000000000002", name: "mint_nft", description: "Mint a new NFT into the collection", args: [{ name: "uri", type: "String" }], accounts: [
          { id: "a3000000-0000-0000-0000-000000000020", name: "collection", accountType: "account", stateType: "CollectionState", constraints: [{ type: "mut" }], description: undefined },
          { id: "a3000000-0000-0000-0000-000000000021", name: "mint", accountType: "mint", constraints: [{ type: "init", payer: "payer", space: 82 }], description: undefined },
          { id: "a3000000-0000-0000-0000-000000000022", name: "payer", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
          { id: "a3000000-0000-0000-0000-000000000023", name: "system_program", accountType: "system-program", constraints: [], description: undefined },
        ], body: [
          { type: "math", operation: "add", left: "collection.mint_count", right: "1", result: "new_count", checked: true },
          { type: "set-field", account: "collection", field: "mint_count", value: "new_count" },
          { type: "emit-event", event: "NFTMintedEvent", fields: { mint: "*ctx.accounts.mint.key", uri: "uri" } },
        ] },
        { id: "a3000000-0000-0000-0000-000000000003", name: "verify_collection", description: "Verify an NFT belongs to this collection", args: [], accounts: [
          { id: "a3000000-0000-0000-0000-000000000030", name: "collection", accountType: "account", stateType: "CollectionState", constraints: [], description: undefined },
          { id: "a3000000-0000-0000-0000-000000000031", name: "authority", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
        ], body: [
          { type: "require", condition: "collection.authority == *ctx.accounts.authority.key", errorCode: "Unauthorized" },
        ] },
      ],
      states: [{ id: "b3000000-0000-0000-0000-000000000001", name: "CollectionState", fields: [{ name: "authority", type: "Pubkey", description: "Collection authority" }, { name: "mint_count", type: "u64", description: "Total NFTs minted" }, { name: "name", type: "String", description: "Collection name" }, { name: "symbol", type: "String", description: "Collection symbol" }], description: undefined, isZeroCopy: false }],
      errors: [{ id: "c3000000-0000-0000-0000-000000000001", name: "Unauthorized", code: 6000, message: "Not authorized" }],
      events: [{ id: "d3000000-0000-0000-0000-000000000001", name: "NFTMintedEvent", fields: [{ name: "mint", type: "Pubkey" }, { name: "uri", type: "String" }] }],
      integrations: [],
      constants: [{ name: "MAX_SUPPLY", type: "u64", value: "10000" }],
      metadata: META,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 5-7: Staking Pool, DAO Voting, AMM — full flow + IR (compact)
  // These are simpler templates with proper nodes/edges/IR
  // ═══════════════════════════════════════════════════════════════════════
  {
    title: "Staking Pool",
    description: "Token staking pool with time-weighted reward distribution and compound support.",
    longDescription: "A staking program where users lock tokens and earn proportional rewards over time. Implements stake, unstake, and claim_rewards instructions.",
    category: "DEFI",
    tags: ["staking", "rewards", "defi", "yield"],
    pricingModel: "FREE" as const,
    templateFlowData: makeFlow(
      [
        { id: "prog", type: "program", position: { x: 40, y: 200 }, data: { name: "staking_pool", version: "0.1.0" } },
        { id: "ix-init", type: "instruction", position: { x: 260, y: 40 }, data: { name: "initialize_pool", instructionData: [{ name: "reward_rate", type: "u64" }] } },
        { id: "ix-stake", type: "instruction", position: { x: 260, y: 200 }, data: { name: "stake", instructionData: [{ name: "amount", type: "u64" }] } },
        { id: "ix-unstake", type: "instruction", position: { x: 260, y: 360 }, data: { name: "unstake", instructionData: [{ name: "amount", type: "u64" }] } },
        { id: "ix-claim", type: "instruction", position: { x: 260, y: 520 }, data: { name: "claim_rewards", instructionData: [] } },

        // init accounts
        { id: "acc-init-pool", type: "account", position: { x: 520, y: 40 }, data: { name: "pool", accountType: "account", isMut: true, isInit: true, payer: "authority", space: "auto", stateType: "PoolState", seeds: [{ type: "literal", value: "pool" }], bump: "pool.bump" } },
        { id: "acc-init-auth", type: "account", position: { x: 740, y: 40 }, data: { name: "authority", accountType: "signer", isSigner: true } },
        { id: "acc-init-sys", type: "account", position: { x: 740, y: 120 }, data: { name: "system_program", accountType: "system-program" } },

        // stake accounts
        { id: "acc-st-pool", type: "account", position: { x: 520, y: 200 }, data: { name: "pool", accountType: "account", isMut: true, stateType: "PoolState" } },
        { id: "acc-st-staker", type: "account", position: { x: 740, y: 200 }, data: { name: "staker_account", accountType: "account", isMut: true, isInitIfNeeded: true, payer: "staker", space: "auto", stateType: "StakerState" } },
        { id: "acc-st-staker-s", type: "account", position: { x: 960, y: 200 }, data: { name: "staker", accountType: "signer", isSigner: true } },
        { id: "acc-st-sys", type: "account", position: { x: 960, y: 280 }, data: { name: "system_program", accountType: "system-program" } },

        // unstake accounts
        { id: "acc-un-pool", type: "account", position: { x: 520, y: 360 }, data: { name: "pool", accountType: "account", isMut: true, stateType: "PoolState" } },
        { id: "acc-un-staker", type: "account", position: { x: 740, y: 360 }, data: { name: "staker_account", accountType: "account", isMut: true, stateType: "StakerState" } },
        { id: "acc-un-s", type: "account", position: { x: 960, y: 360 }, data: { name: "staker", accountType: "signer", isSigner: true } },

        // claim accounts
        { id: "acc-cl-pool", type: "account", position: { x: 520, y: 520 }, data: { name: "pool", accountType: "account", isMut: true, stateType: "PoolState" } },
        { id: "acc-cl-staker", type: "account", position: { x: 740, y: 520 }, data: { name: "staker_account", accountType: "account", isMut: true, stateType: "StakerState" } },
        { id: "acc-cl-s", type: "account", position: { x: 960, y: 520 }, data: { name: "staker", accountType: "signer", isSigner: true } },

        // States
        { id: "state-pool", type: "state", position: { x: 40, y: 400 }, data: { name: "PoolState", fields: [{ name: "authority", type: "Pubkey" }, { name: "total_staked", type: "u64" }, { name: "reward_rate", type: "u64" }, { name: "bump", type: "u8" }] } },
        { id: "state-staker", type: "state", position: { x: 40, y: 500 }, data: { name: "StakerState", fields: [{ name: "staker", type: "Pubkey" }, { name: "staked_amount", type: "u64" }, { name: "pending_rewards", type: "u64" }] } },

        // Errors
        { id: "err-inv", type: "error", position: { x: 40, y: 580 }, data: { name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" } },
        { id: "err-insuf", type: "error", position: { x: 40, y: 640 }, data: { name: "InsufficientStake", code: 6001, message: "Insufficient staked amount" } },
      ],
      [
        { id: "e-p-init", source: "prog", target: "ix-init" },
        { id: "e-p-st", source: "prog", target: "ix-stake" },
        { id: "e-p-un", source: "prog", target: "ix-unstake" },
        { id: "e-p-cl", source: "prog", target: "ix-claim" },
        // init
        { id: "e-i-p", source: "ix-init", target: "acc-init-pool" },
        { id: "e-i-a", source: "ix-init", target: "acc-init-auth" },
        { id: "e-i-s", source: "ix-init", target: "acc-init-sys" },
        // stake
        { id: "e-s-p", source: "ix-stake", target: "acc-st-pool" },
        { id: "e-s-sa", source: "ix-stake", target: "acc-st-staker" },
        { id: "e-s-s", source: "ix-stake", target: "acc-st-staker-s" },
        { id: "e-s-sys", source: "ix-stake", target: "acc-st-sys" },
        { id: "e-s-err", source: "ix-stake", target: "err-inv" },
        // unstake
        { id: "e-u-p", source: "ix-unstake", target: "acc-un-pool" },
        { id: "e-u-sa", source: "ix-unstake", target: "acc-un-staker" },
        { id: "e-u-s", source: "ix-unstake", target: "acc-un-s" },
        { id: "e-u-err1", source: "ix-unstake", target: "err-inv" },
        { id: "e-u-err2", source: "ix-unstake", target: "err-insuf" },
        // claim
        { id: "e-c-p", source: "ix-claim", target: "acc-cl-pool" },
        { id: "e-c-sa", source: "ix-claim", target: "acc-cl-staker" },
        { id: "e-c-s", source: "ix-claim", target: "acc-cl-s" },
        // state
        { id: "e-state-p", source: "state-pool", target: "acc-init-pool" },
        { id: "e-state-s", source: "state-staker", target: "acc-st-staker" },
      ],
    ),
    templateIR: {
      version: "1.0.0",
      program: { name: "staking_pool", description: "Token staking with time-weighted rewards", version: "0.1.0" },
      instructions: [
        { id: "a4000000-0000-0000-0000-000000000001", name: "initialize_pool", description: "Initialize the staking pool", args: [{ name: "reward_rate", type: "u64" }], accounts: [
          { id: "a4000000-0000-0000-0000-000000000010", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "init", payer: "authority", space: "auto" }, { type: "seeds", seeds: [{ type: "literal", value: "pool" }], bump: "pool.bump" }], description: undefined },
          { id: "a4000000-0000-0000-0000-000000000011", name: "authority", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
          { id: "a4000000-0000-0000-0000-000000000012", name: "system_program", accountType: "system-program", constraints: [], description: undefined },
        ], body: [
          { type: "set-field", account: "pool", field: "authority", value: "*ctx.accounts.authority.key" },
          { type: "set-field", account: "pool", field: "total_staked", value: "0" },
          { type: "set-field", account: "pool", field: "reward_rate", value: "reward_rate" },
          { type: "set-field", account: "pool", field: "bump", value: "ctx.bumps.pool" },
        ] },
        { id: "a4000000-0000-0000-0000-000000000002", name: "stake", description: "Stake tokens into the pool", args: [{ name: "amount", type: "u64" }], accounts: [
          { id: "a4000000-0000-0000-0000-000000000020", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "mut" }], description: undefined },
          { id: "a4000000-0000-0000-0000-000000000021", name: "staker_account", accountType: "account", stateType: "StakerState", constraints: [{ type: "init-if-needed", payer: "staker", space: "auto" }], description: undefined },
          { id: "a4000000-0000-0000-0000-000000000022", name: "staker", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
          { id: "a4000000-0000-0000-0000-000000000023", name: "system_program", accountType: "system-program", constraints: [], description: undefined },
        ], body: [
          { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
          { type: "math", operation: "add", left: "staker_account.staked_amount", right: "amount", result: "new_staked", checked: true },
          { type: "set-field", account: "staker_account", field: "staked_amount", value: "new_staked" },
          { type: "math", operation: "add", left: "pool.total_staked", right: "amount", result: "new_total", checked: true },
          { type: "set-field", account: "pool", field: "total_staked", value: "new_total" },
        ] },
        { id: "a4000000-0000-0000-0000-000000000003", name: "unstake", description: "Unstake tokens from the pool", args: [{ name: "amount", type: "u64" }], accounts: [
          { id: "a4000000-0000-0000-0000-000000000030", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "mut" }], description: undefined },
          { id: "a4000000-0000-0000-0000-000000000031", name: "staker_account", accountType: "account", stateType: "StakerState", constraints: [{ type: "mut" }], description: undefined },
          { id: "a4000000-0000-0000-0000-000000000032", name: "staker", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
        ], body: [
          { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
          { type: "require", condition: "staker_account.staked_amount >= amount", errorCode: "InsufficientStake" },
          { type: "math", operation: "sub", left: "staker_account.staked_amount", right: "amount", result: "remaining", checked: true },
          { type: "set-field", account: "staker_account", field: "staked_amount", value: "remaining" },
          { type: "math", operation: "sub", left: "pool.total_staked", right: "amount", result: "new_total", checked: true },
          { type: "set-field", account: "pool", field: "total_staked", value: "new_total" },
        ] },
        { id: "a4000000-0000-0000-0000-000000000004", name: "claim_rewards", description: "Claim accumulated rewards", args: [], accounts: [
          { id: "a4000000-0000-0000-0000-000000000040", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "mut" }], description: undefined },
          { id: "a4000000-0000-0000-0000-000000000041", name: "staker_account", accountType: "account", stateType: "StakerState", constraints: [{ type: "mut" }], description: undefined },
          { id: "a4000000-0000-0000-0000-000000000042", name: "staker", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
        ], body: [
          { type: "set-field", account: "staker_account", field: "pending_rewards", value: "0" },
        ] },
      ],
      states: [
        { id: "b4000000-0000-0000-0000-000000000001", name: "PoolState", fields: [{ name: "authority", type: "Pubkey" }, { name: "total_staked", type: "u64" }, { name: "reward_rate", type: "u64" }, { name: "bump", type: "u8" }], description: undefined, isZeroCopy: false },
        { id: "b4000000-0000-0000-0000-000000000002", name: "StakerState", fields: [{ name: "staker", type: "Pubkey" }, { name: "staked_amount", type: "u64" }, { name: "pending_rewards", type: "u64" }], description: undefined, isZeroCopy: false },
      ],
      errors: [{ id: "c4000000-0000-0000-0000-000000000001", name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" }, { id: "c4000000-0000-0000-0000-000000000002", name: "InsufficientStake", code: 6001, message: "Insufficient staked amount" }],
      events: [],
      integrations: [],
      constants: [{ name: "MIN_STAKE", type: "u64", value: "1_000_000" }],
      metadata: META,
    },
  },

  {
    title: "DAO Voting",
    description: "On-chain DAO with proposal creation, token-weighted voting, and execution timelock.",
    longDescription: "A minimal DAO program. Members create proposals, cast votes weighted by token holdings, and execute approved proposals after a timelock.",
    category: "DAO",
    tags: ["dao", "voting", "governance", "proposals"],
    pricingModel: "FREE" as const,
    templateFlowData: makeFlow(
      [
        { id: "prog", type: "program", position: { x: 40, y: 180 }, data: { name: "dao_voting", version: "0.1.0" } },
        { id: "ix-create", type: "instruction", position: { x: 260, y: 40 }, data: { name: "create_proposal", instructionData: [{ name: "description", type: "String" }, { name: "deadline", type: "i64" }] } },
        { id: "ix-vote", type: "instruction", position: { x: 260, y: 240 }, data: { name: "cast_vote", instructionData: [{ name: "support", type: "bool" }] } },
        { id: "ix-execute", type: "instruction", position: { x: 260, y: 440 }, data: { name: "execute_proposal", instructionData: [] } },

        // create accounts
        { id: "acc-cr-prop", type: "account", position: { x: 520, y: 40 }, data: { name: "proposal", accountType: "account", isMut: true, isInit: true, payer: "proposer", space: "auto", stateType: "ProposalState", seeds: [{ type: "literal", value: "proposal" }, { type: "account-field", value: "proposer" }], bump: "proposal.bump" } },
        { id: "acc-cr-proposer", type: "account", position: { x: 740, y: 40 }, data: { name: "proposer", accountType: "signer", isSigner: true } },
        { id: "acc-cr-sys", type: "account", position: { x: 740, y: 120 }, data: { name: "system_program", accountType: "system-program" } },

        // vote accounts
        { id: "acc-v-prop", type: "account", position: { x: 520, y: 240 }, data: { name: "proposal", accountType: "account", isMut: true, stateType: "ProposalState" } },
        { id: "acc-v-rec", type: "account", position: { x: 740, y: 240 }, data: { name: "vote_record", accountType: "account", isMut: true, isInit: true, payer: "voter", space: "auto", stateType: "VoteRecord" } },
        { id: "acc-v-voter", type: "account", position: { x: 960, y: 240 }, data: { name: "voter", accountType: "signer", isSigner: true } },
        { id: "acc-v-sys", type: "account", position: { x: 960, y: 320 }, data: { name: "system_program", accountType: "system-program" } },

        // execute accounts
        { id: "acc-ex-prop", type: "account", position: { x: 520, y: 440 }, data: { name: "proposal", accountType: "account", isMut: true, stateType: "ProposalState" } },
        { id: "acc-ex-exec", type: "account", position: { x: 740, y: 440 }, data: { name: "executor", accountType: "signer", isSigner: true } },

        // States
        { id: "state-prop", type: "state", position: { x: 40, y: 340 }, data: { name: "ProposalState", fields: [{ name: "proposer", type: "Pubkey" }, { name: "description", type: "String" }, { name: "votes_for", type: "u64" }, { name: "votes_against", type: "u64" }, { name: "deadline", type: "i64" }, { name: "executed", type: "bool" }, { name: "bump", type: "u8" }] } },
        { id: "state-vote", type: "state", position: { x: 40, y: 440 }, data: { name: "VoteRecord", fields: [{ name: "voter", type: "Pubkey" }, { name: "proposal", type: "Pubkey" }, { name: "support", type: "bool" }, { name: "weight", type: "u64" }] } },

        // Errors
        { id: "err-ended", type: "error", position: { x: 40, y: 540 }, data: { name: "VotingEnded", code: 6000, message: "Voting period has ended" } },
        { id: "err-exec", type: "error", position: { x: 40, y: 600 }, data: { name: "AlreadyExecuted", code: 6001, message: "Proposal already executed" } },
        { id: "err-reject", type: "error", position: { x: 40, y: 660 }, data: { name: "ProposalRejected", code: 6002, message: "Proposal did not pass" } },
      ],
      [
        { id: "e-p-cr", source: "prog", target: "ix-create" },
        { id: "e-p-v", source: "prog", target: "ix-vote" },
        { id: "e-p-ex", source: "prog", target: "ix-execute" },
        // create
        { id: "e-cr-p", source: "ix-create", target: "acc-cr-prop" },
        { id: "e-cr-pr", source: "ix-create", target: "acc-cr-proposer" },
        { id: "e-cr-s", source: "ix-create", target: "acc-cr-sys" },
        // vote
        { id: "e-v-p", source: "ix-vote", target: "acc-v-prop" },
        { id: "e-v-r", source: "ix-vote", target: "acc-v-rec" },
        { id: "e-v-v", source: "ix-vote", target: "acc-v-voter" },
        { id: "e-v-s", source: "ix-vote", target: "acc-v-sys" },
        { id: "e-v-e1", source: "ix-vote", target: "err-ended" },
        { id: "e-v-e2", source: "ix-vote", target: "err-exec" },
        // execute
        { id: "e-ex-p", source: "ix-execute", target: "acc-ex-prop" },
        { id: "e-ex-e", source: "ix-execute", target: "acc-ex-exec" },
        { id: "e-ex-e1", source: "ix-execute", target: "err-exec" },
        { id: "e-ex-e2", source: "ix-execute", target: "err-reject" },
        // state
        { id: "e-st-p", source: "state-prop", target: "acc-cr-prop" },
        { id: "e-st-v", source: "state-vote", target: "acc-v-rec" },
      ],
    ),
    templateIR: {
      version: "1.0.0",
      program: { name: "dao_voting", description: "On-chain DAO with token-weighted voting", version: "0.1.0" },
      instructions: [
        { id: "a5000000-0000-0000-0000-000000000001", name: "create_proposal", args: [{ name: "description", type: "String" }, { name: "deadline", type: "i64" }], accounts: [
          { id: "a5000000-0000-0000-0000-000000000010", name: "proposal", accountType: "account", stateType: "ProposalState", constraints: [{ type: "init", payer: "proposer", space: "auto" }, { type: "seeds", seeds: [{ type: "literal", value: "proposal" }, { type: "account-field", value: "proposer" }], bump: "proposal.bump" }], description: undefined },
          { id: "a5000000-0000-0000-0000-000000000011", name: "proposer", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
          { id: "a5000000-0000-0000-0000-000000000012", name: "system_program", accountType: "system-program", constraints: [], description: undefined },
        ], body: [
          { type: "set-field", account: "proposal", field: "proposer", value: "*ctx.accounts.proposer.key" },
          { type: "set-field", account: "proposal", field: "description", value: "description" },
          { type: "set-field", account: "proposal", field: "votes_for", value: "0" },
          { type: "set-field", account: "proposal", field: "votes_against", value: "0" },
          { type: "set-field", account: "proposal", field: "deadline", value: "deadline" },
          { type: "set-field", account: "proposal", field: "executed", value: "false" },
          { type: "set-field", account: "proposal", field: "bump", value: "ctx.bumps.proposal" },
        ] },
        { id: "a5000000-0000-0000-0000-000000000002", name: "cast_vote", args: [{ name: "support", type: "bool" }], accounts: [
          { id: "a5000000-0000-0000-0000-000000000020", name: "proposal", accountType: "account", stateType: "ProposalState", constraints: [{ type: "mut" }], description: undefined },
          { id: "a5000000-0000-0000-0000-000000000021", name: "vote_record", accountType: "account", stateType: "VoteRecord", constraints: [{ type: "init", payer: "voter", space: "auto" }], description: undefined },
          { id: "a5000000-0000-0000-0000-000000000022", name: "voter", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
          { id: "a5000000-0000-0000-0000-000000000023", name: "system_program", accountType: "system-program", constraints: [], description: undefined },
        ], body: [
          { type: "require", condition: "Clock::get()?.unix_timestamp < proposal.deadline", errorCode: "VotingEnded" },
          { type: "require", condition: "proposal.executed == false", errorCode: "AlreadyExecuted" },
          { type: "set-field", account: "vote_record", field: "voter", value: "*ctx.accounts.voter.key" },
          { type: "set-field", account: "vote_record", field: "support", value: "support" },
        ] },
        { id: "a5000000-0000-0000-0000-000000000003", name: "execute_proposal", args: [], accounts: [
          { id: "a5000000-0000-0000-0000-000000000030", name: "proposal", accountType: "account", stateType: "ProposalState", constraints: [{ type: "mut" }], description: undefined },
          { id: "a5000000-0000-0000-0000-000000000031", name: "executor", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
        ], body: [
          { type: "require", condition: "proposal.executed == false", errorCode: "AlreadyExecuted" },
          { type: "require", condition: "proposal.votes_for > proposal.votes_against", errorCode: "ProposalRejected" },
          { type: "set-field", account: "proposal", field: "executed", value: "true" },
        ] },
      ],
      states: [
        { id: "b5000000-0000-0000-0000-000000000001", name: "ProposalState", fields: [{ name: "proposer", type: "Pubkey" }, { name: "description", type: "String" }, { name: "votes_for", type: "u64" }, { name: "votes_against", type: "u64" }, { name: "deadline", type: "i64" }, { name: "executed", type: "bool" }, { name: "bump", type: "u8" }], description: undefined, isZeroCopy: false },
        { id: "b5000000-0000-0000-0000-000000000002", name: "VoteRecord", fields: [{ name: "voter", type: "Pubkey" }, { name: "proposal", type: "Pubkey" }, { name: "support", type: "bool" }, { name: "weight", type: "u64" }], description: undefined, isZeroCopy: false },
      ],
      errors: [{ id: "c5000000-0000-0000-0000-000000000001", name: "VotingEnded", code: 6000, message: "Voting period has ended" }, { id: "c5000000-0000-0000-0000-000000000002", name: "AlreadyExecuted", code: 6001, message: "Proposal already executed" }, { id: "c5000000-0000-0000-0000-000000000003", name: "ProposalRejected", code: 6002, message: "Proposal did not pass" }],
      events: [],
      integrations: [],
      constants: [{ name: "QUORUM", type: "u64", value: "10" }],
      metadata: META,
    },
  },

  {
    title: "AMM (Basic)",
    description: "Constant-product AMM (x*y=k) with add/remove liquidity and swap instructions.",
    longDescription: "A basic automated market maker using the constant product formula. Supports adding liquidity, removing liquidity, and token swaps with LP token minting.",
    category: "DEFI",
    tags: ["amm", "swap", "liquidity", "defi", "dex"],
    pricingModel: "FREE" as const,
    templateFlowData: makeFlow(
      [
        { id: "prog", type: "program", position: { x: 40, y: 200 }, data: { name: "amm", version: "0.1.0" } },
        { id: "ix-init", type: "instruction", position: { x: 260, y: 40 }, data: { name: "initialize_pool", instructionData: [] } },
        { id: "ix-add", type: "instruction", position: { x: 260, y: 200 }, data: { name: "add_liquidity", instructionData: [{ name: "token_a_amount", type: "u64" }, { name: "token_b_amount", type: "u64" }] } },
        { id: "ix-remove", type: "instruction", position: { x: 260, y: 360 }, data: { name: "remove_liquidity", instructionData: [{ name: "lp_amount", type: "u64" }] } },
        { id: "ix-swap", type: "instruction", position: { x: 260, y: 520 }, data: { name: "swap", instructionData: [{ name: "amount_in", type: "u64" }, { name: "min_amount_out", type: "u64" }] } },

        // init accounts
        { id: "acc-i-pool", type: "account", position: { x: 520, y: 40 }, data: { name: "pool", accountType: "account", isMut: true, isInit: true, payer: "authority", space: "auto", stateType: "PoolState", seeds: [{ type: "literal", value: "pool" }, { type: "account-field", value: "authority" }], bump: "pool.bump" } },
        { id: "acc-i-auth", type: "account", position: { x: 740, y: 40 }, data: { name: "authority", accountType: "signer", isSigner: true } },
        { id: "acc-i-sys", type: "account", position: { x: 740, y: 120 }, data: { name: "system_program", accountType: "system-program" } },

        // add liquidity accounts
        { id: "acc-a-pool", type: "account", position: { x: 520, y: 200 }, data: { name: "pool", accountType: "account", isMut: true, stateType: "PoolState" } },
        { id: "acc-a-prov", type: "account", position: { x: 740, y: 200 }, data: { name: "provider", accountType: "signer", isSigner: true } },

        // remove liquidity accounts
        { id: "acc-r-pool", type: "account", position: { x: 520, y: 360 }, data: { name: "pool", accountType: "account", isMut: true, stateType: "PoolState" } },
        { id: "acc-r-prov", type: "account", position: { x: 740, y: 360 }, data: { name: "provider", accountType: "signer", isSigner: true } },

        // swap accounts
        { id: "acc-s-pool", type: "account", position: { x: 520, y: 520 }, data: { name: "pool", accountType: "account", isMut: true, stateType: "PoolState" } },
        { id: "acc-s-trader", type: "account", position: { x: 740, y: 520 }, data: { name: "trader", accountType: "signer", isSigner: true } },

        // State
        { id: "state-pool", type: "state", position: { x: 40, y: 380 }, data: { name: "PoolState", fields: [{ name: "authority", type: "Pubkey" }, { name: "token_a_vault", type: "Pubkey" }, { name: "token_b_vault", type: "Pubkey" }, { name: "lp_mint", type: "Pubkey" }, { name: "total_lp", type: "u64" }, { name: "bump", type: "u8" }] } },

        // Errors
        { id: "err-inv", type: "error", position: { x: 40, y: 480 }, data: { name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" } },
        { id: "err-slippage", type: "error", position: { x: 40, y: 540 }, data: { name: "SlippageExceeded", code: 6001, message: "Slippage tolerance exceeded" } },
      ],
      [
        { id: "e-p-i", source: "prog", target: "ix-init" },
        { id: "e-p-a", source: "prog", target: "ix-add" },
        { id: "e-p-r", source: "prog", target: "ix-remove" },
        { id: "e-p-s", source: "prog", target: "ix-swap" },
        // init
        { id: "e-i-p", source: "ix-init", target: "acc-i-pool" },
        { id: "e-i-a", source: "ix-init", target: "acc-i-auth" },
        { id: "e-i-s", source: "ix-init", target: "acc-i-sys" },
        // add
        { id: "e-a-p", source: "ix-add", target: "acc-a-pool" },
        { id: "e-a-pr", source: "ix-add", target: "acc-a-prov" },
        { id: "e-a-err", source: "ix-add", target: "err-inv" },
        // remove
        { id: "e-r-p", source: "ix-remove", target: "acc-r-pool" },
        { id: "e-r-pr", source: "ix-remove", target: "acc-r-prov" },
        { id: "e-r-err", source: "ix-remove", target: "err-inv" },
        // swap
        { id: "e-s-p", source: "ix-swap", target: "acc-s-pool" },
        { id: "e-s-t", source: "ix-swap", target: "acc-s-trader" },
        { id: "e-s-err1", source: "ix-swap", target: "err-inv" },
        { id: "e-s-err2", source: "ix-swap", target: "err-slippage" },
        // state
        { id: "e-st", source: "state-pool", target: "acc-i-pool" },
      ],
    ),
    templateIR: {
      version: "1.0.0",
      program: { name: "amm", description: "Constant-product AMM with liquidity and swaps", version: "0.1.0" },
      instructions: [
        { id: "a6000000-0000-0000-0000-000000000001", name: "initialize_pool", args: [], accounts: [
          { id: "a6000000-0000-0000-0000-000000000010", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "init", payer: "authority", space: "auto" }, { type: "seeds", seeds: [{ type: "literal", value: "pool" }, { type: "account-field", value: "authority" }], bump: "pool.bump" }], description: undefined },
          { id: "a6000000-0000-0000-0000-000000000011", name: "authority", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
          { id: "a6000000-0000-0000-0000-000000000012", name: "system_program", accountType: "system-program", constraints: [], description: undefined },
        ], body: [
          { type: "set-field", account: "pool", field: "authority", value: "*ctx.accounts.authority.key" },
          { type: "set-field", account: "pool", field: "total_lp", value: "0" },
          { type: "set-field", account: "pool", field: "bump", value: "ctx.bumps.pool" },
        ] },
        { id: "a6000000-0000-0000-0000-000000000002", name: "add_liquidity", args: [{ name: "token_a_amount", type: "u64" }, { name: "token_b_amount", type: "u64" }], accounts: [
          { id: "a6000000-0000-0000-0000-000000000020", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "mut" }], description: undefined },
          { id: "a6000000-0000-0000-0000-000000000021", name: "provider", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
        ], body: [
          { type: "require", condition: "token_a_amount > 0", errorCode: "InvalidAmount" },
          { type: "require", condition: "token_b_amount > 0", errorCode: "InvalidAmount" },
          { type: "math", operation: "add", left: "pool.total_lp", right: "token_a_amount", result: "new_total", checked: true },
          { type: "set-field", account: "pool", field: "total_lp", value: "new_total" },
        ] },
        { id: "a6000000-0000-0000-0000-000000000003", name: "remove_liquidity", args: [{ name: "lp_amount", type: "u64" }], accounts: [
          { id: "a6000000-0000-0000-0000-000000000030", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "mut" }], description: undefined },
          { id: "a6000000-0000-0000-0000-000000000031", name: "provider", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
        ], body: [
          { type: "require", condition: "lp_amount > 0", errorCode: "InvalidAmount" },
          { type: "math", operation: "sub", left: "pool.total_lp", right: "lp_amount", result: "new_total", checked: true },
          { type: "set-field", account: "pool", field: "total_lp", value: "new_total" },
        ] },
        { id: "a6000000-0000-0000-0000-000000000004", name: "swap", args: [{ name: "amount_in", type: "u64" }, { name: "min_amount_out", type: "u64" }], accounts: [
          { id: "a6000000-0000-0000-0000-000000000040", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "mut" }], description: undefined },
          { id: "a6000000-0000-0000-0000-000000000041", name: "trader", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
        ], body: [
          { type: "require", condition: "amount_in > 0", errorCode: "InvalidAmount" },
          { type: "require", condition: "min_amount_out > 0", errorCode: "SlippageExceeded" },
        ] },
      ],
      states: [{ id: "b6000000-0000-0000-0000-000000000001", name: "PoolState", fields: [{ name: "authority", type: "Pubkey" }, { name: "token_a_vault", type: "Pubkey" }, { name: "token_b_vault", type: "Pubkey" }, { name: "lp_mint", type: "Pubkey" }, { name: "total_lp", type: "u64" }, { name: "bump", type: "u8" }], description: undefined, isZeroCopy: false }],
      errors: [{ id: "c6000000-0000-0000-0000-000000000001", name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" }, { id: "c6000000-0000-0000-0000-000000000002", name: "SlippageExceeded", code: 6001, message: "Slippage tolerance exceeded" }],
      events: [],
      integrations: [],
      constants: [{ name: "SWAP_FEE_BPS", type: "u64", value: "30" }],
      metadata: META,
    },
  },
] as const;

// ─── Seed function ────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding starter templates...");

  await prisma.user.upsert({
    where: { id: SYSTEM_USER_ID },
    update: {},
    create: {
      id: SYSTEM_USER_ID,
      name: "SolStudio Team",
      email: "templates@solflow.dev",
      authProvider: "EMAIL",
    },
  });

  // Clean old seeded data first
  const oldListings = await prisma.marketplaceListing.findMany({
    where: { authorId: SYSTEM_USER_ID },
    select: { id: true, projectId: true },
  });
  for (const ol of oldListings) {
    await prisma.marketplaceListing.delete({ where: { id: ol.id } }).catch(() => {});
  }
  const oldProjects = await prisma.project.findMany({
    where: { userId: SYSTEM_USER_ID },
    select: { id: true },
  });
  for (const op of oldProjects) {
    await prisma.project.delete({ where: { id: op.id } }).catch(() => {});
  }

  for (const template of TEMPLATES) {
    const project = await prisma.project.create({
      data: {
        name: template.title,
        description: template.description,
        framework: "ANCHOR",
        userId: SYSTEM_USER_ID,
        flowData: template.templateFlowData as object,
        irData: template.templateIR as object,
      },
    });

    await prisma.marketplaceListing.create({
      data: {
        projectId: project.id,
        authorId: SYSTEM_USER_ID,
        title: template.title,
        description: template.description,
        longDescription: template.longDescription,
        category: template.category,
        tags: [...template.tags],
        pricingModel: template.pricingModel,
        templateFlowData: template.templateFlowData as object,
        templateIR: template.templateIR as object,
        status: "PUBLISHED",
        featured: true,
        publishedAt: new Date(),
      },
    });
    console.log(`  Seeded: ${template.title}`);
  }

  console.log("Done — 7 starter templates seeded.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
