/**
 * End-to-end compilation test for marketplace templates.
 * Tests: Escrow, NFT Collection (more to be added).
 *
 * Usage: bun run scripts/template-compile-test.ts
 */

import { generateCode } from "../src/index";
import type { ProgramIR } from "@solflow/ir";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { request } from "https";

const execFileAsync = promisify(execFile);

// ─── Flatten Anchor code for Solana Playground ─────────────────────────────

function flattenForCloudBuild(files: { path: string; content: string }[]): [string, string][] {
  const fileMap = new Map<string, string>();
  for (const f of files) {
    if (f.path.endsWith("Cargo.toml")) continue;
    const srcIdx = f.path.indexOf("/src/");
    if (srcIdx !== -1) fileMap.set(f.path.substring(srcIdx + 5), f.content);
  }
  const libRs = fileMap.get("lib.rs") ?? "";
  if (!libRs) return [["/src/lib.rs", "// No source"]];

  const instructions: string[] = [], states: string[] = [], errors: string[] = [], events: string[] = [];
  for (const [p, content] of fileMap) {
    if (p === "lib.rs" || p.endsWith("mod.rs")) continue;
    if (p.startsWith("instructions/")) instructions.push(content);
    else if (p.startsWith("state/")) states.push(content);
    else if (p.startsWith("errors")) errors.push(content);
    else if (p.startsWith("events")) events.push(content);
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
  return [["/src/lib.rs", parts.join("\n")]];
}

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

// ─── Templates ──────────────────────────────────────────────────────────────

const META = {
  createdAt: "2026-04-17T00:00:00.000Z",
  updatedAt: "2026-04-17T00:00:00.000Z",
  flowHash: "seed-v3",
  generatorVersion: "0.1.0",
};

const TEMPLATES: Record<string, ProgramIR> = {
  "Escrow": {
    version: "1.0.0",
    program: { name: "escrow", description: "Two-party token escrow with timelock", version: "0.1.0", programId: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS" },
    instructions: [
      { id: "a2000000-0000-0000-0000-000000000001", name: "initialize_escrow", description: "Initialize a new escrow", accessControl: "none", args: [{ name: "amount", type: "u64" }, { name: "deadline", type: "i64" }], accounts: [
        { id: "a2000000-0000-0000-0000-000000000010", name: "escrow", accountType: "account", stateType: "EscrowState", constraints: [{ type: "init", payer: "maker", space: "auto" }, { type: "seeds", seeds: [{ type: "literal", value: "escrow" }, { type: "account-field", value: "maker" }], bump: "escrow.bump" }], description: undefined },
        { id: "a2000000-0000-0000-0000-000000000011", name: "maker", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
        { id: "a2000000-0000-0000-0000-000000000012", name: "system_program", accountType: "system-program", constraints: [], description: undefined },
      ], body: [
        { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
        { type: "set-field", account: "escrow", field: "maker", value: "*ctx.accounts.maker.key" },
        { type: "set-field", account: "escrow", field: "amount", value: "amount" },
        { type: "set-field", account: "escrow", field: "deadline", value: "deadline" },
        { type: "set-field", account: "escrow", field: "bump", value: "ctx.bumps.escrow" },
      ] },
      { id: "a2000000-0000-0000-0000-000000000002", name: "exchange", description: "Fulfill the escrow trade", accessControl: "none", args: [], accounts: [
        { id: "a2000000-0000-0000-0000-000000000020", name: "escrow", accountType: "account", stateType: "EscrowState", constraints: [{ type: "mut" }, { type: "seeds", seeds: [{ type: "literal", value: "escrow" }, { type: "account-field", value: "maker" }], bump: "escrow.bump" }], description: undefined },
        { id: "a2000000-0000-0000-0000-000000000023", name: "maker", accountType: "system-account", constraints: [], description: undefined },
        { id: "a2000000-0000-0000-0000-000000000021", name: "taker", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
        { id: "a2000000-0000-0000-0000-000000000022", name: "system_program", accountType: "system-program", constraints: [], description: undefined },
      ], body: [
        { type: "require", condition: "Clock::get()?.unix_timestamp < escrow.deadline", errorCode: "EscrowExpired" },
        { type: "set-field", account: "escrow", field: "taker", value: "*ctx.accounts.taker.key" },
        { type: "emit-event", event: "ExchangeEvent", fields: { maker: "escrow.maker", taker: "*ctx.accounts.taker.key", amount: "escrow.amount" } },
      ] },
      { id: "a2000000-0000-0000-0000-000000000003", name: "cancel", description: "Cancel the escrow", accessControl: "none", args: [], accounts: [
        { id: "a2000000-0000-0000-0000-000000000030", name: "escrow", accountType: "account", stateType: "EscrowState", constraints: [{ type: "mut" }, { type: "close", target: "maker" }, { type: "seeds", seeds: [{ type: "literal", value: "escrow" }, { type: "account-field", value: "maker" }], bump: "escrow.bump" }], description: undefined },
        { id: "a2000000-0000-0000-0000-000000000031", name: "maker", accountType: "signer", constraints: [{ type: "signer" }], description: undefined },
        { id: "a2000000-0000-0000-0000-000000000032", name: "system_program", accountType: "system-program", constraints: [], description: undefined },
      ], body: [
        { type: "emit-event", event: "CancelEvent", fields: { maker: "*ctx.accounts.maker.key" } },
      ] },
    ],
    states: [{ id: "b2000000-0000-0000-0000-000000000001", name: "EscrowState", isZeroCopy: false, fields: [{ name: "maker", type: "Pubkey", description: "Escrow creator" }, { name: "taker", type: "Pubkey", description: "Escrow fulfiller" }, { name: "amount", type: "u64", description: "Escrow amount" }, { name: "deadline", type: "i64", description: "Unix timestamp deadline" }, { name: "bump", type: "u8", description: "PDA bump" }] }],
    errors: [{ id: "c2000000-0000-0000-0000-000000000001", name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" }, { id: "c2000000-0000-0000-0000-000000000002", name: "EscrowExpired", code: 6001, message: "Escrow deadline has passed" }],
    events: [{ id: "d2000000-0000-0000-0000-000000000001", name: "ExchangeEvent", fields: [{ name: "maker", type: "Pubkey" }, { name: "taker", type: "Pubkey" }, { name: "amount", type: "u64" }] }, { id: "d2000000-0000-0000-0000-000000000002", name: "CancelEvent", fields: [{ name: "maker", type: "Pubkey" }] }],
    integrations: [],
    constants: [],
    metadata: META,
  },
};

// ─── Runner ─────────────────────────────────────────────────────────────────

const TMP_BASE = "/tmp/solflow-template-test";
const frameworks = ["anchor", "pinocchio", "quasar"] as const;

async function testTemplate(name: string, ir: ProgramIR): Promise<{ pass: number; fail: number }> {
  let pass = 0, fail = 0;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${name} — Compilation Test`);
  console.log(`${"=".repeat(60)}\n`);

  for (const fw of frameworks) {
    console.log(`  [${fw.toUpperCase()}] Generating...`);
    const result = generateCode(ir, fw as any);

    if (result.errors.length > 0) {
      console.error(`    CODEGEN ERRORS: ${result.errors.map(e => e.message).join(", ")}`);
      fail++; continue;
    }

    const projectDir = `${TMP_BASE}/${name.toLowerCase().replace(/\s/g, "-")}-${fw}`;
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
        if (buildResult.success) { console.log(`    PASSED (Solana Playground)`); pass++; }
        else {
          console.error(`    FAILED (Solana Playground)`);
          const errorLines = buildResult.stderr.split("\n").filter((l: string) => l.includes("error")).slice(0, 10);
          for (const l of [...new Set(errorLines)]) console.error(`      ${l}`);
          fs.writeFileSync(`${projectDir}/compile-output.log`, buildResult.stderr);
          fail++;
        }
      } else {
        const cargoDir = path.join(projectDir, `programs/${ir.program.name}`);
        await execFileAsync("cargo-build-sbf", ["--sbf-out-dir", "dist"], { cwd: cargoDir, timeout: 300_000 });
        console.log(`    PASSED (local)`);
        pass++;
      }
    } catch (err: any) {
      console.error(`    FAILED`);
      const output = (err.stdout?.toString() || "") + (err.stderr?.toString() || "");
      const errorLines = output.split("\n").filter((l: string) => l.includes("error")).slice(0, 10);
      for (const l of [...new Set(errorLines)]) console.error(`      ${l}`);
      fs.writeFileSync(`${projectDir}/compile-output.log`, output);
      fail++;
    }
  }

  return { pass, fail };
}

async function main() {
  let totalPass = 0, totalFail = 0;

  for (const [name, ir] of Object.entries(TEMPLATES)) {
    const { pass, fail } = await testTemplate(name, ir);
    totalPass += pass;
    totalFail += fail;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  TOTAL: ${totalPass} passed, ${totalFail} failed`);
  console.log(`${"=".repeat(60)}\n`);

  process.exit(totalFail > 0 ? 1 : 0);
}

main();
