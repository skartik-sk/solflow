// IDL command — parse an IDL JSON file and output flow data.

import { Command } from "commander";
import { resolve } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { idlToFlow } from "@solflow/idl-import";

export const idlCommand = new Command("idl")
  .description("Parse an IDL JSON file and output flow data")
  .argument("<path>", "Path to the IDL JSON file")
  .option("-o, --output <file>", "Write output to file instead of stdout")
  .option("-f, --format <format>", "Output format: json, summary", "json")
  .action((pathArg: string, options: { output?: string; format: string }) => {
    const resolvedPath = resolve(pathArg);

    if (!existsSync(resolvedPath)) {
      console.error(`File does not exist: ${resolvedPath}`);
      process.exit(1);
    }

    try {
      const raw = readFileSync(resolvedPath, "utf-8");
      const idl = JSON.parse(raw);

      // Basic IDL structure validation
      if (typeof idl !== "object" || idl === null) {
        throw new Error("IDL must be a JSON object");
      }
      const hasInstructions = Array.isArray(idl.instructions) || Array.isArray(idl.ix);
      if (!hasInstructions && !idl.name && !idl.version) {
        console.error("Warning: File doesn't look like a standard Solana IDL (no instructions array found)");
      }

      const result = idlToFlow(idl);

      if (options.format === "summary") {
        console.log(`Format       : ${result.format}`);
        console.log(`Instructions : ${result.stats.instructions}`);
        console.log(`Accounts     : ${result.stats.accounts}`);
        console.log(`Errors       : ${result.stats.errors}`);
        console.log(`Events       : ${result.stats.events}`);
        console.log(`Nodes        : ${result.nodes.length}`);
        console.log(`Edges        : ${result.edges.length}`);
      } else {
        const json = JSON.stringify(
          { nodes: result.nodes, edges: result.edges, format: result.format, stats: result.stats },
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
      console.error(`Error parsing IDL: ${message}`);
      process.exit(1);
    }
  });
