import { Command } from "commander";
import { existsSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";
import { detectProjectType } from "../utils/detect";

interface DoctorOptions {
  json?: boolean;
}

interface DoctorCheck {
  name: string;
  command: string;
  ok: boolean;
  version?: string;
  fix: string;
  requiredFor: string;
}

interface FrameworkCoverageRow {
  framework: "Anchor" | "Pinocchio" | "Quasar";
  parser: string;
  codegen: string;
  compile: string;
  test: string;
  audit: string;
  templates: string;
}

const CHECKS: Array<Omit<DoctorCheck, "ok" | "version"> & { args: string[] }> = [
  {
    name: "Node.js",
    command: "node",
    args: ["--version"],
    requiredFor: "CLI runtime compatibility",
    fix: "Install Node.js 20 or newer.",
  },
  {
    name: "Bun",
    command: "bun",
    args: ["--version"],
    requiredFor: "SolStudio monorepo development",
    fix: "Install Bun from https://bun.sh/docs/installation.",
  },
  {
    name: "Cargo",
    command: "cargo",
    args: ["--version"],
    requiredFor: "Pinocchio and Quasar tests",
    fix: "Install Rust from https://rustup.rs.",
  },
  {
    name: "Rust",
    command: "rustc",
    args: ["--version"],
    requiredFor: "Rust program compilation",
    fix: "Install Rust from https://rustup.rs.",
  },
  {
    name: "Solana CLI",
    command: "solana",
    args: ["--version"],
    requiredFor: "Deploy, localnet, and Solana toolchain checks",
    fix: "Install Solana CLI from https://docs.anza.xyz/cli/install.",
  },
  {
    name: "Anchor CLI",
    command: "anchor",
    args: ["--version"],
    requiredFor: "Anchor build/test/deploy",
    fix: "Install Anchor with AVM, then run `avm install latest && avm use latest`.",
  },
  {
    name: "cargo-build-sbf",
    command: "cargo-build-sbf",
    args: ["--version"],
    requiredFor: "Pinocchio and Quasar SBF builds",
    fix: "Install/update the Solana toolchain so cargo-build-sbf is on PATH.",
  },
  {
    name: "Surfpool",
    command: "surfpool",
    args: ["--version"],
    requiredFor: "Simnet tests",
    fix: "Install Surfpool from https://www.surfpool.run.",
  },
  {
    name: "Docker",
    command: "docker",
    args: ["--version"],
    requiredFor: "Compiler container and isolated runners",
    fix: "Install Docker and ensure the daemon is running.",
  },
];

const FRAMEWORK_COVERAGE: FrameworkCoverageRow[] = [
  {
    framework: "Anchor",
    parser: "full",
    codegen: "full",
    compile: "anchor build",
    test: "anchor test",
    audit: "full",
    templates: "full",
  },
  {
    framework: "Pinocchio",
    parser: "full",
    codegen: "full",
    compile: "cargo-build-sbf",
    test: "cargo test",
    audit: "full",
    templates: "full",
  },
  {
    framework: "Quasar",
    parser: "beta",
    codegen: "beta",
    compile: "cargo-build-sbf",
    test: "cargo test",
    audit: "full",
    templates: "beta",
  },
];

export const doctorCommand = new Command("doctor")
  .description("Check local SolStudio/Solana development tooling")
  .argument("[path]", "Optional project directory to inspect", ".")
  .option("--json", "Print machine-readable result JSON")
  .action((pathArg: string, options: DoctorOptions) => {
    const projectPath = resolve(pathArg);
    const checks = CHECKS.map(runCheck);
    const framework = existsSync(projectPath)
      ? detectProjectType(projectPath)
      : "unknown";
    const ok = checks.every((check) => check.ok);

    if (options.json) {
      console.log(
        JSON.stringify(
          { ok, projectPath, framework, checks, frameworkCoverage: FRAMEWORK_COVERAGE },
          null,
          2,
        ),
      );
    } else {
      console.log("SolStudio Doctor");
      console.log(`Project : ${existsSync(projectPath) ? projectPath : "not found"}`);
      console.log(`Framework: ${framework}`);
      console.log("");
      for (const check of checks) {
        const icon = check.ok ? "OK " : "MISS";
        console.log(`${icon} ${check.name.padEnd(16)} ${check.version ?? check.fix}`);
        if (!check.ok) {
          console.log(`     needed for: ${check.requiredFor}`);
        }
      }
      console.log("");
      console.log("Framework Coverage");
      console.log("Framework  Parser  Codegen  Compile          Test         Audit  Templates");
      for (const row of FRAMEWORK_COVERAGE) {
        console.log(
          `${row.framework.padEnd(10)} ${row.parser.padEnd(7)} ${row.codegen.padEnd(8)} ${row.compile.padEnd(16)} ${row.test.padEnd(12)} ${row.audit.padEnd(6)} ${row.templates}`,
        );
      }
    }

    process.exit(ok ? 0 : 1);
  });

function runCheck(
  check: Omit<DoctorCheck, "ok" | "version"> & { args: string[] },
): DoctorCheck {
  const result = spawnSync(check.command, check.args, {
    encoding: "utf-8",
    maxBuffer: 1024 * 1024,
  });
  const ok = result.status === 0;
  const version = ok
    ? (result.stdout || result.stderr).trim().split("\n")[0]
    : undefined;
  return {
    name: check.name,
    command: [check.command, ...check.args].join(" "),
    ok,
    version,
    fix: check.fix,
    requiredFor: check.requiredFor,
  };
}
