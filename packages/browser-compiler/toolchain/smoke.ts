// Compile generated programs with the real BrowserCompiler and the built assets.
// Usage: bun toolchain/smoke.ts [--fw pinocchio,quasar] [--assets <dir>] [--out <dir>] [--all]
//   default: the vault fixture; --all: also every codegen marketplace/production template.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { parseArgs } from "util";
import { generateCode } from "@solflow/codegen";
import { flowToIR, type ProgramIR } from "@solflow/ir";
import { BrowserCompiler } from "../src/compiler";
import type { CompilerManifest } from "../src/crate";

const { values } = parseArgs({
  options: { fw: { type: "string" }, assets: { type: "string" }, out: { type: "string" }, all: { type: "boolean" } },
});
const assets = values.assets ?? join(import.meta.dir, "..", "dist-assets", "v1");
const manifest = JSON.parse(readFileSync(join(assets, "manifest.json"), "utf8")) as CompilerManifest;
const frameworks = (values.fw ?? "pinocchio,quasar").split(",") as ("pinocchio" | "quasar")[];

// The vault (from the codegen compilation test): PDA init, SOL transfer, checked math, custom errors.
const programs: { name: string; ir: ProgramIR }[] = [
  { name: "vault", ir: JSON.parse(readFileSync(join(import.meta.dir, "fixtures/vault-ir.json"), "utf8")) },
];
if (values.all) {
  const codegen = join(import.meta.dir, "../../codegen");
  for (const file of readdirSync(join(codegen, "fixtures/templates"))) {
    const flow = JSON.parse(readFileSync(join(codegen, "fixtures/templates", file), "utf8"));
    programs.push({ name: file.replace(/\.json$/, ""), ir: flowToIR(flow.nodes, flow.edges) });
  }
  for (const name of ["vault", "escrow"]) {
    programs.push({ name: `token-${name}`, ir: JSON.parse(readFileSync(join(codegen, `src/templates/${name}/template.json`), "utf8")) });
  }
}

const compiler = await BrowserCompiler.create(manifest, async (name) => new Uint8Array(readFileSync(join(assets, name))));
let failed = 0;
for (const fw of frameworks) {
  const t0 = performance.now();
  await compiler.prepare(fw);
  console.log(`${fw}: loaded in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  for (const { name, ir } of programs) {
    try {
      const out = await compiler.compile(generateCode(ir, fw).files, fw);
      console.log(`  ✓ ${name}: rustc ${(out.timings.rustcMs / 1000).toFixed(2)}s, link ${out.timings.linkMs.toFixed(0)}ms → ${out.program.length} bytes`);
      if (values.out) {
        mkdirSync(values.out, { recursive: true });
        writeFileSync(join(values.out, `${name}-${fw}.so`), out.program);
      }
    } catch (err) {
      failed++;
      const stderr = (err as { stderr?: string }).stderr ?? "";
      console.log(`  ✗ ${name}: ${(err as Error).message}\n${stderr.split("\n").slice(0, 12).join("\n")}`);
    }
  }
}
process.exit(failed ? 1 : 0);
