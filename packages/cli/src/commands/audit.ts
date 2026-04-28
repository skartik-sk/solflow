// Audit command — parse a Solana project and run local static + deterministic stress checks.

import { Command } from "commander";
import { resolve, extname } from "path";
import { existsSync, statSync, writeFileSync } from "fs";
import { parseFile, parseProgram, type ParseResult, type SourceCoverageOptions } from "@solflow/rust-parser";
import { flowToIR, type ProgramIR } from "@solflow/ir";
import { runInstantAudit, type AuditReport, type AuditSeverity } from "@solflow/audit";

interface AuditCommandOptions {
  output?: string;
  format: "summary" | "json";
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

const SEVERITY_ORDER: AuditSeverity[] = ["critical", "high", "medium", "low", "info"];

export const auditCommand = new Command("audit")
  .description("Run static audit and deterministic stress checks for a Solana project")
  .argument("[path]", "Path to the project directory or .rs file", ".")
  .option("-o, --output <file>", "Write output to file instead of stdout")
  .option("-f, --format <format>", "Output format: summary, json", "summary")
  .option("--include-tests", "Include tests/ directories in parser coverage")
  .option("--include-examples", "Include examples/ directories in parser coverage")
  .option("--include-benches", "Include benches/ directories in parser coverage")
  .option("--include-migrations", "Include migration/ and migrations/ directories in parser coverage")
  .option("--include-hidden", "Include hidden directories in parser coverage")
  .action(async (pathArg: string, options: AuditCommandOptions) => {
    if (!["summary", "json"].includes(options.format)) {
      console.error("Invalid format. Use one of: summary, json");
      process.exit(1);
    }

    try {
      const result = runAuditForPath(pathArg, options);
      const output =
        options.format === "json"
          ? JSON.stringify(
              {
                report: result.report,
                parseStats: result.parsed.stats,
                parserReport: result.parsed.report,
              },
              null,
              2,
            )
          : formatAuditSummary(result);

      if (options.output) {
        writeFileSync(options.output, output);
        console.log(`Output written to ${options.output}`);
      } else {
        console.log(output);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Audit failed: ${message}`);
      process.exit(1);
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

function formatAuditSummary(result: AuditCommandResult): string {
  const lines: string[] = [];
  const { report, parsed } = result;

  lines.push(`Score        : ${report.score}/100`);
  lines.push(`Findings     : ${report.findings.length}`);
  lines.push(
    `Severity     : ${SEVERITY_ORDER.map((severity) => `${severity}=${report.summary[severity]}`).join(", ")}`,
  );
  lines.push(`Stress cases : ${report.stressSummary.total}`);
  lines.push(`Framework    : ${parsed.report.framework}`);
  lines.push(`Files        : ${parsed.report.filesParsed} parsed, ${parsed.report.filesSkipped} skipped`);

  const topFindings = report.findings.slice(0, 8);
  if (topFindings.length > 0) {
    lines.push("");
    lines.push("Top findings:");
    for (const finding of topFindings) {
      const location = finding.location.instructionName
        ? ` (${finding.location.instructionName}${finding.location.accountName ? ` > ${finding.location.accountName}` : ""})`
        : "";
      lines.push(`  - [${finding.severity}] ${finding.ruleId}: ${finding.title}${location}`);
    }
  }

  const highSignalStress = report.stressTests
    .filter((test) => test.severity !== "info")
    .slice(0, 10);
  if (highSignalStress.length > 0) {
    lines.push("");
    lines.push("Deterministic stress:");
    for (const test of highSignalStress) {
      lines.push(`  - [${test.severity}] ${test.instructionName}: ${test.title} -> ${test.expected}`);
    }
  }

  if (report.findings.length === 0 && report.stressSummary.total === 0) {
    lines.push("");
    lines.push("No findings or deterministic stress cases were generated.");
  }

  return lines.join("\n");
}
