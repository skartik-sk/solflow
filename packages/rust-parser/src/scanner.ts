// Scanner — discovers Rust source files with proper module resolution.
//
// For Anchor projects: finds programs/*/src/lib.rs as entry point,
// follows mod declarations to build the complete module tree.
// For other projects: falls back to finding all .rs files.

import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, extname, basename, dirname, relative } from "path";
import type { ParseFramework, ParseReportFile, SourceCoverageOptions } from "./types";

const ALWAYS_SKIP_DIRS = new Set(["target", "node_modules", ".git"]);
const OPTIONAL_SKIP_DIRS: Record<string, keyof SourceCoverageOptions> = {
  tests: "includeTests",
  benches: "includeBenches",
  examples: "includeExamples",
  migration: "includeMigrations",
  migrations: "includeMigrations",
};
export const DEFAULT_SKIP_DIRS = new Set([...ALWAYS_SKIP_DIRS, ...Object.keys(OPTIONAL_SKIP_DIRS)]);

export interface RustProjectScan {
  rustFiles: string[];
  parsedFiles: ParseReportFile[];
  skippedFiles: ParseReportFile[];
  framework: ParseFramework;
}

/**
 * Resolve the full module tree for a Rust project directory.
 * Returns the concatenated content of all reachable .rs files.
 */
export function readRustProject(dir: string, coverage?: SourceCoverageOptions): string {
  if (!existsSync(dir)) {
    throw new Error(`Project directory not found: ${dir}`);
  }

  const projectType = detectProjectType(dir);
  const srcDirs = findAllSourceDirs(dir, projectType);

  if (srcDirs.length === 0) {
    return fallbackReadAll(dir, coverage);
  }

  const visited = new Set<string>();
  const contents: string[] = [];

  for (const srcDir of srcDirs) {
    const entryFile = findEntryPoint(srcDir);
    if (entryFile) {
      collectModules(entryFile, visited, contents);
    }
  }

  if (contents.length === 0) {
    return fallbackReadAll(dir, coverage);
  }

  appendCoverageExtras(dir, visited, contents, coverage);
  return contents.join("\n\n");
}

function collectModules(filePath: string, visited: Set<string>, out: string[]): void {
  if (visited.has(filePath)) return;
  visited.add(filePath);

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch { return; }

  out.push(content);

  const modNames = extractModDeclarations(content);
  const baseDir = dirname(filePath);

  for (const mod of modNames) {
    const modFile = resolveModule(baseDir, mod);
    if (modFile) {
      collectModules(modFile, visited, out);
    }
  }
}

/**
 * Extract `mod name;` declarations from source.
 * Skips cfg(test) blocks and inline mod blocks with braces.
 */
function extractModDeclarations(src: string): string[] {
  const mods: string[] = [];

  // Remove block comments
  const noBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, "");

  // Remove line comments
  const noComments = noBlockComments.replace(/\/\/.*$/gm, "");

  // Remove string literals to avoid false matches
  const noStrings = noComments.replace(/"(?:[^"\\]|\\.)*"/g, '""');

  // Remove cfg(test) blocks
  const cleaned = noStrings;
  let safe = "";
  let i = 0;
  while (i < cleaned.length) {
    const cfgIdx = cleaned.indexOf("#[cfg(test)]", i);
    if (cfgIdx === -1) {
      safe += cleaned.slice(i);
      break;
    }
    safe += cleaned.slice(i, cfgIdx);
    let afterAttr = cfgIdx + "#[cfg(test)]".length;
    // Skip whitespace and any additional attributes
    while (afterAttr < cleaned.length && /\s/.test(cleaned[afterAttr])) afterAttr++;
    while (afterAttr < cleaned.length && cleaned[afterAttr] === "#") {
      const attrEnd = cleaned.indexOf("]", afterAttr);
      if (attrEnd === -1) break;
      afterAttr = attrEnd + 1;
      while (afterAttr < cleaned.length && /\s/.test(cleaned[afterAttr])) afterAttr++;
    }
    // Skip the following block (mod, fn, etc.)
    const braceIdx = cleaned.indexOf("{", afterAttr);
    if (braceIdx !== -1 && braceIdx - afterAttr < 200) {
      const endIdx = findBalancedBrace(cleaned, braceIdx);
      if (endIdx !== -1) {
        i = endIdx + 1;
        continue;
      }
    }
    i = cfgIdx + "#[cfg(test)]".length;
  }

  // Match `mod name;` (semicolon-only, not inline `mod name {`)
  const modRe = /\bmod\s+([a-z_][a-z0-9_]*)\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = modRe.exec(safe)) !== null) {
    mods.push(m[1]);
  }

  return mods;
}

function findBalancedBrace(src: string, start: number): number {
  let depth = 0;
  let inStr = false;
  let strCh = "";
  let i = start;
  while (i < src.length) {
    const ch = src[i];
    if (inStr) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === strCh) inStr = false;
      i++; continue;
    }
    // Raw string: r"..." or r#"..."#
    if (ch === 'r' && i + 1 < src.length && (src[i + 1] === '"' || src[i + 1] === '#')) {
      let hashes = 0;
      let j = i + 1;
      while (j < src.length && src[j] === '#') { hashes++; j++; }
      if (j < src.length && src[j] === '"') {
        j++;
        const endMarker = '"'.padEnd(hashes + 1, '#');
        const endIdx = src.indexOf(endMarker, j);
        if (endIdx !== -1) { i = endIdx + endMarker.length; continue; }
      }
      i++; continue;
    }
    if (ch === '"') { inStr = true; strCh = '"'; i++; continue; }
    if (ch === "'") {
      // char literal
      if (i + 2 < src.length && src[i + 2] === "'") { i += 3; continue; }
      if (i + 3 < src.length && src[i + 2] === "\\" && src[i + 4] === "'") { i += 5; continue; }
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/**
 * Resolve mod name to file path: foo → foo.rs or foo/mod.rs
 */
function resolveModule(baseDir: string, modName: string): string | null {
  const candidates = [
    join(baseDir, `${modName}.rs`),
    join(baseDir, modName, "mod.rs"),
    join(baseDir, modName, `${modName}.rs`),
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c) && statSync(c).isFile()) return c;
    } catch { /* skip */ }
  }
  return null;
}

function findAllSourceDirs(dir: string, projectType: string): string[] {
  const results: string[] = [];

  if (projectType === "anchor" || projectType === "quasar") {
    // Anchor/Quasar workspace: programs/<name>/src/ — collect ALL programs
    const programsDir = join(dir, "programs");
    if (existsSync(programsDir)) {
      try {
        for (const entry of readdirSync(programsDir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            const srcDir = join(programsDir, entry.name, "src");
            if (existsSync(srcDir)) results.push(srcDir);
          }
        }
      } catch { /* skip */ }
    }

    // Direct Anchor project (no workspace): src/
    if (results.length === 0) {
      const directSrc = join(dir, "src");
      if (existsSync(directSrc) && existsSync(join(directSrc, "lib.rs"))) {
        results.push(directSrc);
      }
    }
  }

  if (results.length === 0) {
    const srcDir = join(dir, "src");
    if (existsSync(srcDir)) results.push(srcDir);
  }

  return results;
}

function findEntryPoint(srcDir: string): string | null {
  const candidates = [join(srcDir, "lib.rs"), join(srcDir, "main.rs")];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function fallbackReadAll(dir: string, coverage?: SourceCoverageOptions): string {
  const files = findRustFiles(dir, 10, coverage);
  const contents: string[] = [];
  for (const file of files) {
    try { contents.push(readFileSync(file, "utf-8")); } catch { /* skip */ }
  }
  return contents.join("\n\n");
}

function appendCoverageExtras(dir: string, visited: Set<string>, contents: string[], coverage?: SourceCoverageOptions): void {
  if (!coverage) return;
  const files = findRustFiles(dir, 10, coverage);
  for (const file of files) {
    if (visited.has(file)) continue;
    try {
      contents.push(readFileSync(file, "utf-8"));
      visited.add(file);
    } catch { /* skip */ }
  }
}

/**
 * Walk a directory and collect all .rs files.
 */
export function scanRustProject(dir: string, maxDepth = 10, coverage?: SourceCoverageOptions): RustProjectScan {
  const rustFiles: string[] = [];
  const skippedFiles: ParseReportFile[] = [];
  const root = dir;

  function walk(current: string, depth: number): void {
    if (depth > maxDepth) return;
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      const reportPath = relative(root, fullPath) || entry.name;

      if (entry.name.startsWith(".") && !coverage?.includeHidden) {
        skippedFiles.push({ path: reportPath, status: "skipped", reason: "Hidden path" });
        continue;
      }

      const skipReason = getSkipReason(entry.name, coverage);
      if (skipReason) {
        skippedFiles.push({ path: reportPath, status: "skipped", reason: skipReason });
        continue;
      }

      if (entry.isDirectory()) walk(fullPath, depth + 1);
      else if (extname(entry.name) === ".rs") rustFiles.push(fullPath);
    }
  }

  walk(dir, 0);
  return {
    rustFiles,
    parsedFiles: rustFiles.map((file) => ({
      path: relative(root, file) || file,
      status: "parsed" as const,
    })),
    skippedFiles,
    framework: detectProjectType(dir),
  };
}

/**
 * Walk a directory and collect all .rs files.
 */
export function findRustFiles(dir: string, maxDepth = 10, coverage?: SourceCoverageOptions): string[] {
  return collectRustFiles(dir, maxDepth, coverage);
}

function collectRustFiles(dir: string, maxDepth = 10, coverage?: SourceCoverageOptions): string[] {
  const files: string[] = [];
  function walk(current: string, depth: number): void {
    if (depth > maxDepth) return;
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if ((entry.name.startsWith(".") && !coverage?.includeHidden) || getSkipReason(entry.name, coverage)) continue;
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) walk(fullPath, depth + 1);
      else if (extname(entry.name) === ".rs") files.push(fullPath);
    }
  }
  walk(dir, 0);
  return files;
}

function getSkipReason(name: string, coverage?: SourceCoverageOptions): string | null {
  if (ALWAYS_SKIP_DIRS.has(name)) return `Skipped directory: ${name}`;
  const option = OPTIONAL_SKIP_DIRS[name];
  if (option && !coverage?.[option]) return `Skipped directory: ${name}; pass source coverage option ${option} to include`;
  return null;
}

/**
 * Parse version from Cargo.toml if available.
 */
export function parseCargoVersion(dir: string): string | null {
  const candidates = [join(dir, "Cargo.toml")];
  const programsDir = join(dir, "programs");
  if (existsSync(programsDir)) {
    try {
      for (const pe of readdirSync(programsDir, { withFileTypes: true })) {
        if (pe.isDirectory()) candidates.push(join(programsDir, pe.name, "Cargo.toml"));
      }
    } catch { /* skip */ }
  }
  for (const cargoPath of candidates) {
    try {
      if (!existsSync(cargoPath)) continue;
      const cargo = readFileSync(cargoPath, "utf-8");
      const m = cargo.match(/^version\s*=\s*"([^"]+)"/m);
      if (m) return m[1];
    } catch { /* skip */ }
  }
  return null;
}

/**
 * Detect if a directory is an Anchor, Pinocchio, or Quasar project.
 */
export function detectProjectType(dir: string): ParseFramework {
  try {
    const entries = readdirSync(dir);
    if (entries.includes("Anchor.toml")) return "anchor";
    if (entries.includes("Cargo.toml")) {
      const cargo = readFileSync(join(dir, "Cargo.toml"), "utf-8");
      if (cargo.includes("anchor-lang")) return "anchor";
      if (cargo.includes("pinocchio")) return "pinocchio";
      if (cargo.includes("quasar-lang")) return "quasar";
    }
    const programsDir = join(dir, "programs");
    if (existsSync(programsDir)) {
      for (const pe of readdirSync(programsDir, { withFileTypes: true })) {
        if (pe.isDirectory()) {
          try {
            const cargo = readFileSync(join(programsDir, pe.name, "Cargo.toml"), "utf-8");
            if (cargo.includes("anchor-lang")) return "anchor";
            if (cargo.includes("pinocchio")) return "pinocchio";
            if (cargo.includes("quasar-lang")) return "quasar";
          } catch { /* skip */ }
        }
      }
    }
    const files = findRustFiles(dir);
    for (const file of files) {
      if (basename(file) === "lib.rs") {
        const content = readFileSync(file, "utf-8");
        if (content.includes("#[program]")) return "anchor";
        if (content.includes("quasar_lang::prelude")) return "quasar";
      }
    }
  } catch { /* ignore */ }
  return "unknown";
}
