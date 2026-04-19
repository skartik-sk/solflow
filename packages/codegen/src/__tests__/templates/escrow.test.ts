import { describe, it, expect } from "vitest";
import { generateCode } from "../../index";
import type { ProgramIR } from "@solflow/ir";
import escrowTemplate from "../../templates/escrow/template.json";

const ESCROW_IR = escrowTemplate as ProgramIR;

const frameworks = ["anchor", "pinocchio", "quasar"] as const;

describe("Escrow template — all 3 frameworks", () => {
  for (const fw of frameworks) {
    describe(`${fw}`, () => {
      it("generates files without errors", () => {
        const result = generateCode(ESCROW_IR, fw);
        expect(result.errors).toHaveLength(0);
        expect(result.files.length).toBeGreaterThan(0);
      });

      it("generates lib.rs", () => {
        const result = generateCode(ESCROW_IR, fw);
        const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
        expect(libRs).toBeDefined();
        if (fw === "pinocchio") {
          expect(libRs!.content).toContain("process_instruction");
        } else {
          expect(libRs!.content).toContain("escrow");
        }
      });

      it("generates EscrowState with all fields", () => {
        const result = generateCode(ESCROW_IR, fw);
        const stateFile = result.files.find((f) => f.path.includes("escrow_state") && f.path.endsWith(".rs"));
        expect(stateFile).toBeDefined();
        expect(stateFile!.content).toContain("EscrowState");
      });

      it("generates error file with all errors", () => {
        const result = generateCode(ESCROW_IR, fw);
        const errFile = result.files.find((f) => f.path.endsWith("errors.rs"));
        expect(errFile).toBeDefined();
        expect(errFile!.content).toContain("InvalidAmount");
        expect(errFile!.content).toContain("InvalidMaker");
      });

      it("generates event file with all 3 events", () => {
        const result = generateCode(ESCROW_IR, fw);
        const evtFile = result.files.find((f) => f.path.endsWith("events.rs"));
        expect(evtFile).toBeDefined();
        expect(evtFile!.content).toContain("MakeEvent");
        expect(evtFile!.content).toContain("TakeEvent");
        expect(evtFile!.content).toContain("RefundEvent");
      });

      it("generates make instruction", () => {
        const result = generateCode(ESCROW_IR, fw);
        const makeFile = result.files.find((f) => f.path.includes("make"));
        expect(makeFile).toBeDefined();
      });

      it("generates take instruction", () => {
        const result = generateCode(ESCROW_IR, fw);
        const takeFile = result.files.find((f) => f.path.includes("take"));
        expect(takeFile).toBeDefined();
      });

      it("generates refund instruction", () => {
        const result = generateCode(ESCROW_IR, fw);
        const refundFile = result.files.find((f) => f.path.includes("refund"));
        expect(refundFile).toBeDefined();
      });

      it("generates all 3 instructions", () => {
        const result = generateCode(ESCROW_IR, fw);
        const ixFiles = result.files.filter((f) => f.path.includes("instructions/") && f.path.endsWith(".rs") && !f.path.endsWith("mod.rs"));
        expect(ixFiles.length).toBe(3);
      });

      it("includes SPL token dependencies", () => {
        const result = generateCode(ESCROW_IR, fw);
        const cargo = result.files.find((f) => f.path.endsWith("Cargo.toml"));
        expect(cargo).toBeDefined();
        if (fw === "anchor") {
          expect(cargo!.content).toContain("anchor-spl");
        } else if (fw === "quasar") {
          expect(cargo!.content).toContain("quasar-spl");
        }
      });
    });
  }

  describe("anchor-specific escrow patterns", () => {
    it("generates has-one constraint for maker validation", () => {
      const result = generateCode(ESCROW_IR, "anchor");
      const take = result.files.find((f) => f.path.includes("take"));
      expect(take!.content).toContain("has_one");
    });

    it("generates associated-token init in make", () => {
      const result = generateCode(ESCROW_IR, "anchor");
      const make = result.files.find((f) => f.path.includes("make"));
      expect(make!.content).toContain("associated_token");
    });

    it("generates close constraint in take and refund", () => {
      const result = generateCode(ESCROW_IR, "anchor");
      const take = result.files.find((f) => f.path.includes("take"));
      const refund = result.files.find((f) => f.path.includes("refund"));
      expect(take!.content).toContain("close");
      expect(refund!.content).toContain("close");
    });

    it("generates signerSeeds for PDA-signed token transfers", () => {
      const result = generateCode(ESCROW_IR, "anchor");
      const take = result.files.find((f) => f.path.includes("take"));
      const refund = result.files.find((f) => f.path.includes("refund"));
      expect(take!.content).toContain("seeds");
      expect(refund!.content).toContain("seeds");
    });
  });

  describe("pinocchio-specific escrow patterns", () => {
    it("generates state accessors for escrow fields", () => {
      const result = generateCode(ESCROW_IR, "pinocchio");
      const take = result.files.find((f) => f.path.includes("take"));
      expect(take!.content).toContain("EscrowState::");
    });

    it("generates pinocchio-system dependency", () => {
      const result = generateCode(ESCROW_IR, "pinocchio");
      const cargo = result.files.find((f) => f.path.endsWith("Cargo.toml"));
      expect(cargo!.content).toContain("pinocchio-system");
    });
  });

  describe("quasar-specific escrow patterns", () => {
    it("uses Pod types in EscrowState", () => {
      const result = generateCode(ESCROW_IR, "quasar");
      const stateFile = result.files.find((f) => f.path.includes("escrow_state"));
      expect(stateFile!.content).toContain("PodU64");
      expect(stateFile!.content).toContain("Address");
    });

    it("uses Ctx and instruction discriminators", () => {
      const result = generateCode(ESCROW_IR, "quasar");
      const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
      expect(libRs!.content).toContain("Ctx<");
      expect(libRs!.content).toContain("#[instruction(discriminator");
    });
  });
});
