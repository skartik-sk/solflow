import { Command } from "commander";
import { dirname, extname, join, resolve } from "path";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { generateCode } from "@solflow/codegen";
import { flowToIR } from "@solflow/ir";
import { parseFile, parseProgram } from "@solflow/rust-parser";
import { detectProjectType, type ProjectType } from "../utils/detect";
import { createUnifiedDiff } from "../utils/diff";
import { isPathInside, mapGeneratedPath } from "../utils/paths";

export { createUnifiedDiff };

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

  const projectRoot = isRsFile ? findEnclosingCrate(root) : root;
  const framework = resolvePatchFramework(
    options.framework,
    detectProjectType(projectRoot),
  );
  const parsed = isRsFile ? parseFile(root) : parseProgram(root);
  const ir = flowToIR(parsed.nodes, parsed.edges);
  const generated = generateCode(ir, framework);
  if (generated.errors.length > 0) {
    throw new Error(generated.errors.map((error) => error.message).join("; "));
  }

  const patches = generated.files
    .map((file) => {
      const relativePath = mapGeneratedPath(projectRoot, file.path);
      const targetPath = resolve(projectRoot, relativePath);
      if (!isPathInside(projectRoot, targetPath)) return "";
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

/** For a single .rs input, diff against the crate that contains it. */
function findEnclosingCrate(filePath: string): string {
  let current = dirname(filePath);
  for (let depth = 0; depth < 8; depth++) {
    if (existsSync(join(current, "Cargo.toml"))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirname(filePath);
}
