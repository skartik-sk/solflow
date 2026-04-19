import { describe, it, expect } from "vitest";
import { generateCode } from "../../index";
import type { ProgramIR } from "@solflow/ir";
import vaultTemplate from "../../templates/vault/template.json";

const VAULT_IR = vaultTemplate as ProgramIR;

const frameworks = ["anchor", "pinocchio", "quasar"] as const;

describe("Vault template — all 3 frameworks", () => {
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
        if (fw === "pinocchio") {
          expect(libRs!.content).toContain("process_instruction");
        } else {
          expect(libRs!.content).toContain("token_vault");
        }
      });

      it("generates VaultState", () => {
        const result = generateCode(VAULT_IR, fw);
        const stateFile = result.files.find((f) => f.path.includes("vault_state") && f.path.endsWith(".rs"));
        expect(stateFile).toBeDefined();
        expect(stateFile!.content).toContain("VaultState");
      });

      it("generates error file with all 4 errors", () => {
        const result = generateCode(VAULT_IR, fw);
        const errFile = result.files.find((f) => f.path.endsWith("errors.rs"));
        expect(errFile).toBeDefined();
        expect(errFile!.content).toContain("InvalidAmount");
        expect(errFile!.content).toContain("InsufficientFunds");
        expect(errFile!.content).toContain("Unauthorized");
        expect(errFile!.content).toContain("VaultNotEmpty");
      });

      it("generates event file with all 3 events", () => {
        const result = generateCode(VAULT_IR, fw);
        const evtFile = result.files.find((f) => f.path.endsWith("events.rs"));
        expect(evtFile).toBeDefined();
        expect(evtFile!.content).toContain("DepositEvent");
        expect(evtFile!.content).toContain("WithdrawEvent");
        expect(evtFile!.content).toContain("CloseVaultEvent");
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
      });

      it("handles transfer-token in deposit", () => {
        const result = generateCode(VAULT_IR, fw);
        const depFile = result.files.find((f) => f.path.includes("deposit"));
        expect(depFile).toBeDefined();
      });

      it("handles signerSeeds in withdraw", () => {
        const result = generateCode(VAULT_IR, fw);
        const withFile = result.files.find((f) => f.path.includes("withdraw"));
        expect(withFile).toBeDefined();
      });

      it("handles close constraint in close_vault", () => {
        const result = generateCode(VAULT_IR, fw);
        const closeFile = result.files.find((f) => f.path.includes("close_vault"));
        expect(closeFile).toBeDefined();
      });

      it("includes SPL token dependencies", () => {
        const result = generateCode(VAULT_IR, fw);
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

  describe("anchor-specific vault patterns", () => {
    it("generates has-one constraint in withdraw", () => {
      const result = generateCode(VAULT_IR, "anchor");
      const withdraw = result.files.find((f) => f.path.includes("withdraw"));
      expect(withdraw!.content).toContain("has_one");
    });

    it("generates associated-token constraints in initialize", () => {
      const result = generateCode(VAULT_IR, "anchor");
      const init = result.files.find((f) => f.path.includes("initialize"));
      expect(init!.content).toContain("associated_token");
    });
  });

  describe("pinocchio-specific vault patterns", () => {
    it("generates state accessors for vault fields", () => {
      const result = generateCode(VAULT_IR, "pinocchio");
      const deposit = result.files.find((f) => f.path.includes("deposit"));
      expect(deposit!.content).toContain("VaultState::");
    });

    it("generates pinocchio-system dependency", () => {
      const result = generateCode(VAULT_IR, "pinocchio");
      const cargo = result.files.find((f) => f.path.endsWith("Cargo.toml"));
      expect(cargo!.content).toContain("pinocchio-system");
    });
  });

  describe("quasar-specific vault patterns", () => {
    it("uses PodU64 for vault amount field", () => {
      const result = generateCode(VAULT_IR, "quasar");
      const stateFile = result.files.find((f) => f.path.includes("vault_state"));
      expect(stateFile!.content).toContain("PodU64");
    });

    it("uses Address for Pubkey fields", () => {
      const result = generateCode(VAULT_IR, "quasar");
      const stateFile = result.files.find((f) => f.path.includes("vault_state"));
      expect(stateFile!.content).toContain("Address");
    });
  });
});
