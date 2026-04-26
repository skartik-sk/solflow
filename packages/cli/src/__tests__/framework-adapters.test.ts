import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { getFrameworkAdapter, resolveCodegenFramework, resolveFrameworkTestPlan } from "../utils/framework-adapters";

describe("framework adapters", () => {
  it("owns framework-specific commands", () => {
    expect(getFrameworkAdapter("anchor").compileCommand).toEqual({ cmd: "anchor", args: ["build"] });
    expect(getFrameworkAdapter("anchor").testCommand).toEqual({ cmd: "anchor", args: ["test", "--skip-local-validator"] });
    expect(getFrameworkAdapter("pinocchio").compileCommand).toEqual({ cmd: "cargo", args: ["build-sbf"] });
    expect(getFrameworkAdapter("quasar").compileCommand).toEqual({ cmd: "cargo", args: ["build-sbf"] });
  });

  it("uses Surfpool as the simnet setup for Anchor tests", () => {
    const root = mkdtempSync(join(tmpdir(), "solstudio-anchor-"));
    const testConfigPath = join(root, "Test.toml");
    writeFileSync(testConfigPath, "[test]\n");
    const plan = resolveFrameworkTestPlan("anchor", root);

    expect(plan.runtime).toBe("surfpool");
    expect(plan.setupCommand?.cmd).toBe("surfpool");
    expect(plan.setupCommand?.args).toEqual(
      expect.arrayContaining(["start", "--ci", "--daemon", "--no-studio", "--no-tui", "--yes"]),
    );
    expect(plan.setupCommand?.args).toEqual(
      expect.arrayContaining(["--legacy-anchor-compatibility", "--anchor-test-config-path", testConfigPath]),
    );
    expect(plan.testCommand).toEqual({ cmd: "anchor", args: ["test", "--skip-local-validator"] });
  });

  it("detects a parent Surfpool manifest for nested Pinocchio projects", () => {
    const root = mkdtempSync(join(tmpdir(), "solstudio-pinocchio-"));
    mkdirSync(join(root, "examples", "hello", "src"), { recursive: true });
    mkdirSync(join(root, ".surfpool"));

    const plan = resolveFrameworkTestPlan("pinocchio", join(root, "examples", "hello"));

    expect(plan.runtime).toBe("surfpool");
    expect(plan.setupCommand?.cmd).toBe("surfpool");
    expect(plan.setupCommand?.cwd).toBe(root);
    expect(plan.testCommand).toEqual({ cmd: "cargo", args: ["test"] });
  });

  it("keeps unknown projects read-only for codegen and deploy", () => {
    const adapter = getFrameworkAdapter("unknown");

    expect(adapter.codegenFramework).toBeNull();
    expect(adapter.keySync).toBe("none");
    expect(adapter.deploy).toBe("unsupported");
    expect(() => resolveCodegenFramework("unknown")).toThrow(/framework is unknown/);
  });

  it("discovers workspace and single-crate watch roots", () => {
    const root = mkdtempSync(join(tmpdir(), "solstudio-adapter-"));
    mkdirSync(join(root, "programs", "vault", "src"), { recursive: true });
    mkdirSync(join(root, "src"), { recursive: true });

    const watchDirs = getFrameworkAdapter("quasar").getWatchDirs(root);

    expect(watchDirs).toContain(join(root, "programs", "vault", "src"));
    expect(watchDirs).toContain(join(root, "src"));
  });
});
