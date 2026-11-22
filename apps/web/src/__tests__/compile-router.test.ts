import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@solflow/auth", () => ({ auth: async () => null }));
vi.mock("@solflow/db", () => ({ prisma: new Proxy({}, { get: (_t, m) => (db as any)?.[m as string] }) }));

let db: any;
let updates: any[];

import { compileRouter } from "../server/trpc/routers/compile";
import { encodeGhHandle } from "../server/compile-worker/gh-actions-runner";

const caller = () => compileRouter.createCaller({ session: { user: { id: "u1" } }, prisma: db, headers: new Headers() } as any);

function sbpf(): Buffer {
  const b = Buffer.alloc(200);
  b.writeUInt32BE(0x7f454c46, 0);
  b[4] = 2;
  b[5] = 1;
  b.writeUInt16LE(0xf7, 18);
  return b;
}

beforeEach(() => {
  updates = [];
  vi.unstubAllGlobals();
});

describe("compile router", () => {
  it("stores an oversized browser build log truncated instead of rejecting it", async () => {
    db = {
      compilation: {
        findFirst: async () => ({ id: "c1", projectId: "p1", status: "BUILDING" }),
        update: async (args: any) => (updates.push(args), args.data),
      },
      project: { update: async () => ({}) },
    };
    const logs = Array.from({ length: 2000 }, (_, i) => `line ${i}`);
    const res = await caller().completeBrowserBuild({
      jobId: "c1",
      program: sbpf().toString("base64"),
      logs,
      errors: [],
    });
    expect(res.success).toBe(true);
    const stored = updates[0].data.logs.split("\n");
    expect(stored).toHaveLength(500);
    expect(stored[499]).toBe("line 1999");

    updates = [];
    await caller().completeBrowserBuild({ jobId: "c1", errors: ["e".repeat(80_000)] });
    expect(updates[0].data.errors[0].length).toBeLessThan(20_100);
  });

  it("status polls GitHub once and stores the finished binary", async () => {
    process.env.GITHUB_TOKEN = "t";
    process.env.GITHUB_COMPILER_OWNER = "o";
    process.env.GITHUB_COMPILER_REPO = "r";
    const handle = encodeGhHandle({ kind: "build", branch: "build/1", commitSha: "abcdef1", runId: 7 });
    const row: any = { id: "c1", projectId: "p1", status: "BUILDING", binaryUrl: handle, logs: "", startedAt: new Date() };
    db = {
      compilation: {
        findFirst: async () => ({ ...row }),
        findUnique: async () => ({ ...row }),
        updateMany: async ({ data }: any) => (Object.assign(row, data), { count: 1 }),
        update: async ({ data }: any) => Object.assign(row, data),
      },
      project: { update: async () => ({}) },
    };
    const { zipSync } = await import("fflate");
    const zip = zipSync({ "program.so": new Uint8Array(sbpf()) });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/actions/runs/7")) return new Response(JSON.stringify({ status: "completed", conclusion: "success", html_url: "u" }));
        if (url.endsWith("/artifacts")) return new Response(JSON.stringify({ artifacts: [{ name: "program-so", archive_download_url: "https://dl/zip" }] }));
        if (url === "https://dl/zip") return new Response(Buffer.from(zip));
        return new Response("{}", { status: 200 }); // branch delete
      }),
    );
    const res: any = await caller().status({ jobId: "c1" });
    expect(res.status).toBe("SUCCESS");
    expect(res.binarySize).toBe(200);
    expect(res.binaryBytes).toBeUndefined(); // bytes never sent to the client
    expect(row.binaryUrl).toBe("gha:7.so");
  });

  it("status fails a BUILDING row older than the stale limit", async () => {
    const row: any = { id: "c1", projectId: "p1", status: "BUILDING", binaryUrl: null, startedAt: new Date(Date.now() - 21 * 60_000) };
    db = {
      compilation: {
        findFirst: async () => ({ ...row }),
        findUnique: async () => ({ ...row }),
        updateMany: async ({ data }: any) => (Object.assign(row, data), { count: 1 }),
      },
    };
    const res: any = await caller().status({ jobId: "c1" });
    expect(res.status).toBe("FAILED");
    expect(String(res.errors)).toMatch(/timed out/);
  });
});
