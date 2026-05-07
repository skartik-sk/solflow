// Express server for standalone mode.
// Serves the static build from apps/standalone/out/ and provides REST API.

import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { dirname, join, resolve as pathResolve, relative } from "path";
import { execFile } from "child_process";
import { readConfig, getProjectPath, getConfigDir } from "../utils/config";
import { detectProjectType, type ProjectType } from "../utils/detect";
import {
  getFrameworkAdapter,
  resolveCodegenFramework,
  resolveFrameworkTestPlan,
  type FrameworkAdapter,
} from "../utils/framework-adapters";
import { fileURLToPath } from "url";
import type { SourceCoverageOptions } from "@solflow/rust-parser";

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
        const framework = resolveCodegenFramework(config.framework);
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
          report: result.report,
        }, null, 2));

        res.json({
          nodes: result.nodes,
          edges: result.edges,
          stats: result.stats,
          warnings: result.warnings,
          report: result.report,
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
        const adapter = getFrameworkAdapter(projectType);
        if (!adapter.compileCommand) {
          throw new Error(`${adapter.label} projects cannot be compiled from the CLI visualizer yet.`);
        }
        let prefix = "";

        // Sync keys so declare_id! matches keypairs
        prefix += await syncKeys(options.projectPath, adapter);

        const { cmd, args } = adapter.compileCommand;
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
        const adapter = getFrameworkAdapter(projectType);
        let prefix = "";

        prefix += await syncKeys(options.projectPath, adapter);

        const testPlan = resolveFrameworkTestPlan(projectType, options.projectPath);
        let setupOutput = "";
        if (testPlan.setupCommand) {
          const setup = testPlan.setupCommand;
          const result = await runCommand(setup.cmd, setup.args, setup.cwd ?? options.projectPath);
          setupOutput = result.stdout || result.stderr
            ? [
                `$ ${setup.cmd} ${setup.args.join(" ")}`,
                result.stdout,
                result.stderr,
              ].filter(Boolean).join("\n")
            : "";
          if (result.exitCode !== 0) {
            if (testPlan.runtime === "surfpool" && isBenignSurfpoolStartFailure(setupOutput)) {
              setupOutput = [
                setupOutput,
                "[surfpool] Existing simnet appears to be running; continuing with project tests.",
              ].filter(Boolean).join("\n");
            } else {
              broadcast(wss, { type: "test-done", success: false });
              res.json({
                success: false,
                stdout: prefix + setupOutput,
                stderr: result.stderr,
                exitCode: result.exitCode,
                runtime: testPlan.runtime,
              });
              return;
            }
          }
        }

        const { cmd, args, cwd } = testPlan.testCommand;
        const output = await runCommand(cmd, args, cwd ?? options.projectPath);
        broadcast(wss, { type: "test-done", success: output.exitCode === 0 });
        res.json({
          success: output.exitCode === 0,
          stdout: [prefix, setupOutput, output.stdout].filter(Boolean).join("\n"),
          stderr: output.stderr,
          exitCode: output.exitCode,
          runtime: testPlan.runtime,
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
        const adapter = getFrameworkAdapter(projectType);
        const result = await codegenToDisk(options.projectPath);
        const keyMsg = await syncKeys(options.projectPath, adapter);
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
        const adapter = getFrameworkAdapter(projectType);
        if (!adapter.compileCommand || adapter.deploy === "unsupported") {
          throw new Error(`${adapter.label} projects cannot be deployed from the CLI visualizer yet.`);
        }
        const network = (req.body?.network as string) || "localnet";
        let prefix = "";

        // Key sync
        prefix += await syncKeys(options.projectPath, adapter);

        // Build first (ensure .so is up to date with synced keys)
        const { cmd: buildCmd, args: buildArgs } = adapter.compileCommand;
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
        const output = await deployProgram(options.projectPath, adapter, network);
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
    app.get("/api/source", (req, res) => {
      try {
        const files: { path: string; content: string; language: string }[] = [];

        // Read .rs files
        const rsFiles = findProjectRustFiles(options.projectPath, sourceCoverageFromQuery(req.query));
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
          report: result.report,
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
          report: result.report,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save source file";
        res.status(500).json({ ok: false, error: message });
      }
    });

    // GET /api/status — project type and tool availability
    app.get("/api/status", (_req, res) => {
      const projectType = detectProjectType(options.projectPath);
      const adapter = getFrameworkAdapter(projectType);
      res.json({
        projectType,
        projectPath: options.projectPath,
        name: config.name,
        framework: config.framework,
        buildCommand: adapter.compileCommand ? `${adapter.compileCommand.cmd} ${adapter.compileCommand.args.join(" ")}` : null,
        testCommand: adapter.testCommand ? `${adapter.testCommand.cmd} ${adapter.testCommand.args.join(" ")}` : null,
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
            nodes: result.nodes, edges: result.edges, stats: result.stats, report: result.report,
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
  const framework = resolveCodegenFramework(cfg.framework);

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
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const entryDir = process.argv[1] ? dirname(pathResolve(process.argv[1])) : moduleDir;
  const candidates = [
    pathResolve(moduleDir, "../../../apps/standalone/out"),
    pathResolve(moduleDir, "../static"),
    pathResolve(moduleDir, "../../static"),
    pathResolve(entryDir, "../static"),
    pathResolve(entryDir, "../../static"),
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
  const adapter = getFrameworkAdapter(projectType);
  const watchDirs = adapter.getWatchDirs(projectPath);

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
        report: result.report,
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

// Sync program IDs from keypairs to declare_id! in source files.
// This prevents DeclaredProgramIdMismatch errors on deploy.
async function syncKeys(projectPath: string, adapter: FrameworkAdapter): Promise<string> {
  if (adapter.keySync === "none") {
    return "[keys] No key sync configured for unknown framework\n";
  }

  if (adapter.keySync === "anchor") {
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
      // Keypair is byte array — public key is last 32 bytes
      const bytes = Array.isArray(keypairData) ? keypairData : keypairData.secretKey;
      if (!bytes) continue;
      const pubKeyBytes = bytes.slice(32);
      const programId = bs58Encode(pubKeyBytes);

      if (!programId) continue;

      // Patch declare_id! in lib.rs
      const libRsPath = join(basePath, "src", "lib.rs");
      if (existsSync(libRsPath)) {
        const content = readFileSync(libRsPath, "utf-8");
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
function findSoFile(projectPath: string): string | null {
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
  adapter: FrameworkAdapter,
  network: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const validNetworks = ["localnet", "devnet", "testnet", "mainnet"];
  const safeNetwork = validNetworks.includes(network) ? network : "localnet";
  const clusterArg = safeNetwork === "localnet" ? "localnet" : safeNetwork;
  const urlArg = safeNetwork === "localnet" ? "localhost" : safeNetwork;

  if (adapter.deploy === "anchor") {
    // Anchor deploy handles everything — just run it
    return runCommand("anchor", ["deploy", "--provider.cluster", clusterArg], projectPath);
  }

  // Pinocchio/Quasar: find the .so file and deploy manually
  const soFile = findSoFile(projectPath);
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

function isBenignSurfpoolStartFailure(output: string): boolean {
  return /address already in use|already running|port .*in use|os error 48|os error 98/i.test(output);
}

const ALWAYS_SKIP_SOURCE_DIRS = new Set(["target", "node_modules", ".git"]);
const OPTIONAL_SOURCE_DIRS: Record<string, keyof SourceCoverageOptions> = {
  tests: "includeTests",
  benches: "includeBenches",
  examples: "includeExamples",
  migration: "includeMigrations",
  migrations: "includeMigrations",
};

function findProjectRustFiles(dir: string, coverage?: SourceCoverageOptions): string[] {
  const files: string[] = [];
  function walk(current: string, depth: number): void {
    if (depth > 10) return;
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (shouldSkipSourceEntry(entry.name, coverage)) continue;
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

function shouldSkipSourceEntry(name: string, coverage?: SourceCoverageOptions): boolean {
  if (ALWAYS_SKIP_SOURCE_DIRS.has(name)) return true;
  if (name.startsWith(".") && !coverage?.includeHidden) return true;
  const option = OPTIONAL_SOURCE_DIRS[name];
  return Boolean(option && !coverage?.[option]);
}

function sourceCoverageFromQuery(query: Record<string, unknown>): SourceCoverageOptions {
  return {
    includeTests: queryFlag(query.includeTests),
    includeExamples: queryFlag(query.includeExamples),
    includeBenches: queryFlag(query.includeBenches),
    includeMigrations: queryFlag(query.includeMigrations),
    includeHidden: queryFlag(query.includeHidden),
  };
}

function queryFlag(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(queryFlag);
  return value === true || value === "true" || value === "1";
}
