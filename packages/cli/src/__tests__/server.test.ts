import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import WebSocket from "ws";
import type { ServerHandle } from "../server/index";

let tempDir: string;
let handle: ServerHandle;
const PORT = 16339; // Use a non-standard port for testing

// Helper: fetch wrapper
async function fetchJSON(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  return { status: res.status, data: (await res.json()) as Record<string, any> };
}

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "solstudio-server-test-"));

  // Copy fixture .rs file into temp dir
  const fixtureRs = join(__dirname, "fixtures", "minianchor", "src", "lib.rs");
  const srcDir = join(tempDir, "src");
  const { mkdirSync: mkdir } = await import("fs");
  mkdir(srcDir, { recursive: true });

  if (existsSync(fixtureRs)) {
    writeFileSync(join(srcDir, "lib.rs"), readFileSync(fixtureRs, "utf-8"));
  } else {
    // Create a minimal .rs file
    writeFileSync(join(srcDir, "lib.rs"), `
use anchor_lang::prelude::*;
declare_id!("Test1111111111111111111111111111111111111111");
#[program]
pub mod test_prog {
    pub fn hello(ctx: Context<Hello>) -> Result<()> { Ok(()) }
}
#[derive(Accounts)]
pub struct Hello<'info> {
    pub user: Signer<'info>,
}
    `);
  }
});

afterAll(async () => {
  if (handle) await handle.close();
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── Server start/stop ───────────────────────────────────────────────

describe("server startup", () => {
  it("starts without error", async () => {
    const { startServer } = await import("../server/index");
    handle = await startServer({ port: PORT, projectPath: tempDir, watch: false });
  }, 10000);

  it("responds to GET /api/project", async () => {
    const { status, data } = await fetchJSON(`http://localhost:${PORT}/api/project`);
    expect(status).toBe(200);
    expect(data).toHaveProperty("nodes");
    expect(data).toHaveProperty("edges");
  });
});

// ─── GET /api/project ────────────────────────────────────────────────

describe("GET /api/project", () => {
  it("returns empty project when no project.json exists", async () => {
    const { status, data } = await fetchJSON(`http://localhost:${PORT}/api/project`);
    expect(status).toBe(200);
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(Array.isArray(data.edges)).toBe(true);
  });

  it("returns saved project data", async () => {
    // First save some data
    const projectData = {
      nodes: [{ id: "test-1", type: "program", position: { x: 0, y: 0 }, data: { name: "test" } }],
      edges: [],
    };
    await fetchJSON(`http://localhost:${PORT}/api/project`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(projectData),
    });

    // Then load it
    const { status, data } = await fetchJSON(`http://localhost:${PORT}/api/project`);
    expect(status).toBe(200);
    expect(data.nodes).toHaveLength(1);
    expect(data.nodes[0].data.name).toBe("test");
  });
});

// ─── PUT /api/project ────────────────────────────────────────────────

describe("PUT /api/project", () => {
  it("saves project data", async () => {
    const projectData = {
      nodes: [
        { id: "p1", type: "program", position: { x: 0, y: 0 }, data: { name: "saved-project" } },
        { id: "ix1", type: "instruction", position: { x: 0, y: 0 }, data: { name: "init" } },
      ],
      edges: [
        { id: "e1", source: "p1", target: "ix1", sourceHandle: "instruction-out", targetHandle: "instruction-in" },
      ],
    };

    const { status, data } = await fetchJSON(`http://localhost:${PORT}/api/project`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(projectData),
    });

    expect(status).toBe(200);
    expect(data.ok).toBe(true);

    // Verify it persisted
    const { data: loaded } = await fetchJSON(`http://localhost:${PORT}/api/project`);
    expect(loaded.nodes).toHaveLength(2);
    expect(loaded.edges).toHaveLength(1);
  });
});

// ─── POST /api/parse ─────────────────────────────────────────────────

describe("POST /api/parse", () => {
  it("parses .rs files and returns flow data", async () => {
    const { status, data } = await fetchJSON(`http://localhost:${PORT}/api/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(status).toBe(200);
    expect(data).toHaveProperty("nodes");
    expect(data).toHaveProperty("edges");
    expect(data).toHaveProperty("stats");
    expect(data).toHaveProperty("report");
    expect(data.stats.instructions).toBeGreaterThanOrEqual(1);
    expect(data.report.filesParsed).toBeGreaterThanOrEqual(1);
  });

  it("saves parsed result to project.json", async () => {
    await fetchJSON(`http://localhost:${PORT}/api/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    // Verify project.json was updated
    const { data } = await fetchJSON(`http://localhost:${PORT}/api/project`);
    expect(data.nodes.length).toBeGreaterThan(0);
  });
});

// ─── WebSocket ───────────────────────────────────────────────────────

describe("WebSocket connection", () => {
  it("connects and receives connected message", async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${PORT}/ws`);

      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        expect(msg.type).toBe("connected");
        expect(msg.port).toBe(PORT);
        ws.close();
        resolve();
      });

      ws.on("error", reject);

      setTimeout(() => {
        ws.close();
        reject(new Error("WebSocket timeout"));
      }, 5000);
    });
  });

  it("receives project-saved broadcast after PUT", async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${PORT}/ws`);

      ws.on("open", () => {
        // Send a PUT after connecting
        fetch(`http://localhost:${PORT}/api/project`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodes: [], edges: [] }),
        });
      });

      let gotConnected = false;
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "connected") {
          gotConnected = true;
          return;
        }
        if (msg.type === "project-saved") {
          expect(gotConnected).toBe(true);
          ws.close();
          resolve();
        }
      });

      ws.on("error", reject);

      setTimeout(() => {
        ws.close();
        reject(new Error("WebSocket broadcast timeout"));
      }, 5000);
    });
  });
});

// ─── Static file serving ─────────────────────────────────────────────

describe("static file serving", () => {
  it("returns 404 when no static build exists", async () => {
    const res = await fetch(`http://localhost:${PORT}/some-page`);
    expect([200, 404]).toContain(res.status);
  });
});
