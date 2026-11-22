import { Command } from "commander";
import { resolve } from "path";
import { existsSync } from "fs";
import { spawnSync } from "child_process";
import { detectProjectType } from "../utils/detect";
import { resolveFrameworkTestPlan, type CommandSpec } from "../utils/framework-adapters";
import { missingToolMessage } from "../utils/tools";

export { missingToolMessage };

interface TestCommandOptions {
  json?: boolean;
  setup?: boolean;
}

interface CommandRunResult {
  missingTool?: string;
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
      // Stream output live unless the caller wants one JSON document at the end.
      const live = !options.json;
      if (live) {
        console.log(`Runtime: ${setup ? plan.runtime : "native"}`);
        console.log(`Command: ${formatCommand(plan.testCommand)}`);
        if (setup) console.log(`Setup  : ${formatCommand(setup)}`);
      }
      const setupResult = setup ? runCommand(setup, projectPath, live) : null;
      const testResult =
        setupResult && setupResult.exitCode !== 0
          ? null
          : runCommand(plan.testCommand, projectPath, live);
      const success = !!testResult && testResult.exitCode === 0;
      const missing = [setupResult, testResult].find((r) => r?.missingTool)?.missingTool;
      if (missing && live) console.error(`\n${missingToolMessage(missing)}`);
      const result = {
        ...(missing ? { error: missingToolMessage(missing) } : {}),
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

function runCommand(spec: CommandSpec, fallbackCwd: string, live = false): CommandRunResult {
  const started = Date.now();
  const cwd = spec.cwd ?? fallbackCwd;
  const result = spawnSync(spec.cmd, spec.args, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
    stdio: live ? "inherit" : "pipe",
  });
  const notFound = (result.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
  return {
    ...(notFound ? { missingTool: spec.cmd } : {}),
    command: formatCommand(spec),
    cwd,
    exitCode: notFound ? 127 : typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout ?? "",
    stderr: notFound ? missingToolMessage(spec.cmd) : result.stderr ?? (result.error ? result.error.message : ""),
    duration: Date.now() - started,
  };
}

function formatCommand(spec: CommandSpec): string {
  return [spec.cmd, ...spec.args].join(" ");
}
