// Express server for standalone mode.
// Serves the static build from apps/standalone/out/ and provides REST API.

import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";
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
    app.use(cors());
    app.use(express.json({ limit: "50mb" }));

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
        const ir = flowToIR(nodes, edges);
        const result = generateCode(ir, config.framework as "anchor" | "pinocchio" | "quasar");

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
  const msg = JSON.stringify(data);
  for (const client of [...wss.clients]) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

function findStaticDir(): string | null {
  // Look for the standalone app build output relative to this package
  const candidates = [
    resolve(__dirname, "../../../apps/standalone/out"),
    resolve(__dirname, "../static"),
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
