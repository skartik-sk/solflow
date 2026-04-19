import { describe, it, expect } from "vitest";
import { generateCode } from "../../index";
import type { ProgramIR } from "@solflow/ir";

// Matches the default flow (createDefaultFlow) from project.ts
const BOILERPLATE_IR: ProgramIR = {
  version: "1.0.0",
  program: { name: "my_program", description: "My first Anchor program", version: "0.1.0", programId: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS" },
  instructions: [
    {
      id: "bp-0001", name: "initialize", accessControl: "none", args: [],
      accounts: [
        { id: "bp-0010", name: "state_account", accountType: "account", stateType: "ProgramState", constraints: [{ type: "init", payer: "authority", space: "auto" }] },
        { id: "bp-0011", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "bp-0012", name: "system_program", accountType: "system-program", constraints: [] },
      ],
      body: [
        { type: "set-field", account: "state_account", field: "count", value: "0" },
        { type: "set-field", account: "state_account", field: "authority", value: "*ctx.accounts.authority.key" },
      ],
    },
  ],
  states: [{ id: "bp-0100", name: "ProgramState", isZeroCopy: false, fields: [{ name: "authority", type: "Pubkey" }, { name: "count", type: "u64" }] }],
  errors: [], events: [], integrations: [], constants: [],
  metadata: { createdAt: "2026-04-18T00:00:00Z", updatedAt: "2026-04-18T00:00:00Z", flowHash: "boilerplate", generatorVersion: "0.1.0" },
};

const frameworks = ["anchor", "pinocchio", "quasar"] as const;

describe("Boilerplate template — all 3 frameworks", () => {
  for (const fw of frameworks) {
    describe(`${fw}`, () => {
      it("generates files without errors", () => {
        const result = generateCode(BOILERPLATE_IR, fw);
        expect(result.errors).toHaveLength(0);
        expect(result.files.length).toBeGreaterThan(0);
      });

      it("generates lib.rs", () => {
        const result = generateCode(BOILERPLATE_IR, fw);
        const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
        expect(libRs).toBeDefined();
      });

      it("generates ProgramState", () => {
        const result = generateCode(BOILERPLATE_IR, fw);
        const stateFile = result.files.find((f) => f.path.includes("program_state") && f.path.endsWith(".rs"));
        expect(stateFile).toBeDefined();
        expect(stateFile!.content).toContain("ProgramState");
      });

      it("generates single initialize instruction", () => {
        const result = generateCode(BOILERPLATE_IR, fw);
        const ixFiles = result.files.filter((f) => f.path.includes("instructions/") && f.path.endsWith(".rs") && !f.path.endsWith("mod.rs"));
        expect(ixFiles.length).toBe(1);
        expect(ixFiles[0].path).toContain("initialize");
      });

      it("generates Cargo.toml", () => {
        const result = generateCode(BOILERPLATE_IR, fw);
        const cargo = result.files.find((f) => f.path.endsWith("Cargo.toml"));
        expect(cargo).toBeDefined();
      });
    });
  }

  describe("anchor-specific", () => {
    it("uses anchor-lang dependency", () => {
      const result = generateCode(BOILERPLATE_IR, "anchor");
      const cargo = result.files.find((f) => f.path.endsWith("Cargo.toml"));
      expect(cargo!.content).toContain("anchor-lang");
    });

    it("generates init constraint with payer", () => {
      const result = generateCode(BOILERPLATE_IR, "anchor");
      const initFile = result.files.find((f) => f.path.includes("initialize"));
      expect(initFile!.content).toContain("init");
      expect(initFile!.content).toContain("payer = authority");
    });
  });

  describe("pinocchio-specific", () => {
    it("generates #![no_std] entrypoint", () => {
      const result = generateCode(BOILERPLATE_IR, "pinocchio");
      const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
      expect(libRs!.content).toContain("#![no_std]");
      expect(libRs!.content).toContain("process_instruction");
    });

    it("generates state with discriminator and zero-copy layout", () => {
      const result = generateCode(BOILERPLATE_IR, "pinocchio");
      const stateFile = result.files.find((f) => f.path.includes("program_state"));
      expect(stateFile!.content).toContain("DISCRIMINATOR");
    });
  });

  describe("quasar-specific", () => {
    it("uses Ctx type and instruction discriminators", () => {
      const result = generateCode(BOILERPLATE_IR, "quasar");
      const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
      expect(libRs!.content).toContain("Ctx<");
      expect(libRs!.content).toContain("#[instruction(discriminator");
    });

    it("uses Pod types in state struct", () => {
      const result = generateCode(BOILERPLATE_IR, "quasar");
      const stateFile = result.files.find((f) => f.path.includes("program_state"));
      expect(stateFile!.content).toContain("PodU64");
      expect(stateFile!.content).toContain("Address");
    });
  });
});
