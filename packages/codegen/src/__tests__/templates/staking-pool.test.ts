import { describe, it, expect } from "vitest";
import { generateCode } from "../../index";
import type { ProgramIR } from "@solflow/ir";

const STAKING_POOL_IR: ProgramIR = {
  version: "1.0.0",
  program: { name: "staking_pool", description: "Token staking with time-weighted rewards", version: "0.1.0" },
  instructions: [
    {
      id: "a4-001", name: "initialize_pool", args: [{ name: "reward_rate", type: "u64" }],
      accounts: [
        { id: "a4-010", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "init", payer: "authority", space: "auto" }, { type: "seeds", seeds: [{ type: "literal", value: "pool" }], bump: "pool.bump" }] },
        { id: "a4-011", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a4-012", name: "system_program", accountType: "system-program", constraints: [] },
      ],
      body: [
        { type: "set-field", account: "pool", field: "authority", value: "*ctx.accounts.authority.key" },
        { type: "set-field", account: "pool", field: "total_staked", value: "0" },
        { type: "set-field", account: "pool", field: "reward_rate", value: "reward_rate" },
        { type: "set-field", account: "pool", field: "bump", value: "ctx.bumps.pool" },
      ],
    },
    {
      id: "a4-002", name: "stake", args: [{ name: "amount", type: "u64" }],
      accounts: [
        { id: "a4-020", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "mut" }] },
        { id: "a4-021", name: "staker_account", accountType: "account", stateType: "StakerState", constraints: [{ type: "init-if-needed", payer: "staker", space: "auto" }] },
        { id: "a4-022", name: "staker", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a4-023", name: "system_program", accountType: "system-program", constraints: [] },
      ],
      body: [
        { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
        { type: "math", operation: "add", left: "staker_account.staked_amount", right: "amount", result: "new_staked", checked: true },
        { type: "set-field", account: "staker_account", field: "staked_amount", value: "new_staked" },
        { type: "math", operation: "add", left: "pool.total_staked", right: "amount", result: "new_total", checked: true },
        { type: "set-field", account: "pool", field: "total_staked", value: "new_total" },
      ],
    },
    {
      id: "a4-003", name: "unstake", args: [{ name: "amount", type: "u64" }],
      accounts: [
        { id: "a4-030", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "mut" }] },
        { id: "a4-031", name: "staker_account", accountType: "account", stateType: "StakerState", constraints: [{ type: "mut" }] },
        { id: "a4-032", name: "staker", accountType: "signer", constraints: [{ type: "signer" }] },
      ],
      body: [
        { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
        { type: "require", condition: "staker_account.staked_amount >= amount", errorCode: "InsufficientStake" },
        { type: "math", operation: "sub", left: "staker_account.staked_amount", right: "amount", result: "remaining", checked: true },
        { type: "set-field", account: "staker_account", field: "staked_amount", value: "remaining" },
        { type: "math", operation: "sub", left: "pool.total_staked", right: "amount", result: "new_total", checked: true },
        { type: "set-field", account: "pool", field: "total_staked", value: "new_total" },
      ],
    },
    {
      id: "a4-004", name: "claim_rewards", args: [],
      accounts: [
        { id: "a4-040", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "mut" }] },
        { id: "a4-041", name: "staker_account", accountType: "account", stateType: "StakerState", constraints: [{ type: "mut" }] },
        { id: "a4-042", name: "staker", accountType: "signer", constraints: [{ type: "signer" }] },
      ],
      body: [
        { type: "set-field", account: "staker_account", field: "pending_rewards", value: "0" },
      ],
    },
  ],
  states: [
    { id: "b4-001", name: "PoolState", fields: [{ name: "authority", type: "Pubkey" }, { name: "total_staked", type: "u64" }, { name: "reward_rate", type: "u64" }, { name: "bump", type: "u8" }], isZeroCopy: false },
    { id: "b4-002", name: "StakerState", fields: [{ name: "staker", type: "Pubkey" }, { name: "staked_amount", type: "u64" }, { name: "pending_rewards", type: "u64" }], isZeroCopy: false },
  ],
  errors: [
    { id: "c4-001", name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" },
    { id: "c4-002", name: "InsufficientStake", code: 6001, message: "Insufficient staked amount" },
  ],
  events: [],
  integrations: [],
  constants: [{ name: "MIN_STAKE", type: "u64", value: "1_000_000" }],
  metadata: { createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z", flowHash: "staking-pool", generatorVersion: "0.1.0" },
};

const frameworks = ["anchor", "pinocchio", "quasar"] as const;

describe("Staking Pool template — all 3 frameworks", () => {
  for (const fw of frameworks) {
    describe(`${fw}`, () => {
      it("generates files without errors", () => {
        const result = generateCode(STAKING_POOL_IR, fw);
        expect(result.errors).toHaveLength(0);
        expect(result.files.length).toBeGreaterThan(0);
      });

      it("generates lib.rs", () => {
        const result = generateCode(STAKING_POOL_IR, fw);
        const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
        expect(libRs).toBeDefined();
        if (fw === "pinocchio") {
          expect(libRs!.content).toContain("process_instruction");
        } else {
          expect(libRs!.content).toContain("staking_pool");
        }
      });

      it("generates both state structs", () => {
        const result = generateCode(STAKING_POOL_IR, fw);
        const poolState = result.files.find((f) => f.path.includes("pool_state"));
        const stakerState = result.files.find((f) => f.path.includes("staker_state"));
        expect(poolState).toBeDefined();
        expect(stakerState).toBeDefined();
        expect(poolState!.content).toContain("PoolState");
        expect(stakerState!.content).toContain("StakerState");
      });

      it("generates error file with all errors", () => {
        const result = generateCode(STAKING_POOL_IR, fw);
        const errFile = result.files.find((f) => f.path.endsWith("errors.rs"));
        expect(errFile).toBeDefined();
        expect(errFile!.content).toContain("InvalidAmount");
        expect(errFile!.content).toContain("InsufficientStake");
      });

      it("generates all 4 instructions", () => {
        const result = generateCode(STAKING_POOL_IR, fw);
        const ixFiles = result.files.filter((f) => f.path.includes("instructions/") && f.path.endsWith(".rs") && !f.path.endsWith("mod.rs"));
        expect(ixFiles.length).toBe(4);
      });

      it("generates initialize_pool with PDA seeds", () => {
        const result = generateCode(STAKING_POOL_IR, fw);
        const initFile = result.files.find((f) => f.path.includes("initialize_pool"));
        expect(initFile).toBeDefined();
      });

      it("generates stake instruction", () => {
        const result = generateCode(STAKING_POOL_IR, fw);
        const stakeFile = result.files.find((f) => f.path.includes("stake") && !f.path.includes("staker"));
        expect(stakeFile).toBeDefined();
      });

      it("generates unstake instruction", () => {
        const result = generateCode(STAKING_POOL_IR, fw);
        const unstakeFile = result.files.find((f) => f.path.includes("unstake"));
        expect(unstakeFile).toBeDefined();
      });

      it("generates claim_rewards instruction", () => {
        const result = generateCode(STAKING_POOL_IR, fw);
        const claimFile = result.files.find((f) => f.path.includes("claim_rewards"));
        expect(claimFile).toBeDefined();
      });

      it("generates constants file with MIN_STAKE", () => {
        const result = generateCode(STAKING_POOL_IR, fw);
        const constants = result.files.find((f) => f.path.endsWith("constants.rs"));
        expect(constants).toBeDefined();
        expect(constants!.content).toContain("MIN_STAKE");
      });
    });
  }

  describe("anchor-specific staking patterns", () => {
    it("generates seeds constraint in initialize_pool", () => {
      const result = generateCode(STAKING_POOL_IR, "anchor");
      const init = result.files.find((f) => f.path.includes("initialize_pool"));
      expect(init!.content).toContain("seeds");
    });

    it("generates init-if-needed for staker_account", () => {
      const result = generateCode(STAKING_POOL_IR, "anchor");
      const stake = result.files.find((f) => f.path.includes("stake") && !f.path.includes("staker"));
      expect(stake!.content).toContain("init");
    });
  });

  describe("pinocchio-specific staking patterns", () => {
    it("generates #![no_std] entrypoint", () => {
      const result = generateCode(STAKING_POOL_IR, "pinocchio");
      const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
      expect(libRs!.content).toContain("#![no_std]");
      expect(libRs!.content).toContain("process_instruction");
    });

    it("generates state with discriminators", () => {
      const result = generateCode(STAKING_POOL_IR, "pinocchio");
      const stateFile = result.files.find((f) => f.path.includes("pool_state"));
      expect(stateFile!.content).toContain("DISCRIMINATOR");
    });
  });

  describe("quasar-specific staking patterns", () => {
    it("uses Pod types in PoolState", () => {
      const result = generateCode(STAKING_POOL_IR, "quasar");
      const stateFile = result.files.find((f) => f.path.includes("pool_state"));
      expect(stateFile!.content).toContain("PodU64");
      expect(stateFile!.content).toContain("Address");
    });

    it("uses Ctx type and instruction discriminators", () => {
      const result = generateCode(STAKING_POOL_IR, "quasar");
      const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
      expect(libRs!.content).toContain("Ctx<");
      expect(libRs!.content).toContain("#[instruction(discriminator");
    });
  });
});
