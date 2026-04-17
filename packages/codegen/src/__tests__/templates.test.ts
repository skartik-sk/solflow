import { describe, it, expect } from "vitest";
import { generateCode } from "../index";
import type { ProgramIR } from "@solflow/ir";
import vaultTemplate from "../templates/vault/template.json";
import escrowTemplate from "../templates/escrow/template.json";

const VAULT_IR = vaultTemplate as ProgramIR;
const ESCROW_IR = escrowTemplate as ProgramIR;

// ─── Vault Template Tests ──────────────────────────────────────────────────

describe("Vault template — all 3 frameworks", () => {
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
        if (fw === "pinocchio") {
          expect(libRs!.content).toContain("process_instruction");
        } else {
          expect(libRs!.content).toContain("token_vault");
        }
      });

      it("generates VaultState", () => {
        const result = generateCode(VAULT_IR, fw);
        const stateFile = result.files.find(
          (f) => f.path.includes("vault_state") && f.path.endsWith(".rs"),
        );
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
        const ixFiles = result.files.filter(
          (f) =>
            f.path.includes("instructions/") &&
            f.path.endsWith(".rs") &&
            !f.path.endsWith("mod.rs"),
        );
        expect(ixFiles.length).toBe(4);
      });

      it("handles seeds with bump in initialize", () => {
        const result = generateCode(VAULT_IR, fw);
        const initFile = result.files.find((f) =>
          f.path.includes("initialize"),
        );
        expect(initFile).toBeDefined();
      });

      it("handles transfer-token in deposit", () => {
        const result = generateCode(VAULT_IR, fw);
        const depFile = result.files.find((f) => f.path.includes("deposit"));
        expect(depFile).toBeDefined();
      });

      it("handles signerSeeds in withdraw", () => {
        const result = generateCode(VAULT_IR, fw);
        const withFile = result.files.find((f) =>
          f.path.includes("withdraw"),
        );
        expect(withFile).toBeDefined();
      });

      it("handles close constraint in close_vault", () => {
        const result = generateCode(VAULT_IR, fw);
        const closeFile = result.files.find((f) =>
          f.path.includes("close_vault"),
        );
        expect(closeFile).toBeDefined();
      });
    });
  }
});

// ─── Escrow Template Tests ─────────────────────────────────────────────────

describe("Escrow template — all 3 frameworks", () => {
  const frameworks = ["anchor", "pinocchio", "quasar"] as const;

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
        const stateFile = result.files.find(
          (f) => f.path.includes("escrow_state") && f.path.endsWith(".rs"),
        );
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
        const refundFile = result.files.find((f) =>
          f.path.includes("refund"),
        );
        expect(refundFile).toBeDefined();
      });

      it("generates all 3 instructions", () => {
        const result = generateCode(ESCROW_IR, fw);
        const ixFiles = result.files.filter(
          (f) =>
            f.path.includes("instructions/") &&
            f.path.endsWith(".rs") &&
            !f.path.endsWith("mod.rs"),
        );
        expect(ixFiles.length).toBe(3);
      });
    });
  }
});
