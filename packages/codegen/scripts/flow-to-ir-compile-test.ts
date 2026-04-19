/**
 * Flow-to-IR compilation test — same path as the frontend.
 * Imports seed template flow data, converts via flowToIR(), then compiles.
 * Catches field name mismatches between flow nodes and the transformer.
 *
 * Usage: bun run scripts/flow-to-ir-compile-test.ts
 */

import { generateCode } from "../src/index";
import { flowToIR } from "@solflow/ir";
import type { Node, Edge } from "@xyflow/react";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { request } from "https";

const execFileAsync = promisify(execFile);

// ─── SolPG build helper (for Anchor) ──────────────────────────────────────

function solpgBuild(files: [string, string][]): Promise<{ success: boolean; stderr: string }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ files: files.map(([p, c]) => [p, c]), flags: {} });
    const req = request({ hostname: "api.solpg.io", path: "/build", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, timeout: 120_000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => { try { const parsed = JSON.parse(data); const stderr = parsed.stderr || ""; resolve({ success: !stderr.includes("error: could not compile") && !stderr.includes("error[E"), stderr }); } catch { resolve({ success: false, stderr: data }); } });
    });
    req.on("error", (err) => reject(err));
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(body); req.end();
  });
}

// ─── Flatten for SolPG ──────────────────────────────────────────────────

function flattenForCloudBuild(files: { path: string; content: string }[]): [string, string][] {
  const fileMap = new Map<string, string>();
  for (const f of files) {
    if (f.path.endsWith("Cargo.toml")) continue;
    const srcIdx = f.path.indexOf("/src/");
    if (srcIdx !== -1) fileMap.set(f.path.substring(srcIdx + 5), f.content);
  }
  const libRs = fileMap.get("lib.rs") ?? "";
  if (!libRs) return [["/src/lib.rs", "// No source"]];
  const instructions: string[] = [], states: string[] = [], errors: string[] = [], events: string[] = [], constants: string[] = [];
  for (const [p, content] of fileMap) {
    if (p === "lib.rs" || p.endsWith("mod.rs")) continue;
    if (p.startsWith("instructions/")) instructions.push(content);
    else if (p.startsWith("state/")) states.push(content);
    else if (p.startsWith("errors")) errors.push(content);
    else if (p.startsWith("events")) events.push(content);
    else if (p.startsWith("constants")) constants.push(content);
  }
  const stripImports = (code: string) => code.replace(/^use\s+anchor_lang::prelude::\*;\s*$/gm, "").replace(/^use\s+crate::\w+::\w+;\s*$/gm, "").trim();
  const declareId = libRs.match(/declare_id!\("[^"]*"\);/)?.[0] ?? 'declare_id!("11111111111111111111111111111111");';
  const programModuleMatch = libRs.match(/#\[program\]\s*pub mod \w+ \{([\s\S]*?)\n\}/);
  let programBody = programModuleMatch ? programModuleMatch[1].trim() : "";
  const handlerBodies = new Map<string, { body: string; args: string; ctxName: string }>();
  const accountStructs: string[] = [];
  for (const instrContent of instructions) {
    const stripped = stripImports(instrContent);
    const handlerMatch = stripped.match(/pub fn handler\(ctx: Context<(\w+)>([^)]*)\)\s*(?:->\s*Result<\(\)>\s*)?\{([\s\S]*?)\n\}/);
    if (handlerMatch) handlerBodies.set(handlerMatch[1], { body: handlerMatch[3].trim(), args: handlerMatch[2].trim(), ctxName: handlerMatch[1] });
    const accountsMatches = [...stripped.matchAll(/#\[derive\(Accounts\)\]\s*(?:#\[instruction\([^)]*\)\]\s*)?pub struct \w+[^{]*\{[\s\S]*?\n\}/g)];
    for (const m of accountsMatches) accountStructs.push(m[0]);
  }
  const stateStructs: string[] = [];
  for (const s of states) { const stripped = stripImports(s); const matches = [...stripped.matchAll(/#\[account[^\n]*\](?:\s*#\[derive[^\n]*\])*\s*pub struct \w+[^{]*\{[\s\S]*?\n\}/g)]; for (const m of matches) stateStructs.push(m[0]); }
  const programNameMatch = libRs.match(/pub mod (\w+)\s*\{/);
  const programName = programNameMatch ? programNameMatch[1] : "my_program";
  const instrFns: string[] = [];
  for (const [ctxName, info] of handlerBodies) {
    const fnNameMatch = programBody.match(new RegExp(`pub fn (\\w+)\\(ctx: Context<${ctxName}>`));
    const fnName = fnNameMatch ? fnNameMatch[1] : ctxName.toLowerCase();
    const extraArgs = info.args ? ` ${info.args}` : "";
    instrFns.push(`    pub fn ${fnName}(ctx: Context<${ctxName}>${extraArgs}) -> Result<()> {\n` + info.body.split("\n").map((l: string) => (l ? `        ${l}` : "")).join("\n") + `\n    }`);
  }
  const parts: string[] = ["use anchor_lang::prelude::*;\n", `${declareId}\n`, "#[program]", `pub mod ${programName} {`, "    use super::*;", "", instrFns.join("\n\n"), "}\n"];
  if (stateStructs.length) parts.push(stateStructs.join("\n\n") + "\n");
  if (accountStructs.length) parts.push(accountStructs.join("\n\n") + "\n");
  if (errors.length) { for (const e of errors) { const stripped = stripImports(e); const m = stripped.match(/#\[error_code\]\s*pub enum \w+[^{]*\{[\s\S]*?\n\}/); if (m) parts.push(m[0] + "\n"); } }
  if (events.length) { for (const e of events) { const stripped = stripImports(e); const matches = [...stripped.matchAll(/#\[event\]\s*pub struct \w+[^{]*\{[\s\S]*?\n\}/g)]; for (const m of matches) parts.push(m[0] + "\n"); } }
  if (constants.length) { for (const c of constants) { parts.push(c + "\n"); } }
  return [["/src/lib.rs", parts.join("\n")]];
}

// ─── Runner ────────────────────────────────────────────────────────────────

const TMP_BASE = "/tmp/solflow-flow-to-ir-test";

async function testTemplate(name: string, ir: any): Promise<{ pass: number; fail: number }> {
  let pass = 0, fail = 0;

  for (const fw of ["anchor", "pinocchio", "quasar"] as const) {
    const result = generateCode(ir, fw as any);
    if (result.errors.length > 0) { fail++; console.error(`  [${fw}] FAIL (codegen): ${result.errors.map(e => e.message).join("; ")}`); continue; }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const projectDir = `${TMP_BASE}/${slug}-${fw}`;
    fs.rmSync(projectDir, { recursive: true, force: true });
    for (const file of result.files) {
      const fullPath = path.join(projectDir, file.path);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, file.content);
    }

    try {
      if (fw === "anchor") {
        const flatFiles = flattenForCloudBuild(result.files);
        const buildResult = await solpgBuild(flatFiles);
        if (buildResult.success) { pass++; } else {
          const errs = buildResult.stderr.split("\n").filter((l: string) => l.includes("error")).slice(0, 5);
          console.error(`  [${fw}] FAIL (SolPG): ${errs.join(" | ")}`);
          fs.writeFileSync(`${projectDir}/compile-output.log`, buildResult.stderr);
          fail++;
        }
      } else {
        const cargoDir = path.join(projectDir, `programs/${ir.program?.name ?? slug}`);
        await execFileAsync("cargo-build-sbf", ["--sbf-out-dir", "dist"], { cwd: cargoDir, timeout: 300_000 });
        pass++;
      }
      console.log(`  [${fw}] PASS`);
    } catch (err: any) {
      const output = (err.stdout?.toString() || "") + (err.stderr?.toString() || "");
      const errs = output.split("\n").filter((l: string) => l.includes("error")).slice(0, 5);
      console.error(`  [${fw}] FAIL: ${errs.join(" | ")}`);
      fs.writeFileSync(`${projectDir}/compile-output.log`, output);
      fail++;
    }
  }
  return { pass, fail };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  FLOW-TO-IR COMPILATION TEST (frontend path)");
  console.log("══════════════════════════════════════════════════════════════\n");

  const { TEMPLATES } = await import("../../db/prisma/seed.ts") as any;

  let totalPass = 0, totalFail = 0;

  for (const tmpl of TEMPLATES) {
    const name = tmpl.title;
    console.log(`\n>>> ${name}`);
    try {
      const fd = tmpl.templateFlowData;
      const ir = flowToIR(fd.nodes, fd.edges);
      const { pass, fail } = await testTemplate(name, ir);
      totalPass += pass;
      totalFail += fail;
      console.log(`    Result: ${pass} pass, ${fail} fail`);
    } catch (err: any) {
      console.error(`    flowToIR FAILED: ${err.message}`);
      totalFail += 3;
    }
  }

  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`  TOTAL: ${totalPass} passed, ${totalFail} failed`);
  console.log("══════════════════════════════════════════════════════════════\n");

  process.exit(totalFail > 0 ? 1 : 0);
}

main();
