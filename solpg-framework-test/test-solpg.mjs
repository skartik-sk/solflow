// Empirical test: can api.solpg.io compile NON-Anchor (native) Solana programs?
//
// Sends 4 payloads to https://api.solpg.io/build and reports what happens:
//   1. Anchor minimal            (baseline — known to work)
//   2. Pinocchio, lib.rs only     (native Rust, no Anchor macros)
//   3. Pinocchio, + custom Cargo.toml (does solpg respect custom deps?)
//   4. Pure solana-program native  (generic non-Anchor; proxy for Quasar too)
//
// Run: node solpg-framework-test/test-solpg.mjs   (or: bun run ...)

const API = "https://api.solpg.io";
const BUILD_TIMEOUT_MS = 120_000;

// ─── Minimal programs ────────────────────────────────────────────────────────

const ANCHOR_LIB = `use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod minimal {
    use super::*;
    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
`;

const PINOCCHIO_LIB = `use pinocchio::{
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
    Ok(())
}
`;

const PINOCCHIO_CARGO = `[package]
name = "pinocchio-minimal"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]

[dependencies]
pinocchio = "0.8"
`;

const NATIVE_LIB = `#![no_std]
use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, pubkey::Pubkey,
};

entrypoint!(process);

pub fn process(_program_id: &Pubkey, _accounts: &[AccountInfo], _data: &[u8]) -> ProgramResult {
    Ok(())
}
`;

const NATIVE_CARGO = `[package]
name = "native-minimal"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]

[dependencies]
solana-program = "1.18"
`;

// ─── Harness ─────────────────────────────────────────────────────────────────

async function build(files, label) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`TEST: ${label}`);
  console.log("=".repeat(72));
  console.log(`files: ${files.map((f) => f[0]).join(", ")}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BUILD_TIMEOUT_MS);
  const started = Date.now();

  try {
    const res = await fetch(`${API}/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files,
        flags: { seedsFeature: false, noDocs: true, safetyChecks: false },
      }),
      signal: controller.signal,
    });

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const text = await res.text();

    console.log(`HTTP ${res.status} in ${elapsed}s`);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.log("NON-JSON response (first 500 chars):");
      console.log(text.slice(0, 500));
      return { label, ok: false, reason: "non-json response" };
    }

    // Did the Rust actually compile? solpg returns stderr in the body.
    const stderr = typeof data.stderr === "string" ? data.stderr : "";
    const hasError =
      stderr.includes("error[") ||
      stderr.includes("error:") ||
      stderr.includes("could not compile") ||
      data.error;

    if (data.error) {
      console.log(`❌ API error: ${data.error}`);
      return { label, ok: false, reason: data.error };
    }

    if (hasError) {
      console.log("❌ Compilation errors in stderr:");
      // print first ~15 error lines
      const errLines = stderr
        .split("\n")
        .filter((l) => /error/i.test(l))
        .slice(0, 15);
      for (const l of errLines) console.log("   " + l.trim());
      return { label, ok: false, reason: "compile error", uuid: data.uuid };
    }

    // Looks successful — try to fetch the binary
    if (data.uuid) {
      console.log(`✅ Build OK (uuid: ${data.uuid}). Fetching binary...`);
      const bin = await fetch(`${API}/deploy/${data.uuid}`);
      if (bin.ok) {
        const buf = Buffer.from(await bin.arrayBuffer());
        console.log(`✅ Binary fetched: ${buf.byteLength} bytes`);
        return { label, ok: true, binaryBytes: buf.byteLength, uuid: data.uuid };
      }
      console.log(`⚠️  Build OK but binary fetch returned HTTP ${bin.status}`);
      return { label, ok: true, binaryBytes: 0, uuid: data.uuid, binaryFetchFailed: true };
    }

    console.log("⚠️  Unexpected response (no uuid, no error):");
    console.log(JSON.stringify(data).slice(0, 500));
    return { label, ok: false, reason: "unexpected shape" };
  } catch (err) {
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    if (err.name === "AbortError") {
      console.log(`❌ Timed out after ${elapsed}s`);
      return { label, ok: false, reason: "timeout" };
    }
    console.log(`❌ Network/fetch error: ${err.message}`);
    return { label, ok: false, reason: `fetch error: ${err.message}` };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Run all tests ───────────────────────────────────────────────────────────

const results = [];
results.push(await build([["/src/lib.rs", ANCHOR_LIB]], "1. Anchor (baseline)"));
results.push(await build([["/src/lib.rs", PINOCCHIO_LIB]], "2. Pinocchio — lib.rs only"));
results.push(
  await build(
    [
      ["/Cargo.toml", PINOCCHIO_CARGO],
      ["/src/lib.rs", PINOCCHIO_LIB],
    ],
    "3. Pinocchio — with custom Cargo.toml",
  ),
);
results.push(await build([["/src/lib.rs", NATIVE_LIB]], "4. Pure solana-program native"));

console.log(`\n${"#".repeat(72)}`);
console.log("SUMMARY");
console.log("#".repeat(72));
for (const r of results) {
  const mark = r.ok ? "✅ WORKS" : "❌ FAILS";
  const extra = r.binaryBytes ? ` (${r.binaryBytes} bytes)` : "";
  console.log(`${mark}${extra}  ${r.label}  — ${r.reason || ""}`);
}
console.log(
  "\nIf only Anchor works → solpg is Anchor-only; Pinocchio/Quasar need another path (WASM or a box).",
);
