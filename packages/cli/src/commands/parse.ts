// Parse command — parse Rust source or IDL and output structured data.

import { Command } from "commander";
import { resolve, extname } from "path";
import { existsSync, statSync, writeFileSync } from "fs";
import { parseProgram, parseFile, type SourceCoverageOptions } from "@solflow/rust-parser";

interface ParseCommandOptions {
  output?: string;
  format: string;
  includeTests?: boolean;
  includeExamples?: boolean;
  includeBenches?: boolean;
  includeMigrations?: boolean;
  includeHidden?: boolean;
}

export const parseCommand = new Command("parse")
  .description("Parse a Solana project and output structured data")
  .argument("[path]", "Path to the project directory or .rs file", ".")
  .option("-o, --output <file>", "Write output to file instead of stdout")
  .option("-f, --format <format>", "Output format: json, ir, summary", "json")
  .option("--include-tests", "Include tests/ directories in parser coverage")
  .option("--include-examples", "Include examples/ directories in parser coverage")
  .option("--include-benches", "Include benches/ directories in parser coverage")
  .option("--include-migrations", "Include migration/ and migrations/ directories in parser coverage")
  .option("--include-hidden", "Include hidden directories in parser coverage")
  .action(async (pathArg: string, options: ParseCommandOptions) => {
    const resolvedPath = resolve(pathArg);

    if (!existsSync(resolvedPath)) {
      console.error(`Path does not exist: ${resolvedPath}`);
      process.exit(1);
    }

    const validFormats = ["json", "ir", "summary"];
    if (!validFormats.includes(options.format)) {
      console.error(`Invalid format: ${options.format}. Use one of: ${validFormats.join(", ")}`);
      process.exit(1);
    }

    try {
      const stat = statSync(resolvedPath);
      const isFile = stat.isFile();
      const isRsFile = isFile && extname(resolvedPath) === ".rs";

      const result = isRsFile
        ? parseFile(resolvedPath)
        : parseProgram(resolvedPath, { sourceCoverage: coverageOptions(options) });

      if (options.format === "summary") {
        outputSummary(result);
      } else if (options.format === "ir") {
        const { flowToIR } = await import("@solflow/ir");
        const ir = flowToIR(result.nodes, result.edges);
        const json = JSON.stringify(ir, null, 2);
        if (options.output) {
          writeFileSync(options.output, json);
          console.log(`Output written to ${options.output}`);
        } else {
          console.log(json);
        }
      } else {
        const json = JSON.stringify(
          { nodes: result.nodes, edges: result.edges, stats: result.stats, warnings: result.warnings, report: result.report },
          null,
          2,
        );

        if (options.output) {
          writeFileSync(options.output, json);
          console.log(`Output written to ${options.output}`);
        } else {
          console.log(json);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error parsing project: ${message}`);
      process.exit(1);
    }
  });

function coverageOptions(options: ParseCommandOptions): SourceCoverageOptions | undefined {
  const coverage = {
    includeTests: options.includeTests,
    includeExamples: options.includeExamples,
    includeBenches: options.includeBenches,
    includeMigrations: options.includeMigrations,
    includeHidden: options.includeHidden,
  };
  return Object.values(coverage).some(Boolean) ? coverage : undefined;
}

function outputSummary(result: import("@solflow/rust-parser").ParseResult): void {
  const { stats } = result;
  console.log(`Instructions : ${stats.instructions}`);
  console.log(`Accounts     : ${stats.accounts}`);
  console.log(`States       : ${stats.states}`);
  console.log(`Errors       : ${stats.errors}`);
  console.log(`Events       : ${stats.events}`);
  console.log(`Logic ops    : ${stats.logicOps}`);
  console.log(`Nodes        : ${result.nodes.length}`);
  console.log(`Edges        : ${result.edges.length}`);
  console.log(`Framework    : ${result.report.framework}`);
  console.log(`Confidence   : ${result.report.confidence}`);
  console.log(`Files        : ${result.report.filesParsed} parsed, ${result.report.filesSkipped} skipped`);

  if (result.report.unsupportedConstructs.length > 0) {
    console.log(`\nManual review:`);
    for (const item of result.report.unsupportedConstructs) {
      console.log(`  - ${item}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log(`\nWarnings:`);
    for (const w of result.warnings) {
      console.log(`  - ${w}`);
    }
  }
}
