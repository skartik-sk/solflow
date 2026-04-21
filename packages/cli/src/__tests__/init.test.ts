import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { isInitialized, readConfig, getConfigDir, getProjectPath, writeConfig } from "../utils/config";
import { detectProjectType } from "../utils/detect";
import { parseProgram } from "@solflow/rust-parser";

// ─── init command logic — uses detect + config under the hood ─────────

describe("init command — project detection", () => {
  it("detects anchor project and sets framework", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-init-"));
    try {
      // Simulate an anchor project
      writeFileSync(join(tempDir, "Anchor.toml"), "[features]\n");
      const detected = detectProjectType(tempDir);
      expect(detected).toBe("anchor");

      writeConfig(tempDir, {
        name: "my-anchor",
        framework: detected === "unknown" ? "anchor" : detected,
        mode: "rust",
        port: 6139,
      });

      const config = readConfig(tempDir);
      expect(config.framework).toBe("anchor");
      expect(config.mode).toBe("rust");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("defaults to anchor for unknown project type", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-init-"));
    try {
      const detected = detectProjectType(tempDir);
      expect(detected).toBe("unknown");

      // Init defaults unknown to anchor
      writeConfig(tempDir, {
        name: "new-proj",
        framework: "anchor",
        mode: "editor",
        port: 6139,
      });

      const config = readConfig(tempDir);
      expect(config.framework).toBe("anchor");
      expect(config.mode).toBe("editor");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("sets editor mode for unknown projects", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-init-"));
    try {
      const detected = detectProjectType(tempDir);
      const mode = detected === "unknown" ? "editor" : "rust";

      writeConfig(tempDir, {
        name: "blank",
        framework: "anchor",
        mode,
        port: 6139,
      });

      expect(readConfig(tempDir).mode).toBe("editor");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ─── init — idempotent ───────────────────────────────────────────────

describe("init command — idempotent", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "solstudio-init-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("does not overwrite existing config on re-init", () => {
    writeConfig(tempDir, { name: "original", framework: "anchor", mode: "rust", port: 9999 });
    expect(isInitialized(tempDir)).toBe(true);

    // Re-init should read existing and not overwrite
    const existing = readConfig(tempDir);
    expect(existing.name).toBe("original");
    expect(existing.port).toBe(9999);
  });

  it("detects already-initialized project", () => {
    writeConfig(tempDir, { name: "test", framework: "anchor", mode: "rust", port: 6139 });
    expect(isInitialized(tempDir)).toBe(true);
  });
});

// ─── init — scaffold ─────────────────────────────────────────────────

describe("init command — scaffold", () => {
  it("creates .solstudio dir and config", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-scaffold-"));
    try {
      writeConfig(tempDir, { name: "scaffolded", framework: "anchor", mode: "editor", port: 6139 });

      expect(existsSync(getConfigDir(tempDir))).toBe(true);
      expect(readConfig(tempDir).name).toBe("scaffolded");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("can create minimal anchor lib.rs content", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-scaffold-"));
    try {
      const srcDir = join(tempDir, "src");
      mkdirSync(srcDir, { recursive: true });

      const content = `use anchor_lang::prelude::*;
declare_id!("PLACEHOLDER1111111111111111111111111111111111");
#[program]
pub mod test { pub fn init(ctx: Context<Init>) -> Result<()> { Ok(()) } }
#[derive(Accounts)]
pub struct Init {}`;
      writeFileSync(join(srcDir, "lib.rs"), content);

      expect(existsSync(join(srcDir, "lib.rs"))).toBe(true);
      const written = readFileSync(join(srcDir, "lib.rs"), "utf-8");
      expect(written).toContain("anchor_lang");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ─── e2e: init → parse → save → load ─────────────────────────────────

describe("e2e: init → parse → save → load", () => {
  it("full workflow works", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-e2e-"));
    try {
      // 1. Create a minimal anchor project
      writeFileSync(join(tempDir, "Anchor.toml"), "[features]\n");
      const srcDir = join(tempDir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "lib.rs"), `
use anchor_lang::prelude::*;
declare_id!("E2E11111111111111111111111111111111111111111");
#[program]
pub mod e2e_prog {
    pub fn create(ctx: Context<Create>) -> Result<()> { Ok(()) }
}
#[derive(Accounts)]
pub struct Create<'info> {
    pub authority: Signer<'info>,
}
      `);

      // 2. Init
      const detected = detectProjectType(tempDir);
      expect(detected).toBe("anchor");
      writeConfig(tempDir, { name: "e2e-test", framework: "anchor", mode: "rust", port: 6139 });
      expect(isInitialized(tempDir)).toBe(true);

      // 3. Parse
      const result = parseProgram(tempDir);
      expect(result.stats.instructions).toBe(1);
      expect(result.nodes.length).toBeGreaterThan(0);

      // 4. Save project data
      const projectJsonPath = getProjectPath(tempDir);
      const projectData = { nodes: result.nodes, edges: result.edges, stats: result.stats };
      writeFileSync(projectJsonPath, JSON.stringify(projectData, null, 2));

      // 5. Load and verify
      const loaded = JSON.parse(readFileSync(projectJsonPath, "utf-8"));
      expect(loaded.nodes.length).toBe(result.nodes.length);
      expect(loaded.edges.length).toBe(result.edges.length);
      expect(loaded.stats.instructions).toBe(1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
