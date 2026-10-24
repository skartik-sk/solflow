import type { ProgramIR } from "@solflow/ir";

interface RustFile {
  path: string;
  content: string;
}

const pascal = (name: string) => name.split(/[_-]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
const snake = (name: string) => name.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");

/**
 * Generated code can reference the program's constants and state types from places the
 * per-file import logic doesn't anticipate (seeds, init sizes, parsed expressions). Add the
 * `use crate::…` lines a file needs and doesn't have.
 */
export function addMissingCrateImports<T extends RustFile>(files: T[], ir: ProgramIR): T[] {
  return files.map((file) => {
    if (!file.path.endsWith(".rs")) return file;
    const inInstructions = file.path.includes("/src/instructions/");
    const isLib = file.path.endsWith("/src/lib.rs");
    if (!inInstructions && !isLib) return file;

    // Look at code only, not comments or strings.
    const code = file.content.replace(/\/\/.*$/gm, "").replace(/"(?:[^"\\]|\\.)*"/g, '""');
    const uses = (name: string) => new RegExp(`(?<![\\w:])${name}\\b`).test(code);
    const needed: string[] = [];

    if (
      ir.constants.some((c) => uses(c.name)) &&
      !/use crate::constants/.test(file.content) &&
      (!isLib || /pub mod constants;/.test(file.content))
    ) {
      // A glob import never conflicts with names defined or imported explicitly.
      needed.push("use crate::constants::*;");
    }
    if (inInstructions) {
      const errorEnum = `${pascal(ir.program.name)}Error`;
      if (ir.errors.length && new RegExp(`(?<![\\w:])${errorEnum}::`).test(code) && !new RegExp(`use crate::errors::[\\w:{}, ]*\\b${errorEnum}\\b`).test(file.content)) {
        needed.push(`use crate::errors::${errorEnum};`);
      }
      for (const state of ir.states) {
        const imported = new RegExp(`use crate::state::[\\w:{}, ]*\\b${state.name}\\b`).test(file.content);
        if (!imported && uses(state.name)) needed.push(`use crate::state::${snake(state.name)}::${state.name};`);
      }
    }
    if (!needed.length) return file;

    const lines = file.content.split("\n");
    let at = lines.findIndex((l) => l.startsWith("use "));
    if (at < 0) at = lines.findIndex((l) => !l.startsWith("#!") && l.trim() !== "");
    lines.splice(Math.max(at, 0), 0, ...needed);
    return { ...file, content: lines.join("\n") };
  });
}
