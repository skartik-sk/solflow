// Express server for standalone mode.
// Serves the static build from apps/standalone/out/ and provides REST API.

import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, resolve as pathResolve, relative } from "path";
import { execFile } from "child_process";
import { readConfig, getProjectPath, getConfigDir } from "../utils/config";
import { dirname } from "path";

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

    // PUT /api/project — save project data (flow JSON only, does NOT touch source files)
    app.put("/api/project", async (req, res) => {
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

    // POST /api/compile — key sync + build (does NOT overwrite source files)
    app.post("/api/compile", async (_req, res) => {
      try {
        const projectType = detectProjectType(options.projectPath);
        let prefix = "";

        // Sync keys so declare_id! matches keypairs
        prefix += await syncKeys(options.projectPath, projectType);

        const { cmd, args } = getCompileCommand(projectType);
        const output = await runCommand(cmd, args, options.projectPath);
        broadcast(wss, { type: "compile-done", success: output.exitCode === 0 });
        res.json({
          success: output.exitCode === 0,
          stdout: prefix + (output.stdout || ""),
          stderr: output.stderr,
          exitCode: output.exitCode,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Compile failed";
        res.status(500).json({ success: false, error: message, stdout: "", stderr: message });
      }
    });

    // POST /api/test — key sync + run tests (does NOT overwrite source files)
    app.post("/api/test", async (_req, res) => {
      try {
        const projectType = detectProjectType(options.projectPath);
        let prefix = "";

        prefix += await syncKeys(options.projectPath, projectType);

        const { cmd, args } = getTestCommand(projectType);
        const output = await runCommand(cmd, args, options.projectPath);
        broadcast(wss, { type: "test-done", success: output.exitCode === 0 });
        res.json({
          success: output.exitCode === 0,
          stdout: prefix + (output.stdout || ""),
          stderr: output.stderr,
          exitCode: output.exitCode,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Test failed";
        res.status(500).json({ success: false, error: message, stdout: "", stderr: message });
      }
    });

    // POST /api/sync — force codegen + key sync (for explicit two-way sync)
    app.post("/api/sync", async (_req, res) => {
      try {
        const projectType = detectProjectType(options.projectPath);
        const result = await codegenToDisk(options.projectPath);
        const keyMsg = await syncKeys(options.projectPath, projectType);
        res.json({ ok: true, written: result.written, errors: result.errors, keysSync: keyMsg });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Sync failed";
        res.status(400).json({ ok: false, written: 0, errors: [message] });
      }
    });

    // POST /api/deploy — key sync + build + deploy (does NOT overwrite source files)
    app.post("/api/deploy", async (req, res) => {
      try {
        const projectType = detectProjectType(options.projectPath);
        const network = (req.body?.network as string) || "localnet";
        let prefix = "";

        // Key sync
        prefix += await syncKeys(options.projectPath, projectType);

        // Build first (ensure .so is up to date with synced keys)
        const { cmd: buildCmd, args: buildArgs } = getCompileCommand(projectType);
        prefix += `[build] $ ${buildCmd} ${buildArgs.join(" ")}\n`;
        const buildOut = await runCommand(buildCmd, buildArgs, options.projectPath);
        if (buildOut.exitCode !== 0) {
          res.json({
            success: false,
            stdout: prefix + (buildOut.stdout || ""),
            stderr: buildOut.stderr || "Build failed — cannot deploy",
            exitCode: 1,
          });
          return;
        }
        prefix += "[build] Success\n";

        // Deploy
        prefix += `[deploy] Deploying to ${network}...\n`;
        const output = await deployProgram(options.projectPath, projectType, network);
        broadcast(wss, { type: "deploy-done", success: output.exitCode === 0 });
        res.json({
          success: output.exitCode === 0,
          stdout: prefix + (output.stdout || ""),
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
        const configFiles = ["Cargo.toml", "Anchor.toml", "Quasar.toml", "Xargo.toml", "rust-toolchain.toml"];
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
        const normalizedPath = pathResolve(options.projectPath, filePath);
        const projectRoot = pathResolve(options.projectPath) + "/";
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
      const { cmd: compileCmd, args: compileArgs } = getCompileCommand(projectType);
      const { cmd: testCmd, args: testArgs } = getTestCommand(projectType);
      res.json({
        projectType,
        projectPath: options.projectPath,
        name: config.name,
        framework: config.framework,
        buildCommand: `${compileCmd} ${compileArgs.join(" ")}`,
        testCommand: `${testCmd} ${testArgs.join(" ")}`,
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

      // Watch source files for changes (framework-aware)
      if (options.watch !== false) {
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

// Generate code from flow data and write files to disk.
// Returns { written: number, errors: string[] } or throws.
async function codegenToDisk(projectPath: string): Promise<{ written: number; errors: string[] }> {
  const pjPath = getProjectPath(projectPath);
  if (!existsSync(pjPath)) throw new Error("No project data found");

  const raw = JSON.parse(readFileSync(pjPath, "utf-8"));
  const nodes = raw.nodes;
  const edges = raw.edges;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error("No flow nodes — add instructions in the visual editor first");
  }

  const { flowToIR } = await import("@solflow/ir");
  const { generateCode } = await import("@solflow/codegen");

  const cfg = readConfig(projectPath);
  const validFrameworks = ["anchor", "pinocchio", "quasar"] as const;
  const framework = validFrameworks.includes(cfg.framework as typeof validFrameworks[number])
    ? cfg.framework as typeof validFrameworks[number]
    : "anchor";

  const ir = flowToIR(nodes, edges);
  const result = generateCode(ir, framework);

  if (result.errors.length > 0) {
    return { written: 0, errors: result.errors.map((e) => e.message) };
  }

  let written = 0;
  for (const file of result.files) {
    if (file.language !== "rust" && file.language !== "toml") continue;
    const absPath = pathResolve(projectPath, file.path);
    const dir = dirname(absPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(absPath, file.content, "utf-8");
    written++;
  }

  return { written, errors: [] };
}

function findStaticDir(): string | null {
  // Look for the standalone app build output relative to this package
  const candidates = [
    pathResolve(__dirname, "../../../apps/standalone/out"),
    pathResolve(__dirname, "../static"),
    pathResolve(__dirname, "../../static"),
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
  const projectType = detectProjectType(projectPath);

  // Determine which directories to watch based on framework
  let watchDirs: string[] = [];
  if (projectType === "anchor") {
    // Anchor: programs/*/src/
    const programsDir = join(projectPath, "programs");
    if (existsSync(programsDir)) {
      for (const pe of readdirSync(programsDir, { withFileTypes: true })) {
        if (pe.isDirectory() && existsSync(join(programsDir, pe.name, "src"))) {
          watchDirs.push(join(programsDir, pe.name, "src"));
        }
      }
    }
  } else if (projectType === "pinocchio") {
    // Pinocchio: programs/*/src/ or src/
    const programsDir = join(projectPath, "programs");
    if (existsSync(programsDir)) {
      for (const pe of readdirSync(programsDir, { withFileTypes: true })) {
        if (pe.isDirectory() && existsSync(join(programsDir, pe.name, "src"))) {
          watchDirs.push(join(programsDir, pe.name, "src"));
        }
      }
    }
    if (existsSync(join(projectPath, "src"))) {
      watchDirs.push(join(projectPath, "src"));
    }
  } else if (projectType === "quasar") {
    // Quasar: src/ or instructions/
    if (existsSync(join(projectPath, "src"))) {
      watchDirs.push(join(projectPath, "src"));
    }
  }

  // Fallback: if no framework-specific dirs found, watch src/ if it exists
  if (watchDirs.length === 0 && existsSync(join(projectPath, "src"))) {
    watchDirs.push(join(projectPath, "src"));
  }

  if (watchDirs.length === 0) return { close: () => Promise.resolve() };

  const watcher = chokidar.watch(watchDirs.length === 1 ? "**/*.rs" : "**/*.rs", {
    cwd: watchDirs.length === 1 ? watchDirs[0] : undefined,
    ignored: /node_modules|target/,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300 },
    ...(watchDirs.length > 1 ? {} : {}),
  });

  // For multiple watch dirs, add them all
  if (watchDirs.length > 1) {
    watcher.add(watchDirs.map((d) => join(d, "**/*.rs")));
  }

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

  console.log(`[watch] Watching ${watchDirs.length} directory(ies) for ${projectType} project`);

  return watcher;
}

// ─── Local command execution ───────────────────────────────────────────

type ProjectType = "anchor" | "pinocchio" | "quasar" | "unknown";

function detectProjectType(dir: string): ProjectType {
  try {
    // Anchor: Anchor.toml at root
    if (existsSync(join(dir, "Anchor.toml"))) return "anchor";

    // Quasar: Quasar.toml at root
    if (existsSync(join(dir, "Quasar.toml"))) return "quasar";

    // Scan programs/*/Cargo.toml for framework deps
    const programsDir = join(dir, "programs");
    if (existsSync(programsDir)) {
      for (const pe of readdirSync(programsDir, { withFileTypes: true })) {
        if (pe.isDirectory()) {
          try {
            const cargo = readFileSync(join(programsDir, pe.name, "Cargo.toml"), "utf-8");
            if (cargo.includes("anchor-lang")) return "anchor";
            if (cargo.includes("pinocchio")) return "pinocchio";
            if (cargo.includes("quasar-lang")) return "quasar";
          } catch { /* skip */ }
        }
      }
    }

    // Check root Cargo.toml
    if (existsSync(join(dir, "Cargo.toml"))) {
      const cargo = readFileSync(join(dir, "Cargo.toml"), "utf-8");
      if (cargo.includes("anchor-lang")) return "anchor";
      if (cargo.includes("pinocchio")) return "pinocchio";
      if (cargo.includes("quasar-lang")) return "quasar";
    }

    // Check workspace members for framework deps
    if (existsSync(join(dir, "Cargo.toml"))) {
      try {
        const cargo = readFileSync(join(dir, "Cargo.toml"), "utf-8");
        // If there's a workspace, scan member dirs
        const memberMatch = cargo.match(/members\s*=\s*\[([^\]]+)\]/);
        if (memberMatch) {
          const members = memberMatch[1].match(/"([^"]+)"/g)?.map((m) => m.replace(/"/g, "")) ?? [];
          for (const member of members) {
            const memberCargo = join(dir, member.replace("/*", ""), "Cargo.toml");
            // For glob members, try scanning
            if (member.includes("*")) {
              const parentDir = join(dir, member.replace("/*", ""));
              if (existsSync(parentDir)) {
                for (const pe of readdirSync(parentDir, { withFileTypes: true })) {
                  if (pe.isDirectory()) {
                    try {
                      const c = readFileSync(join(parentDir, pe.name, "Cargo.toml"), "utf-8");
                      if (c.includes("anchor-lang")) return "anchor";
                      if (c.includes("pinocchio")) return "pinocchio";
                      if (c.includes("quasar-lang")) return "quasar";
                    } catch { /* skip */ }
                  }
                }
              }
            } else if (existsSync(memberCargo)) {
              try {
                const c = readFileSync(memberCargo, "utf-8");
                if (c.includes("anchor-lang")) return "anchor";
                if (c.includes("pinocchio")) return "pinocchio";
                if (c.includes("quasar-lang")) return "quasar";
              } catch { /* skip */ }
            }
          }
        }
      } catch { /* skip */ }
    }
  } catch { /* ignore */ }
  return "unknown";
}

function getCompileCommand(projectType: ProjectType): { cmd: string; args: string[] } {
  switch (projectType) {
    case "anchor":
      return { cmd: "anchor", args: ["build"] };
    case "pinocchio":
      return { cmd: "cargo", args: ["build-sbf"] };
    case "quasar":
      return { cmd: "cargo", args: ["build-sbf"] };
    default:
      return { cmd: "cargo", args: ["build-sbf"] };
  }
}

function getTestCommand(projectType: ProjectType): { cmd: string; args: string[] } {
  switch (projectType) {
    case "anchor":
      return { cmd: "anchor", args: ["test"] };
    case "pinocchio":
      return { cmd: "cargo", args: ["test"] };
    case "quasar":
      return { cmd: "cargo", args: ["test"] };
    default:
      return { cmd: "cargo", args: ["test"] };
  }
}

// Sync program IDs from keypairs to declare_id! in source files.
// This prevents DeclaredProgramIdMismatch errors on deploy.
async function syncKeys(projectPath: string, projectType: ProjectType): Promise<string> {
  if (projectType === "anchor") {
    // Anchor has a built-in keys sync command
    const out = await runCommand("anchor", ["keys", "sync"], projectPath);
    if (out.exitCode === 0) {
      return "[keys] Synced program IDs from keypairs\n";
    }
    // anchor keys sync might not exist in older versions — fallback to manual sync
    return "[keys] anchor keys sync not available, skipping\n";
  }

  // For Pinocchio/Quasar: read keypair JSON, extract pubkey, patch declare_id!
  const programsDir = join(projectPath, "programs");
  const programDirs: string[] = [];

  if (existsSync(programsDir)) {
    for (const pe of readdirSync(programsDir, { withFileTypes: true })) {
      if (pe.isDirectory()) programDirs.push(pe.name);
    }
  }
  // Single-program layout (no programs/ dir)
  if (programDirs.length === 0 && existsSync(join(projectPath, "src", "lib.rs"))) {
    programDirs.push(".");
  }

  let synced = 0;
  for (const progDir of programDirs) {
    const isWorkspace = progDir !== ".";
    const basePath = isWorkspace ? join(programsDir, progDir) : projectPath;

    // Find keypair file
    const keypairPaths = [
      join(projectPath, "target", "deploy", `${progDir === "." ? readPackageName(basePath) : progDir}-keypair.json`),
      join(projectPath, "target", "sbf-solana-solana", "release", `${progDir === "." ? readPackageName(basePath) : progDir}-keypair.json`),
    ];

    let keypairPath: string | null = null;
    for (const kp of keypairPaths) {
      if (existsSync(kp)) { keypairPath = kp; break; }
    }

    if (!keypairPath) continue;

    try {
      const keypairData = JSON.parse(readFileSync(keypairPath, "utf-8"));
      const publicKey = keypairData.publicKey || Buffer.from(keypairData).slice(32).toString("base64");
      // Keypair is byte array — public key is last 32 bytes
      const bytes = Array.isArray(keypairData) ? keypairData : keypairData.secretKey;
      if (!bytes) continue;
      const pubKeyBytes = bytes.slice(32);
      const programId = bs58Encode(pubKeyBytes);

      if (!programId) continue;

      // Patch declare_id! in lib.rs
      const libRsPath = join(basePath, "src", "lib.rs");
      if (existsSync(libRsPath)) {
        let content = readFileSync(libRsPath, "utf-8");
        const updated = content.replace(
          /declare_id!\("([^"]+)"\)/g,
          `declare_id!("${programId}")`
        );
        if (content !== updated) {
          writeFileSync(libRsPath, updated, "utf-8");
          synced++;
        }
      }
    } catch { /* skip */ }
  }

  return synced > 0 ? `[keys] Synced ${synced} program ID(s)\n` : "[keys] No keypairs found to sync\n";
}

function readPackageName(dir: string): string {
  try {
    const cargo = readFileSync(join(dir, "Cargo.toml"), "utf-8");
    const match = cargo.match(/name\s*=\s*"([^"]+)"/);
    return match ? match[1].replace(/-/g, "_") : "unknown";
  } catch {
    return "unknown";
  }
}

// Find the compiled .so file for deployment
function findSoFile(projectPath: string, projectType: ProjectType): string | null {
  const searchDirs = [
    join(projectPath, "target", "deploy"),
    join(projectPath, "target", "sbf-solana-solana", "release"),
  ];

  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    try {
      for (const f of readdirSync(dir)) {
        if (f.endsWith(".so") && !f.endsWith("-debug.so")) {
          return join(dir, f);
        }
      }
    } catch { /* skip */ }
  }
  return null;
}

function bs58Encode(bytes: number[]): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = BigInt(0);
  for (const b of bytes) {
    num = num * 256n + BigInt(b);
  }
  let result = "";
  while (num > 0) {
    result = ALPHABET[Number(num % 58n)] + result;
    num = num / 58n;
  }
  // Count leading zero bytes
  for (const b of bytes) {
    if (b === 0) result = "1" + result;
    else break;
  }
  return result;
}

async function deployProgram(
  projectPath: string,
  projectType: ProjectType,
  network: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const validNetworks = ["localnet", "devnet", "testnet", "mainnet"];
  const safeNetwork = validNetworks.includes(network) ? network : "localnet";
  const clusterArg = safeNetwork === "localnet" ? "localnet" : safeNetwork;
  const urlArg = safeNetwork === "localnet" ? "localhost" : safeNetwork;

  if (projectType === "anchor") {
    // Anchor deploy handles everything — just run it
    return runCommand("anchor", ["deploy", "--provider.cluster", clusterArg], projectPath);
  }

  // Pinocchio/Quasar: find the .so file and deploy manually
  const soFile = findSoFile(projectPath, projectType);
  if (!soFile) {
    return {
      stdout: "",
      stderr: "No compiled .so file found. Run Compile first.",
      exitCode: 1,
    };
  }

  // Find keypair for the program
  const soName = soFile.split("/").pop()!.replace(".so", "");
  const keypairPaths = [
    join(projectPath, "target", "deploy", `${soName}-keypair.json`),
    join(projectPath, "target", "sbf-solana-solana", "release", `${soName}-keypair.json`),
  ];

  let keypairFile: string | null = null;
  for (const kp of keypairPaths) {
    if (existsSync(kp)) { keypairFile = kp; break; }
  }

  const args = ["program", "deploy", "--url", urlArg, "--program-path", soFile];
  if (keypairFile) {
    args.push("--program-id", keypairFile);
  }

  return runCommand("solana", args, projectPath);
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
