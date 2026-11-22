// Local server hardening: loopback bind, Host/Origin checks, session token,
// JSON-only writes, WebSocket auth, and the confirm-before-overwrite sync.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir, networkInterfaces } from "os";
import { request } from "http";
import WebSocket from "ws";
import { assertLoopbackHost, isAllowedHostHeader, startServer, type ServerHandle } from "../server/index";

const FIXTURES = join(__dirname, "..", "..", "..", "rust-parser", "src", "__tests__", "framework-fixtures");
const TOKEN = "security-test-token";

let tempDir: string;
let handle: ServerHandle;
let libPath: string;

interface RawResponse { status: number; body: string; headers: Record<string, string | string[] | undefined> }

function raw(
  path: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string; host?: string } = {},
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: opts.host ?? "127.0.0.1", port: handle.port, path, method: opts.method ?? "GET", headers: opts.headers },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
      },
    );
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

const authed = (extra: Record<string, string> = {}) => ({ "x-solstudio-token": TOKEN, ...extra });
const json = (extra: Record<string, string> = {}) => authed({ "Content-Type": "application/json", ...extra });

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "solstudio-sec-"));
  cpSync(join(FIXTURES, "anchor-workspace"), tempDir, { recursive: true });
  libPath = join(tempDir, "programs", "anchor-vault", "src", "lib.rs");
  handle = await startServer({ port: 0, projectPath: tempDir, watch: false, token: TOKEN });
}, 20000);

afterAll(async () => {
  if (handle) await handle.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("bind address", () => {
  it("refuses non-loopback bind hosts", async () => {
    expect(() => assertLoopbackHost("0.0.0.0")).toThrow(/loopback/);
    expect(() => assertLoopbackHost("192.168.1.10")).toThrow(/loopback/);
    expect(assertLoopbackHost("localhost")).toBe("localhost");
    await expect(startServer({ port: 0, projectPath: tempDir, watch: false, host: "0.0.0.0" })).rejects.toThrow(/loopback/);
  });

  it("is not reachable on the LAN address", async () => {
    const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address;
    if (!lan) return; // no LAN interface on this machine
    await expect(raw("/api/project", { host: lan, headers: authed() })).rejects.toThrow(/ECONNREFUSED|EHOSTUNREACH|ENETUNREACH/);
  });

  it("prints a URL with the token in the fragment", () => {
    expect(handle.url).toBe(`http://127.0.0.1:${handle.port}/#token=${TOKEN}`);
  });
});

describe("Host and Origin checks", () => {
  it("accepts only loopback Host headers with our port", () => {
    expect(isAllowedHostHeader(`localhost:${handle.port}`, handle.port)).toBe(true);
    expect(isAllowedHostHeader(`127.0.0.1:${handle.port}`, handle.port)).toBe(true);
    expect(isAllowedHostHeader("evil.example", handle.port)).toBe(false);
    expect(isAllowedHostHeader(`evil.example:${handle.port}`, handle.port)).toBe(false);
    expect(isAllowedHostHeader(`localhost:${handle.port + 1}`, handle.port)).toBe(false);
    expect(isAllowedHostHeader(undefined, handle.port)).toBe(false);
  });

  it("refuses a DNS-rebinding Host even with the token", async () => {
    const res = await raw("/api/source", { headers: authed({ Host: `attacker.example:${handle.port}` }) });
    expect(res.status).toBe(403);
    expect(res.body).not.toContain("lib.rs");
  });

  it("refuses cross-origin requests and never sends CORS headers", async () => {
    const res = await raw("/api/project", { headers: authed({ Origin: "https://evil.example" }) });
    expect(res.status).toBe(403);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("session token", () => {
  it("refuses /api without a token", async () => {
    expect((await raw("/api/source")).status).toBe(401);
    expect((await raw("/api/status")).status).toBe(401);
  });

  it("refuses a wrong token", async () => {
    expect((await raw("/api/source", { headers: { "x-solstudio-token": "nope" } })).status).toBe(401);
  });

  it("accepts the right token", async () => {
    const res = await raw("/api/status", { headers: authed() });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).projectType).toBe("anchor");
  });

  it("refuses WebSocket upgrades without the token", async () => {
    const result = await new Promise<string>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${handle.port}/ws`);
      ws.on("open", () => { ws.close(); resolve("open"); });
      ws.on("error", () => resolve("rejected"));
    });
    expect(result).toBe("rejected");
  });

  it("accepts WebSocket upgrades with the token", async () => {
    const msg = await new Promise<{ type: string }>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${handle.port}/ws?token=${TOKEN}`);
      ws.on("message", (data) => { ws.close(); resolve(JSON.parse(data.toString())); });
      ws.on("error", reject);
    });
    expect(msg.type).toBe("connected");
  });
});

describe("JSON-only writes (CSRF)", () => {
  it("refuses a text/plain POST even with the token, and changes nothing", async () => {
    const before = readFileSync(libPath, "utf-8");
    const res = await raw("/api/sync", { method: "POST", headers: authed({ "Content-Type": "text/plain" }), body: "x" });
    expect(res.status).toBe(415);
    expect(readFileSync(libPath, "utf-8")).toBe(before);
  });

  it("refuses a text/plain POST without the token (what a no-cors page sends)", async () => {
    const res = await raw("/api/sync", { method: "POST", headers: { "Content-Type": "text/plain", Origin: "https://evil.example" }, body: "x" });
    expect(res.status).toBe(403);
    const noOrigin = await raw("/api/sync", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" });
    expect(noOrigin.status).toBe(401);
  });

  it("refuses a body-less POST", async () => {
    expect((await raw("/api/parse", { method: "POST", headers: authed() })).status).toBe(415);
  });
});

describe("PUT /api/source path rules", () => {
  for (const path of ["../outside.rs", "/etc/x.toml", "programs/../../x.rs", ".cargo/config.toml", "target/x.rs", ".git/x.toml"]) {
    it(`refuses ${path}`, async () => {
      const res = await raw("/api/source", { method: "PUT", headers: json(), body: JSON.stringify({ path, content: "x" }) });
      expect(res.status).toBe(403);
    });
  }
});

describe("sync never silently overwrites source", () => {
  it("preview lists diffs mapped onto the existing crate and writes nothing", async () => {
    const before = readFileSync(libPath, "utf-8");
    const res = await raw("/api/sync/preview", { method: "POST", headers: json(), body: "{}" });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.ok).toBe(true);
    const lib = data.changes.find((c: { path: string }) => c.path === "programs/anchor-vault/src/lib.rs");
    expect(lib).toBeTruthy();
    expect(lib.status).toBe("modified");
    expect(lib.diff).toContain("--- a/programs/anchor-vault/src/lib.rs");
    expect(data.changes.some((c: { path: string }) => c.path.startsWith("programs/anchor_vault/"))).toBe(false);
    expect(readFileSync(libPath, "utf-8")).toBe(before);
  });

  it("refuses to write without confirm", async () => {
    const before = readFileSync(libPath, "utf-8");
    const res = await raw("/api/sync", { method: "POST", headers: json(), body: "{}" });
    expect(res.status).toBe(409);
    expect(JSON.parse(res.body).requiresConfirm).toBe(true);
    expect(readFileSync(libPath, "utf-8")).toBe(before);
  });

  it("refuses when a file changed after the preview", async () => {
    const preview = JSON.parse((await raw("/api/sync/preview", { method: "POST", headers: json(), body: "{}" })).body);
    const expected = Object.fromEntries(preview.changes.map((c: { path: string; beforeHash: string | null }) => [c.path, c.beforeHash]));
    expected["programs/anchor-vault/src/lib.rs"] = "0".repeat(64);
    const before = readFileSync(libPath, "utf-8");
    const res = await raw("/api/sync", { method: "POST", headers: json(), body: JSON.stringify({ confirm: true, expected }) });
    expect(res.status).toBe(409);
    expect(readFileSync(libPath, "utf-8")).toBe(before);
  });

  it("writes after confirm and backs up every overwritten file", async () => {
    const original = readFileSync(libPath, "utf-8");
    const preview = JSON.parse((await raw("/api/sync/preview", { method: "POST", headers: json(), body: "{}" })).body);
    const expected = Object.fromEntries(preview.changes.map((c: { path: string; beforeHash: string | null }) => [c.path, c.beforeHash]));
    const res = await raw("/api/sync", { method: "POST", headers: json(), body: JSON.stringify({ confirm: true, expected }) });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.ok).toBe(true);
    expect(data.written).toBe(preview.changes.length);
    expect(data.backupDir).toMatch(/^\.solstudio\/backups\//);
    const backup = join(tempDir, data.backupDir, "programs", "anchor-vault", "src", "lib.rs");
    expect(readFileSync(backup, "utf-8")).toBe(original);
    expect(readFileSync(libPath, "utf-8")).not.toBe(original);
    // No parallel programs/anchor_vault tree was created.
    expect(existsSync(join(tempDir, "programs", "anchor_vault"))).toBe(false);
    expect(readdirSync(join(tempDir, "programs"))).toEqual(["anchor-vault"]);
  });
});
