// Compile a generated Pinocchio program with the real BrowserCompiler and the built assets.
// Usage: bun toolchain/smoke.ts [out.so]
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { generateCode } from "@solflow/codegen";
import type { ProgramIR } from "@solflow/ir";
import { BrowserCompiler } from "../src/compiler";
import type { CompilerManifest } from "../src/crate";

const assets = join(import.meta.dir, "..", "dist-assets", "v1");
const manifest = JSON.parse(readFileSync(join(assets, "manifest.json"), "utf8")) as CompilerManifest;

// A vault (from the codegen compilation test): PDA init, SOL transfer, checked math, custom errors.
const ir = JSON.parse(readFileSync(join(import.meta.dir, "fixtures/vault-ir.json"), "utf8")) as ProgramIR;
const generated = generateCode(ir, "pinocchio");

const t0 = performance.now();
const compiler = await BrowserCompiler.create(manifest, async (name) => new Uint8Array(readFileSync(join(assets, name))));
await compiler.prepare("pinocchio");
const t1 = performance.now();
const out = await compiler.compile(generated.files, "pinocchio");
console.log(
  `load ${((t1 - t0) / 1000).toFixed(1)}s, rustc ${(out.timings.rustcMs / 1000).toFixed(2)}s, link ${out.timings.linkMs.toFixed(0)}ms → ${out.program.length} bytes`,
);
if (process.argv[2]) writeFileSync(process.argv[2], out.program);
