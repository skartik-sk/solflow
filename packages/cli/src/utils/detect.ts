// Detect project type — Anchor, Pinocchio, Quasar, or unknown.

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

export type ProjectType = "anchor" | "pinocchio" | "quasar" | "unknown";

/**
 * Detect if a directory is an Anchor, Pinocchio, or Quasar project.
 */
export function detectProjectType(dir: string): ProjectType {
  try {
    const entries = readdirSync(dir);

    // Check for Anchor.toml
    if (entries.includes("Anchor.toml")) return "anchor";

    // Check for Quasar.toml
    if (entries.includes("Quasar.toml")) return "quasar";

    // Check root Cargo.toml for dependencies
    const cargoPath = join(dir, "Cargo.toml");
    if (entries.includes("Cargo.toml")) {
      const cargo = readFileSync(cargoPath, "utf-8");
      if (cargo.includes("anchor-lang")) return "anchor";
      if (cargo.includes("pinocchio")) return "pinocchio";
      if (cargo.includes("quasar-lang")) return "quasar";
      const workspaceType = detectWorkspaceMemberType(dir, cargo);
      if (workspaceType !== "unknown") return workspaceType;
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
            if (cargo.includes("quasar-lang")) return "quasar";
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

function detectWorkspaceMemberType(dir: string, cargo: string): ProjectType {
  const memberMatch = cargo.match(/members\s*=\s*\[([^\]]+)\]/);
  if (!memberMatch) return "unknown";

  const members = memberMatch[1].match(/"([^"]+)"/g)?.map((m) => m.replace(/"/g, "")) ?? [];
  for (const member of members) {
    const memberRoot = member.replace("/*", "");
    const parentDir = join(dir, memberRoot);

    if (member.includes("*")) {
      if (!existsSync(parentDir)) continue;
      try {
        const entries = readdirSync(parentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const detected = detectCargoDependency(join(parentDir, entry.name, "Cargo.toml"));
          if (detected !== "unknown") return detected;
        }
      } catch { /* skip */ }
      continue;
    }

    const detected = detectCargoDependency(join(dir, member, "Cargo.toml"));
    if (detected !== "unknown") return detected;
  }

  return "unknown";
}

function detectCargoDependency(cargoPath: string): ProjectType {
  if (!existsSync(cargoPath)) return "unknown";
  try {
    const cargo = readFileSync(cargoPath, "utf-8");
    if (cargo.includes("anchor-lang")) return "anchor";
    if (cargo.includes("pinocchio")) return "pinocchio";
    if (cargo.includes("quasar-lang")) return "quasar";
  } catch { /* skip */ }
  return "unknown";
}

function hasAnchorProgram(dir: string, depth = 0): boolean {
  if (depth > 10) return false;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (hasAnchorProgram(join(dir, entry.name), depth + 1)) return true;
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
