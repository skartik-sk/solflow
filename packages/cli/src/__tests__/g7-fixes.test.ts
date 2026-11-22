// Regression tests for the CLI fix pass: patch crate mapping, init scaffolds,
// CI workflow, missing tools, SARIF locations, smoke-test labels, self-host secrets.

import { describe, it, expect, afterEach } from "vitest";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { formatAuditReport } from "@solflow/audit";
import { generatePatchForPath } from "../commands/patch";
import { runInit, parseInitFramework, toCrateName } from "../commands/init";
import { WORKFLOW } from "../commands/ci";
import { missingToolMessage } from "../commands/test";
import { labelSmokeTest, runAuditForPath, attachSourceLocations } from "../commands/audit";
import { confirmSelfHostDeploy } from "../commands/cloud";
import { buildSelfHostFiles, generateSelfHostEnv, prepareSelfHostDirectory, validateSelfHostEnv } from "../utils/cloud-self-host";
import { isPathInside, mapGeneratedPath } from "../utils/paths";
import { readConfig, writeConfig } from "../utils/config";
import { detectProjectType } from "../utils/detect";
import { CLI_VERSION } from "../version";

const FIXTURES = join(__dirname, "..", "..", "..", "rust-parser", "src", "__tests__", "framework-fixtures");
const temps: string[] = [];
function temp(prefix = "solstudio-g7-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function patchPaths(patch: string): string[] {
  return [...patch.matchAll(/^diff --git a\/(\S+)/gm)].map((m) => m[1]);
}

describe("patch maps generated paths onto the detected crate root", () => {
  it("anchor workspace with a hyphenated member", () => {
    const paths = patchPaths(generatePatchForPath(join(FIXTURES, "anchor-workspace")));
    expect(paths).toContain("programs/anchor-vault/src/lib.rs");
    expect(paths).toContain("programs/anchor-vault/Cargo.toml");
    expect(paths.some((p) => p.startsWith("programs/anchor_vault/"))).toBe(false);
  });

  it("pinocchio crate at the repo root", () => {
    const paths = patchPaths(generatePatchForPath(join(FIXTURES, "pinocchio-dispatch")));
    expect(paths).toContain("src/lib.rs");
    expect(paths).toContain("Cargo.toml");
    expect(paths.some((p) => p.startsWith("programs/"))).toBe(false);
  });

  it("quasar crate at the repo root", () => {
    const paths = patchPaths(generatePatchForPath(join(FIXTURES, "quasar-events")));
    expect(paths).toContain("src/lib.rs");
    expect(paths.some((p) => p.startsWith("programs/"))).toBe(false);
  });

  it("single .rs file diffs against its crate", () => {
    const patch = generatePatchForPath(join(FIXTURES, "anchor-workspace", "programs", "anchor-vault", "src", "lib.rs"));
    expect(patchPaths(patch)).toContain("src/lib.rs");
    expect(patch).toContain("--- a/src/lib.rs");
  });

  it("leaves paths alone when no crate matches", () => {
    const dir = temp();
    expect(mapGeneratedPath(dir, "programs/x/src/lib.rs")).toBe("programs/x/src/lib.rs");
  });
});

describe("isPathInside (Windows-safe containment)", () => {
  it("uses path.relative instead of string prefixes", () => {
    expect(isPathInside("/a/proj", "/a/proj/src/lib.rs")).toBe(true);
    expect(isPathInside("/a/proj", "/a/proj")).toBe(true);
    expect(isPathInside("/a/proj", "/a/project-evil/x.rs")).toBe(false);
    expect(isPathInside("/a/proj", "/a/x.rs")).toBe(false);
  });
});

describe("init", () => {
  it("rejects an invalid --framework", () => {
    expect(() => parseInitFramework("solidity")).toThrow(/Invalid framework/);
    expect(() => runInit(temp(), { framework: "solidity" })).toThrow(/Invalid framework/);
    expect(parseInitFramework("Pinocchio")).toBe("pinocchio");
  });

  it("makes valid crate names", () => {
    expect(toCrateName("My-Program")).toBe("my_program");
    expect(toCrateName("123abc")).toBe("p_123abc");
    expect(toCrateName("test")).toBe("test_program");
  });

  for (const framework of ["anchor", "pinocchio", "quasar"] as const) {
    it(`scaffolds a ${framework} program with a Cargo.toml and a valid declare_id`, () => {
      const dir = join(temp(), "demo-prog");
      const result = runInit(dir, { framework, scaffold: true });
      expect(result.status).toBe("initialized");
      expect(result.framework).toBe(framework);
      expect(existsSync(join(dir, "Cargo.toml"))).toBe(true);
      expect(existsSync(join(dir, "programs", "demo_prog", "Cargo.toml"))).toBe(true);
      const lib = readFileSync(join(dir, "programs", "demo_prog", "src", "lib.rs"), "utf-8");
      const id = lib.match(/declare_id!\("([^"]+)"\)/)?.[1];
      expect(id).toBe(result.programId);
      expect(id).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
      const keypair = JSON.parse(readFileSync(join(dir, "target", "deploy", "demo_prog-keypair.json"), "utf-8"));
      expect(keypair).toHaveLength(64);
      expect(detectProjectType(dir)).toBe(framework);
      if (framework === "anchor") {
        expect(readFileSync(join(dir, "Anchor.toml"), "utf-8")).toContain(`demo_prog = "${id}"`);
      }
    });
  }

  it("does not scaffold over existing source", () => {
    const dir = temp();
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "lib.rs"), "// mine\n");
    const result = runInit(dir, { framework: "anchor", scaffold: true });
    expect(result.scaffolded).toEqual([]);
    expect(readFileSync(join(dir, "src", "lib.rs"), "utf-8")).toBe("// mine\n");
  });

  it("--framework updates an existing config", () => {
    const dir = temp();
    writeConfig(dir, { name: "x", framework: "unknown", mode: "editor", port: 6139 });
    const result = runInit(dir, { framework: "quasar" });
    expect(result.status).toBe("updated");
    expect(readConfig(dir).framework).toBe("quasar");
    expect(readConfig(dir).mode).toBe("rust");
    expect(runInit(dir, {}).status).toBe("unchanged");
  });
});

describe("ci workflow", () => {
  it("has least-privilege permissions for SARIF upload", () => {
    expect(WORKFLOW).toMatch(/permissions:\n {2}contents: read\n {2}security-events: write/);
  });

  it("installs the Solana and Anchor toolchains and runs a validator", () => {
    expect(WORKFLOW).toContain("solana-install.solana.workers.dev");
    expect(WORKFLOW).toContain("$HOME/.avm/bin");
    expect(WORKFLOW).toContain("solana-test-validator");
    expect(WORKFLOW).toContain("solana-keygen new");
  });

  it("pins the CLI version", () => {
    expect(WORKFLOW).toContain(`@solstudio/cli@${CLI_VERSION}`);
    expect(WORKFLOW).not.toContain("@latest");
  });
});

describe("missing tools", () => {
  it("gives an install hint", () => {
    expect(missingToolMessage("anchor")).toMatch(/`anchor` was not found on your PATH.*anchor-lang/);
    expect(missingToolMessage("cargo")).toMatch(/rustup/);
    expect(missingToolMessage("whatever")).toMatch(/not found on your PATH/);
  });
});

describe("SARIF locations", () => {
  it("uses relative file URIs with line regions", () => {
    const result = runAuditForPath(join(__dirname, "fixtures", "mini-anchor"));
    expect(result.report.findings.length).toBeGreaterThan(0);
    const sarif = JSON.parse(formatAuditReport(result.report, "sarif", { projectPath: "." }));
    for (const res of sarif.runs[0].results) {
      const loc = res.locations[0].physicalLocation;
      expect(loc.artifactLocation.uri.startsWith("/")).toBe(false);
      expect(loc.artifactLocation.uri).not.toMatch(/^[A-Za-z]:/);
      expect(loc.artifactLocation.uri).toMatch(/\.rs$/);
      expect(loc.region.startLine).toBeGreaterThan(0);
    }
  });

  it("is relative to the project root when the project is outside the cwd", () => {
    const dir = temp();
    cpSync(join(FIXTURES, "anchor-workspace"), dir, { recursive: true });
    const report = {
      findings: [{ ruleId: "X", severity: "low", title: "t", description: "d", recommendation: "r", location: { instructionName: "deposit" } }],
    } as never;
    attachSourceLocations(report, dir, false, "/definitely/not/a/parent");
    const loc = (report as { findings: Array<{ location: { file: string; line: number } }> }).findings[0].location;
    expect(loc.file).toBe("programs/anchor-vault/src/lib.rs");
    const lines = readFileSync(join(dir, loc.file), "utf-8").split("\n");
    expect(lines[loc.line - 1]).toMatch(/fn deposit/);
  });
});

describe("generated audit tests are labelled smoke tests", () => {
  it("prefixes code files and README", () => {
    expect(labelSmokeTest("tests/a.ts", "x")).toMatch(/^\/\/ SMOKE TESTS/);
    expect(labelSmokeTest("tests/a.rs", "x")).toMatch(/^\/\/ SMOKE TESTS/);
    expect(labelSmokeTest("tests/README.md", "# Title\nbody")).toContain("> SMOKE TESTS");
    expect(labelSmokeTest("tests/cases.json", "{}")).toBe("{}");
  });
});

describe("self-host secrets", () => {
  it("generates a random Postgres password used by both compose and DATABASE_URL", () => {
    const a = generateSelfHostEnv();
    const b = generateSelfHostEnv();
    const pw = a.match(/^POSTGRES_PASSWORD=(.+)$/m)?.[1];
    expect(pw).toBeTruthy();
    expect(pw).not.toBe("solstudio");
    expect(pw).not.toBe(b.match(/^POSTGRES_PASSWORD=(.+)$/m)?.[1]);
    expect(a).toContain(`DATABASE_URL=postgresql://solstudio:${pw}@postgres:5432/solstudio_cloud`);
    const compose = buildSelfHostFiles()["docker-compose.yml"];
    expect(compose).toContain("POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?");
    expect(compose).not.toContain("POSTGRES_PASSWORD: solstudio");
    expect(validateSelfHostEnv(a).ok).toBe(true);
  });

  it("writes .env with mode 0600", () => {
    if (process.platform === "win32") return;
    const dir = temp();
    const prepared = prepareSelfHostDirectory({ directory: dir, autoEnv: true });
    expect(statSync(prepared.envPath).mode & 0o777).toBe(0o600);
  });

  it("deploy needs --yes or an interactive yes", async () => {
    expect(await confirmSelfHostDeploy("/x", true)).toBe(true);
    expect(await confirmSelfHostDeploy("/x", undefined, { isTTY: false, ask: async () => "y" })).toBe(false);
    expect(await confirmSelfHostDeploy("/x", undefined, { isTTY: true, ask: async () => "y" })).toBe(true);
    expect(await confirmSelfHostDeploy("/x", undefined, { isTTY: true, ask: async () => "" })).toBe(false);
  });
});
