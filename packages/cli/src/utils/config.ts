// Config — read/write .solstudio/config.json

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

export interface SolStudioConfig {
  name: string;
  framework: "anchor" | "pinocchio" | "quasar";
  mode: "rust" | "editor";
  port: number;
}

const DEFAULT_CONFIG: SolStudioConfig = {
  name: "unnamed-project",
  framework: "anchor",
  mode: "rust",
  port: 6139,
};

/**
 * Get the .solstudio directory path for a project.
 */
export function getConfigDir(projectPath: string): string {
  return join(projectPath, ".solstudio");
}

/**
 * Get the config.json file path.
 */
export function getConfigPath(projectPath: string): string {
  return join(getConfigDir(projectPath), "config.json");
}

/**
 * Get the project.json file path.
 */
export function getProjectPath(projectPath: string): string {
  return join(getConfigDir(projectPath), "project.json");
}

const VALID_FRAMEWORKS = ["anchor", "pinocchio", "quasar"] as const;
const VALID_MODES = ["rust", "editor"] as const;

/**
 * Read config from .solstudio/config.json. Returns defaults if not found.
 */
export function readConfig(projectPath: string): SolStudioConfig {
  const configPath = getConfigPath(projectPath);
  if (!existsSync(configPath)) return { ...DEFAULT_CONFIG };

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_CONFIG, ...parsed };

    // Validate values
    if (!VALID_FRAMEWORKS.includes(merged.framework)) {
      merged.framework = DEFAULT_CONFIG.framework;
    }
    if (!VALID_MODES.includes(merged.mode)) {
      merged.mode = DEFAULT_CONFIG.mode;
    }
    if (typeof merged.port !== "number" || merged.port < 1 || merged.port > 65535) {
      merged.port = DEFAULT_CONFIG.port;
    }
    return merged;
  } catch (err) {
    console.error(`Warning: Failed to read config at ${configPath}: ${err instanceof Error ? err.message : String(err)}`);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Write config to .solstudio/config.json. Creates directory if needed.
 */
export function writeConfig(projectPath: string, config: SolStudioConfig): void {
  const configDir = getConfigDir(projectPath);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  writeFileSync(getConfigPath(projectPath), JSON.stringify(config, null, 2));
}

/**
 * Check if a project has been initialized (.solstudio directory exists).
 */
export function isInitialized(projectPath: string): boolean {
  return existsSync(getConfigDir(projectPath));
}
