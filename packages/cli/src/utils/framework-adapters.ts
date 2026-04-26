import { existsSync, readdirSync } from "fs";
import { dirname, join } from "path";
import type { ProjectType } from "./detect";

export type CodegenFramework = Exclude<ProjectType, "unknown">;
export type KeySyncStrategy = "anchor" | "declare-id" | "none";
export type DeployStrategy = "anchor" | "solana-program" | "unsupported";

export interface CommandSpec {
  cmd: string;
  args: string[];
  cwd?: string;
}

export interface FrameworkTestPlan {
  setupCommand: CommandSpec | null;
  testCommand: CommandSpec;
  runtime: "surfpool" | "native";
}

export interface FrameworkAdapter {
  type: ProjectType;
  label: string;
  codegenFramework: CodegenFramework | null;
  keySync: KeySyncStrategy;
  deploy: DeployStrategy;
  compileCommand: CommandSpec | null;
  testCommand: CommandSpec | null;
  getWatchDirs(projectPath: string): string[];
}

export function getFrameworkAdapter(type: ProjectType): FrameworkAdapter {
  switch (type) {
    case "anchor":
      return makeAdapter({
        type,
        label: "Anchor",
        codegenFramework: "anchor",
        keySync: "anchor",
        deploy: "anchor",
        compileCommand: { cmd: "anchor", args: ["build"] },
        testCommand: { cmd: "anchor", args: ["test", "--skip-local-validator"] },
        roots: ["programs", "src"],
      });
    case "pinocchio":
      return makeAdapter({
        type,
        label: "Pinocchio",
        codegenFramework: "pinocchio",
        keySync: "declare-id",
        deploy: "solana-program",
        compileCommand: { cmd: "cargo", args: ["build-sbf"] },
        testCommand: { cmd: "cargo", args: ["test"] },
        roots: ["programs", "src"],
      });
    case "quasar":
      return makeAdapter({
        type,
        label: "Quasar",
        codegenFramework: "quasar",
        keySync: "declare-id",
        deploy: "solana-program",
        compileCommand: { cmd: "cargo", args: ["build-sbf"] },
        testCommand: { cmd: "cargo", args: ["test"] },
        roots: ["programs", "src"],
      });
    default:
      return makeAdapter({
        type: "unknown",
        label: "Unknown Rust",
        codegenFramework: null,
        keySync: "none",
        deploy: "unsupported",
        compileCommand: null,
        testCommand: { cmd: "cargo", args: ["test"] },
        roots: ["src"],
      });
  }
}

export function resolveFrameworkTestPlan(type: ProjectType, projectPath: string): FrameworkTestPlan {
  const adapter = getFrameworkAdapter(type);
  if (!adapter.testCommand) {
    throw new Error(`${adapter.label} projects do not have a configured test command.`);
  }

  const surfpoolRoot = findSurfpoolRoot(projectPath);
  const setupCommand = surfpoolRoot
    ? buildSurfpoolSetupCommand(type, surfpoolRoot)
    : type === "anchor"
      ? buildSurfpoolSetupCommand(type, projectPath)
      : null;

  return {
    setupCommand,
    testCommand: adapter.testCommand,
    runtime: setupCommand ? "surfpool" : "native",
  };
}

export function resolveCodegenFramework(type: ProjectType): CodegenFramework {
  const framework = getFrameworkAdapter(type).codegenFramework;
  if (!framework) {
    throw new Error("Project framework is unknown. Run `solstudio init --framework <anchor|pinocchio|quasar>` before generating code.");
  }
  return framework;
}

function makeAdapter(config: Omit<FrameworkAdapter, "getWatchDirs"> & { roots: Array<"programs" | "src"> }): FrameworkAdapter {
  return {
    ...config,
    getWatchDirs: (projectPath: string) => discoverWatchDirs(projectPath, config.roots),
  };
}

function discoverWatchDirs(projectPath: string, roots: Array<"programs" | "src">): string[] {
  const dirs: string[] = [];

  if (roots.includes("programs")) {
    const programsDir = join(projectPath, "programs");
    if (existsSync(programsDir)) {
      try {
        for (const entry of readdirSync(programsDir, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const srcDir = join(programsDir, entry.name, "src");
          if (existsSync(srcDir)) dirs.push(srcDir);
        }
      } catch { /* skip unreadable workspace members */ }
    }
  }

  if (roots.includes("src")) {
    const srcDir = join(projectPath, "src");
    if (existsSync(srcDir)) dirs.push(srcDir);
  }

  return Array.from(new Set(dirs));
}

function buildSurfpoolSetupCommand(type: ProjectType, root: string): CommandSpec {
  const manifest = join(root, "txtx.yml");
  const args = ["start", "--ci", "--daemon", "--no-studio", "--no-tui", "--yes"];
  if (existsSync(manifest)) {
    args.push("--manifest-file-path", manifest);
  }
  if (type === "anchor") {
    args.push("--legacy-anchor-compatibility");
    for (const configPath of findAnchorTestConfigPaths(root)) {
      args.push("--anchor-test-config-path", configPath);
    }
  }
  return { cmd: "surfpool", args, cwd: root };
}

function findAnchorTestConfigPaths(root: string): string[] {
  const candidates = [
    join(root, "Test.toml"),
    join(root, "tests", "Test.toml"),
    join(root, ".anchor", "Test.toml"),
  ];
  return candidates.filter((candidate) => existsSync(candidate));
}

function findSurfpoolRoot(projectPath: string): string | null {
  let current = projectPath;
  for (let depth = 0; depth < 5; depth++) {
    if (existsSync(join(current, "txtx.yml")) || existsSync(join(current, ".surfpool"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}
