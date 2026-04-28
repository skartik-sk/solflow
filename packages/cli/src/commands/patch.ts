import { Command } from "commander";
import { dirname, extname, relative, resolve } from "path";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { generateCode } from "@solflow/codegen";
import { flowToIR } from "@solflow/ir";
import { parseFile, parseProgram } from "@solflow/rust-parser";
import { detectProjectType, type ProjectType } from "../utils/detect";

type PatchFramework = "anchor" | "pinocchio" | "quasar";

interface PatchOptions {
  framework?: PatchFramework;
  output?: string;
}

export const patchCommand = new Command("patch")
  .description("Generate a dry-run source patch without overwriting project files")
  .argument("[path]", "Path to the project directory or .rs file", ".")
  .option(
    "-f, --framework <framework>",
    "Target framework: anchor, pinocchio, quasar",
  )
  .option("-o, --output <file>", "Write patch to file instead of stdout")
  .action((pathArg: string, options: PatchOptions) => {
    try {
      const patch = generatePatchForPath(pathArg, options);
      if (options.output) {
        const outputPath = resolve(options.output);
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, patch);
        console.log(`Patch written to ${outputPath}`);
      } else {
        console.log(patch);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Patch failed: ${message}`);
      process.exit(2);
    }
  });

export function generatePatchForPath(
  pathArg: string,
  options: PatchOptions = {},
): string {
  const root = resolve(pathArg);
  if (!existsSync(root)) throw new Error(`Path does not exist: ${root}`);

  const stat = statSync(root);
  const isRsFile = stat.isFile() && extname(root) === ".rs";
  if (stat.isFile() && !isRsFile) {
    throw new Error("Patch input must be a project directory or .rs file");
  }

  const framework = resolvePatchFramework(
    options.framework,
    isRsFile ? "unknown" : detectProjectType(root),
  );
  const parsed = isRsFile ? parseFile(root) : parseProgram(root);
  const ir = flowToIR(parsed.nodes, parsed.edges);
  const generated = generateCode(ir, framework);
  if (generated.errors.length > 0) {
    throw new Error(generated.errors.map((error) => error.message).join("; "));
  }

  const projectRoot = isRsFile ? dirname(root) : root;
  const patches = generated.files
    .map((file) => {
      const targetPath = resolve(projectRoot, file.path);
      if (!targetPath.startsWith(projectRoot)) return "";
      const relativePath = relative(projectRoot, targetPath);
      const oldContent = existsSync(targetPath)
        ? readFileSync(targetPath, "utf8")
        : null;
      return createUnifiedDiff(relativePath, oldContent, file.content);
    })
    .filter(Boolean);

  return patches.length > 0
    ? `${patches.join("\n")}\n`
    : "No source changes generated.\n";
}

function resolvePatchFramework(
  requested: PatchFramework | undefined,
  detected: ProjectType,
): PatchFramework {
  if (requested) {
    if (!["anchor", "pinocchio", "quasar"].includes(requested)) {
      throw new Error("Invalid framework. Use one of: anchor, pinocchio, quasar");
    }
    return requested;
  }
  if (detected === "anchor" || detected === "pinocchio" || detected === "quasar") {
    return detected;
  }
  throw new Error("Could not detect framework. Pass --framework anchor|pinocchio|quasar.");
}

export function createUnifiedDiff(
  path: string,
  oldContent: string | null,
  newContent: string,
): string {
  if (oldContent === newContent) return "";
  const oldLines = oldContent == null ? [] : splitLines(oldContent);
  const newLines = splitLines(newContent);
  const header = [
    `diff --git a/${path} b/${path}`,
    oldContent == null ? "--- /dev/null" : `--- a/${path}`,
    `+++ b/${path}`,
  ];

  if (oldContent == null) {
    return [
      ...header,
      `@@ -0,0 +1,${newLines.length} @@`,
      ...newLines.map((line) => `+${line}`),
    ].join("\n");
  }

  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix++;
  }

  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (
    oldEnd >= prefix &&
    newEnd >= prefix &&
    oldLines[oldEnd] === newLines[newEnd]
  ) {
    oldEnd--;
    newEnd--;
  }

  const context = 3;
  const start = Math.max(0, prefix - context);
  const oldLimit = Math.min(oldLines.length - 1, oldEnd + context);
  const newLimit = Math.min(newLines.length - 1, newEnd + context);
  const oldCount = oldLimit >= start ? oldLimit - start + 1 : 0;
  const newCount = newLimit >= start ? newLimit - start + 1 : 0;
  const hunk: string[] = [
    `@@ -${start + 1},${oldCount} +${start + 1},${newCount} @@`,
  ];

  for (let i = start; i < prefix; i++) hunk.push(` ${oldLines[i]}`);
  for (let i = prefix; i <= oldEnd; i++) hunk.push(`-${oldLines[i]}`);
  for (let i = prefix; i <= newEnd; i++) hunk.push(`+${newLines[i]}`);
  for (let i = Math.max(prefix, oldEnd + 1); i <= oldLimit; i++) {
    hunk.push(` ${oldLines[i]}`);
  }

  return [...header, ...hunk].join("\n");
}

function splitLines(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}
