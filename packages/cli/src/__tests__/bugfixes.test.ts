import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { detectProjectType } from "../utils/detect";
import { isInitialized, readConfig, getConfigDir, getConfigPath, getProjectPath, writeConfig } from "../utils/config";
import { parseProgram, parseFile } from "@solflow/rust-parser";

// ─── Scanner: skip directories ───────────────────────────────────────

describe("scanner: skip directories", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "solstudio-scanner-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("skips node_modules directory", () => {
    // Create .rs in node_modules (should NOT be picked up)
    const nmDir = join(tempDir, "node_modules", "some-lib", "src");
    mkdirSync(nmDir, { recursive: true });
    writeFileSync(join(nmDir, "lib.rs"), `
use anchor_lang::prelude::*;
declare_id!("Skip11111111111111111111111111111111111111111");
#[program]
pub mod skip_mod { pub fn skip(ctx: Context<Skip>) -> Result<()> { Ok(()) } }
#[derive(Accounts)]
pub struct Skip {}
    `);

    // Create src/lib.rs (SHOULD be picked up)
    const srcDir = join(tempDir, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "lib.rs"), `
use anchor_lang::prelude::*;
declare_id!("Real111111111111111111111111111111111111111111");
#[program]
pub mod real_mod { pub fn real(ctx: Context<Real>) -> Result<()> { Ok(()) } }
#[derive(Accounts)]
pub struct Real {}
    `);

    const result = parseProgram(tempDir);
    // Should only find the real_mod instruction, not skip_mod
    const ixNames = result.nodes.filter((n) => n.type === "instruction").map((n) => n.data.name);
    expect(ixNames).toContain("real");
    expect(ixNames).not.toContain("skip");
  });

  it("skips tests directory", () => {
    const testsDir = join(tempDir, "tests");
    mkdirSync(testsDir, { recursive: true });
    writeFileSync(join(testsDir, "test.rs"), `
use anchor_lang::prelude::*;
#[program]
pub mod test_only { pub fn test_fn(ctx: Context<TestCtx>) -> Result<()> { Ok(()) } }
#[derive(Accounts)]
pub struct TestCtx {}
    `);

    const srcDir = join(tempDir, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "lib.rs"), `
use anchor_lang::prelude::*;
declare_id!("Real222222222222222222222222222222222222222222");
#[program]
pub mod main_prog { pub fn init(ctx: Context<Init>) -> Result<()> { Ok(()) } }
#[derive(Accounts)]
pub struct Init {}
    `);

    const result = parseProgram(tempDir);
    const ixNames = result.nodes.filter((n) => n.type === "instruction").map((n) => n.data.name);
    expect(ixNames).toContain("init");
    expect(ixNames).not.toContain("test_fn");
  });

  it("skips target directory", () => {
    const targetDir = join(tempDir, "target", "debug");
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, "build.rs"), "fn main() {}");

    const srcDir = join(tempDir, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "lib.rs"), `
use anchor_lang::prelude::*;
declare_id!("Tgt111111111111111111111111111111111111111111");
#[program]
pub mod tgt_prog { pub fn go(ctx: Context<Go>) -> Result<()> { Ok(()) } }
#[derive(Accounts)]
pub struct Go {}
    `);

    const result = parseProgram(tempDir);
    // Should find the program without errors
    expect(result.stats.instructions).toBe(1);
  });
});

// ─── Scanner: depth limit ────────────────────────────────────────────

describe("scanner: depth limit", () => {
  it("finds files in normal depth (src/lib.rs)", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-depth-"));
    try {
      const srcDir = join(tempDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "lib.rs"), `
use anchor_lang::prelude::*;
declare_id!("Deep111111111111111111111111111111111111111111");
#[program]
pub mod deep_prog { pub fn deep(ctx: Context<Deep>) -> Result<()> { Ok(()) } }
#[derive(Accounts)]
pub struct Deep {}
      `);

      const result = parseProgram(tempDir);
      expect(result.stats.instructions).toBe(1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("finds files in programs/ subdirectory (Anchor workspace)", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-ws-"));
    try {
      const progDir = join(tempDir, "programs", "my-prog", "src");
      mkdirSync(progDir, { recursive: true });
      writeFileSync(join(progDir, "lib.rs"), `
use anchor_lang::prelude::*;
declare_id!("WS11111111111111111111111111111111111111111111");
#[program]
pub mod ws_prog { pub fn ws_init(ctx: Context<WsInit>) -> Result<()> { Ok(()) } }
#[derive(Accounts)]
pub struct WsInit {}
      `);

      const result = parseProgram(tempDir);
      expect(result.stats.instructions).toBe(1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ─── Detect: programs/*/Cargo.toml ───────────────────────────────────

describe("detect: programs/*/Cargo.toml", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "solstudio-detect-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("detects Anchor from programs/*/Cargo.toml", () => {
    const progDir = join(tempDir, "programs", "my-prog");
    mkdirSync(progDir, { recursive: true });
    writeFileSync(join(progDir, "Cargo.toml"), `
[dependencies]
anchor-lang = "0.30"
    `);

    expect(detectProjectType(tempDir)).toBe("anchor");
  });

  it("detects Pinocchio from programs/*/Cargo.toml", () => {
    const progDir = join(tempDir, "programs", "pin-prog");
    mkdirSync(progDir, { recursive: true });
    writeFileSync(join(progDir, "Cargo.toml"), `
[dependencies]
pinocchio = "0.2"
    `);

    expect(detectProjectType(tempDir)).toBe("pinocchio");
  });

  it("detects Anchor from src/lib.rs with #[program]", () => {
    const srcDir = join(tempDir, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "lib.rs"), `
use anchor_lang::prelude::*;
#[program]
pub mod test { pub fn hello() -> Result<()> { Ok(()) } }
    `);

    expect(detectProjectType(tempDir)).toBe("anchor");
  });

  it("returns unknown for empty directory", () => {
    expect(detectProjectType(tempDir)).toBe("unknown");
  });
});

// ─── Parse command: single .rs file ──────────────────────────────────

describe("parse command: single .rs file", () => {
  it("parseFile works on a single .rs file", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-single-"));
    try {
      const rsFile = join(tempDir, "program.rs");
      writeFileSync(rsFile, `
use anchor_lang::prelude::*;
declare_id!("Sng111111111111111111111111111111111111111111");
#[program]
pub mod single_prog {
    pub fn create(ctx: Context<Create>) -> Result<()> { Ok(()) }
    pub fn update(ctx: Context<Update>) -> Result<()> { Ok(()) }
}
#[derive(Accounts)]
pub struct Create<'info> {
    pub authority: Signer<'info>,
}
#[derive(Accounts)]
pub struct Update<'info> {
    pub authority: Signer<'info>,
}
      `);

      const result = parseFile(rsFile);
      expect(result.stats.instructions).toBe(2);
      const ixNames = result.nodes.filter((n) => n.type === "instruction").map((n) => n.data.name);
      expect(ixNames).toContain("create");
      expect(ixNames).toContain("update");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("parseFile on empty .rs returns zero instructions", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-empty-rs-"));
    try {
      const rsFile = join(tempDir, "empty.rs");
      writeFileSync(rsFile, "");
      const result = parseFile(rsFile);
      expect(result.stats.instructions).toBe(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ─── Server: parse creates .solstudio dir ────────────────────────────

describe("server: parse creates .solstudio dir", () => {
  it("POST /api/parse creates .solstudio dir if missing", async () => {
    const { startServer } = await import("../server/index");
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-parse-dir-"));
    const PORT = 16340;

    // Write .rs file but do NOT init (no .solstudio dir)
    const srcDir = join(tempDir, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "lib.rs"), `
use anchor_lang::prelude::*;
declare_id!("Dir111111111111111111111111111111111111111111");
#[program]
pub mod dir_prog { pub fn init(ctx: Context<Init>) -> Result<()> { Ok(()) } }
#[derive(Accounts)]
pub struct Init { pub user: Signer<'info> }
    `);

    // Start server
    const handle = await startServer({ port: PORT, projectPath: tempDir, watch: false });

    try {
      // .solstudio should already exist from auto-parse on startup
      expect(existsSync(getConfigDir(tempDir))).toBe(true);

      // Call /api/parse
      const res = await fetch(`http://localhost:${PORT}/api/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);

      // Now .solstudio dir should exist with project.json
      expect(existsSync(getConfigDir(tempDir))).toBe(true);
      expect(existsSync(getProjectPath(tempDir))).toBe(true);

      const data = JSON.parse(readFileSync(getProjectPath(tempDir), "utf-8"));
      expect(data.stats.instructions).toBe(1);
    } finally {
      await handle.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ─── Server: WebSocket broadcast on parse ────────────────────────────

describe("server: WebSocket receives flow-updated on parse", () => {
  it("receives flow-updated event after POST /api/parse", async () => {
    const { startServer } = await import("../server/index");
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-ws-parse-"));
    const PORT = 16341;
    const WebSocket = (await import("ws")).default;

    const srcDir = join(tempDir, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "lib.rs"), `
use anchor_lang::prelude::*;
declare_id!("WsP1111111111111111111111111111111111111111111");
#[program]
pub mod ws_prog { pub fn go(ctx: Context<Go>) -> Result<()> { Ok(()) } }
#[derive(Accounts)]
pub struct Go { pub user: Signer<'info> }
    `);

    const handle = await startServer({ port: PORT, projectPath: tempDir, watch: false });

    try {
      const result = await new Promise<string>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
        let gotConnected = false;

        ws.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "connected") {
            gotConnected = true;
            // Trigger parse
            fetch(`http://localhost:${PORT}/api/parse`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            });
            return;
          }
          if (msg.type === "flow-updated" && gotConnected) {
            ws.close();
            resolve(JSON.stringify(msg));
          }
        });

        ws.on("error", reject);
        setTimeout(() => { ws.close(); reject(new Error("WS timeout")); }, 5000);
      });

      const msg = JSON.parse(result);
      expect(msg.type).toBe("flow-updated");
      expect(msg.nodes).toBeGreaterThan(0);
    } finally {
      await handle.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ─── Config: framework type ──────────────────────────────────────────

describe("config: framework only anchor|pinocchio", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "solstudio-config-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("accepts anchor framework", () => {
    writeConfig(tempDir, { name: "test", framework: "anchor", mode: "rust", port: 6139 });
    expect(readConfig(tempDir).framework).toBe("anchor");
  });

  it("accepts pinocchio framework", () => {
    writeConfig(tempDir, { name: "test", framework: "pinocchio", mode: "rust", port: 6139 });
    expect(readConfig(tempDir).framework).toBe("pinocchio");
  });

  it("defaults to anchor framework", () => {
    expect(readConfig(tempDir).framework).toBe("anchor");
  });
});

// ─── Init: scaffold produces parseable code ──────────────────────────

describe("init: scaffold produces parseable code", () => {
  it("scaffolded lib.rs can be parsed by rust-parser", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-scaffold-parse-"));
    try {
      const projectName = "test_scaffold";
      const srcDir = join(tempDir, "src");
      mkdirSync(srcDir, { recursive: true });

      // Replicate the scaffold template from init.ts
      const libContent = `use anchor_lang::prelude::*;

declare_id!("PLACEHOLDER1111111111111111111111111111111111");

#[program]
pub mod ${projectName} {
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
`;
      writeFileSync(join(srcDir, "lib.rs"), libContent);

      const result = parseProgram(tempDir);
      expect(result.stats.instructions).toBe(1);
      expect(result.nodes.some((n) => n.type === "program")).toBe(true);
      expect(result.nodes.some((n) => n.type === "instruction")).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
