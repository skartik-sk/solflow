import { Command } from "commander";
import { resolve } from "path";
import { existsSync } from "fs";
import { spawnSync } from "child_process";
import { detectProjectType } from "../utils/detect";
import { resolveFrameworkTestPlan, type CommandSpec } from "../utils/framework-adapters";

interface TestCommandOptions {
  json?: boolean;
  setup?: boolean;
}

interface CommandRunResult {
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

export const testCommand = new Command("test")
  .description("Run the detected Solana framework test command")
  .argument("[path]", "Path to the project directory", ".")
  .option("--json", "Print machine-readable result JSON")
  .option("--no-setup", "Skip Surfpool/simnet setup command")
  .action((pathArg: string, options: TestCommandOptions) => {
    const projectPath = resolve(pathArg);
    if (!existsSync(projectPath)) {
      console.error(`Path does not exist: ${projectPath}`);
      process.exit(2);
    }

    try {
      const projectType = detectProjectType(projectPath);
      const plan = resolveFrameworkTestPlan(projectType, projectPath);
      const setup = options.setup === false ? null : plan.setupCommand;
      const setupResult = setup ? runCommand(setup, projectPath) : null;
      const testResult =
        setupResult && setupResult.exitCode !== 0
          ? null
          : runCommand(plan.testCommand, projectPath);
      const success = !!testResult && testResult.exitCode === 0;
      const result = {
        success,
        framework: projectType,
        runner: "local-cli",
        runtime: setup ? plan.runtime : "native",
        setupCommand: setup ? formatCommand(setup) : null,
        command: formatCommand(plan.testCommand),
        setup: setupResult,
        test: testResult,
      };

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Runner : ${result.runner}`);
        console.log(`Runtime: ${result.runtime}`);
        console.log(`Command: ${result.command}`);
        if (result.setupCommand) console.log(`Setup  : ${result.setupCommand}`);
        if (setupResult) {
          process.stdout.write(setupResult.stdout);
          process.stderr.write(setupResult.stderr);
        }
        if (testResult) {
          process.stdout.write(testResult.stdout);
          process.stderr.write(testResult.stderr);
        }
      }

      process.exit(success ? 0 : setupResult?.exitCode ?? testResult?.exitCode ?? 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: message }, null, 2));
      } else {
        console.error(`Test failed: ${message}`);
      }
      process.exit(2);
    }
  });

function runCommand(spec: CommandSpec, fallbackCwd: string): CommandRunResult {
  const started = Date.now();
  const cwd = spec.cwd ?? fallbackCwd;
  const result = spawnSync(spec.cmd, spec.args, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    command: formatCommand(spec),
    cwd,
    exitCode: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? (result.error ? result.error.message : ""),
    duration: Date.now() - started,
  };
}

function formatCommand(spec: CommandSpec): string {
  return [spec.cmd, ...spec.args].join(" ");
}
