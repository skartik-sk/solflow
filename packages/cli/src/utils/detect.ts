// Detect project type — Anchor, Pinocchio, or unknown.

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

export type ProjectType = "anchor" | "pinocchio" | "unknown";

/**
 * Detect if a directory is an Anchor or Pinocchio project.
 */
export function detectProjectType(dir: string): ProjectType {
  try {
    const entries = readdirSync(dir);

    // Check for Anchor.toml
    if (entries.includes("Anchor.toml")) return "anchor";

    // Check root Cargo.toml for dependencies
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

      // Also check .rs files in programs/ for #[program]
      if (hasAnchorProgram(programsDir)) return "anchor";
    }

    // Check src/ directory
    const srcDir = join(dir, "src");
    if (existsSync(srcDir)) {
      if (hasAnchorProgram(srcDir)) return "anchor";
    }
  } catch {
    // Ignore errors
  }

  return "unknown";
}

function hasAnchorProgram(dir: string): boolean {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (hasAnchorProgram(join(dir, entry.name))) return true;
      } else if (entry.name.endsWith(".rs")) {
        const content = readFileSync(join(dir, entry.name), "utf-8");
        if (content.includes("#[program]")) return true;
      }
    }
  } catch {
    // Ignore
  }
  return false;
}
