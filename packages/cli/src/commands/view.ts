// View command — start local server and open browser.

import { Command } from "commander";
import { resolve, basename } from "path";
import { startServer } from "../server/index";
import { readConfig, writeConfig, isInitialized } from "../utils/config";
import { detectProjectType } from "../utils/detect";
import { openBrowser } from "../utils/browser";

export const viewCommand = new Command("view")
  .description("Start local server and open visualizer in browser")
  .argument("[path]", "Path to the project directory", ".")
  .option("-p, --port <port>", "Server port", "6139")
  .option("--no-open", "Don't open browser automatically")
  .action(async (pathArg: string, options: { port: string; open: boolean }) => {
    const resolvedPath = resolve(pathArg);
    const port = parseInt(options.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(`Invalid port: ${options.port}. Must be between 1 and 65535.`);
      process.exit(1);
    }

    // Initialize config if not already done
    if (!isInitialized(resolvedPath)) {
      const projectType = detectProjectType(resolvedPath);
      writeConfig(resolvedPath, {
        name: basename(resolvedPath),
        framework: projectType === "pinocchio" ? "pinocchio" : "anchor",
        mode: projectType === "unknown" ? "editor" : "rust",
        port,
      });
    }

    const config = readConfig(resolvedPath);

    console.log(`Starting SolStudio server on port ${port}...`);
    console.log(`Project: ${resolvedPath}`);
    console.log(`Framework: ${config.framework}`);
    console.log(`Mode: ${config.mode}`);

    try {
      await startServer({
        port,
        projectPath: resolvedPath,
      });

      const url = `http://localhost:${port}`;
      console.log(`\n  SolStudio running at ${url}`);

      if (options.open) {
        try {
          await openBrowser(url);
          console.log("  Opened in browser.");
        } catch {
          console.log(`  Open ${url} in your browser.`);
        }
      }

      // Keep process alive
      process.on("SIGINT", () => {
        console.log("\nShutting down...");
        process.exit(0);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("EADDRINUSE")) {
        console.error(`Port ${port} is already in use. Try a different port with --port.`);
      } else {
        console.error(`Failed to start server: ${message}`);
      }
      process.exit(1);
    }
  });
