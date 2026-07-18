// Local test of the GitHub Actions compile path using .env.web.local.
// Run from repo root:  bun run scripts/test-gh-compile.ts
//
// This commits a sample Pinocchio program to the compiler repo, waits for the
// GitHub Actions workflow, and downloads the .so — exactly what the web app does.
import { readFileSync } from "node:fs";
import { runGitHubActionsBuild } from "../apps/web/src/server/compile-worker/gh-actions-runner";

// Load .env.web.local into process.env (so the test uses YOUR local token).
try {
  for (const line of readFileSync(".env.web.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
} catch (e) {
  console.error("Could not read .env.web.local:", e);
  process.exit(1);
}

const tok = process.env.GITHUB_TOKEN ?? "";
console.log("GITHUB_TOKEN length:", tok.length, "prefix:", tok.slice(0, 12));
console.log("OWNER/REPO:", process.env.GITHUB_COMPILER_OWNER, "/", process.env.GITHUB_COMPILER_REPO);
console.log("token has trailing whitespace?", /\s/.test(tok));
console.log("");

const cargoToml = `[package]
name = "program"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]

[dependencies]
pinocchio = "0.8"
`;

const libRs = `use pinocchio::{
    account_info::AccountInfo,
    entrypoint,
    program_error::ProgramError,
    pubkey::Pubkey,
};

entrypoint!(process_instruction);

pub fn process_instruction(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    _data: &[u8],
) -> Result<(), ProgramError> {
    Ok(()) // local-test-flavor-{TICK}
}
`;

console.log("Starting compile (this commits to the repo + waits for the workflow, ~1-2 min)...");
const result = await runGitHubActionsBuild(
  {
    ir: {},
    framework: "PINOCCHIO",
    irHash: "local-test",
    generatedFiles: [
      { path: "Cargo.toml", content: cargoToml },
      { path: "src/lib.rs", content: libRs },
    ],
    options: { release: false, verifiable: false, targetNetwork: "devnet" },
  } as never,
  (msg, level) => console.log(`[${level}] ${msg}`),
);

console.log("\n=== RESULT ===");
console.log(
  JSON.stringify(
    {
      success: result.success,
      binaryPath: result.binaryPath,
      binarySize: result.binarySize,
      durationMs: result.duration,
      errors: result.errors,
    },
    null,
    2,
  ),
);
process.exit(result.success ? 0 : 1);
