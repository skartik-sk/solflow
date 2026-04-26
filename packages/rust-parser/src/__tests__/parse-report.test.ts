import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { parseProgram } from "../index";
import { scanRustProject } from "../scanner";

describe("parse report", () => {
  it("reports framework, scanned files, skipped directories, and confidence", () => {
    const root = mkdtempSync(join(tmpdir(), "solflow-parse-report-"));
    mkdirSync(join(root, "programs", "counter", "src"), { recursive: true });
    mkdirSync(join(root, "target"), { recursive: true });
    writeFileSync(join(root, "Anchor.toml"), "[programs.localnet]\ncounter = \"11111111111111111111111111111111\"\n");
    writeFileSync(join(root, "target", "generated.rs"), "pub fn ignored() {}\n");
    writeFileSync(join(root, "programs", "counter", "Cargo.toml"), "[package]\nname = \"counter\"\nversion = \"0.1.0\"\n[dependencies]\nanchor-lang = \"0.30.0\"\n");
    writeFileSync(join(root, "programs", "counter", "src", "lib.rs"), `
      use anchor_lang::prelude::*;
      declare_id!("11111111111111111111111111111111");

      #[program]
      pub mod counter {
        use super::*;
        pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
          let _ = ctx.remaining_accounts.len();
          Ok(())
        }
      }

      #[derive(Accounts)]
      pub struct Initialize<'info> {
        #[account(init, payer = payer, space = 8 + 8)]
        pub counter: Account<'info, Counter>,
        #[account(mut)]
        pub payer: Signer<'info>,
        pub system_program: Program<'info, System>,
      }

      #[account]
      pub struct Counter {
        pub value: u64,
      }
    `);

    const result = parseProgram(root);

    expect(result.report.framework).toBe("anchor");
    expect(result.report.filesParsed).toBeGreaterThanOrEqual(1);
    expect(result.report.skippedFiles.some((file) => file.path === "target")).toBe(true);
    expect(result.report.unsupportedConstructs).toContain("remaining_accounts usage is not expanded into explicit account nodes");
    expect(result.report.confidence).toBe("medium");
  });

  it("honors source coverage options for tests, examples, benches, and migrations", () => {
    const root = mkdtempSync(join(tmpdir(), "solflow-source-coverage-"));
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, "tests"), { recursive: true });
    mkdirSync(join(root, "examples"), { recursive: true });
    mkdirSync(join(root, "benches"), { recursive: true });
    mkdirSync(join(root, "migrations"), { recursive: true });
    writeFileSync(join(root, "Cargo.toml"), "[package]\nname = \"coverage\"\nversion = \"0.1.0\"\n");
    writeFileSync(join(root, "src", "lib.rs"), "pub fn root() {}\n");
    writeFileSync(join(root, "tests", "integration.rs"), "pub fn test_helper() {}\n");
    writeFileSync(join(root, "examples", "demo.rs"), "pub fn demo() {}\n");
    writeFileSync(join(root, "benches", "bench.rs"), "pub fn bench() {}\n");
    writeFileSync(join(root, "migrations", "old.rs"), "pub fn old() {}\n");

    const defaultScan = scanRustProject(root);
    expect(defaultScan.parsedFiles.map((file) => file.path)).toEqual(["src/lib.rs"]);
    expect(defaultScan.skippedFiles.map((file) => file.path)).toEqual(
      expect.arrayContaining(["tests", "examples", "benches", "migrations"]),
    );

    const fullScan = scanRustProject(root, 10, {
      includeTests: true,
      includeExamples: true,
      includeBenches: true,
      includeMigrations: true,
    });
    expect(fullScan.parsedFiles.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        "src/lib.rs",
        "tests/integration.rs",
        "examples/demo.rs",
        "benches/bench.rs",
        "migrations/old.rs",
      ]),
    );
  });
});
