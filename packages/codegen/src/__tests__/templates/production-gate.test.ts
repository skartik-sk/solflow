import { describe, expect, it } from "vitest";
import type { ProgramIR } from "@solflow/ir";
import { generateCode } from "../../index";
import templateIndex from "../../templates/index.json";
import vaultTemplate from "../../templates/vault/template.json";
import escrowTemplate from "../../templates/escrow/template.json";

const frameworks = ["anchor", "pinocchio", "quasar"] as const;

const templates: Record<string, ProgramIR> = {
  "vault/template.json": vaultTemplate as ProgramIR,
  "escrow/template.json": escrowTemplate as ProgramIR,
};

const BLOCKED_PLACEHOLDERS = [
  /\bTODO\b/i,
  /unimplemented logic operation/i,
  /add a handler in codegen/i,
  /placeholder generated code/i,
];

describe("checked-in template production gate", () => {
  for (const entry of templateIndex.templates) {
    const ir = templates[entry.path];

    it(`${entry.id} has a checked-in IR fixture`, () => {
      expect(ir, `Missing fixture import for ${entry.path}`).toBeDefined();
    });

    for (const framework of frameworks) {
      it(`${entry.id} generates production-ready ${framework} files`, () => {
        expect(ir, `Missing fixture import for ${entry.path}`).toBeDefined();
        const result = generateCode(ir, framework);

        expect(result.errors).toEqual([]);
        expect(result.files.length).toBeGreaterThan(0);

        const generatedRust = result.files.filter(
          (file) => file.language === "rust",
        );
        expect(generatedRust.length).toBeGreaterThan(0);

        for (const file of generatedRust) {
          for (const pattern of BLOCKED_PLACEHOLDERS) {
            expect(file.content, `${framework}:${file.path}`).not.toMatch(
              pattern,
            );
          }
        }
      });
    }
  }
});
