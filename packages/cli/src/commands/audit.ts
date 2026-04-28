// Audit command — parse a Solana project and run local static + deterministic stress checks.

import { Command } from "commander";
import { resolve, extname, join, dirname } from "path";
import { existsSync, mkdirSync, statSync, writeFileSync } from "fs";
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
    "Generate deterministic audit test files into a directory",
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
        projectPath: resolve(pathArg),
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
          `Generated ${written.length} audit test file(s) in ${resolve(options.generateTests)}`,
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

  return { parsed, ir, report };
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
    writeFileSync(dest, file.content);
  }
  return files;
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
