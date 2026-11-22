// Init command — set up a project for use with SolStudio.

import { Command } from "commander";
import { resolve, basename, join, dirname } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";
import { generateCode } from "@solflow/codegen";
import type { ProgramIR } from "@solflow/ir";
import { detectProjectType } from "../utils/detect";
import { writeConfig, isInitialized, readConfig, getConfigDir } from "../utils/config";
import { generateProgramKeypair } from "../utils/keypair";
import { mapGeneratedPath } from "../utils/paths";

export const INIT_FRAMEWORKS = ["anchor", "pinocchio", "quasar"] as const;
export type InitFramework = (typeof INIT_FRAMEWORKS)[number];

export interface InitOptions {
  framework?: string;
  scaffold?: boolean;
}

export interface InitResult {
  path: string;
  framework: InitFramework | "unknown";
  mode: "rust" | "editor";
  status: "initialized" | "updated" | "unchanged";
  scaffolded: string[];
  programId?: string;
}

const RUST_KEYWORDS = new Set([
  "as", "break", "const", "continue", "crate", "else", "enum", "extern", "false", "fn", "for", "if", "impl",
  "in", "let", "loop", "match", "mod", "move", "mut", "pub", "ref", "return", "self", "static", "struct",
  "super", "trait", "true", "type", "unsafe", "use", "where", "while", "async", "await", "dyn", "test",
]);

/** Turn a directory name into a valid Rust crate/module identifier. */
export function toCrateName(name: string): string {
  let crate = name.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "program";
  if (/^[0-9]/.test(crate)) crate = `p_${crate}`;
  if (RUST_KEYWORDS.has(crate)) crate = `${crate}_program`;
  return crate;
}

export function parseInitFramework(value: string | undefined): InitFramework | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!(INIT_FRAMEWORKS as readonly string[]).includes(normalized)) {
    throw new Error(`Invalid framework "${value}". Use one of: ${INIT_FRAMEWORKS.join(", ")}`);
  }
  return normalized as InitFramework;
}

/** Minimal buildable program for a framework: workspace Cargo.toml, program crate, keypair. */
export function scaffoldProject(projectPath: string, framework: InitFramework): { files: string[]; programId: string } {
  const crate = toCrateName(basename(projectPath));
  const keypair = generateProgramKeypair();
  const now = new Date().toISOString();
  const ir: ProgramIR = {
    version: "1.0.0",
    program: { name: crate, version: "0.1.0", programId: keypair.address },
    instructions: [{
      id: randomUUID(),
      name: "initialize",
      args: [],
      accounts: [{ id: randomUUID(), name: "payer", accountType: "signer", constraints: [] }],
      body: [],
      accessControl: "none",
    }],
    states: [],
    errors: [],
    events: [],
    integrations: [],
    constants: [],
    metadata: { createdAt: now, updatedAt: now, flowHash: "scaffold", generatorVersion: "solstudio-cli" },
  };
  const generated = generateCode(ir, framework);
  if (generated.errors.length > 0) {
    throw new Error(`Scaffold failed: ${generated.errors.map((e) => e.message).join("; ")}`);
  }

  const files: Record<string, string> = {
    "Cargo.toml": [
      "[workspace]",
      'members = ["programs/*"]',
      'resolver = "2"',
      "",
      "[profile.release]",
      "overflow-checks = true",
      'lto = "fat"',
      "codegen-units = 1",
      "",
    ].join("\n"),
    ".gitignore": ["target/", "node_modules/", ".anchor/", ".solstudio/backups/", ""].join("\n"),
    [`target/deploy/${crate}-keypair.json`]: JSON.stringify(keypair.secretKey),
  };
  if (framework === "anchor") {
    files["Anchor.toml"] = [
      "[toolchain]",
      "",
      "[features]",
      "resolution = true",
      "skip-lint = false",
      "",
      "[programs.localnet]",
      `${crate} = "${keypair.address}"`,
      "",
      "[provider]",
      'cluster = "localnet"',
      'wallet = "~/.config/solana/id.json"',
      "",
    ].join("\n");
  }
  for (const file of generated.files) {
    files[mapGeneratedPath(projectPath, file.path)] = file.content;
  }

  const written: string[] = [];
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(projectPath, rel);
    if (existsSync(abs)) continue;
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, rel.endsWith("-keypair.json") ? { mode: 0o600 } : undefined);
    written.push(rel);
  }
  return { files: written, programId: keypair.address };
}

function hasProjectFiles(dir: string): boolean {
  return ["Cargo.toml", "Anchor.toml", "Quasar.toml", "src", "programs"].some((f) => existsSync(join(dir, f)));
}

export function runInit(pathArg: string, options: InitOptions = {}): InitResult {
  const resolvedPath = resolve(pathArg);
  const forced = parseInitFramework(options.framework);

  if (!existsSync(resolvedPath)) {
    if (!options.scaffold) {
      throw new Error(`Directory does not exist: ${resolvedPath}\nUse --scaffold to create a new project.`);
    }
    mkdirSync(resolvedPath, { recursive: true });
  }

  if (isInitialized(resolvedPath)) {
    const existing = readConfig(resolvedPath);
    if (forced && forced !== existing.framework) {
      const mode = "rust" as const;
      writeConfig(resolvedPath, { ...existing, framework: forced, mode });
      return { path: resolvedPath, framework: forced, mode, status: "updated", scaffolded: [] };
    }
    return {
      path: resolvedPath,
      framework: existing.framework,
      mode: existing.mode,
      status: "unchanged",
      scaffolded: [],
    };
  }

  let scaffolded: string[] = [];
  let programId: string | undefined;
  if (options.scaffold && !hasProjectFiles(resolvedPath)) {
    const result = scaffoldProject(resolvedPath, forced ?? "anchor");
    scaffolded = result.files;
    programId = result.programId;
  }

  const detected = forced ?? detectProjectType(resolvedPath);
  const mode = detected === "unknown" ? "editor" : "rust";
  writeConfig(resolvedPath, {
    name: basename(resolvedPath),
    framework: detected,
    mode,
    port: 6139,
  });
  return { path: resolvedPath, framework: detected, mode, status: "initialized", scaffolded, programId };
}

export const initCommand = new Command("init")
  .description("Initialize SolStudio for a project directory")
  .argument("[path]", "Path to the project directory", ".")
  .option("-f, --framework <framework>", "Force framework (anchor|pinocchio|quasar); updates an existing config")
  .option("--scaffold", "Scaffold a minimal buildable program if the directory has none", false)
  .action((pathArg: string, options: InitOptions) => {
    try {
      const result = runInit(pathArg, options);
      if (result.status === "unchanged") {
        console.log(`Already initialized: ${result.path}`);
      } else if (result.status === "updated") {
        console.log(`Updated SolStudio config for ${basename(result.path)}`);
      } else {
        console.log(`Initialized SolStudio for ${basename(result.path)}`);
      }
      if (result.scaffolded.length > 0) {
        console.log(`  Scaffolded ${result.framework} program (id ${result.programId}):`);
        for (const file of result.scaffolded) console.log(`    ${file}`);
      }
      console.log(`  Framework: ${result.framework}`);
      console.log(`  Mode: ${result.mode}`);
      console.log(`  Config: ${getConfigDir(result.path)}`);
      if (result.status === "initialized") {
        console.log(`\nRun \`solstudio view ${pathArg}\` to start the visualizer.`);
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
