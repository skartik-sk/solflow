import { spawn } from "child_process";
import { randomBytes } from "crypto";
import { mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { isAbsolute, join, resolve } from "path";

export type TestFramework = "ANCHOR" | "PINOCCHIO" | "QUASAR";
export type GeneratedTestRuntime = "cargo-smoke" | "surfpool-simnet";

export interface GeneratedTestFile {
  path: string;
  content: string;
}

export interface FrameworkTestCommand {
  cmd: string;
  args: string[];
  cwd: string;
  runtime: GeneratedTestRuntime;
  setupCommand?: FrameworkTestCommandStep;
}

export interface FrameworkTestCommandStep {
  cmd: string;
  args: string[];
  cwd: string;
}

export interface LocalTestRunResult {
  success: boolean;
  status: "PASSED" | "FAILED" | "ERROR";
  command: string;
  setupCommand?: string;
  runtime: GeneratedTestRuntime;
  logs: string[];
  errors: string[];
  warnings: string[];
  duration: number;
  workDir: string;
}

export function buildFrameworkTestCommand(
  framework: TestFramework,
  programName: string,
  options: { runtime?: GeneratedTestRuntime } = {},
): FrameworkTestCommand {
  const runtime = options.runtime ?? "cargo-smoke";
  const manifestPath = `programs/${programName}/Cargo.toml`;

  return {
    cmd: "cargo",
    args: ["test", "--manifest-path", manifestPath, "--lib"],
    cwd: ".",
    runtime,
    setupCommand: runtime === "surfpool-simnet" ? buildSurfpoolSetupCommand(framework) : undefined,
  };
}

export async function runGeneratedProjectTests(input: {
  framework: TestFramework;
  programName: string;
  files: GeneratedTestFile[];
  runtime?: GeneratedTestRuntime;
  timeoutMs?: number;
  keepWorkDir?: boolean;
}): Promise<LocalTestRunResult> {
  const startedAt = Date.now();
  const workDir = await createTempProject(input.files);
  const command = buildFrameworkTestCommand(input.framework, input.programName, {
    runtime: input.runtime ?? getDefaultGeneratedTestRuntime(),
  });
  const commandText = [command.cmd, ...command.args].join(" ");
  const setupCommandText = command.setupCommand
    ? [command.setupCommand.cmd, ...command.setupCommand.args].join(" ")
    : undefined;

  try {
    const setupLogs: string[] = [];
    if (command.setupCommand) {
      const setupResult = await runCommand(
        command.setupCommand.cmd,
        command.setupCommand.args,
        resolve(workDir, command.setupCommand.cwd),
        Math.min(input.timeoutMs ?? 5 * 60_000, 60_000),
      );
      setupLogs.push(...setupResult.logs);
      const setupMissingTool = setupResult.errorCode === "ENOENT";
      const setupFailed = setupResult.code !== 0 || setupMissingTool || setupResult.timedOut;
      if (setupFailed && !isBenignSurfpoolStartupFailure(setupResult.logs)) {
        const duration = Date.now() - startedAt;
        const parsed = parseLogs(setupResult.logs);
        const errors = setupMissingTool
          ? [`Required test setup command not found: ${command.setupCommand.cmd}`]
          : setupResult.timedOut
            ? ["Surfpool setup command timed out after 60000ms"]
            : parsed.errors.length > 0
              ? parsed.errors
              : [`Surfpool setup command exited with code ${setupResult.code}`];

        return {
          success: false,
          status: "ERROR",
          command: commandText,
          setupCommand: setupCommandText,
          runtime: command.runtime,
          logs: setupResult.logs,
          errors,
          warnings: parsed.warnings,
          duration,
          workDir,
        };
      }
    }

    const result = await runCommand(
      command.cmd,
      command.args,
      resolve(workDir, command.cwd),
      input.timeoutMs ?? 5 * 60_000,
    );
    const duration = Date.now() - startedAt;
    const logs = [...setupLogs, ...result.logs];
    const parsed = parseLogs(logs);
    const missingTool = result.errorCode === "ENOENT";
    const timedOut = result.timedOut;
    const success = result.code === 0 && !missingTool && !timedOut;
    const status: LocalTestRunResult["status"] = success
      ? "PASSED"
      : missingTool || timedOut
        ? "ERROR"
        : "FAILED";
    const errors = missingTool
      ? [`Required test command not found: ${command.cmd}`]
      : timedOut
        ? [`Test command timed out after ${input.timeoutMs ?? 5 * 60_000}ms`]
        : parsed.errors.length > 0
          ? parsed.errors
          : success
            ? []
            : [`Test command exited with code ${result.code}`];

    return {
      success,
      status,
      command: commandText,
      setupCommand: setupCommandText,
      runtime: command.runtime,
      logs,
      errors,
      warnings: parsed.warnings,
      duration,
      workDir,
    };
  } finally {
    if (!input.keepWorkDir && process.env.SOLFLOW_KEEP_TEST_WORKDIR !== "1") {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function createTempProject(files: GeneratedTestFile[]): Promise<string> {
  const dir = join(tmpdir(), `solflow-test-${randomBytes(8).toString("hex")}`);
  await mkdir(dir, { recursive: true });

  for (const file of files) {
    if (isAbsolute(file.path) || file.path.includes("..")) {
      throw new Error(`Unsafe generated file path: ${file.path}`);
    }
    const fullPath = resolve(dir, file.path);
    if (!fullPath.startsWith(dir)) {
      throw new Error(`Generated file path escapes test workspace: ${file.path}`);
    }
    const fileDir = fullPath.slice(0, fullPath.lastIndexOf("/"));
    await mkdir(fileDir, { recursive: true });
    await writeFile(fullPath, file.content, "utf8");
  }

  return dir;
}

function getDefaultGeneratedTestRuntime(): GeneratedTestRuntime {
  return process.env.SOLFLOW_TEST_RUNTIME === "surfpool-simnet"
    ? "surfpool-simnet"
    : "cargo-smoke";
}

function buildSurfpoolSetupCommand(framework: TestFramework): FrameworkTestCommandStep {
  const args = [
    "start",
    "--ci",
    "--daemon",
    "--no-studio",
    "--no-tui",
    "--yes",
    "--offline",
  ];
  if (framework === "ANCHOR") {
    args.push("--legacy-anchor-compatibility");
  }
  return { cmd: "surfpool", args, cwd: "." };
}

function isBenignSurfpoolStartupFailure(logs: string[]): boolean {
  const joined = logs.join("\n");
  return /already running|address already in use|AddrInUse|os error 48|os error 98/i.test(joined);
}

function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{
  code: number;
  logs: string[];
  timedOut: boolean;
  errorCode?: string;
}> {
  return new Promise((resolveResult) => {
    const logs: string[] = [];
    const proc = spawn(cmd, args, { cwd, shell: false });
    let settled = false;
    let timedOut = false;

    const append = (data: Buffer) => {
      for (const line of data.toString().split("\n")) {
        if (line.trim()) logs.push(line);
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeoutMs);

    proc.stdout.on("data", append);
    proc.stderr.on("data", append);
    proc.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      logs.push(error.message);
      resolveResult({
        code: 1,
        logs,
        timedOut: false,
        errorCode: error.code,
      });
    });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult({ code: code ?? 1, logs, timedOut });
    });
  });
}

function parseLogs(logs: string[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const line of logs) {
    const trimmed = line.trim();
    if (/^(error|error\[E\d+\]):/.test(trimmed)) {
      errors.push(trimmed);
    } else if (/^warning(\[.*\])?:/.test(trimmed)) {
      warnings.push(trimmed);
    }
  }

  return { errors, warnings };
}
