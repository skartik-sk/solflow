import { describe, expect, it } from "vitest";
import { buildFrameworkTestCommand } from "../server/test-runner/local-test-runner";

describe("local test runner", () => {
  it("uses Cargo manifest tests for generated Anchor projects", () => {
    expect(buildFrameworkTestCommand("ANCHOR", "counter")).toEqual({
      cmd: "cargo",
      args: ["test", "--manifest-path", "programs/counter/Cargo.toml", "--lib"],
      cwd: ".",
      runtime: "cargo-smoke",
      setupCommand: undefined,
    });
  });

  it("uses the same generated-project smoke test path for Pinocchio and Quasar", () => {
    expect(buildFrameworkTestCommand("PINOCCHIO", "vault").args).toContain(
      "programs/vault/Cargo.toml",
    );
    expect(buildFrameworkTestCommand("QUASAR", "vault").args).toContain(
      "programs/vault/Cargo.toml",
    );
  });

  it("can prepare Surfpool Simnet setup for transaction-level generated tests", () => {
    const command = buildFrameworkTestCommand("ANCHOR", "counter", {
      runtime: "surfpool-simnet",
    });

    expect(command.runtime).toBe("surfpool-simnet");
    expect(command.setupCommand?.cmd).toBe("surfpool");
    expect(command.setupCommand?.args).toEqual(
      expect.arrayContaining([
        "start",
        "--ci",
        "--daemon",
        "--no-studio",
        "--no-tui",
        "--yes",
        "--offline",
        "--legacy-anchor-compatibility",
      ]),
    );
  });
});
