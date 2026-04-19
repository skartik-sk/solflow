/**
 * Quick boilerplate compilation test.
 * Tests the default flow (createDefaultFlow) across all 3 frameworks.
 */
import { flowToIR } from "@solflow/ir";
import { generateCode } from "../src/index";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { request } from "https";

const execFileAsync = promisify(execFile);

// Replicate createDefaultFlow from project.ts
function createDefaultFlow(programPublicKey: string) {
  return {
    nodes: [
      { id: "program-1", type: "program", position: { x: 300, y: 50 }, data: { name: "my_program", version: "0.1.0", description: "My first Anchor program", license: "MIT", programId: programPublicKey } },
      { id: "instruction-1", type: "instruction", position: { x: 300, y: 220 }, data: { name: "initialize", description: "Initialize the program state", args: [], accessControl: "none" } },
      { id: "account-1", type: "account", position: { x: 120, y: 420 }, data: { name: "state_account", accountType: "account", isMut: true, isSigner: false, isInit: true, isClose: false } },
      { id: "authority-1", type: "account", position: { x: 300, y: 420 }, data: { name: "authority", accountType: "signer", isMut: false, isSigner: true, isInit: false, isClose: false } },
      { id: "sys-1", type: "account", position: { x: 480, y: 420 }, data: { name: "system_program", accountType: "system-program", isMut: false, isSigner: false, isInit: false, isClose: false } },
      { id: "state-1", type: "state", position: { x: 120, y: 600 }, data: { name: "ProgramState", fields: [{ name: "authority", type: "Pubkey" }, { name: "count", type: "u64" }], isZeroCopy: false } },
      { id: "logic-1", type: "logic", position: { x: 300, y: 340 }, data: { logicType: "set-field", order: 0, operation: { type: "set-field", account: "state_account", field: "count", value: "0" } } },
    ],
    edges: [
      { id: "e1", source: "program-1", target: "instruction-1", sourceHandle: "instruction-out", targetHandle: "instruction-in", type: "smoothstep", animated: true },
      { id: "e2", source: "instruction-1", target: "account-1", sourceHandle: "account-out", targetHandle: "account-in", type: "smoothstep", animated: true },
      { id: "e3", source: "instruction-1", target: "authority-1", sourceHandle: "account-out", targetHandle: "account-in", type: "smoothstep", animated: true },
      { id: "e4", source: "instruction-1", target: "sys-1", sourceHandle: "account-out", targetHandle: "account-in", type: "smoothstep", animated: true },
      { id: "e5", source: "instruction-1", target: "logic-1", sourceHandle: "logic-out", targetHandle: "logic-in", type: "smoothstep", animated: true },
      { id: "e6", source: "state-1", target: "account-1", sourceHandle: "data-out", targetHandle: "data-in", type: "smoothstep", animated: true },
    ],
  };
}

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

async function main() {
  const programPublicKey = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS";
  const flow = createDefaultFlow(programPublicKey);
  
  console.log("Converting boilerplate flow to IR...");
  const ir = flowToIR(flow.nodes as any, flow.edges as any);
  console.log(`  IR: program=${ir.program.name}, instructions=${ir.instructions.length}, states=${ir.states.length}`);
  
  const frameworks = ["anchor", "pinocchio", "quasar"] as const;
  let pass = 0, fail = 0;
  
  for (const fw of frameworks) {
    console.log(`\n--- ${fw.toUpperCase()} ---`);
    const result = generateCode(ir, fw as any);
    if (result.errors.length > 0) {
      console.error(`  CODEGEN ERRORS: ${result.errors.map(e => e.message).join(", ")}`);
      fail++; continue;
    }
    console.log(`  Generated ${result.files.length} files`);
    
    const projectDir = `/tmp/solflow-boilerplate-test/${fw}`;
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
        if (buildResult.success) { console.log("  PASSED (Solana Playground)"); pass++; }
        else { console.error("  FAILED (Solana Playground)"); console.error(buildResult.stderr.split("\n").filter((l: string) => l.includes("error")).slice(0, 10).join("\n")); fail++; }
      } else {
        const cargoDir = path.join(projectDir, `programs/${ir.program.name}`);
        await execFileAsync("cargo-build-sbf", ["--sbf-out-dir", "dist"], { cwd: cargoDir, timeout: 300_000 });
        console.log("  PASSED (local)"); pass++;
      }
    } catch (err: any) {
      console.error("  FAILED");
      const output = (err.stdout?.toString() || "") + (err.stderr?.toString() || "");
      console.error(output.split("\n").filter((l: string) => l.includes("error")).slice(0, 10).join("\n"));
      fail++;
    }
  }
  
  console.log(`\nBOILERPLATE RESULTS: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
