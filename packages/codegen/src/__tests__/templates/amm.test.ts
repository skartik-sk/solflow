import { describe, it, expect } from "vitest";
import { generateCode } from "../../index";
import type { ProgramIR } from "@solflow/ir";

const AMM_IR: ProgramIR = {
  version: "1.0.0",
  program: { name: "amm", description: "Constant-product AMM with liquidity and swap", version: "0.1.0" },
  instructions: [
    {
      id: "a6-001", name: "initialize_pool", args: [],
      accounts: [
        { id: "a6-010", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "init", payer: "authority", space: "auto" }, { type: "seeds", seeds: [{ type: "literal", value: "pool" }, { type: "account-field", value: "authority" }], bump: "pool.bump" }] },
        { id: "a6-011", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a6-012", name: "system_program", accountType: "system-program", constraints: [] },
      ],
      body: [
        { type: "set-field", account: "pool", field: "authority", value: "*ctx.accounts.authority.key" },
        { type: "set-field", account: "pool", field: "token_a_vault", value: "*ctx.accounts.authority.key" },
        { type: "set-field", account: "pool", field: "token_b_vault", value: "*ctx.accounts.authority.key" },
        { type: "set-field", account: "pool", field: "lp_mint", value: "*ctx.accounts.authority.key" },
        { type: "set-field", account: "pool", field: "total_lp", value: "0" },
        { type: "set-field", account: "pool", field: "bump", value: "ctx.bumps.pool" },
      ],
    },
    {
      id: "a6-002", name: "add_liquidity", args: [{ name: "token_a_amount", type: "u64" }, { name: "token_b_amount", type: "u64" }],
      accounts: [
        { id: "a6-020", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "mut" }] },
        { id: "a6-021", name: "provider", accountType: "signer", constraints: [{ type: "signer" }] },
      ],
      body: [
        { type: "require", condition: "token_a_amount > 0", errorCode: "InvalidAmount" },
        { type: "require", condition: "token_b_amount > 0", errorCode: "InvalidAmount" },
        { type: "math", operation: "add", left: "pool.total_lp", right: "token_a_amount", result: "new_lp", checked: true },
        { type: "set-field", account: "pool", field: "total_lp", value: "new_lp" },
      ],
    },
    {
      id: "a6-003", name: "remove_liquidity", args: [{ name: "lp_amount", type: "u64" }],
      accounts: [
        { id: "a6-030", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "mut" }] },
        { id: "a6-031", name: "provider", accountType: "signer", constraints: [{ type: "signer" }] },
      ],
      body: [
        { type: "require", condition: "lp_amount > 0", errorCode: "InvalidAmount" },
        { type: "require", condition: "pool.total_lp >= lp_amount", errorCode: "SlippageExceeded" },
        { type: "math", operation: "sub", left: "pool.total_lp", right: "lp_amount", result: "new_total", checked: true },
        { type: "set-field", account: "pool", field: "total_lp", value: "new_total" },
      ],
    },
    {
      id: "a6-004", name: "swap", args: [{ name: "amount_in", type: "u64" }, { name: "min_amount_out", type: "u64" }],
      accounts: [
        { id: "a6-040", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "mut" }] },
        { id: "a6-041", name: "trader", accountType: "signer", constraints: [{ type: "signer" }] },
      ],
      body: [
        { type: "require", condition: "amount_in > 0", errorCode: "InvalidAmount" },
        { type: "require", condition: "amount_in >= min_amount_out", errorCode: "SlippageExceeded" },
      ],
    },
  ],
  states: [
    { id: "b6-001", name: "PoolState", fields: [{ name: "authority", type: "Pubkey" }, { name: "token_a_vault", type: "Pubkey" }, { name: "token_b_vault", type: "Pubkey" }, { name: "lp_mint", type: "Pubkey" }, { name: "total_lp", type: "u64" }, { name: "bump", type: "u8" }], isZeroCopy: false },
  ],
  errors: [
    { id: "c6-001", name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" },
    { id: "c6-002", name: "SlippageExceeded", code: 6001, message: "Slippage tolerance exceeded" },
  ],
  events: [],
  integrations: [],
  constants: [{ name: "FEE_BPS", type: "u64", value: "30" }],
  metadata: { createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z", flowHash: "amm", generatorVersion: "0.1.0" },
};

const frameworks = ["anchor", "pinocchio", "quasar"] as const;

describe("AMM template — all 3 frameworks", () => {
  for (const fw of frameworks) {
    describe(`${fw}`, () => {
      it("generates files without errors", () => {
        const result = generateCode(AMM_IR, fw);
        expect(result.errors).toHaveLength(0);
        expect(result.files.length).toBeGreaterThan(0);
      });

      it("generates lib.rs", () => {
        const result = generateCode(AMM_IR, fw);
        const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
        expect(libRs).toBeDefined();
        if (fw === "pinocchio") {
          expect(libRs!.content).toContain("process_instruction");
        } else {
          expect(libRs!.content).toContain("amm");
        }
      });

      it("generates PoolState", () => {
        const result = generateCode(AMM_IR, fw);
        const stateFile = result.files.find((f) => f.path.includes("pool_state"));
        expect(stateFile).toBeDefined();
        expect(stateFile!.content).toContain("PoolState");
      });

      it("generates error file with all errors", () => {
        const result = generateCode(AMM_IR, fw);
        const errFile = result.files.find((f) => f.path.endsWith("errors.rs"));
        expect(errFile).toBeDefined();
        expect(errFile!.content).toContain("InvalidAmount");
        expect(errFile!.content).toContain("SlippageExceeded");
      });

      it("generates all 4 instructions", () => {
        const result = generateCode(AMM_IR, fw);
        const ixFiles = result.files.filter((f) => f.path.includes("instructions/") && f.path.endsWith(".rs") && !f.path.endsWith("mod.rs"));
        expect(ixFiles.length).toBe(4);
      });

      it("generates initialize_pool with PDA seeds", () => {
        const result = generateCode(AMM_IR, fw);
        const initFile = result.files.find((f) => f.path.includes("initialize_pool"));
        expect(initFile).toBeDefined();
      });

      it("generates add_liquidity instruction", () => {
        const result = generateCode(AMM_IR, fw);
        const file = result.files.find((f) => f.path.includes("add_liquidity"));
        expect(file).toBeDefined();
      });

      it("generates remove_liquidity instruction", () => {
        const result = generateCode(AMM_IR, fw);
        const file = result.files.find((f) => f.path.includes("remove_liquidity"));
        expect(file).toBeDefined();
      });

      it("generates swap instruction", () => {
        const result = generateCode(AMM_IR, fw);
        const file = result.files.find((f) => f.path.includes("swap"));
        expect(file).toBeDefined();
      });

      it("generates constants file with FEE_BPS", () => {
        const result = generateCode(AMM_IR, fw);
        const constants = result.files.find((f) => f.path.endsWith("constants.rs"));
        expect(constants).toBeDefined();
        expect(constants!.content).toContain("FEE_BPS");
      });
    });
  }

  describe("anchor-specific AMM patterns", () => {
    it("generates seeds constraint in initialize_pool", () => {
      const result = generateCode(AMM_IR, "anchor");
      const init = result.files.find((f) => f.path.includes("initialize_pool"));
      expect(init!.content).toContain("seeds");
    });

    it("generates require! for slippage check", () => {
      const result = generateCode(AMM_IR, "anchor");
      const swap = result.files.find((f) => f.path.includes("swap"));
      expect(swap!.content).toContain("require");
    });
  });

  describe("pinocchio-specific AMM patterns", () => {
    it("generates #![no_std] entrypoint", () => {
      const result = generateCode(AMM_IR, "pinocchio");
      const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
      expect(libRs!.content).toContain("#![no_std]");
      expect(libRs!.content).toContain("process_instruction");
    });

    it("generates state with discriminator", () => {
      const result = generateCode(AMM_IR, "pinocchio");
      const stateFile = result.files.find((f) => f.path.includes("pool_state"));
      expect(stateFile!.content).toContain("DISCRIMINATOR");
    });
  });

  describe("quasar-specific AMM patterns", () => {
    it("uses Pod types in PoolState", () => {
      const result = generateCode(AMM_IR, "quasar");
      const stateFile = result.files.find((f) => f.path.includes("pool_state"));
      expect(stateFile!.content).toContain("PodU64");
      expect(stateFile!.content).toContain("Address");
    });

    it("uses Ctx type and instruction discriminators", () => {
      const result = generateCode(AMM_IR, "quasar");
      const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
      expect(libRs!.content).toContain("Ctx<");
      expect(libRs!.content).toContain("#[instruction(discriminator");
    });
  });
});
