// Path helpers that behave the same on POSIX and Windows.

import { existsSync, readdirSync, readFileSync } from "fs";
import { isAbsolute, join, relative, resolve, sep } from "path";

/** True when `target` is `root` itself or somewhere below it. */
export function isPathInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  if (rel === "") return true;
  return !rel.startsWith("..") && !isAbsolute(rel);
}

/** Relative path with forward slashes (for diffs, SARIF and UI display). */
export function toPosixRelative(root: string, target: string): string {
  return relative(root, target).split(sep).join("/");
}

/**
 * Codegen emits workspace-style paths (`programs/<crate>/...`). Map them onto
 * the crate that actually exists in the project, so a root-level crate
 * (`Cargo.toml` + `src/`) or a hyphenated workspace member gets patched in place
 * instead of a parallel `programs/<crate>` tree being created.
 */
export function mapGeneratedPath(projectRoot: string, generatedPath: string): string {
  const parts = generatedPath.split(/[\\/]/);
  if (parts.length < 3 || parts[0] !== "programs") return generatedPath;
  const crateRoot = findCrateRoot(projectRoot, parts[1]);
  if (!crateRoot) return generatedPath;
  return toPosixRelative(projectRoot, join(crateRoot, ...parts.slice(2))) || generatedPath;
}

/** Find the on-disk directory of the program crate codegen calls `crateName`. */
export function findCrateRoot(projectRoot: string, crateName: string): string | null {
  const want = normalizeCrateName(crateName);
  const programsDir = join(projectRoot, "programs");
  const members: string[] = [];
  if (existsSync(programsDir)) {
    try {
      for (const entry of readdirSync(programsDir, { withFileTypes: true })) {
        if (entry.isDirectory() && existsSync(join(programsDir, entry.name, "Cargo.toml"))) {
          members.push(join(programsDir, entry.name));
        }
      }
    } catch { /* unreadable */ }
  }
  for (const member of members) {
    const dirName = member.split(sep).pop() ?? "";
    if (normalizeCrateName(dirName) === want || normalizeCrateName(readCrateName(member) ?? "") === want) {
      return member;
    }
  }
  if (members.length === 1) return members[0];
  if (members.length === 0 && existsSync(join(projectRoot, "src"))) return projectRoot;
  return null;
}

function readCrateName(dir: string): string | null {
  try {
    const cargo = readFileSync(join(dir, "Cargo.toml"), "utf-8");
    return cargo.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1] ?? null;
  } catch {
    return null;
  }
}

function normalizeCrateName(name: string): string {
  return name.trim().toLowerCase().replace(/-/g, "_");
}
