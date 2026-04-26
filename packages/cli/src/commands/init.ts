// Init command — set up a project for use with SolStudio.

import { Command } from "commander";
import { resolve, basename } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { detectProjectType } from "../utils/detect";
import { writeConfig, isInitialized, readConfig, getConfigDir } from "../utils/config";

const MINIMAL_ANCHOR = `use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111111111111");

#[program]
pub mod {{name}} {
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
`;

export const initCommand = new Command("init")
  .description("Initialize SolStudio for a project directory")
  .argument("[path]", "Path to the project directory", ".")
  .option("-f, --framework <framework>", "Force framework (anchor|pinocchio|quasar)")
  .option("--scaffold", "Scaffold a minimal project if none exists", false)
  .action(async (pathArg: string, options: { framework?: string; scaffold: boolean }) => {
    const resolvedPath = resolve(pathArg);

    if (!existsSync(resolvedPath)) {
      if (options.scaffold) {
        mkdirSync(resolvedPath, { recursive: true });
        console.log(`Created directory: ${resolvedPath}`);
      } else {
        console.error(`Directory does not exist: ${resolvedPath}`);
        console.error("Use --scaffold to create a new project.");
        process.exit(1);
      }
    }

    const projectName = basename(resolvedPath);
    const VALID_FRAMEWORKS = ["anchor", "pinocchio", "quasar"] as const;
    const detected = (options.framework && VALID_FRAMEWORKS.includes(options.framework as typeof VALID_FRAMEWORKS[number])
      ? options.framework as typeof VALID_FRAMEWORKS[number]
      : undefined) || detectProjectType(resolvedPath);
    const framework = detected === "unknown" && options.scaffold ? "anchor" : detected;

    if (isInitialized(resolvedPath)) {
      const existing = readConfig(resolvedPath);
      console.log(`Already initialized: ${resolvedPath}`);
      console.log(`  Framework: ${existing.framework}`);
      console.log(`  Mode: ${existing.mode}`);
      console.log(`  Config: ${getConfigDir(resolvedPath)}`);
      return;
    }

    // Scaffold minimal files if requested and no src/ exists
    if (options.scaffold && !existsSync(resolve(resolvedPath, "src"))) {
      const srcDir = resolve(resolvedPath, "src");
      mkdirSync(srcDir, { recursive: true });

      const libContent = MINIMAL_ANCHOR.replace(/\{\{name\}\}/g, projectName.replace(/-/g, "_"));
      writeFileSync(resolve(srcDir, "lib.rs"), libContent);

      console.log(`Scaffolded minimal Anchor program in ${srcDir}/lib.rs`);
    }

    writeConfig(resolvedPath, {
      name: projectName,
      framework,
      mode: detected === "unknown" ? "editor" : "rust",
      port: 6139,
    });

    console.log(`Initialized SolStudio for ${projectName}`);
    console.log(`  Framework: ${framework}`);
    console.log(`  Mode: ${detected === "unknown" ? "editor" : "rust"}`);
    console.log(`  Config: ${getConfigDir(resolvedPath)}`);
    console.log(`\nRun \`solstudio view ${pathArg}\` to start the visualizer.`);
  });
