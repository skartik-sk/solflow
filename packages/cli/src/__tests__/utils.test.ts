import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { detectProjectType } from "../utils/detect";
import { readConfig, writeConfig, isInitialized, getConfigDir, getConfigPath } from "../utils/config";

const FIXTURES_DIR = join(__dirname, "fixtures");

// ─── detect.ts ───────────────────────────────────────────────────────

describe("detectProjectType", () => {
  it("detects Anchor project by Anchor.toml", () => {
    const result = detectProjectType(join(FIXTURES_DIR, "mini-anchor"));
    expect(result).toBe("anchor");
  });

  it("returns unknown for random directory", () => {
    const result = detectProjectType(tmpdir());
    expect(result).toBe("unknown");
  });

  it("returns unknown for non-existent directory", () => {
    const result = detectProjectType("/nonexistent/path/xyz");
    expect(result).toBe("unknown");
  });
});

// ─── config.ts ───────────────────────────────────────────────────────

describe("config utilities", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "solstudio-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("isInitialized returns false when no .solstudio dir", () => {
    expect(isInitialized(tempDir)).toBe(false);
  });

  it("isInitialized returns true after writeConfig", () => {
    writeConfig(tempDir, { name: "test", framework: "anchor", mode: "rust", port: 6139 });
    expect(isInitialized(tempDir)).toBe(true);
  });

  it("writeConfig creates .solstudio directory", () => {
    writeConfig(tempDir, { name: "test", framework: "anchor", mode: "rust", port: 6139 });
    expect(existsSync(getConfigDir(tempDir))).toBe(true);
    expect(existsSync(getConfigPath(tempDir))).toBe(true);
  });

  it("writeConfig then readConfig roundtrips correctly", () => {
    const config = { name: "my-project", framework: "anchor" as const, mode: "rust" as const, port: 8080 };
    writeConfig(tempDir, config);
    const read = readConfig(tempDir);
    expect(read.name).toBe("my-project");
    expect(read.framework).toBe("anchor");
    expect(read.mode).toBe("rust");
    expect(read.port).toBe(8080);
  });

  it("readConfig returns defaults when no config file", () => {
    const config = readConfig(tempDir);
    expect(config.name).toBe("unnamed-project");
    expect(config.port).toBe(6139);
  });

  it("getConfigDir returns correct path", () => {
    expect(getConfigDir("/projects/my-app")).toBe("/projects/my-app/.solstudio");
  });

  it("getConfigPath returns correct path", () => {
    expect(getConfigPath("/projects/my-app")).toBe("/projects/my-app/.solstudio/config.json");
  });

  it("config file is valid JSON", () => {
    writeConfig(tempDir, { name: "test", framework: "pinocchio", mode: "editor", port: 3000 });
    const raw = readFileSync(getConfigPath(tempDir), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.name).toBe("test");
    expect(parsed.framework).toBe("pinocchio");
  });
});
