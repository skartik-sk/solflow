import { describe, it, expect } from "vitest";
import { generateCode } from "../index";
import type { ProgramIR } from "@solflow/ir";

// ─── Vault: PDA with seeds, bump, token ops, events, math, require ─────────

const VAULT_IR: ProgramIR = {
  version: "1.0.0",
  program: {
    name: "vault",
    description: "SOL vault with PDA, deposits, withdrawals, and events",
    version: "0.1.0",
    programId: "Vault11111111111111111111111111111111111111",
  },
  instructions: [
    // initialize: PDA account with seeds, init, state type
    {
      id: "a0000000-0000-0000-0000-000000000001",
      name: "initialize",
      description: "Initialize a new vault",
      args: [],
      accounts: [
        {
          id: "a0000000-0000-0000-0000-000000000010",
          name: "vault",
          accountType: "account",
          stateType: "VaultState",
          constraints: [
            { type: "init", payer: "authority", space: "auto" },
            { type: "seeds", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" },
          ],
        },
        {
          id: "a0000000-0000-0000-0000-000000000011",
          name: "authority",
          accountType: "signer",
          constraints: [{ type: "signer" }],
        },
        {
          id: "a0000000-0000-0000-0000-000000000012",
          name: "system_program",
          accountType: "system-program",
          constraints: [],
        },
      ],
      body: [
        { type: "set-field", account: "vault", field: "authority", value: "*ctx.accounts.authority.key" },
        { type: "set-field", account: "vault", field: "balance", value: "0" },
        { type: "set-field", account: "vault", field: "bump", value: "ctx.bumps.vault" },
      ],
    },
    // deposit: transfer-sol + math (checked add) + emit-event
    {
      id: "a0000000-0000-0000-0000-000000000002",
      name: "deposit",
      args: [{ name: "amount", type: "u64", description: "Amount of lamports to deposit" }],
      accounts: [
        {
          id: "a0000000-0000-0000-0000-000000000020",
          name: "vault",
          accountType: "account",
          stateType: "VaultState",
          constraints: [
            { type: "mut" },
            { type: "seeds", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" },
          ],
        },
        {
          id: "a0000000-0000-0000-0000-000000000021",
          name: "authority",
          accountType: "signer",
          constraints: [{ type: "signer" }],
        },
        {
          id: "a0000000-0000-0000-0000-000000000022",
          name: "system_program",
          accountType: "system-program",
          constraints: [],
        },
      ],
      body: [
        { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
        { type: "transfer-sol", from: "authority", to: "vault", amount: "amount" },
        { type: "math", operation: "add", left: "vault.balance", right: "amount", result: "new_balance", checked: true },
        { type: "set-field", account: "vault", field: "balance", value: "new_balance" },
        { type: "emit-event", event: "DepositEvent", fields: { authority: "*ctx.accounts.authority.key", amount: "amount", new_balance: "new_balance" } },
      ],
    },
    // withdraw: transfer-sol (signed PDA) + require + math (checked sub) + return-error
    {
      id: "a0000000-0000-0000-0000-000000000003",
      name: "withdraw",
      args: [{ name: "amount", type: "u64" }],
      accounts: [
        {
          id: "a0000000-0000-0000-0000-000000000030",
          name: "vault",
          accountType: "account",
          stateType: "VaultState",
          constraints: [
            { type: "mut" },
            { type: "seeds", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" },
          ],
        },
        {
          id: "a0000000-0000-0000-0000-000000000031",
          name: "authority",
          accountType: "signer",
          constraints: [{ type: "signer" }],
        },
        {
          id: "a0000000-0000-0000-0000-000000000032",
          name: "system_program",
          accountType: "system-program",
          constraints: [],
        },
      ],
      body: [
        { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
        { type: "require", condition: "vault.balance >= amount", errorCode: "InsufficientFunds" },
        { type: "if-else", condition: "amount == vault.balance", thenBody: [
          { type: "set-field", account: "vault", field: "balance", value: "0" },
        ], elseBody: [
          { type: "math", operation: "sub", left: "vault.balance", right: "amount", result: "remaining", checked: true },
          { type: "set-field", account: "vault", field: "balance", value: "remaining" },
        ] },
        { type: "emit-event", event: "WithdrawEvent", fields: { authority: "*ctx.accounts.authority.key", amount: "amount" } },
      ],
    },
    // close_vault: close constraint
    {
      id: "a0000000-0000-0000-0000-000000000004",
      name: "close_vault",
      args: [],
      accounts: [
        {
          id: "a0000000-0000-0000-0000-000000000040",
          name: "vault",
          accountType: "account",
          stateType: "VaultState",
          constraints: [
            { type: "mut" },
            { type: "close", target: "authority" },
            { type: "seeds", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" },
          ],
        },
        {
          id: "a0000000-0000-0000-0000-000000000041",
          name: "authority",
          accountType: "signer",
          constraints: [{ type: "signer" }],
        },
        {
          id: "a0000000-0000-0000-0000-000000000042",
          name: "system_program",
          accountType: "system-program",
          constraints: [],
        },
      ],
      body: [],
    },
  ],
  states: [
    {
      id: "b0000000-0000-0000-0000-000000000001",
      name: "VaultState",
      fields: [
        { name: "authority", type: "Pubkey", description: "Vault owner" },
        { name: "balance", type: "u64", description: "Current vault balance" },
        { name: "bump", type: "u8", description: "PDA bump seed" },
      ],
    },
  ],
  errors: [
    { id: "c0000000-0000-0000-0000-000000000001", name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" },
    { id: "c0000000-0000-0000-0000-000000000002", name: "InsufficientFunds", code: 6001, message: "Insufficient funds in vault" },
  ],
  events: [
    {
      id: "d0000000-0000-0000-0000-000000000001",
      name: "DepositEvent",
      fields: [
        { name: "authority", type: "Pubkey" },
        { name: "amount", type: "u64" },
        { name: "new_balance", type: "u64" },
      ],
    },
    {
      id: "d0000000-0000-0000-0000-000000000002",
      name: "WithdrawEvent",
      fields: [
        { name: "authority", type: "Pubkey" },
        { name: "amount", type: "u64" },
      ],
    },
  ],
  integrations: [],
  constants: [
    { name: "MAX_DEPOSIT", type: "u64", value: "1_000_000_000_000" },
  ],
  metadata: {
    createdAt: "2026-04-17T00:00:00.000Z",
    updatedAt: "2026-04-17T00:00:00.000Z",
    flowHash: "vault_example",
    generatorVersion: "0.1.0",
  },
};

// ─── Escrow: token operations, associated-token, has-one, custom-code ────────

const ESCROW_IR: ProgramIR = {
  version: "1.0.0",
  program: { name: "escrow", description: "Token escrow with SPL token support", version: "0.1.0" },
  instructions: [
    {
      id: "e0000000-0000-0000-0000-000000000001",
      name: "make",
      args: [{ name: "receive_amount", type: "u64" }],
      accounts: [
        {
          id: "e0000000-0000-0000-0000-000000000010",
          name: "escrow",
          accountType: "account",
          stateType: "EscrowState",
          constraints: [
            { type: "init", payer: "maker", space: "auto" },
            { type: "seeds", seeds: [{ type: "literal", value: "escrow" }, { type: "account-field", value: "maker" }], bump: "escrow.bump" },
          ],
        },
        { id: "e0000000-0000-0000-0000-000000000011", name: "maker", accountType: "signer", constraints: [{ type: "signer" }, { type: "mut" }] },
        {
          id: "e0000000-0000-0000-0000-000000000012",
          name: "maker_ta_a",
          accountType: "token-account",
          constraints: [
            { type: "mut" },
            { type: "token-authority", authority: "maker" },
            { type: "token-mint", mint: "mint_a" },
          ],
        },
        {
          id: "e0000000-0000-0000-0000-000000000013",
          name: "vault_ta_a",
          accountType: "associated-token",
          constraints: [
            { type: "init", payer: "maker", space: "auto" },
            { type: "associated-token-authority", authority: "escrow" },
            { type: "associated-token-mint", mint: "mint_a" },
          ],
        },
        { id: "e0000000-0000-0000-0000-000000000014", name: "mint_a", accountType: "mint", constraints: [] },
        { id: "e0000000-0000-0000-0000-000000000015", name: "mint_b", accountType: "mint", constraints: [] },
        { id: "e0000000-0000-0000-0000-000000000016", name: "token_program", accountType: "token-program", constraints: [] },
        { id: "e0000000-0000-0000-0000-000000000017", name: "associated_token_program", accountType: "associated-token-program", constraints: [] },
        { id: "e0000000-0000-0000-0000-000000000018", name: "system_program", accountType: "system-program", constraints: [] },
      ],
      body: [
        { type: "set-field", account: "escrow", field: "maker", value: "*ctx.accounts.maker.key" },
        { type: "set-field", account: "escrow", field: "mint_a", value: "*ctx.accounts.mint_a.key" },
        { type: "set-field", account: "escrow", field: "mint_b", value: "*ctx.accounts.mint_b.key" },
        { type: "set-field", account: "escrow", field: "receive_amount", value: "receive_amount" },
        { type: "set-field", account: "escrow", field: "bump", value: "ctx.bumps.escrow" },
        { type: "transfer-token", from: "maker_ta_a", to: "vault_ta_a", authority: "maker", amount: "receive_amount" },
        { type: "emit-event", event: "MakeEvent", fields: { maker: "*ctx.accounts.maker.key", receive_amount: "receive_amount" } },
      ],
    },
    {
      id: "e0000000-0000-0000-0000-000000000002",
      name: "take",
      args: [],
      accounts: [
        {
          id: "e0000000-0000-0000-0000-000000000020",
          name: "escrow",
          accountType: "account",
          stateType: "EscrowState",
          constraints: [
            { type: "mut" },
            { type: "has-one", field: "maker", target: "maker", errorCode: "InvalidMaker" },
            { type: "seeds", seeds: [{ type: "literal", value: "escrow" }, { type: "account-field", value: "maker" }], bump: "escrow.bump" },
            { type: "close", target: "taker" },
          ],
        },
        { id: "e0000000-0000-0000-0000-000000000021", name: "taker", accountType: "signer", constraints: [{ type: "signer" }, { type: "mut" }] },
        { id: "e0000000-0000-0000-0000-000000000022", name: "maker", accountType: "system-account", constraints: [] },
        { id: "e0000000-0000-0000-0000-000000000023", name: "vault_ta_a", accountType: "token-account", constraints: [
          { type: "mut" },
          { type: "token-authority", authority: "escrow" },
        ] },
        { id: "e0000000-0000-0000-0000-000000000024", name: "taker_ta_a", accountType: "token-account", constraints: [{ type: "mut" }] },
        { id: "e0000000-0000-0000-0000-000000000025", name: "token_program", accountType: "token-program", constraints: [] },
        { id: "e0000000-0000-0000-0000-000000000026", name: "system_program", accountType: "system-program", constraints: [] },
      ],
      body: [
        { type: "transfer-token", from: "vault_ta_a", to: "taker_ta_a", authority: "escrow", amount: "escrow.receive_amount",
          signerSeeds: [{ type: "literal", value: "escrow" }, { type: "account-field", value: "maker" }, { type: "literal", value: "escrow.bump" }],
        },
        { type: "emit-event", event: "TakeEvent", fields: { taker: "*ctx.accounts.taker.key", amount: "escrow.receive_amount" } },
      ],
    },
  ],
  states: [
    {
      id: "f0000000-0000-0000-0000-000000000001",
      name: "EscrowState",
      fields: [
        { name: "maker", type: "Pubkey" },
        { name: "mint_a", type: "Pubkey" },
        { name: "mint_b", type: "Pubkey" },
        { name: "receive_amount", type: "u64" },
        { name: "bump", type: "u8" },
      ],
    },
  ],
  errors: [
    { id: "g0000000-0000-0000-0000-000000000001", name: "InvalidMaker", code: 6000, message: "Invalid maker account" },
    { id: "g0000000-0000-0000-0000-000000000002", name: "InvalidAmount", code: 6001, message: "Invalid amount" },
  ],
  events: [
    { id: "h0000000-0000-0000-0000-000000000001", name: "MakeEvent", fields: [
      { name: "maker", type: "Pubkey" },
      { name: "receive_amount", type: "u64" },
    ] },
    { id: "h0000000-0000-0000-0000-000000000002", name: "TakeEvent", fields: [
      { name: "taker", type: "Pubkey" },
      { name: "amount", type: "u64" },
    ] },
  ],
  integrations: [],
  constants: [],
  metadata: { createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z", flowHash: "escrow_example", generatorVersion: "0.1.0" },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Vault example — all 3 frameworks", () => {
  const frameworks = ["anchor", "pinocchio", "quasar"] as const;

  for (const fw of frameworks) {
    describe(`${fw}`, () => {
      it("generates files without errors", () => {
        const result = generateCode(VAULT_IR, fw);
        expect(result.errors).toHaveLength(0);
        expect(result.files.length).toBeGreaterThan(0);
      });

      it("generates lib.rs", () => {
        const result = generateCode(VAULT_IR, fw);
        const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
        expect(libRs).toBeDefined();
        expect(libRs!.content).toContain("vault");
      });

      it("generates state file", () => {
        const result = generateCode(VAULT_IR, fw);
        const stateFile = result.files.find((f) => f.path.includes("vault_state") && f.path.endsWith(".rs"));
        expect(stateFile).toBeDefined();
        expect(stateFile!.content).toContain("VaultState");
      });

      it("generates error file", () => {
        const result = generateCode(VAULT_IR, fw);
        const errFile = result.files.find((f) => f.path.endsWith("errors.rs"));
        expect(errFile).toBeDefined();
        expect(errFile!.content).toContain("InvalidAmount");
      });

      it("generates event file", () => {
        const result = generateCode(VAULT_IR, fw);
        const evtFile = result.files.find((f) => f.path.endsWith("events.rs"));
        expect(evtFile).toBeDefined();
        expect(evtFile!.content).toContain("DepositEvent");
      });

      it("generates constants file", () => {
        const result = generateCode(VAULT_IR, fw);
        const constFile = result.files.find((f) => f.path.endsWith("constants.rs"));
        expect(constFile).toBeDefined();
        expect(constFile!.content).toContain("MAX_DEPOSIT");
      });

      it("generates all 4 instructions", () => {
        const result = generateCode(VAULT_IR, fw);
        const ixFiles = result.files.filter((f) => f.path.includes("instructions/") && f.path.endsWith(".rs") && !f.path.endsWith("mod.rs"));
        expect(ixFiles.length).toBe(4);
      });

      it("handles seeds with bump in initialize", () => {
        const result = generateCode(VAULT_IR, fw);
        const initFile = result.files.find((f) => f.path.includes("initialize"));
        expect(initFile).toBeDefined();
        const content = initFile!.content;
        if (fw === "anchor") {
          // With init, Anchor requires plain "bump" (no target)
          expect(content).toContain(", bump)]");
        }
      });

      it("handles transfer-sol in deposit", () => {
        const result = generateCode(VAULT_IR, fw);
        const depFile = result.files.find((f) => f.path.includes("deposit"));
        expect(depFile).toBeDefined();
      });

      it("handles if-else in withdraw", () => {
        const result = generateCode(VAULT_IR, fw);
        // Quasar puts logic in lib.rs, others in instruction files
        const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
        expect(libRs).toBeDefined();
        expect(libRs!.content).toContain("withdraw");
      });

      it("handles close constraint", () => {
        const result = generateCode(VAULT_IR, fw);
        const closeFile = result.files.find((f) => f.path.includes("close_vault"));
        expect(closeFile).toBeDefined();
      });
    });
  }
});

describe("Escrow example — token operations across all 3 frameworks", () => {
  const frameworks = ["anchor", "pinocchio", "quasar"] as const;

  for (const fw of frameworks) {
    describe(`${fw}`, () => {
      it("generates files without errors", () => {
        const result = generateCode(ESCROW_IR, fw);
        expect(result.errors).toHaveLength(0);
        expect(result.files.length).toBeGreaterThan(0);
      });

      it("generates make instruction", () => {
        const result = generateCode(ESCROW_IR, fw);
        const makeFile = result.files.find((f) => f.path.includes("make"));
        expect(makeFile).toBeDefined();
      });

      it("generates take instruction with signerSeeds", () => {
        const result = generateCode(ESCROW_IR, fw);
        const takeFile = result.files.find((f) => f.path.includes("take"));
        expect(takeFile).toBeDefined();
      });

      it("includes EscrowState", () => {
        const result = generateCode(ESCROW_IR, fw);
        const stateFile = result.files.find((f) => f.path.includes("escrow_state") && f.path.endsWith(".rs"));
        expect(stateFile).toBeDefined();
        expect(stateFile!.content).toContain("EscrowState");
      });
    });
  }
});
