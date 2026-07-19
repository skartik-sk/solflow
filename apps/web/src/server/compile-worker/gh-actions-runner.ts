// apps/web/src/server/compile-worker/gh-actions-runner.ts
// Compiles Pinocchio/Quasar programs on FREE GitHub Actions runners.
// Replaces the Docker compiler for the serverless (no-VM) deployment.
//
// Flow:
//   1. Commit generated source files into the compiler repo under programs/program/.
//   2. The push triggers the "compile" workflow on a free runner.
//   3. Poll the run until it completes.
//   4. Download the .so artifact (zip) and extract the binary.
//
// Requires env (configure in production):
//   GITHUB_TOKEN          — fine-grained PAT with "Contents: read+write" + "Actions: read"
//   GITHUB_COMPILER_OWNER — e.g. skartik-sk
//   GITHUB_COMPILER_REPO  — e.g. solflow-gh-compiler
//
// If not configured, returns a graceful "not available" result so the strategy
// can fall through to Docker (local dev) or codegen-only.
//
// SERVER ONLY — never import from client components.

import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { unzipSync } from "fflate";
import type { ProgramIR } from "@solflow/ir";

// ─── Types (mirror DockerBuildInput/Result so it's a drop-in) ─────────────────

export interface GitHubActionsBuildInput {
  ir: ProgramIR;
  framework: "ANCHOR" | "PINOCCHIO" | "QUASAR";
  irHash: string;
  generatedFiles: { path: string; content: string }[];
  options: {
    release: boolean;
    verifiable: boolean;
    targetNetwork: "devnet" | "mainnet" | "localnet";
  };
}

export interface GitHubActionsBuildResult {
  success: boolean;
  logs: string[];
  errors: string[];
  warnings: string[];
  workDir: string;
  duration: number;
  binaryPath: string | null;
  binarySize: number | null;
  idlJson: string | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const API = "https://api.github.com";
const TIMEOUT_MS = 12 * 60_000; // cap (workflow is 15-min)
const POLL_INTERVAL_MS = 8_000;
const PROGRAM_DIR = "programs/program"; // must match gh-actions-compiler/.github/workflows/compile.yml
const BRANCH = "main";

interface GhConfig {
  token: string;
  owner: string;
  repo: string;
  configured: boolean;
}

function loadConfig(): GhConfig {
  const token = process.env.GITHUB_TOKEN ?? "";
  const owner = process.env.GITHUB_COMPILER_OWNER ?? "";
  const repo = process.env.GITHUB_COMPILER_REPO ?? "";
  return { token, owner, repo, configured: Boolean(token && owner && repo) };
}

// ─── GitHub REST helpers ──────────────────────────────────────────────────────

async function ghRequest(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("User-Agent", "solflow-gh-actions-runner");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${API}${path}`, { ...init, headers });
}

async function ghJson<T = unknown>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await ghRequest(path, token, init);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GitHub ${path} → HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Map a codegen file path to a path relative to programs/program/. */
function toProgramRelative(rawPath: string): string {
  // codegen emits e.g. "programs/<name>/src/lib.rs" or "programs/<name>/Cargo.toml"
  const m = rawPath.match(/(?:^|\/)programs\/[^/]+\/(.+)$/);
  if (m) return m[1];
  const srcIdx = rawPath.indexOf("/src/");
  if (srcIdx !== -1) return rawPath.slice(srcIdx + 1); // "src/..."
  if (rawPath.endsWith("Cargo.toml")) return "Cargo.toml";
  return rawPath;
}

// ─── Commit source files via the Git Data API ────────────────────────────────

interface TreeEntry {
  path: string;
  mode: "100644";
  type: "blob";
  sha: string | null;
}

/** Replace programs/program/** in the repo with the generated source. */
async function commitSourceFiles(
  files: { path: string; content: string }[],
  cfg: GhConfig,
  onLog: (line: string, level: "info" | "warn" | "error") => void,
  branch: string,
): Promise<string> {
  const { token, owner, repo } = cfg;

  // 1. Current HEAD commit + tree
  const ref = await ghJson<{ object: { sha: string } }>(
    `/repos/${owner}/${repo}/git/ref/heads/${BRANCH}`,
    token,
  );
  const parentSha = ref.object.sha;
  const parentCommit = await ghJson<{ tree: { sha: string } }>(
    `/repos/${owner}/${repo}/git/commits/${parentSha}`,
    token,
  );
  const baseTreeSha = parentCommit.tree.sha;

  // 2. Existing files under programs/program/ (so we can delete stale ones)
  const baseTree = await ghJson<{ tree: Array<{ path: string; sha?: string }> }>(
    `/repos/${owner}/${repo}/git/trees/${baseTreeSha}?recursive=1`,
    token,
  );
  const existing = baseTree.tree.filter(
    (e) => e.path.startsWith(`${PROGRAM_DIR}/`) && e.sha,
  );

  // 3. Create blobs for the new source files
  const desired = new Map<string, string>(); // program-relative path → blob sha
  const entries: TreeEntry[] = [];
  for (const f of files) {
    const rel = toProgramRelative(f.path);
    if (desired.has(rel)) continue; // dedupe
    const blob = await ghJson<{ sha: string }>(
      `/repos/${owner}/${repo}/git/blobs`,
      token,
      {
        method: "POST",
        body: JSON.stringify({ content: f.content, encoding: "utf-8" }),
      },
    );
    desired.set(rel, blob.sha);
    entries.push({ path: `${PROGRAM_DIR}/${rel}`, mode: "100644", type: "blob", sha: blob.sha });
  }

  // 4. Delete any existing file under programs/program/ that isn't in the new set
  for (const e of existing) {
    const rel = e.path.slice(`${PROGRAM_DIR}/`.length);
    if (!desired.has(rel)) {
      entries.push({ path: e.path, mode: "100644", type: "blob", sha: null });
    }
  }

  // 5. New tree (base_tree keeps everything else in the repo intact)
  const newTree = await ghJson<{ sha: string }>(
    `/repos/${owner}/${repo}/git/trees`,
    token,
    { method: "POST", body: JSON.stringify({ base_tree: baseTreeSha, tree: entries }) },
  );

  // 6. Commit + fast-forward ref
  const newCommit = await ghJson<{ sha: string }>(
    `/repos/${owner}/${repo}/git/commits`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        message: `solflow: compile ${desired.size} file(s)`,
        tree: newTree.sha,
        parents: [parentSha],
      }),
    },
  );
  // Create a UNIQUE branch per build (build/<id>) instead of pushing to main.
  // Concurrent compiles then never race on main's ref (which would 422 on the
  // second). The push to this new branch triggers the workflow just the same.
  await ghJson(`/repos/${owner}/${repo}/git/refs`, token, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: newCommit.sha }),
  });

  onLog(`[gh-actions] pushed ${desired.size} file(s) to ${branch} (commit ${newCommit.sha.slice(0, 7)})`, "info");
  return newCommit.sha;
}

// ─── Poll the workflow run ────────────────────────────────────────────────────

async function waitForRun(
  commitSha: string,
  cfg: GhConfig,
  onLog: (line: string, level: "info" | "warn" | "error") => void,
): Promise<number> {
  const { token, owner, repo } = cfg;
  const deadline = Date.now() + TIMEOUT_MS;

  // Wait for the run to appear (push triggers it after a few seconds).
  // NOTE: we list recent runs and match head_sha CLIENT-side, because GitHub's
  // `?head_sha=` server filter has indexing lag and can miss a run that exists.
  let runId: number | null = null;
  while (Date.now() < deadline && runId === null) {
    const data = await ghJson<{ workflow_runs: Array<{ id: number; head_sha: string }> }>(
      `/repos/${owner}/${repo}/actions/runs?per_page=10`,
      token,
    );
    const run = data.workflow_runs?.find((r) => r.head_sha === commitSha);
    if (run) runId = run.id;
    else await sleep(POLL_INTERVAL_MS);
  }
  if (runId === null) throw new Error("Workflow run never started (check the repo has the compile workflow on main)");

  onLog(`[gh-actions] run ${runId} started — waiting on free runner…`, "info");

  // Poll until completed
  while (Date.now() < deadline) {
    const run = await ghJson<{ status: string; conclusion: string | null; html_url: string }>(
      `/repos/${owner}/${repo}/actions/runs/${runId}`,
      token,
    );
    if (run.status === "completed") {
      if (run.conclusion !== "success") {
        const logText = await fetchBuildLog(runId, cfg);
        const errs = extractCargoErrors(logText);
        const detail = errs.length > 0 ? errs.join("\n") : logText.slice(0, 1000);
        throw new Error(
          `Run ${runId} ended: ${run.conclusion} — see ${run.html_url}` +
            (detail ? `\n${detail}` : ""),
        );
      }
      onLog(`[gh-actions] run ${runId} succeeded`, "info");
      return runId;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Run ${runId} timed out after ${TIMEOUT_MS / 1000}s`);
}

// ─── Download + extract the .so artifact ─────────────────────────────────────

async function downloadSoArtifact(
  runId: number,
  cfg: GhConfig,
): Promise<{ bytes: Uint8Array; name: string }> {
  const { token, owner, repo } = cfg;
  const arts = await ghJson<{ artifacts: Array<{ name: string; archive_download_url: string }> }>(
    `/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`,
    token,
  );
  const art = arts.artifacts?.find((a) => a.name === "program-so");
  if (!art) throw new Error("Artifact 'program-so' not found on the completed run");

  // archive_download_url is a /repos/.../actions/artifacts/{id}/zip that redirects to S3.
  const res = await fetch(art.archive_download_url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`Artifact download failed: HTTP ${res.status}`);

  const buf = new Uint8Array(await res.arrayBuffer());
  const files = unzipSync(buf);
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith(".so")) return { bytes: data, name: name.split("/").pop() ?? "program.so" };
  }
  throw new Error("No .so file inside the artifact zip");
}

/** Download the build-log artifact text (best-effort) — used to surface cargo errors on failure. */
async function fetchBuildLog(runId: number, cfg: GhConfig): Promise<string> {
  const { token, owner, repo } = cfg;
  try {
    const arts = await ghJson<{ artifacts: Array<{ name: string; archive_download_url: string }> }>(
      `/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`,
      token,
    );
    const art = arts.artifacts?.find((a) => a.name === "build-log");
    if (!art) return "";
    const res = await fetch(art.archive_download_url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return "";
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    for (const [name, data] of Object.entries(files)) {
      if (name.endsWith(".log") || name.endsWith(".txt") || !name.includes(".")) {
        return new TextDecoder().decode(data);
      }
    }
    return "";
  } catch {
    return "";
  }
}

/** Extract the meaningful cargo-build-sbf error lines from a build log. */
function extractCargoErrors(log: string): string[] {
  return log
    .split("\n")
    .filter((l) => /\berror(\[E\d+\]|:)/i.test(l))
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 20);
}

// ─── Main entry (same signature contract as runDockerBuild) ───────────────────

export async function runGitHubActionsBuild(
  input: GitHubActionsBuildInput,
  onLog: (line: string, level: "info" | "warn" | "error") => void,
): Promise<GitHubActionsBuildResult> {
  const startedAt = Date.now();
  const cfg = loadConfig();
  const workDir = join(tmpdir(), `solflow-gha-${randomBytes(4).toString("hex")}`);

  if (!cfg.configured) {
    return {
      success: false,
      logs: ["[gh-actions] not configured (set GITHUB_TOKEN, GITHUB_COMPILER_OWNER, GITHUB_COMPILER_REPO)."],
      errors: ["GitHub Actions compiler not configured"],
      warnings: [],
      workDir: "",
      duration: Date.now() - startedAt,
      binaryPath: null,
      binarySize: null,
      idlJson: null,
    };
  }

  try {
    onLog(`[gh-actions] compiling ${input.framework} via GitHub Actions (${cfg.owner}/${cfg.repo})`, "info");
    // Force a unique commit every build by adding a BUILD_ID file. Without this,
    // identical source (same starter template, a re-compile, or another user's
    // identical code) would produce zero file diff and GitHub's push trigger
    // would NOT fire. The BUILD_ID guarantees a diff so the workflow always runs.
    const buildId = `${Date.now()}-${randomBytes(6).toString("hex")}`;
    const buildBranch = `build/${buildId}`;
    const filesWithBuildId = [
      ...input.generatedFiles,
      { path: "BUILD_ID", content: `solflow-build-${buildId}\n` },
    ];
    const commitSha = await commitSourceFiles(filesWithBuildId, cfg, onLog, buildBranch);
    const runId = await waitForRun(commitSha, cfg, onLog);
    const { bytes, name } = await downloadSoArtifact(runId, cfg);

    // Best-effort cleanup: delete the per-build branch now that we have the .so.
    await ghRequest(
      `/repos/${cfg.owner}/${cfg.repo}/git/refs/heads/${buildBranch}`,
      cfg.token,
      { method: "DELETE" },
    ).catch(() => undefined);

    await mkdir(workDir, { recursive: true });
    const binaryPath = join(workDir, name);
    await writeFile(binaryPath, bytes);
    onLog(`[gh-actions] compiled binary: ${binaryPath} (${bytes.byteLength} bytes)`, "info");

    return {
      success: true,
      logs: [
        `[gh-actions] compiled on free GitHub Actions runner (run ${runId})`,
        `[gh-actions] binary size: ${bytes.byteLength} bytes`,
      ],
      errors: [],
      warnings: [],
      workDir,
      duration: Date.now() - startedAt,
      binaryPath,
      binarySize: bytes.byteLength,
      idlJson: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onLog(`[gh-actions] failed: ${msg}`, "error");
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    return {
      success: false,
      logs: [`[gh-actions] ${msg}`],
      errors: [msg],
      warnings: [],
      workDir: "",
      duration: Date.now() - startedAt,
      binaryPath: null,
      binarySize: null,
      idlJson: null,
    };
  }
}

/** Quick check used by compiler-strategy to prefer GH Actions when configured. */
export function isGitHubActionsConfigured(): boolean {
  return loadConfig().configured;
}

// ─── Test runner (cargo test via GitHub Actions, no VM) ───────────────────────

/** Download the test-log artifact text (best-effort). */
async function downloadTestLog(runId: number, cfg: GhConfig): Promise<string> {
  const { token, owner, repo } = cfg;
  try {
    const arts = await ghJson<{ artifacts: Array<{ name: string; archive_download_url: string }> }>(
      `/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`,
      token,
    );
    const art = arts.artifacts?.find((a) => a.name === "test-log");
    if (!art) return "";
    const res = await fetch(art.archive_download_url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return "";
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    for (const [name, data] of Object.entries(files)) {
      if (name.endsWith(".log") || name.endsWith(".txt") || !name.includes(".")) {
        return new TextDecoder().decode(data);
      }
    }
    return "";
  } catch {
    return "";
  }
}

/** Parse a cargo test log for pass/fail + the meaningful error lines. */
function parseCargoTestLog(log: string): { success: boolean; errors: string[] } {
  const lines = log.split("\n");
  const resultLine = lines.find((l) => l.includes("test result:"));
  const success = resultLine
    ? /test result:\s*ok/.test(resultLine)
    : !/error\[|error:|FAILED/i.test(log);
  const errors = lines
    .filter((l) => /error\[|^error:|panicked|test result: FAILED|^failures:|---- .* ----/.test(l))
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 20);
  return { success, errors };
}

export interface GitHubActionsTestResult {
  success: boolean;
  status: "PASSED" | "FAILED" | "ERROR";
  runtime: string;
  runner: string;
  command: string;
  setupCommand: string | null;
  logs: string[];
  errors: string[];
  warnings: string[];
  duration: number;
  workDir: string;
}

/**
 * Run `cargo test` on the generated program via GitHub Actions (no VM).
 * Same pattern as runGitHubActionsBuild: commit to a unique test/<id> branch,
 * wait for the "test" workflow, download the test log, parse pass/fail.
 */
export async function runGitHubActionsTest(
  input: { framework: "ANCHOR" | "PINOCCHIO" | "QUASAR"; files: { path: string; content: string }[] },
  onLog: (line: string, level: "info" | "warn" | "error") => void,
): Promise<GitHubActionsTestResult> {
  const startedAt = Date.now();
  const cfg = loadConfig();
  const command = "cargo test --manifest-path programs/program/Cargo.toml --lib";
  const base = {
    runtime: "cargo-smoke",
    runner: "github-actions",
    command,
    setupCommand: null as string | null,
    warnings: [] as string[],
    workDir: "",
  };

  if (!cfg.configured) {
    return {
      success: false,
      status: "ERROR",
      ...base,
      logs: ["GitHub Actions test runner not configured"],
      errors: [
        "GitHub Actions test runner not configured (set GITHUB_TOKEN, GITHUB_COMPILER_OWNER, GITHUB_COMPILER_REPO)",
      ],
      duration: 0,
    };
  }

  try {
    onLog(`[gh-actions-test] running cargo test via GitHub Actions (${cfg.owner}/${cfg.repo})`, "info");
    const buildId = `${Date.now()}-${randomBytes(6).toString("hex")}`;
    const testBranch = `test/${buildId}`;
    const filesWithBuildId = [
      ...input.files,
      { path: "BUILD_ID", content: `solflow-test-${buildId}\n` },
    ];
    const commitSha = await commitSourceFiles(filesWithBuildId, cfg, onLog, testBranch);
    const runId = await waitForRun(commitSha, cfg, onLog);
    const logText = await downloadTestLog(runId, cfg);

    // Best-effort cleanup of the per-test branch.
    await ghRequest(
      `/repos/${cfg.owner}/${cfg.repo}/git/refs/heads/${testBranch}`,
      cfg.token,
      { method: "DELETE" },
    ).catch(() => undefined);

    const { success, errors } = parseCargoTestLog(logText);
    onLog(`[gh-actions-test] ${success ? "PASSED" : "FAILED"}`, success ? "info" : "error");
    return {
      success,
      status: success ? "PASSED" : "FAILED",
      ...base,
      logs: logText ? logText.split("\n") : ["(no test log returned)"],
      errors,
      duration: Date.now() - startedAt,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onLog(`[gh-actions-test] error: ${msg}`, "error");
    return {
      success: false,
      status: "ERROR",
      ...base,
      logs: [`[gh-actions-test] error: ${msg}`],
      errors: [msg],
      duration: Date.now() - startedAt,
    };
  }
}
