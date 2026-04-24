import { parseProgram } from "./packages/rust-parser/src/index";
import { execFileSync } from "child_process";

const output = execFileSync("find", [
  "/Users/singupallikartik/Developer",
  "-name", "Anchor.toml",
  "-not", "-path", "*/target/*",
  "-not", "-path", "*/node_modules/*",
], { encoding: "utf-8" });

const allTomls = output.trim().split("\n").filter(Boolean);

// Deduplicate — only test from /playgroud/anchor (skip /fun-projects/anchor duplicates)
// and skip test fixtures that are duplicates
const seen = new Set<string>();
const uniqueTomls: string[] = [];
for (const toml of allTomls) {
  const dir = toml.replace("/Anchor.toml", "");
  const name = dir.split("/").pop()!;
  // Skip duplicates: fun-projects/anchor is a copy of playgroud/anchor
  if (dir.includes("/fun-projects/anchor/")) continue;
  // Skip other duplicates by name
  if (seen.has(name)) continue;
  seen.add(name);
  uniqueTomls.push(toml);
}

let pass = 0, empty = 0, noLogic = 0, crash = 0;
const failures: string[] = [];

for (const toml of uniqueTomls) {
  const dir = toml.replace("/Anchor.toml", "");
  const name = dir.split("/").pop()!;
  try {
    const r = parseProgram(dir);
    if (r.stats.instructions === 0) {
      empty++;
      failures.push(`⚠️  EMPTY ${name}: ${dir}`);
    } else if (r.stats.logicOps === 0) {
      noLogic++;
      // Only report if it's NOT a trivial Ok(()) project
    } else {
      pass++;
    }
  } catch (err: any) {
    crash++;
    failures.push(`❌ CRASH ${name}: ${err.message?.substring(0, 100)}`);
  }
}

const total = uniqueTomls.length;
console.log(`STRESS TEST: ${total} unique projects (deduped from ${allTomls.length})`);
console.log(`✅ Pass (instr+logic): ${pass}`);
console.log(`🔶 No logic ops:       ${noLogic} (empty bodies - expected)`);
console.log(`⚠️  Empty (0 instr):    ${empty}`);
console.log(`❌ Crashed:             ${crash}`);
if (failures.length > 0) {
  console.log("");
  for (const f of failures) console.log(f);
}
