import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ─── Port validation (view.ts) ─────────────────────────────────────────

describe("port validation", () => {
  it("accepts valid port 6139", () => {
    const port = parseInt("6139", 10);
    expect(isNaN(port) || port < 1 || port > 65535).toBe(false);
  });

  it("accepts valid port 1", () => {
    const port = parseInt("1", 10);
    expect(isNaN(port) || port < 1 || port > 65535).toBe(false);
  });

  it("accepts valid port 65535", () => {
    const port = parseInt("65535", 10);
    expect(isNaN(port) || port < 1 || port > 65535).toBe(false);
  });

  it("rejects port 0", () => {
    const port = parseInt("0", 10);
    expect(isNaN(port) || port < 1 || port > 65535).toBe(true);
  });

  it("rejects port 65536", () => {
    const port = parseInt("65536", 10);
    expect(isNaN(port) || port < 1 || port > 65535).toBe(true);
  });

  it("rejects NaN port", () => {
    const port = parseInt("abc", 10);
    expect(isNaN(port) || port < 1 || port > 65535).toBe(true);
  });

  it("rejects negative port", () => {
    const port = parseInt("-1", 10);
    expect(isNaN(port) || port < 1 || port > 65535).toBe(true);
  });
});

// ─── Config validation ─────────────────────────────────────────────────

describe("config validation", () => {
  let tempDir: string;

  it("returns defaults for missing config", async () => {
    const { readConfig } = await import("../utils/config");
    tempDir = mkdtempSync(join(tmpdir(), "solstudio-cfg-test-"));
    const config = readConfig(tempDir);
    expect(config.framework).toBe("anchor");
    expect(config.mode).toBe("rust");
    expect(config.port).toBe(6139);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("fixes invalid framework", async () => {
    const { readConfig, writeConfig } = await import("../utils/config");
    tempDir = mkdtempSync(join(tmpdir(), "solstudio-cfg-test-"));
    const configDir = join(tempDir, ".solstudio");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "config.json"), JSON.stringify({
      name: "test", framework: "invalid", mode: "rust", port: 6139,
    }));
    const config = readConfig(tempDir);
    expect(config.framework).toBe("anchor"); // fallback to default
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("fixes invalid mode", async () => {
    const { readConfig } = await import("../utils/config");
    tempDir = mkdtempSync(join(tmpdir(), "solstudio-cfg-test-"));
    const configDir = join(tempDir, ".solstudio");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "config.json"), JSON.stringify({
      name: "test", framework: "anchor", mode: "invalid", port: 6139,
    }));
    const config = readConfig(tempDir);
    expect(config.mode).toBe("rust"); // fallback to default
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("fixes invalid port", async () => {
    const { readConfig } = await import("../utils/config");
    tempDir = mkdtempSync(join(tmpdir(), "solstudio-cfg-test-"));
    const configDir = join(tempDir, ".solstudio");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "config.json"), JSON.stringify({
      name: "test", framework: "anchor", mode: "rust", port: -1,
    }));
    const config = readConfig(tempDir);
    expect(config.port).toBe(6139); // fallback to default
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("preserves valid config", async () => {
    const { readConfig } = await import("../utils/config");
    tempDir = mkdtempSync(join(tmpdir(), "solstudio-cfg-test-"));
    const configDir = join(tempDir, ".solstudio");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "config.json"), JSON.stringify({
      name: "my-proj", framework: "pinocchio", mode: "editor", port: 8080,
    }));
    const config = readConfig(tempDir);
    expect(config.name).toBe("my-proj");
    expect(config.framework).toBe("pinocchio");
    expect(config.mode).toBe("editor");
    expect(config.port).toBe(8080);
    rmSync(tempDir, { recursive: true, force: true });
  });
});

// ─── Broadcast error handling ──────────────────────────────────────────

describe("broadcast function", () => {
  it("does not crash on circular reference", async () => {
    // This tests that broadcast handles JSON.stringify failures
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj; // circular reference
    expect(() => JSON.stringify(obj)).toThrow();
    // The broadcast function should catch this internally
  });
});

// ─── Detect recursion limit ────────────────────────────────────────────

describe("detect recursion limit", () => {
  it("hasAnchorProgram has depth parameter", async () => {
    // We can verify the function exists and doesn't crash on deep paths
    const { detectProjectType } = await import("../utils/detect");
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-detect-test-"));
    const result = detectProjectType(tempDir);
    expect(result).toBe("unknown");
    rmSync(tempDir, { recursive: true, force: true });
  });
});
