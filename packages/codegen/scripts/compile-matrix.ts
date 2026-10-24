// Compile every marketplace template (and any Anchor projects passed in) to every framework with
// the real Solana toolchain, and report what doesn't build. Slow; meant for before releases.
//
// Usage: bun scripts/compile-matrix.ts [--only <case>] [--fw anchor,pinocchio,quasar] [anchor-project-dir…]
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { basename, dirname, join, resolve } from "path";
import { parseArgs } from "util";
import { flowToIR, type ProgramIR } from "@solflow/ir";
// By path, not as a dependency: rust-parser already depends on codegen (via idl-import).
import { parseProgram } from "../../rust-parser/src/index";
import { generateCode } from "../src/index";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { only: { type: "string" }, fw: { type: "string" }, work: { type: "string" } },
});
const frameworks = (values.fw ?? "anchor,pinocchio,quasar").split(",") as ("anchor" | "pinocchio" | "quasar")[];
const work = values.work ?? join(tmpdir(), "solstudio-compile-matrix");
mkdirSync(work, { recursive: true });

// Sources: marketplace templates (editor flows) and Anchor projects (parsed like `solstudio patch`).
const sources: { name: string; ir: () => ProgramIR }[] = [];
const templates = join(import.meta.dir, "../fixtures/templates");
for (const file of readdirSync(templates).filter((f) => f.endsWith(".json"))) {
  const flow = JSON.parse(readFileSync(join(templates, file), "utf8"));
  sources.push({ name: file.replace(/\.json$/, ""), ir: () => flowToIR(flow.nodes, flow.edges) });
}
// Production templates are stored as IR already.
for (const name of ["vault", "escrow"]) {
  const ir = JSON.parse(readFileSync(join(import.meta.dir, `../src/templates/${name}/template.json`), "utf8")) as ProgramIR;
  sources.push({ name: `token-${name}`, ir: () => ir });
}
for (const dir of positionals) {
  // parent/name, so two projects called `vault` don't overwrite each other's output
  const name = `anchor:${basename(dirname(resolve(dir)))}-${basename(dir)}`;
  sources.push({ name, ir: () => { const p = parseProgram(dir); return flowToIR(p.nodes, p.edges); } });
}

interface Result { source: string; fw: string; ok: boolean; detail: string; unsupported?: boolean }
const results: Result[] = [];

for (const source of sources) {
  if (values.only && !source.name.includes(values.only)) continue;
  for (const fw of frameworks) {
    const label = `${source.name} → ${fw}`;
    let generated;
    try {
      generated = generateCode(source.ir(), fw);
    } catch (err) {
      results.push({ source: source.name, fw, ok: false, detail: `codegen threw: ${String(err).slice(0, 200)}` });
      continue;
    }
    if (generated.errors.length) {
      // A clear "the framework can't do this" from codegen is a known limit, not a failure.
      const unsupported = generated.errors.every((e) => /can't do/.test(e.message));
      results.push({ source: source.name, fw, ok: false, unsupported, detail: `codegen: ${generated.errors.map((e) => e.message).join("; ")}` });
      console.log(`${unsupported ? "–" : "✗"} ${label}: ${generated.errors[0].message}`);
      continue;
    }
    const dir = join(work, `${source.name.replace(/[^a-z0-9-]/gi, "_")}-${fw}`);
    rmSync(dir, { recursive: true, force: true });
    for (const f of generated.files) {
      mkdirSync(dirname(join(dir, f.path)), { recursive: true });
      writeFileSync(join(dir, f.path), f.content);
    }
    const cargo = generated.files.find((f) => f.path.endsWith("Cargo.toml") && f.content.includes("[package]"))!;
    const crateDir = join(dir, dirname(cargo.path));
    try {
      execFileSync("cargo", ["build-sbf"], {
        cwd: crateDir,
        env: { ...process.env, CARGO_TARGET_DIR: join(work, `target-${fw}`) },
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
        timeout: 900_000,
      });
      results.push({ source: source.name, fw, ok: true, detail: "" });
      console.log(`✓ ${label}`);
    } catch (err) {
      const out = `${(err as { stdout?: string }).stdout ?? ""}${(err as { stderr?: string }).stderr ?? ""}`;
      writeFileSync(join(dir, "build.log"), out);
      const errors = out.split("\n").filter((l) => /^error(\[E\d+\])?:/.test(l));
      const first = out.split("\n").findIndex((l) => /^error(\[E\d+\])?:/.test(l));
      const where = first >= 0 ? (out.split("\n").slice(first, first + 3).find((l) => l.includes("-->")) ?? "").trim() : "";
      results.push({ source: source.name, fw, ok: false, detail: `${errors.length} error(s); ${errors[0] ?? out.slice(-300)} ${where}` });
      console.log(`✗ ${label}: ${errors[0] ?? "build failed"} ${where}`);
    }
  }
}

const failed = results.filter((r) => !r.ok && !r.unsupported);
const unsupported = results.filter((r) => r.unsupported);
console.log(`\n${results.length - failed.length - unsupported.length}/${results.length} build, ${unsupported.length} unsupported by the framework`);
for (const r of unsupported) console.log(`  – ${r.source} → ${r.fw}: ${r.detail}`);
for (const r of failed) console.log(`  ✗ ${r.source} → ${r.fw}: ${r.detail}`);
writeFileSync(join(work, "results.json"), JSON.stringify(results, null, 2));
if (!existsSync(work)) process.exit(2);
process.exit(failed.length ? 1 : 0);
