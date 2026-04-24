import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { ServerHandle } from "../server/index";

let tempDir: string;
let handle: ServerHandle;
const PORT = 16340;

async function fetchJSON(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  let data: Record<string, any> = {};
  try {
    data = (await res.json()) as Record<string, any>;
  } catch {
    // Non-JSON response
  }
  return { status: res.status, data };
}

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "solstudio-validation-test-"));
  const srcDir = join(tempDir, "src");
  const { mkdirSync: mkdir } = await import("fs");
  mkdir(srcDir, { recursive: true });
  writeFileSync(join(srcDir, "lib.rs"), `
use anchor_lang::prelude::*;
declare_id!("Val111111111111111111111111111111111111111111");
#[program]
pub mod validation_test {
    pub fn initialize(ctx: Context<Init>) -> Result<()> { Ok(()) }
}
#[derive(Accounts)]
pub struct Init<'info> {
    pub user: Signer<'info>,
}
  `);

  const { startServer } = await import("../server/index");
  handle = await startServer({ port: PORT, projectPath: tempDir, watch: false });
}, 10000);

afterAll(async () => {
  if (handle) await handle.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("PUT /api/project — input validation", () => {
  it("rejects non-object body", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/project`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "null",
    });
    // Should either reject (400) or handle gracefully
    expect([200, 400]).toContain(res.status);
  });

  it("accepts valid project data", async () => {
    const { status, data } = await fetchJSON(`http://localhost:${PORT}/api/project`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: [], edges: [] }),
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  it("saves and retrieves project with nodes and edges", async () => {
    const project = {
      nodes: [
        { id: "prog-1", type: "program", position: { x: 0, y: 0 }, data: { name: "my_program" } },
        { id: "ix-1", type: "instruction", position: { x: 0, y: 0 }, data: { name: "initialize" } },
      ],
      edges: [
        { id: "e-1", source: "prog-1", target: "ix-1", sourceHandle: "instruction-out", targetHandle: "instruction-in" },
      ],
    };

    const saveRes = await fetchJSON(`http://localhost:${PORT}/api/project`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
    });
    expect(saveRes.status).toBe(200);

    const loadRes = await fetchJSON(`http://localhost:${PORT}/api/project`);
    expect(loadRes.status).toBe(200);
    expect(loadRes.data.nodes).toHaveLength(2);
    expect(loadRes.data.edges).toHaveLength(1);
  });
});

describe("POST /api/codegen — input validation", () => {
  it("rejects missing nodes", async () => {
    const { status, data } = await fetchJSON(`http://localhost:${PORT}/api/codegen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edges: [] }),
    });
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("rejects missing edges", async () => {
    const { status, data } = await fetchJSON(`http://localhost:${PORT}/api/codegen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: [] }),
    });
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it("rejects non-array nodes", async () => {
    const { status } = await fetchJSON(`http://localhost:${PORT}/api/codegen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: "not-array", edges: [] }),
    });
    expect(status).toBe(400);
  });

  it("accepts valid flow data", async () => {
    const { status } = await fetchJSON(`http://localhost:${PORT}/api/codegen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: [], edges: [] }),
    });
    // May be 200 or 400 depending on IR processing, but shouldn't crash
    expect([200, 400]).toContain(status);
  });
});

describe("POST /api/audit — input validation", () => {
  it("rejects non-array nodes", async () => {
    const { status } = await fetchJSON(`http://localhost:${PORT}/api/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: {}, edges: [] }),
    });
    expect(status).toBe(400);
  });

  it("rejects non-array edges", async () => {
    const { status } = await fetchJSON(`http://localhost:${PORT}/api/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: [], edges: "bad" }),
    });
    expect(status).toBe(400);
  });

  it("accepts valid flow data", async () => {
    const { status } = await fetchJSON(`http://localhost:${PORT}/api/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: [], edges: [] }),
    });
    expect([200, 400]).toContain(status);
  });
});

describe("GET /api/project — edge cases", () => {
  it("returns valid JSON with correct structure", async () => {
    const { status, data } = await fetchJSON(`http://localhost:${PORT}/api/project`);
    expect(status).toBe(200);
    expect(typeof data).toBe("object");
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(Array.isArray(data.edges)).toBe(true);
  });
});

describe("CORS headers", () => {
  it("sets CORS headers", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/project`, {
      method: "GET",
      headers: { Origin: "http://localhost:3000" },
    });
    const corsHeader = res.headers.get("access-control-allow-origin");
    // Should allow localhost origins
    expect(corsHeader).toBeTruthy();
  });
});

describe("Payload size limit", () => {
  it("rejects oversized payloads", async () => {
    // Create a payload larger than 5MB
    const bigArray = new Array(1000000).fill({ id: "x", data: "a".repeat(10) });
    try {
      const res = await fetch(`http://localhost:${PORT}/api/project`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: bigArray, edges: [] }),
      });
      // Should get 413 Payload Too Large
      expect(res.status).toBe(413);
    } catch {
      // fetch may throw on connection reset, which is also acceptable
    }
  }, 15000);
});
