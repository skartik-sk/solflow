import { afterEach, describe, expect, it, vi } from "vitest";
import { clampLines, isStaleJob, JOB_STALE_MS } from "../server/jobs/limits";
import {
  decodeGhHandle,
  encodeGhHandle,
  mapRunState,
  parseCargoTestLog,
  pollGitHubActionsJob,
} from "../server/compile-worker/gh-actions-runner";

describe("log clamping (browser build completion)", () => {
  it("keeps short logs unchanged", () => {
    expect(clampLines(["a", "b"], 500, 10)).toEqual(["a", "b"]);
  });

  it("truncates long lines and too many lines instead of failing", () => {
    const lines = Array.from({ length: 1200 }, (_, i) => `line ${i}`);
    const out = clampLines(lines, 500, 10_000) as string[];
    expect(out).toHaveLength(500);
    expect(out[0]).toMatch(/701 earlier line\(s\) truncated/);
    expect(out[499]).toBe("line 1199");
    const long = clampLines(["x".repeat(30_000)], 50, 20_000) as string[];
    expect(long[0].length).toBeLessThan(20_100);
    expect(long[0]).toMatch(/truncated\]$/);
  });

  it("passes non-arrays through for zod to reject", () => {
    expect(clampLines("nope", 1, 1)).toBe("nope");
  });

  it("flags stale jobs", () => {
    const now = Date.now();
    expect(isStaleJob(new Date(now - JOB_STALE_MS - 1), now)).toBe(true);
    expect(isStaleJob(new Date(now - 1000), now)).toBe(false);
  });
});

describe("GitHub Actions job handle", () => {
  it("round-trips through storage", () => {
    const h = { kind: "build" as const, branch: "build/1-abc", commitSha: "a1b2c3d4e5f6", runId: null };
    expect(decodeGhHandle(encodeGhHandle(h))).toEqual(h);
    expect(decodeGhHandle(encodeGhHandle({ ...h, runId: 42 }))).toEqual({ ...h, runId: 42 });
  });

  it("ignores other values (real binary paths, browser builds)", () => {
    expect(decodeGhHandle("browser:abc.so")).toBeNull();
    expect(decodeGhHandle("/tmp/x.so")).toBeNull();
    expect(decodeGhHandle(null)).toBeNull();
    expect(decodeGhHandle("gha-job:nope|b|zz|")).toBeNull();
  });

  it("maps run states", () => {
    expect(mapRunState(null)).toBe("queued");
    expect(mapRunState({ status: "queued" })).toBe("queued");
    expect(mapRunState({ status: "in_progress" })).toBe("running");
    expect(mapRunState({ status: "completed", conclusion: "success" })).toBe("success");
    expect(mapRunState({ status: "completed", conclusion: "failure" })).toBe("failure");
    expect(mapRunState({ status: "completed", conclusion: "cancelled" })).toBe("failure");
  });

  it("parses cargo test results", () => {
    expect(parseCargoTestLog("running 2 tests\ntest result: ok. 2 passed").success).toBe(true);
    const failed = parseCargoTestLog("test a ... FAILED\nfailures:\ntest result: FAILED. 1 passed; 1 failed");
    expect(failed.success).toBe(false);
    expect(failed.errors.length).toBeGreaterThan(0);
  });
});

describe("GitHub Actions poll (one short call per status request)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_COMPILER_OWNER;
    delete process.env.GITHUB_COMPILER_REPO;
  });

  const configure = () => {
    process.env.GITHUB_TOKEN = "t";
    process.env.GITHUB_COMPILER_OWNER = "o";
    process.env.GITHUB_COMPILER_REPO = "r";
  };
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it("reports queued until the run for the commit appears", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => json({ workflow_runs: [{ id: 9, head_sha: "other" }] })));
    const res = await pollGitHubActionsJob({ kind: "build", branch: "build/x", commitSha: "abcdef1", runId: null });
    expect(res.state).toBe("queued");
    expect(res.handle.runId).toBeNull();
  });

  it("finds the run, then reports its state", async () => {
    configure();
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/actions/runs?")
        ? json({ workflow_runs: [{ id: 77, head_sha: "abcdef1" }] })
        : json({ status: "completed", conclusion: "success", html_url: "https://gh/run/77" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await pollGitHubActionsJob({ kind: "build", branch: "build/x", commitSha: "abcdef1", runId: null });
    expect(res).toMatchObject({ state: "success", htmlUrl: "https://gh/run/77", handle: { runId: 77 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips the run lookup once the run id is known", async () => {
    configure();
    const fetchMock = vi.fn(async () => json({ status: "in_progress", conclusion: null, html_url: "u" }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await pollGitHubActionsJob({ kind: "test", branch: "test/x", commitSha: "abcdef1", runId: 5 });
    expect(res.state).toBe("running");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
