// Scanner — walk directory for .rs files, build module graph from mod declarations.

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, extname } from "path";

const SKIP_DIRS = new Set(["target", "node_modules", "tests", "benches", "examples", "migration"]);

/**
 * Walk a directory and collect all .rs files.
 */
export function findRustFiles(dir: string, maxDepth = 10): string[] {
  const files: string[] = [];

  function walk(current: string, depth: number): void {
    if (depth > maxDepth) return;
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (extname(entry.name) === ".rs") {
        files.push(fullPath);
      }
    }
  }

  walk(dir, 0);
  return files;
}

/**
 * Read all .rs files and return their concatenated content.
 */
export function readRustProject(dir: string): string {
  const files = findRustFiles(dir);
  const contents: string[] = [];

  for (const file of files) {
    try {
      contents.push(readFileSync(file, "utf-8"));
    } catch {
      // Skip unreadable files
    }
  }

  return contents.join("\n\n");
}

/**
 * Detect if a directory is an Anchor project.
 */
export function detectProjectType(dir: string): "anchor" | "pinocchio" | "unknown" {
  try {
    const entries = readdirSync(dir);
    if (entries.includes("Anchor.toml")) return "anchor";

    // Check root Cargo.toml for framework dependencies
    const cargoPath = join(dir, "Cargo.toml");
    if (entries.includes("Cargo.toml")) {
      const cargo = readFileSync(cargoPath, "utf-8");
      if (cargo.includes("anchor-lang")) return "anchor";
      if (cargo.includes("pinocchio")) return "pinocchio";
    }

    // Check programs/*/Cargo.toml for Anchor workspace layout
    const programsDir = join(dir, "programs");
    if (existsSync(programsDir)) {
      const progEntries = readdirSync(programsDir, { withFileTypes: true });
      for (const pe of progEntries) {
        if (pe.isDirectory()) {
          const subCargo = join(programsDir, pe.name, "Cargo.toml");
          try {
            const cargo = readFileSync(subCargo, "utf-8");
            if (cargo.includes("anchor-lang")) return "anchor";
            if (cargo.includes("pinocchio")) return "pinocchio";
          } catch { /* skip */ }
        }
      }
    }

    // Check src/ and programs/ for #[program] in .rs files
    const files = findRustFiles(dir);
    for (const file of files) {
      if (file.endsWith("lib.rs")) {
        const content = readFileSync(file, "utf-8");
        if (content.includes("#[program]")) return "anchor";
      }
    }
  } catch {
    // Ignore errors
  }

  return "unknown";
}
