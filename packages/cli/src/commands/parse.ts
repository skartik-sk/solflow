// Parse command — parse Rust source or IDL and output structured data.

import { Command } from "commander";
import { resolve, extname } from "path";
import { existsSync, statSync, writeFileSync } from "fs";
import { parseProgram, parseFile } from "@solflow/rust-parser";

export const parseCommand = new Command("parse")
  .description("Parse a Solana project and output structured data")
  .argument("[path]", "Path to the project directory or .rs file", ".")
  .option("-o, --output <file>", "Write output to file instead of stdout")
  .option("-f, --format <format>", "Output format: json, summary", "json")
  .action((pathArg: string, options: { output?: string; format: string }) => {
    const resolvedPath = resolve(pathArg);

    if (!existsSync(resolvedPath)) {
      console.error(`Path does not exist: ${resolvedPath}`);
      process.exit(1);
    }

    try {
      const stat = statSync(resolvedPath);
      const isFile = stat.isFile();
      const isRsFile = isFile && extname(resolvedPath) === ".rs";

      const result = isRsFile
        ? parseFile(resolvedPath)
        : parseProgram(resolvedPath);

      if (options.format === "summary") {
        outputSummary(result);
      } else {
        const json = JSON.stringify(
          { nodes: result.nodes, edges: result.edges, stats: result.stats, warnings: result.warnings },
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

  if (result.warnings.length > 0) {
    console.log(`\nWarnings:`);
    for (const w of result.warnings) {
      console.log(`  - ${w}`);
    }
  }
}
