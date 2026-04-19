/**
 * End-to-end compilation test for Simple Vault.
 * Uses SAME flow as the browser:
 *   - Anchor: flatten to single lib.rs → Solana Playground API
 *   - Pinocchio/Quasar: cargo-build-sbf locally
 *
 * Usage: bun run scripts/compile-test.ts
 */

import { generateCode } from "../src/index";
import type { ProgramIR } from "@solflow/ir";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { request } from "https";

const execFileAsync = promisify(execFile);

// ─── Simple Vault IR ─────────────────────────────────────────────────────────

const VAULT_IR: ProgramIR = {
  version: "1.0.0",
  program: {
    name: "vault",
    description: "SOL vault with PDA, deposits, withdrawals, and events",
    version: "0.1.0",
    programId: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS",
  },
  instructions: [
    {
      id: "a0000000-0000-0000-0000-000000000001",
      name: "initialize",
      description: "Initialize a new vault",
      args: [],
      accessControl: "none",
      accounts: [
        {
          id: "a0000000-0000-0000-0000-000000000010",
          name: "vault",
          accountType: "account",
          stateType: "VaultState",
          constraints: [
            { type: "init", payer: "authority", space: "auto" },
            { type: "seeds", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" },
          ],
        },
        {
          id: "a0000000-0000-0000-0000-000000000011",
          name: "authority",
          accountType: "signer",
          constraints: [{ type: "signer" }],
        },
        {
          id: "a0000000-0000-0000-0000-000000000012",
          name: "system_program",
          accountType: "system-program",
          constraints: [],
        },
      ],
      body: [
        { type: "set-field", account: "vault", field: "authority", value: "*ctx.accounts.authority.key" },
        { type: "set-field", account: "vault", field: "balance", value: "0" },
        { type: "set-field", account: "vault", field: "bump", value: "ctx.bumps.vault" },
      ],
    },
    {
      id: "a0000000-0000-0000-0000-000000000002",
      name: "deposit",
      accessControl: "none",
      args: [{ name: "amount", type: "u64", description: "Amount of lamports to deposit" }],
      accounts: [
        {
          id: "a0000000-0000-0000-0000-000000000020",
          name: "vault",
          accountType: "account",
          stateType: "VaultState",
          constraints: [
            { type: "mut" },
            { type: "seeds", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" },
          ],
        },
        {
          id: "a0000000-0000-0000-0000-000000000021",
          name: "authority",
          accountType: "signer",
          constraints: [{ type: "signer" }],
        },
        {
          id: "a0000000-0000-0000-0000-000000000022",
          name: "system_program",
          accountType: "system-program",
          constraints: [],
        },
      ],
      body: [
        { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
        { type: "transfer-sol", from: "authority", to: "vault", amount: "amount" },
        { type: "math", operation: "add", left: "vault.balance", right: "amount", result: "new_balance", checked: true },
        { type: "set-field", account: "vault", field: "balance", value: "new_balance" },
        { type: "emit-event", event: "DepositEvent", fields: { authority: "*ctx.accounts.authority.key", amount: "amount", new_balance: "new_balance" } },
      ],
    },
    {
      id: "a0000000-0000-0000-0000-000000000003",
      name: "withdraw",
      accessControl: "none",
      args: [{ name: "amount", type: "u64" }],
      accounts: [
        {
          id: "a0000000-0000-0000-0000-000000000030",
          name: "vault",
          accountType: "account",
          stateType: "VaultState",
          constraints: [
            { type: "mut" },
            { type: "seeds", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" },
          ],
        },
        {
          id: "a0000000-0000-0000-0000-000000000031",
          name: "authority",
          accountType: "signer",
          constraints: [{ type: "signer" }],
        },
        {
          id: "a0000000-0000-0000-0000-000000000032",
          name: "system_program",
          accountType: "system-program",
          constraints: [],
        },
      ],
      body: [
        { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
        { type: "require", condition: "vault.balance >= amount", errorCode: "InsufficientFunds" },
        { type: "if-else", condition: "amount == vault.balance", thenBody: [
          { type: "set-field", account: "vault", field: "balance", value: "0" },
        ], elseBody: [
          { type: "math", operation: "sub", left: "vault.balance", right: "amount", result: "remaining", checked: true },
          { type: "set-field", account: "vault", field: "balance", value: "remaining" },
        ] },
        { type: "emit-event", event: "WithdrawEvent", fields: { authority: "*ctx.accounts.authority.key", amount: "amount" } },
      ],
    },
    {
      id: "a0000000-0000-0000-0000-000000000004",
      name: "close_vault",
      accessControl: "none",
      args: [],
      accounts: [
        {
          id: "a0000000-0000-0000-0000-000000000040",
          name: "vault",
          accountType: "account",
          stateType: "VaultState",
          constraints: [
            { type: "mut" },
            { type: "close", target: "authority" },
            { type: "seeds", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" },
          ],
        },
        {
          id: "a0000000-0000-0000-0000-000000000041",
          name: "authority",
          accountType: "signer",
          constraints: [{ type: "signer" }],
        },
        {
          id: "a0000000-0000-0000-0000-000000000042",
          name: "system_program",
          accountType: "system-program",
          constraints: [],
        },
      ],
      body: [],
    },
  ],
  states: [
    {
      id: "b0000000-0000-0000-0000-000000000001",
      name: "VaultState",
      isZeroCopy: false,
      fields: [
        { name: "authority", type: "Pubkey", description: "Vault owner" },
        { name: "balance", type: "u64", description: "Current vault balance" },
        { name: "bump", type: "u8", description: "PDA bump seed" },
      ],
    },
  ],
  errors: [
    { id: "c0000000-0000-0000-0000-000000000001", name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" },
    { id: "c0000000-0000-0000-0000-000000000002", name: "InsufficientFunds", code: 6001, message: "Insufficient funds in vault" },
  ],
  events: [
    {
      id: "d0000000-0000-0000-0000-000000000001",
      name: "DepositEvent",
      fields: [
        { name: "authority", type: "Pubkey" },
        { name: "amount", type: "u64" },
        { name: "new_balance", type: "u64" },
      ],
    },
    {
      id: "d0000000-0000-0000-0000-000000000002",
      name: "WithdrawEvent",
      fields: [
        { name: "authority", type: "Pubkey" },
        { name: "amount", type: "u64" },
      ],
    },
  ],
  integrations: [],
  constants: [
    { name: "MAX_DEPOSIT", type: "u64", value: "1_000_000_000_000" },
  ],
  metadata: {
    createdAt: "2026-04-17T00:00:00.000Z",
    updatedAt: "2026-04-17T00:00:00.000Z",
    flowHash: "vault_example",
    generatorVersion: "0.1.0",
  },
};

// ─── Flatten Anchor code for Solana Playground ─────────────────────────────

function flattenForCloudBuild(files: { path: string; content: string }[]): [string, string][] {
  const fileMap = new Map<string, string>();
  for (const f of files) {
    if (f.path.endsWith("Cargo.toml")) continue;
    const srcIdx = f.path.indexOf("/src/");
    if (srcIdx !== -1) {
      fileMap.set(f.path.substring(srcIdx + 5), f.content);
    }
  }

  const libRs = fileMap.get("lib.rs") ?? "";
  if (!libRs) return [["/src/lib.rs", "// No source code generated"]];

  const instructions: string[] = [];
  const states: string[] = [];
  const errors: string[] = [];
  const events: string[] = [];

  for (const [p, content] of fileMap) {
    if (p === "lib.rs" || p.endsWith("mod.rs")) continue;
    if (p.startsWith("instructions/")) instructions.push(content);
    else if (p.startsWith("state/")) states.push(content);
    else if (p.startsWith("errors")) errors.push(content);
    else if (p.startsWith("events")) events.push(content);
  }

  const stripImports = (code: string) =>
    code
      .replace(/^use\s+anchor_lang::prelude::\*;\s*$/gm, "")
      .replace(/^use\s+crate::(state|instructions|errors|events|constants)::\w+;\s*$/gm, "")
      .replace(/^use\s+crate::errors::\w+;\s*$/gm, "")
      .trim();

  const declareIdMatch = libRs.match(/declare_id!\("[^"]*"\);/);
  const declareId = declareIdMatch ? declareIdMatch[0] : 'declare_id!("11111111111111111111111111111111");';

  const programModuleMatch = libRs.match(/#\[program\]\s*pub mod \w+ \{([\s\S]*?)\n\}/);
  let programBody = programModuleMatch ? programModuleMatch[1].trim() : "";

  // Extract handlers and account structs from instruction files
  const handlerBodies = new Map<string, { body: string; args: string; ctxName: string }>();
  const accountStructs: string[] = [];

  for (const instrContent of instructions) {
    const stripped = stripImports(instrContent);
    const handlerMatch = stripped.match(
      /pub fn handler\(ctx: Context<(\w+)>([^)]*)\)\s*(?:->\s*Result<\(\)>\s*)?\{([\s\S]*?)\n\}/,
    );
    if (handlerMatch) {
      handlerBodies.set(handlerMatch[1], {
        body: handlerMatch[3].trim(),
        args: handlerMatch[2].trim(),
        ctxName: handlerMatch[1],
      });
    }
    const accountsMatches = [...stripped.matchAll(
      /#\[derive\(Accounts\)\]\s*(?:#\[instruction\([^)]*\)\]\s*)?pub struct \w+[^{]*\{[\s\S]*?\n\}/g,
    )];
    for (const m of accountsMatches) accountStructs.push(m[0]);
  }

  const stateStructs: string[] = [];
  for (const s of states) {
    const stripped = stripImports(s);
    const matches = [...stripped.matchAll(/#\[account[^\n]*\](?:\s*#\[derive[^\n]*\])*\s*pub struct \w+[^{]*\{[\s\S]*?\n\}/g)];
    for (const m of matches) stateStructs.push(m[0]);
  }

  const errorEnums: string[] = [];
  for (const e of errors) {
    const stripped = stripImports(e);
    const m = stripped.match(/#\[error_code\]\s*pub enum \w+[^{]*\{[\s\S]*?\n\}/);
    if (m) errorEnums.push(m[0]);
  }

  const eventStructs: string[] = [];
  for (const e of events) {
    const stripped = stripImports(e);
    const matches = [...stripped.matchAll(/#\[event\]\s*pub struct \w+[^{]*\{[\s\S]*?\n\}/g)];
    for (const m of matches) eventStructs.push(m[0]);
  }

  const programNameMatch = libRs.match(/pub mod (\w+)\s*\{/);
  const rawName = programNameMatch ? programNameMatch[1] : "my_program";
  const programName = rawName === "program" ? "my_program" : rawName;

  const instrFns: string[] = [];
  for (const [ctxName, info] of handlerBodies) {
    const fnNameMatch = programBody.match(new RegExp(`pub fn (\\w+)\\(ctx: Context<${ctxName}>`));
    const fnName = fnNameMatch ? fnNameMatch[1] : ctxName.toLowerCase();
    const extraArgs = info.args ? ` ${info.args}` : "";
    instrFns.push(
      `    pub fn ${fnName}(ctx: Context<${ctxName}>${extraArgs}) -> Result<()> {\n` +
        info.body.split("\n").map((l: string) => (l ? `        ${l}` : "")).join("\n") +
        `\n    }`,
    );
  }

  const parts: string[] = [
    "use anchor_lang::prelude::*;\n",
    `${declareId}\n`,
    "#[program]",
    `pub mod ${programName} {`,
    "    use super::*;",
    "",
    instrFns.join("\n\n"),
    "}\n",
  ];

  if (stateStructs.length) parts.push(stateStructs.join("\n\n") + "\n");
  if (accountStructs.length) parts.push(accountStructs.join("\n\n") + "\n");
  if (errorEnums.length) parts.push(errorEnums.join("\n\n") + "\n");
  if (eventStructs.length) parts.push(eventStructs.join("\n\n") + "\n");

  return [["/src/lib.rs", parts.join("\n")]];
}

// ─── Solana Playground build ────────────────────────────────────────────────

function solpgBuild(files: [string, string][]): Promise<{ success: boolean; stderr: string }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      files: files.map(([p, c]) => [p, c]),
      flags: {},
    });

    const req = request(
      {
        hostname: "api.solpg.io",
        path: "/build",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 120_000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            const stderr = parsed.stderr || "";
            const hasError = stderr.includes("error: could not compile") || stderr.includes("error[E");
            resolve({ success: !hasError, stderr });
          } catch {
            resolve({ success: false, stderr: data });
          }
        });
      },
    );
    req.on("error", (err) => reject(err));
    req.on("timeout", () => { req.destroy(); reject(new Error("SolPG timeout")); });
    req.write(body);
    req.end();
  });
}

// ─── Runner ─────────────────────────────────────────────────────────────────

const TMP_BASE = "/tmp/solflow-compile-test";
const frameworks = ["anchor", "pinocchio", "quasar"] as const;

let totalPass = 0;
let totalFail = 0;

async function runCompileTest(fw: string): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${fw.toUpperCase()} — Simple Vault Compilation Test`);
  console.log(`${"=".repeat(60)}\n`);

  // Step 1: Generate code
  console.log(`[1/3] Generating ${fw} code...`);
  const result = generateCode(VAULT_IR, fw as any);

  if (result.errors.length > 0) {
    console.error(`  CODEGEN ERRORS (${result.errors.length}):`);
    for (const e of result.errors) console.error(`    - ${e.message}`);
    totalFail++;
    return;
  }

  console.log(`  Generated ${result.files.length} files (0 codegen errors)`);

  // Step 2: Write files
  const projectDir = `${TMP_BASE}/${fw}-vault`;
  fs.rmSync(projectDir, { recursive: true, force: true });

  for (const file of result.files) {
    const fullPath = path.join(projectDir, file.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content);
  }
  console.log(`  Written to ${projectDir}`);

  // Step 3: Compile
  console.log(`[2/3] Compiling ${fw}...`);

  try {
    if (fw === "anchor") {
      // Flatten and send to Solana Playground (same as browser)
      const flatFiles = flattenForCloudBuild(result.files);
      console.log(`  Flattened to ${flatFiles.length} file(s) for Solana Playground`);

      // Save flattened file for inspection
      const flatContent = flatFiles[0][1];
      fs.writeFileSync(`${projectDir}/flattened-lib.rs`, flatContent);
      console.log(`  Saved flattened lib.rs (${flatContent.split("\n").length} lines)`);

      const buildResult = await solpgBuild(flatFiles);
      if (buildResult.success) {
        console.log(`  COMPILATION PASSED (Solana Playground)!`);
        totalPass++;
      } else {
        console.error(`  COMPILATION FAILED (Solana Playground)!`);
        const errorLines = buildResult.stderr.split("\n").filter(
          (l: string) => l.includes("error") || l.includes("Error"),
        );
        for (const l of [...new Set(errorLines)].slice(0, 20)) console.error(`    ${l}`);
        fs.writeFileSync(`${projectDir}/compile-output.log`, buildResult.stderr);
        totalFail++;
      }
    } else {
      // Pinocchio/Quasar: local cargo-build-sbf
      const cargoDir = path.join(projectDir, "programs/vault");
      const { stdout } = await execFileAsync("cargo-build-sbf", ["--sbf-out-dir", "dist"], {
        cwd: cargoDir,
        timeout: 300_000,
      });
      console.log(`  COMPILATION PASSED (local)!`);
      totalPass++;
    }

    console.log(`\n[3/3] Generated files:`);
    for (const f of result.files) {
      console.log(`    ${f.path} (${f.content.split("\n").length} lines)`);
    }

  } catch (err: any) {
    console.error(`  COMPILATION FAILED!`);
    const stdout = err.stdout?.toString() || "";
    const stderr = err.stderr?.toString() || "";
    const output = stdout + stderr;

    const errorLines = output.split("\n").filter(
      (l: string) => l.includes("error") || l.includes("Error"),
    );
    for (const l of [...new Set(errorLines)].slice(0, 20)) console.error(`    ${l}`);

    fs.writeFileSync(`${projectDir}/compile-output.log`, output);
    totalFail++;
  }
}

async function main() {
  for (const fw of frameworks) {
    await runCompileTest(fw);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${totalPass} passed, ${totalFail} failed`);
  console.log(`${"=".repeat(60)}\n`);

  process.exit(totalFail > 0 ? 1 : 0);
}

main();
