// Audit command — parse a Solana project and run local static + deterministic stress checks.

import { Command } from "commander";
import { resolve, extname, join, dirname } from "path";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { isPathInside, toPosixRelative } from "../utils/paths";
import {
  parseFile,
  parseProgram,
  type ParseResult,
  type SourceCoverageOptions,
} from "@solflow/rust-parser";
import { flowToIR, type ProgramIR } from "@solflow/ir";
import {
  formatAuditReport,
  generateAuditTestFiles,
  runInstantAudit,
  type AuditReport,
  type AuditExportFormat,
  type AuditTestFramework,
} from "@solflow/audit";

interface AuditCommandOptions {
  output?: string;
  format: AuditExportFormat;
  generateTests?: string;
  testFramework?: AuditTestFramework;
  includeTests?: boolean;
  includeExamples?: boolean;
  includeBenches?: boolean;
  includeMigrations?: boolean;
  includeHidden?: boolean;
}

interface AuditCommandResult {
  parsed: ParseResult;
  ir: ProgramIR;
  report: AuditReport;
}

export const auditCommand = new Command("audit")
  .description(
    "Run static audit and deterministic stress checks for a Solana project",
  )
  .argument("[path]", "Path to the project directory or .rs file", ".")
  .option("-o, --output <file>", "Write output to file instead of stdout")
  .option(
    "-f, --format <format>",
    "Output format: summary, json, markdown, sarif",
    "summary",
  )
  .option(
    "--generate-tests <dir>",
    "Generate smoke-test scaffolds (case tables to turn into real instruction tests) into a directory",
  )
  .option(
    "--test-framework <framework>",
    "Generated test framework: anchor, pinocchio, quasar, litesvm, mollusk",
  )
  .option("--include-tests", "Include tests/ directories in parser coverage")
  .option(
    "--include-examples",
    "Include examples/ directories in parser coverage",
  )
  .option(
    "--include-benches",
    "Include benches/ directories in parser coverage",
  )
  .option(
    "--include-migrations",
    "Include migration/ and migrations/ directories in parser coverage",
  )
  .option("--include-hidden", "Include hidden directories in parser coverage")
  .action(async (pathArg: string, options: AuditCommandOptions) => {
    if (!["summary", "json", "markdown", "sarif"].includes(options.format)) {
      console.error("Invalid format. Use one of: summary, json, markdown, sarif");
      process.exit(2);
    }
    if (
      options.testFramework &&
      !["anchor", "pinocchio", "quasar", "litesvm", "mollusk"].includes(
        options.testFramework,
      )
    ) {
      console.error(
        "Invalid test framework. Use one of: anchor, pinocchio, quasar, litesvm, mollusk",
      );
      process.exit(2);
    }

    try {
      const result = runAuditForPath(pathArg, options);
      const output = formatAuditReport(result.report, options.format, {
        framework: result.parsed.report.framework,
        // SARIF consumers (GitHub code scanning) need repo-relative URIs, never absolute paths.
        projectPath: options.format === "sarif" ? "." : resolve(pathArg),
        parseStats: result.parsed.stats,
        parserReport: result.parsed.report,
      });

      if (options.output) {
        writeFileSync(options.output, output);
        console.log(`Output written to ${options.output}`);
      } else {
        console.log(output);
      }

      if (options.generateTests) {
        const framework =
          options.testFramework ?? auditTestFrameworkFromParser(result.parsed.report.framework);
        const written = writeGeneratedAuditTests(
          options.generateTests,
          result.report,
          framework,
          result.ir.program.name,
        );
        console.log(
          `Generated ${written.length} audit smoke-test scaffold file(s) in ${resolve(options.generateTests)}`,
        );
        console.log(
          "  These are smoke tests: they validate the stress-case table but do not send instructions yet.",
        );
      }

      if (result.report.findings.length > 0) {
        process.exit(1);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Audit failed: ${message}`);
      process.exit(2);
    }
  });

export function runAuditForPath(
  pathArg: string,
  options: Pick<
    AuditCommandOptions,
    | "includeTests"
    | "includeExamples"
    | "includeBenches"
    | "includeMigrations"
    | "includeHidden"
  > = {},
): AuditCommandResult {
  const resolvedPath = resolve(pathArg);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Path does not exist: ${resolvedPath}`);
  }

  const stat = statSync(resolvedPath);
  const isFile = stat.isFile();
  const isRsFile = isFile && extname(resolvedPath) === ".rs";
  if (isFile && !isRsFile) {
    throw new Error("Audit input must be a project directory or .rs file");
  }

  const parsed = isRsFile
    ? parseFile(resolvedPath)
    : parseProgram(resolvedPath, { sourceCoverage: coverageOptions(options) });
  const ir = flowToIR(parsed.nodes, parsed.edges);
  const report = runInstantAudit(ir);
  attachSourceLocations(report, resolvedPath, isRsFile);

  return { parsed, ir, report };
}

/**
 * Point each finding at a source file and line (relative to the current directory
 * when the project is inside it, else to the project root) so SARIF results land on
 * real lines in code scanning. Falls back to the program's lib.rs, line 1.
 */
export function attachSourceLocations(report: AuditReport, targetPath: string, isRsFile: boolean, cwd = process.cwd()): void {
  const projectRoot = isRsFile ? dirname(targetPath) : targetPath;
  const base = isPathInside(cwd, projectRoot) ? cwd : projectRoot;
  const files = isRsFile ? [targetPath] : listRustFiles(projectRoot);
  const sources = files.map((file) => {
    let lines: string[] = [];
    try { lines = readFileSync(file, "utf-8").split(/\r?\n/); } catch { /* unreadable */ }
    return { file, lines };
  });
  const fallback = sources.find((s) => /[\\/]src[\\/]lib\.rs$/.test(s.file)) ?? sources[0];

  const find = (pattern: RegExp) => {
    for (const source of sources) {
      const index = source.lines.findIndex((line) => pattern.test(line));
      if (index !== -1) return { file: source.file, line: index + 1, column: source.lines[index].search(/\S/) + 1 };
    }
    return null;
  };

  for (const finding of report.findings) {
    if (finding.location.file) continue;
    const { instructionName, accountName } = finding.location;
    const hit =
      (accountName ? find(new RegExp(`\\b(pub\\s+)?${escapeRegExp(accountName)}\\s*:`)) : null) ??
      (instructionName ? find(new RegExp(`\\bfn\\s+${escapeRegExp(instructionName)}\\s*[<(]`)) : null) ??
      (fallback ? { file: fallback.file, line: 1, column: 1 } : null);
    if (!hit) continue;
    finding.location.file = toPosixRelative(base, hit.file);
    finding.location.line = hit.line;
    finding.location.column = Math.max(1, hit.column);
  }
}

function listRustFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 10) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".") || entry.name === "target" || entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.name.endsWith(".rs")) out.push(full);
    }
  };
  walk(root, 0);
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function writeGeneratedAuditTests(
  outputDir: string,
  report: AuditReport,
  framework: AuditTestFramework,
  programName?: string,
) {
  const files = generateAuditTestFiles(report, {
    framework,
    programName,
    includeReadme: true,
  });
  const root = resolve(outputDir);
  mkdirSync(root, { recursive: true });
  for (const file of files) {
    const dest = join(root, file.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, labelSmokeTest(file.path, file.content));
  }
  return files;
}

const SMOKE_TEST_NOTE =
  "SMOKE TESTS generated by SolStudio. They check the deterministic stress-case table only; " +
  "they do not build transactions or call the program. Replace each case body with a real instruction call.";

/** Mark generated tests as smoke tests so nobody mistakes them for instruction coverage. */
export function labelSmokeTest(path: string, content: string): string {
  if (/\.(ts|js|rs)$/.test(path)) return `// ${SMOKE_TEST_NOTE}\n${content}`;
  if (path.endsWith(".md")) return content.replace(/^(# .*\n)/, `$1\n> ${SMOKE_TEST_NOTE}\n`);
  return content;
}

function coverageOptions(
  options: Pick<
    AuditCommandOptions,
    | "includeTests"
    | "includeExamples"
    | "includeBenches"
    | "includeMigrations"
    | "includeHidden"
  >,
): SourceCoverageOptions | undefined {
  const coverage = {
    includeTests: options.includeTests,
    includeExamples: options.includeExamples,
    includeBenches: options.includeBenches,
    includeMigrations: options.includeMigrations,
    includeHidden: options.includeHidden,
  };
  return Object.values(coverage).some(Boolean) ? coverage : undefined;
}

function auditTestFrameworkFromParser(framework: string): AuditTestFramework {
  const normalized = framework.toLowerCase();
  if (normalized === "pinocchio" || normalized === "quasar") return normalized;
  return "anchor";
}
