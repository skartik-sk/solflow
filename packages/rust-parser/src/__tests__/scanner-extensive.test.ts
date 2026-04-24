import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { findRustFiles, readRustProject, parseCargoVersion, detectProjectType } from "../scanner";

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "solstudio-scanner-test-"));
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("findRustFiles", () => {
  it("finds .rs files in directory", () => {
    mkdirSync(join(tempDir, "scanner-find"), { recursive: true });
    writeFileSync(join(tempDir, "scanner-find", "lib.rs"), "fn main() {}");
    writeFileSync(join(tempDir, "scanner-find", "utils.rs"), "fn util() {}");
    writeFileSync(join(tempDir, "scanner-find", "readme.md"), "# Hello");

    const files = findRustFiles(join(tempDir, "scanner-find"));
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.endsWith(".rs"))).toBe(true);
  });

  it("skips target and node_modules directories", () => {
    const dir = join(tempDir, "scanner-skip");
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "target", "debug"), { recursive: true });
    mkdirSync(join(dir, "node_modules", "pkg"), { recursive: true });

    writeFileSync(join(dir, "src", "lib.rs"), "fn main() {}");
    writeFileSync(join(dir, "target", "debug", "build.rs"), "fn build() {}");
    writeFileSync(join(dir, "node_modules", "pkg", "index.rs"), "fn index() {}");

    const files = findRustFiles(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("src");
  });
});

describe("readRustProject", () => {
  it("reads and concatenates all .rs files", () => {
    const dir = join(tempDir, "scanner-read");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "a.rs"), "fn a() {}");
    writeFileSync(join(dir, "b.rs"), "fn b() {}");

    const content = readRustProject(dir);
    expect(content).toContain("fn a()");
    expect(content).toContain("fn b()");
  });
});

describe("parseCargoVersion", () => {
  it("parses version from root Cargo.toml", () => {
    const dir = join(tempDir, "scanner-version");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "Cargo.toml"), `
[package]
name = "my-program"
version = "1.2.3"
edition = "2021"
`);
    const version = parseCargoVersion(dir);
    expect(version).toBe("1.2.3");
  });

  it("parses version from programs/*/Cargo.toml", () => {
    const dir = join(tempDir, "scanner-version-ws");
    const progDir = join(dir, "programs", "my-prog");
    mkdirSync(progDir, { recursive: true });
    writeFileSync(join(progDir, "Cargo.toml"), `
[package]
name = "my-prog"
version = "0.3.0"
`);
    const version = parseCargoVersion(dir);
    expect(version).toBe("0.3.0");
  });

  it("returns null when no Cargo.toml exists", () => {
    const dir = join(tempDir, "scanner-no-cargo");
    mkdirSync(dir, { recursive: true });
    const version = parseCargoVersion(dir);
    expect(version).toBeNull();
  });
});

describe("detectProjectType", () => {
  it("detects Anchor via Anchor.toml", () => {
    const dir = join(tempDir, "scanner-anchor");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "Anchor.toml"), "[features]\nseeds = false\n");
    expect(detectProjectType(dir)).toBe("anchor");
  });

  it("detects Anchor via anchor-lang dependency", () => {
    const dir = join(tempDir, "scanner-anchor-dep");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "Cargo.toml"), `
[dependencies]
anchor-lang = "0.30"
`);
    expect(detectProjectType(dir)).toBe("anchor");
  });

  it("detects Pinocchio via dependency", () => {
    const dir = join(tempDir, "scanner-pinocchio");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "Cargo.toml"), `
[dependencies]
pinocchio = "0.2"
`);
    expect(detectProjectType(dir)).toBe("pinocchio");
  });

  it("detects Anchor via #[program] in lib.rs", () => {
    const dir = join(tempDir, "scanner-program");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "lib.rs"), `
use anchor_lang::prelude::*;
#[program]
pub mod test {}
`);
    expect(detectProjectType(dir)).toBe("anchor");
  });

  it("returns unknown for empty directory", () => {
    const dir = join(tempDir, "scanner-unknown");
    mkdirSync(dir, { recursive: true });
    expect(detectProjectType(dir)).toBe("unknown");
  });
});
