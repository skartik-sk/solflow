// Express server for standalone mode.
// Serves the static build from apps/standalone/out/ and provides REST API.

import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, resolve, relative } from "path";
import { execFile } from "child_process";
import { readConfig, getProjectPath, getConfigDir } from "../utils/config";

export interface ServerOptions {
  port: number;
  projectPath: string;
  staticDir?: string;
  watch?: boolean;
}

export interface ServerHandle {
  close: () => Promise<void>;
}

export function startServer(options: ServerOptions): Promise<ServerHandle> {
  return new Promise((resolve, reject) => {
    const app = express();
    app.use(cors({ origin: /^http:\/\/localhost:\d+$/ }));
    app.use(express.json({ limit: "5mb" }));

    const config = readConfig(options.projectPath);
    const projectJsonPath = getProjectPath(options.projectPath);

    // ─── REST API Routes ───────────────────────────────────────────────

    // GET /api/project — load project data
    app.get("/api/project", (_req, res) => {
      try {
        if (existsSync(projectJsonPath)) {
          const data = readFileSync(projectJsonPath, "utf-8");
          res.json(JSON.parse(data));
        } else {
          res.json({ nodes: [], edges: [], name: config.name, framework: config.framework });
        }
      } catch (err) {
        res.status(500).json({ error: "Failed to load project" });
      }
    });

    // PUT /api/project — save project data
    app.put("/api/project", (req, res) => {
      try {
        const body = req.body;
        if (!body || typeof body !== "object" || body === null) {
          res.status(400).json({ error: "Invalid project data" });
          return;
        }
        const configDir = getConfigDir(options.projectPath);
        if (!existsSync(configDir)) {
          mkdirSync(configDir, { recursive: true });
        }
        writeFileSync(projectJsonPath, JSON.stringify(req.body, null, 2));
        res.json({ ok: true });

        // Notify WebSocket clients
        broadcast(wss, { type: "project-saved", timestamp: Date.now() });
      } catch (err) {
        res.status(500).json({ error: "Failed to save project" });
      }
    });

    // POST /api/codegen — generate code from flow data
    app.post("/api/codegen", async (req, res) => {
      try {
        const { flowToIR } = await import("@solflow/ir");
        const { generateCode } = await import("@solflow/codegen");

        const { nodes, edges } = req.body;
        if (!Array.isArray(nodes) || !Array.isArray(edges)) {
          res.status(400).json({ error: "nodes and edges must be arrays" });
          return;
        }
        const ir = flowToIR(nodes, edges);
        const validFrameworks = ["anchor", "pinocchio", "quasar"] as const;
        const framework = validFrameworks.includes(config.framework as typeof validFrameworks[number])
          ? config.framework as typeof validFrameworks[number]
          : "anchor";
        const result = generateCode(ir, framework);

        res.json({
          files: result.files.map((f) => ({ path: f.path, content: f.content, language: f.language })),
          errors: result.errors,
          warnings: result.warnings,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Codegen failed";
        res.status(400).json({ error: message, files: [], errors: [{ message }], warnings: [] });
      }
    });

    // POST /api/audit — run security audit
    app.post("/api/audit", async (req, res) => {
      try {
        const { flowToIR } = await import("@solflow/ir");
        const { runInstantAudit } = await import("@solflow/audit");

        const { nodes, edges } = req.body;
        if (!Array.isArray(nodes) || !Array.isArray(edges)) {
          res.status(400).json({ error: "nodes and edges must be arrays" });
          return;
        }
        const ir = flowToIR(nodes, edges);
        const report = runInstantAudit(ir);

        res.json(report);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Audit failed";
        res.status(400).json({ error: message });
      }
    });

    // POST /api/parse — re-parse .rs files
    app.post("/api/parse", async (req, res) => {
      try {
        const { parseProgram } = await import("@solflow/rust-parser");

        const result = parseProgram(options.projectPath);

        // Ensure config dir exists before saving
        const configDir = getConfigDir(options.projectPath);
        if (!existsSync(configDir)) {
          mkdirSync(configDir, { recursive: true });
        }

        // Save parsed result as project data
        writeFileSync(projectJsonPath, JSON.stringify({
          nodes: result.nodes,
          edges: result.edges,
          stats: result.stats,
        }, null, 2));

        res.json({
          nodes: result.nodes,
          edges: result.edges,
          stats: result.stats,
          warnings: result.warnings,
        });

        // Notify WebSocket clients
        broadcast(wss, { type: "flow-updated", nodes: result.nodes.length, edges: result.edges.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Parse failed";
        res.status(400).json({ error: message });
      }
    });

    // POST /api/compile — run build locally
    app.post("/api/compile", async (_req, res) => {
      try {
        const projectType = detectProjectType(options.projectPath);
        const { cmd, args } = getCompileCommand(projectType);
        const output = await runCommand(cmd, args, options.projectPath);
        broadcast(wss, { type: "compile-done", success: output.exitCode === 0 });
        res.json({
          success: output.exitCode === 0,
          stdout: output.stdout,
          stderr: output.stderr,
          exitCode: output.exitCode,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Compile failed";
        res.status(500).json({ success: false, error: message, stdout: "", stderr: message });
      }
    });

    // POST /api/test — run tests locally
    app.post("/api/test", async (_req, res) => {
      try {
        const projectType = detectProjectType(options.projectPath);
        const { cmd, args } = getTestCommand(projectType);
        const output = await runCommand(cmd, args, options.projectPath);
        broadcast(wss, { type: "test-done", success: output.exitCode === 0 });
        res.json({
          success: output.exitCode === 0,
          stdout: output.stdout,
          stderr: output.stderr,
          exitCode: output.exitCode,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Test failed";
        res.status(500).json({ success: false, error: message, stdout: "", stderr: message });
      }
    });

    // POST /api/deploy — deploy to local cluster
    app.post("/api/deploy", async (req, res) => {
      try {
        const projectType = detectProjectType(options.projectPath);
        const network = (req.body?.network as string) || "localnet";
        const { cmd, args } = getDeployCommand(projectType, network);
        const output = await runCommand(cmd, args, options.projectPath);
        broadcast(wss, { type: "deploy-done", success: output.exitCode === 0 });
        res.json({
          success: output.exitCode === 0,
          stdout: output.stdout,
          stderr: output.stderr,
          exitCode: output.exitCode,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Deploy failed";
        res.status(500).json({ success: false, error: message, stdout: "", stderr: message });
      }
    });

    // GET /api/source — read all project source files (.rs, Cargo.toml, Anchor.toml)
    app.get("/api/source", (_req, res) => {
      try {
        const files: { path: string; content: string; language: string }[] = [];

        // Read .rs files
        const rsFiles = findProjectRustFiles(options.projectPath);
        for (const absPath of rsFiles) {
          try {
            const content = readFileSync(absPath, "utf-8");
            files.push({
              path: relative(options.projectPath, absPath),
              content,
              language: "rust",
            });
          } catch { /* skip unreadable */ }
        }

        // Read config files
        const configFiles = ["Cargo.toml", "Anchor.toml", "Xargo.toml"];
        for (const cf of configFiles) {
          const absPath = join(options.projectPath, cf);
          if (existsSync(absPath)) {
            try {
              files.push({
                path: cf,
                content: readFileSync(absPath, "utf-8"),
                language: "toml",
              });
            } catch { /* skip */ }
          }
        }

        // Also check programs/*/Cargo.toml
        const programsDir = join(options.projectPath, "programs");
        if (existsSync(programsDir)) {
          try {
            for (const pe of readdirSync(programsDir, { withFileTypes: true })) {
              if (pe.isDirectory()) {
                const cargoPath = join(programsDir, pe.name, "Cargo.toml");
                if (existsSync(cargoPath)) {
                  files.push({
                    path: `programs/${pe.name}/Cargo.toml`,
                    content: readFileSync(cargoPath, "utf-8"),
                    language: "toml",
                  });
                }
              }
            }
          } catch { /* skip */ }
        }

        res.json({ files });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to read source files";
        res.status(500).json({ error: message, files: [] });
      }
    });

    // PUT /api/source — write edited file back to disk + trigger re-parse
    app.put("/api/source", async (req, res) => {
      try {
        const { path: filePath, content } = req.body;
        if (!filePath || typeof filePath !== "string" || typeof content !== "string") {
          res.status(400).json({ error: "path and content required" });
          return;
        }

        // Safety: only allow writing to .rs and .toml files, no path traversal
        const normalizedPath = resolve(options.projectPath, filePath);
        const projectRoot = resolve(options.projectPath) + "/";
        if (!normalizedPath.startsWith(projectRoot) && normalizedPath !== projectRoot.slice(0, -1)) {
          res.status(403).json({ error: "Path traversal not allowed" });
          return;
        }
        if (!normalizedPath.endsWith(".rs") && !normalizedPath.endsWith(".toml")) {
          res.status(400).json({ error: "Only .rs and .toml files can be edited" });
          return;
        }

        writeFileSync(normalizedPath, content, "utf-8");

        // Re-parse and return updated flow
        const { parseProgram } = await import("@solflow/rust-parser");
        const result = parseProgram(options.projectPath);

        const configDir = getConfigDir(options.projectPath);
        if (!existsSync(configDir)) {
          mkdirSync(configDir, { recursive: true });
        }
        writeFileSync(projectJsonPath, JSON.stringify({
          nodes: result.nodes,
          edges: result.edges,
          stats: result.stats,
        }, null, 2));

        broadcast(wss, {
          type: "flow-updated",
          nodes: result.nodes.length,
          edges: result.edges.length,
          trigger: "source-edit",
        });

        res.json({
          ok: true,
          nodes: result.nodes,
          edges: result.edges,
          stats: result.stats,
          warnings: result.warnings,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save source file";
        res.status(500).json({ ok: false, error: message });
      }
    });

    // GET /api/status — project type and tool availability
    app.get("/api/status", (_req, res) => {
      const projectType = detectProjectType(options.projectPath);
      res.json({
        projectType,
        projectPath: options.projectPath,
        name: config.name,
        framework: config.framework,
      });
    });

    // ─── Serve static files ────────────────────────────────────────────

    const staticDir = options.staticDir || findStaticDir();
    if (staticDir && existsSync(staticDir)) {
      app.use(express.static(staticDir));
      // SPA fallback — serve index.html for all unmatched routes
      app.get("/{*path}", (_req, res) => {
        const indexPath = join(staticDir, "index.html");
        if (existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(404).send("Not found");
        }
      });
    } else {
      app.get("/{*path}", (_req, res) => {
        res.status(404).json({ error: "No static build found. Run `solstudio build` first." });
      });
    }

    // ─── HTTP + WebSocket server ────────────────────────────────────────

    const server = createServer(app);
    const wss = new WebSocketServer({ server, path: "/ws" });

    wss.on("connection", (ws) => {
      ws.send(JSON.stringify({ type: "connected", port: options.port }));
    });

    let watcher: { close: () => Promise<void> } | undefined;

    server.listen(options.port, async () => {
      // Auto-parse on startup if project.json is empty or missing
      try {
        const hasData = existsSync(projectJsonPath)
          && (() => { try { const d = JSON.parse(readFileSync(projectJsonPath, "utf-8")); return Array.isArray(d.nodes) && d.nodes.length > 0; } catch { return false; } })();
        if (!hasData) {
          console.log("[init] No parsed data found — running initial parse...");
          const { parseProgram } = await import("@solflow/rust-parser");
          const result = parseProgram(options.projectPath);
          const configDir = getConfigDir(options.projectPath);
          if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
          writeFileSync(projectJsonPath, JSON.stringify({
            nodes: result.nodes, edges: result.edges, stats: result.stats,
          }, null, 2));
          console.log(`[init] Parsed: ${result.nodes.length} nodes, ${result.edges.length} edges`);
        }
      } catch (err) {
        console.error("[init] Initial parse failed:", err instanceof Error ? err.message : err);
      }

      // Only watch if src/ exists
      if (options.watch !== false && existsSync(join(options.projectPath, "src"))) {
        try {
          watcher = await createWatcher(options.projectPath, wss, projectJsonPath);
        } catch (err) {
          console.error("[watch] Failed to start file watcher:", err);
        }
      }

      resolve({
        close: () => new Promise<void>((res, rej) => {
          const closeServer = () => server.close((err) => err ? rej(err) : res());
          if (watcher) {
            watcher.close().then(closeServer).catch(closeServer);
          } else {
            closeServer();
          }
        }),
      });
    });

    server.on("error", reject);
  });
}

function broadcast(wss: WebSocketServer, data: unknown): void {
  try {
    const msg = JSON.stringify(data);
    for (const client of [...wss.clients]) {
      if (client.readyState === WebSocket.OPEN) {
        try { client.send(msg); } catch { /* client disconnected */ }
      }
    }
  } catch { /* serialization failed */ }
}

function findStaticDir(): string | null {
  // Look for the standalone app build output relative to this package
  const candidates = [
    resolve(__dirname, "../../../apps/standalone/out"),
    resolve(__dirname, "../static"),
    resolve(__dirname, "../../static"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return null;
}

async function createWatcher(
  projectPath: string,
  wss: WebSocketServer,
  projectJsonPath: string,
) {
  const chokidar = await import("chokidar");
  const srcDir = join(projectPath, "src");

  const watcher = chokidar.watch("**/*.rs", {
    cwd: srcDir,
    ignored: /node_modules/,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300 },
  });

  const onChange = async (label: string) => {
    console.log(`[watch] ${label} — re-parsing...`);
    try {
      const { parseProgram } = await import("@solflow/rust-parser");
      const result = parseProgram(projectPath);

      const configDir = getConfigDir(projectPath);
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      writeFileSync(projectJsonPath, JSON.stringify({
        nodes: result.nodes,
        edges: result.edges,
        stats: result.stats,
      }, null, 2));

      broadcast(wss, {
        type: "flow-updated",
        nodes: result.nodes.length,
        edges: result.edges.length,
        trigger: label,
      });
      console.log(`[watch] ${label} — ${result.nodes.length} nodes, ${result.edges.length} edges`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[watch] ${label} — parse error: ${msg}`);
      broadcast(wss, { type: "parse-error", error: msg });
    }
  };

  watcher.on("add", (path: string) => onChange(`added ${path}`));
  watcher.on("change", (path: string) => onChange(`changed ${path}`));
  watcher.on("unlink", (path: string) => onChange(`removed ${path}`));

  return watcher;
}

// ─── Local command execution ───────────────────────────────────────────

function detectProjectType(dir: string): string {
  try {
    if (existsSync(join(dir, "Anchor.toml"))) return "anchor";
    const programsDir = join(dir, "programs");
    if (existsSync(programsDir)) {
      for (const pe of readdirSync(programsDir, { withFileTypes: true })) {
        if (pe.isDirectory()) {
          try {
            const cargo = readFileSync(join(programsDir, pe.name, "Cargo.toml"), "utf-8");
            if (cargo.includes("anchor-lang")) return "anchor";
            if (cargo.includes("pinocchio")) return "pinocchio";
          } catch { /* skip */ }
        }
      }
    }
    if (existsSync(join(dir, "Cargo.toml"))) {
      const cargo = readFileSync(join(dir, "Cargo.toml"), "utf-8");
      if (cargo.includes("anchor-lang")) return "anchor";
      if (cargo.includes("pinocchio")) return "pinocchio";
    }
  } catch { /* ignore */ }
  return "unknown";
}

function getCompileCommand(projectType: string): { cmd: string; args: string[] } {
  switch (projectType) {
    case "anchor":
      return { cmd: "anchor", args: ["build"] };
    case "pinocchio":
      return { cmd: "cargo", args: ["build-sbf"] };
    default:
      return { cmd: "cargo", args: ["build-sbf"] };
  }
}

function getTestCommand(projectType: string): { cmd: string; args: string[] } {
  switch (projectType) {
    case "anchor":
      return { cmd: "anchor", args: ["test"] };
    case "pinocchio":
      return { cmd: "cargo", args: ["test"] };
    default:
      return { cmd: "cargo", args: ["test"] };
  }
}

function getDeployCommand(projectType: string, network: string): { cmd: string; args: string[] } {
  const validNetworks = ["localnet", "devnet", "testnet", "mainnet"];
  const safeNetwork = validNetworks.includes(network) ? network : "localnet";
  const clusterArg = safeNetwork === "localnet" ? "localnet" : safeNetwork;
  const urlArg = safeNetwork === "localnet" ? "localhost" : safeNetwork;

  switch (projectType) {
    case "anchor":
      return { cmd: "anchor", args: ["deploy", "--provider.cluster", clusterArg] };
    default:
      return { cmd: "solana", args: ["program", "deploy", "--url", urlArg] };
  }
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = execFile(cmd, args, { cwd, timeout: 120_000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        stdout: stdout || "",
        stderr: stderr || "",
        exitCode: err ? (err as NodeJS.ErrnoException).code === "ENOENT" ? -1 : 1 : 0,
      });
    });
    if (proc) {
      proc.on("error", () => {
        resolve({ stdout: "", stderr: `Command not found: ${cmd}`, exitCode: -1 });
      });
    }
  });
}

const SKIP_DIRS = new Set(["target", "node_modules", "tests", "benches", "examples", "migration", ".git"]);

function findProjectRustFiles(dir: string): string[] {
  const files: string[] = [];
  function walk(current: string, depth: number): void {
    if (depth > 10) return;
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) walk(fullPath, depth + 1);
      else if (entry.name.endsWith(".rs")) {
        try { if (statSync(fullPath).isFile()) files.push(fullPath); } catch { /* skip */ }
      }
    }
  }
  walk(dir, 0);
  return files.sort();
}
