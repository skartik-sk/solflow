"use client";

// Build Store — compile, test, and deploy state.
// Per docs/architecture/18-state-management.md → Build Store section.

import { create } from "zustand";

// The SBF linker reports large stack frames (often in dependencies) as "Error: ... Stack offset ... exceeded";
// the build still succeeds, so show it as a warning.
const STACK_WARNING = /Stack offset of \d+ exceeded max offset/;

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const logLevel = (line: string): BuildLogLine["level"] =>
  /^error/i.test(line) && !STACK_WARNING.test(line)
    ? "error"
    : /^warning/i.test(line) || STACK_WARNING.test(line)
      ? "warn"
      : "info";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Server-side limits for completeBrowserBuild; clamp here too so a huge log never fails the upload.
const MAX_UPLOAD_LOG_LINES = 500;
const MAX_UPLOAD_LINE_CHARS = 10_000;
const MAX_UPLOAD_ERROR_CHARS = 20_000;

export function clampForUpload(lines: string[]): string[] {
  const clipped = lines.map((l) =>
    l.length > MAX_UPLOAD_LINE_CHARS ? `${l.slice(0, MAX_UPLOAD_LINE_CHARS)}… [truncated]` : l,
  );
  if (clipped.length <= MAX_UPLOAD_LOG_LINES) return clipped;
  return [
    `… ${clipped.length - (MAX_UPLOAD_LOG_LINES - 1)} earlier line(s) truncated`,
    ...clipped.slice(-(MAX_UPLOAD_LOG_LINES - 1)),
  ];
}

/** RPC the user's wallet funds the deployer through: must be the network being deployed to. */
export function fundingRpcUrl(
  network: "DEVNET" | "MAINNET" | "LOCALNET",
  env: { mainnet?: string; devnet?: string } = {
    mainnet: process.env.NEXT_PUBLIC_MAINNET_RPC_URL,
    devnet: process.env.NEXT_PUBLIC_DEVNET_RPC_URL ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
  },
): string {
  if (network === "MAINNET") return env.mainnet || "https://api.mainnet-beta.solana.com";
  if (network === "LOCALNET") return "http://localhost:8899";
  return env.devnet || "https://api.devnet.solana.com";
}

/** Save the open project first if it has unsaved edits, so server actions read current state. */
async function saveIfDirty(): Promise<void> {
  const { useProjectStore } = await import("./project-store");
  if (useProjectStore.getState().isDirty) {
    await useProjectStore.getState().save();
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BuildLogLine {
  line: string;
  level: "info" | "warn" | "error";
  timestamp: number;
}

export interface TestResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  duration: number;
  error?: string;
}

export type CompileStatus =
  | "idle"
  | "queued"
  | "building"
  | "success"
  | "error";
export type TestStatus = "idle" | "running" | "passed" | "failed";
export type GeneratedTestRuntime = "cargo-smoke" | "surfpool-simnet";
export type DeployStatus =
  | "idle"
  | "deploying"
  | "confirming"
  | "success"
  | "error";

// ─── State interface ──────────────────────────────────────────────────────────

interface BuildState {
  // ─── Compilation ──────────────────────────────────────────────
  compileStatus: CompileStatus;
  compileLogs: BuildLogLine[];
  compileJobId: string | null;
  compileErrors: string[];
  compileWarnings: string[];
  compileBinarySize: number | null;

  // ─── Testing ──────────────────────────────────────────────────
  testStatus: TestStatus;
  testResults: TestResult[];
  testLogs: BuildLogLine[];
  testRunId: string | null;
  testSummary: { passed: number; failed: number; total: number } | null;
  testRunner: string | null;
  testRuntime: GeneratedTestRuntime | null;
  testCommand: string | null;
  testSetupCommand: string | null;
  testDuration: number | null;

  // ─── Deployment ───────────────────────────────────────────────
  deployStatus: DeployStatus;
  deployPhase: string | null;
  deployErrors: string[];
  deployProgress: { current: number; total: number } | null;
  deployedProgramId: string | null;
  deployTxSignature: string | null;
  deployExplorerUrl: string | null;
  deployTxExplorerUrl: string | null;
  deploymentId: string | null;

  // ─── Actions ──────────────────────────────────────────────────
  startCompile: (projectId: string) => Promise<void>;
  startTest: (
    projectId: string,
    testCases?: Array<{
      name: string;
      instruction: string;
      accounts: Record<string, string>;
      args: Record<string, string>;
      expectedResult: "success" | { error: string };
    }>,
    runtime?: GeneratedTestRuntime,
  ) => Promise<void>;
  startDeploy: (
    projectId: string,
    network: "DEVNET" | "MAINNET" | "LOCALNET",
    walletContext?: {
      publicKey: { toBase58: () => string } | null;
      signTransaction: ((tx: unknown) => Promise<unknown>) | undefined;
      connected: boolean;
    } | null,
  ) => Promise<void>;
  /** Pick up a deploy that was in flight when the page reloaded (call on editor load). */
  resumeDeploy: (projectId: string) => Promise<void>;
  /** Close a failed deploy's buffer account and return its SOL to the deployer. */
  reclaimDeployBuffer: (deploymentId: string) => Promise<string>;
  resetProgramKeypair: (projectId: string) => Promise<string>;
  addLog: (log: BuildLogLine) => void;
  clearLogs: () => void;
  reset: () => void;
}

// ─── Initial state ────────────────────────────────────────────────────────────

const INITIAL: Omit<
  BuildState,
  | "startCompile"
  | "startTest"
  | "startDeploy"
  | "resumeDeploy"
  | "reclaimDeployBuffer"
  | "addLog"
  | "clearLogs"
  | "resetProgramKeypair"
  | "reset"
> = {
  compileStatus: "idle",
  compileLogs: [],
  compileJobId: null,
  compileErrors: [],
  compileWarnings: [],
  compileBinarySize: null,
  testStatus: "idle",
  testResults: [],
  testLogs: [],
  testRunId: null,
  testSummary: null,
  testRunner: null,
  testRuntime: null,
  testCommand: null,
  testSetupCommand: null,
  testDuration: null,
  deployStatus: "idle",
  deployPhase: null,
  deployErrors: [],
  deployProgress: null,
  deployedProgramId: null,
  deployTxSignature: null,
  deployExplorerUrl: null,
  deployTxExplorerUrl: null,
  deploymentId: null,
};

// ─── In-browser compile ───────────────────────────────────────────────────────

/** Returns false when the caller should fall back to the server compile. */
async function compileInBrowser(
  projectId: string,
  framework: string,
  client: ReturnType<typeof import("@/lib/trpc/client").getVanillaClient>,
  get: () => BuildState,
  set: (partial: Partial<BuildState>) => void,
): Promise<boolean> {
  const browser = await import("@solflow/browser-compiler");
  if (!browser.browserCompileSupported(framework)) return false;

  const log = (line: string, level: BuildLogLine["level"] = "info") =>
    get().addLog({ line, level, timestamp: Date.now() });

  const prep = await client.compile.prepareBrowserBuild.mutate({ projectId });
  set({ compileStatus: "building", compileJobId: prep.jobId });
  log(`Code generation — ${prep.files.length} file(s)`);
  for (const warning of prep.warnings) log(warning, "warn");
  log("Compiling in your browser…");

  const started = performance.now();
  let lastStep = "";
  let lastPct = -1;
  try {
    const build = await browser.compileInBrowser(framework, prep.files, (step, loaded, total) => {
      if (step !== lastStep) {
        lastStep = step;
        lastPct = -1;
        if (!loaded) log(`${step}…`);
      }
      if (loaded && total) {
        const pct = Math.floor((loaded / total) * 4) * 25;
        if (pct !== lastPct) {
          lastPct = pct;
          log(`${step}: ${pct}% of ${(total / 1e6).toFixed(1)} MB (first time only)`);
        }
      }
    });
    const durationMs = Math.round(performance.now() - started);
    const warnings = build.stderr.split("\n").filter((l) => l.trim());
    for (const line of warnings) log(line, logLevel(line));
    const done = await client.compile.completeBrowserBuild.mutate({
      jobId: prep.jobId,
      program: toBase64(build.program),
      logs: clampForUpload(get().compileLogs.map((l) => l.line)),
      durationMs,
    });
    log(
      `Compilation successful — ${build.program.length} bytes, compiled in your browser in ${(build.timings.rustcMs / 1000).toFixed(1)}s`,
    );
    set({ compileStatus: "success", compileBinarySize: done.binarySize });
    return true;
  } catch (err) {
    const e = err as { message?: string; stderr?: string; unsupported?: boolean };
    const message = e.message ?? String(err);
    const rustErrors = e.stderr?.trim() && message === "Rust compilation failed";
    await client.compile.completeBrowserBuild
      .mutate({
        jobId: prep.jobId,
        errors: [(rustErrors ? e.stderr! : message).slice(-MAX_UPLOAD_ERROR_CHARS)],
      })
      .catch(() => undefined);

    if (rustErrors) {
      // Real compile errors: the server would report the same thing.
      for (const line of e.stderr!.split("\n").filter((l) => l.trim())) log(line, logLevel(line));
      set({ compileStatus: "error", compileErrors: [e.stderr!] });
      return true;
    }
    log(
      e.unsupported
        ? `${message} — compiling on the server instead.`
        : `Browser compiler unavailable (${message}) — compiling on the server instead.`,
      "warn",
    );
    return false;
  }
}

// ─── Server job polling (GitHub Actions builds/tests run outside the request) ─

type VanillaClient = ReturnType<typeof import("@/lib/trpc/client").getVanillaClient>;

const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_MS = 25 * 60_000;

async function pollCompile(
  jobId: string,
  client: VanillaClient,
  get: () => BuildState,
  set: (partial: Partial<BuildState>) => void,
): Promise<void> {
  const started = Date.now();
  let shownLines = 0;
  while (Date.now() - started < POLL_MAX_MS) {
    await sleep(POLL_INTERVAL_MS);
    if (get().compileJobId !== jobId) return; // a newer compile replaced this one
    let row;
    try {
      row = await client.compile.status.query({ jobId });
    } catch {
      continue; // transient; try again
    }
    const lines = (row.logs ?? "").split("\n").filter(Boolean);
    // The first lines were already shown from the start response.
    for (const line of lines.slice(Math.max(shownLines, 2))) {
      get().addLog({ line, level: logLevel(line), timestamp: Date.now() });
    }
    shownLines = Math.max(shownLines, lines.length);
    if (row.status === "SUCCESS") {
      get().addLog({
        line: `Compilation successful — ${row.binarySize ?? 0} bytes (github-actions)`,
        level: "info",
        timestamp: Date.now(),
      });
      set({ compileStatus: "success", compileBinarySize: row.binarySize ?? null });
      return;
    }
    if (row.status === "FAILED") {
      const errors = Array.isArray(row.errors) ? (row.errors as string[]) : [];
      set({ compileStatus: "error", compileErrors: [errors.join("\n") || "Compilation failed."] });
      return;
    }
  }
  set({ compileStatus: "error", compileErrors: ["Compilation is taking too long. Check the build history later."] });
}

type DeploySnapshot = {
  deploymentId: string;
  phase: string;
  progress: { current: number; total: number } | null;
  programId: string;
  txSignature: string | null;
  explorerUrl: string | null;
  txExplorerUrl: string | null;
  isUpgrade: boolean;
  busy?: boolean;
};

const DEPLOY_PHASE_LABEL: Record<string, string> = {
  create: "Creating buffer account…",
  write: "Writing program",
  verify: "Verifying buffer",
  finalize: "Deploying program…",
};

/**
 * Drive a deploy to completion: call deploy.step until the buffer is written and
 * verified, then deploy.finalize until confirmed. Every call is short; progress
 * lives on the server row, so this can be re-entered after a reload.
 */
async function driveDeploy(
  first: DeploySnapshot,
  client: VanillaClient,
  get: () => BuildState,
  set: (partial: Partial<BuildState>) => void,
): Promise<void> {
  const log = (line: string, level: BuildLogLine["level"] = "info") =>
    get().addLog({ line, level, timestamp: Date.now() });
  const show = (snap: DeploySnapshot) => {
    const phase = snap.phase === "write" || snap.phase === "verify" ? "writing" : snap.phase === "finalize" ? "deploying" : snap.phase;
    set({
      deploymentId: snap.deploymentId,
      deployedProgramId: snap.programId,
      deployStatus: snap.phase === "finalize" ? "confirming" : "deploying",
      deployPhase: phase,
      deployProgress: snap.progress,
    });
  };

  let snap = first;
  let lastPhase = "";
  let failures = 0;
  let calls = 0;
  show(snap);
  while (snap.phase !== "done") {
    if (get().deploymentId !== snap.deploymentId) return; // another deploy took over
    if (++calls > 600) throw new Error("Deploy did not finish. Reload the editor to resume it.");
    if (snap.phase !== lastPhase) {
      lastPhase = snap.phase;
      const label = DEPLOY_PHASE_LABEL[snap.phase];
      if (label) log(snap.progress && snap.phase !== "finalize" ? `${label} (${snap.progress.total} chunks)…` : label);
    }
    try {
      const next = (
        snap.phase === "finalize"
          ? await client.deploy.finalize.mutate({ deploymentId: snap.deploymentId })
          : await client.deploy.step.mutate({ deploymentId: snap.deploymentId })
      ) as DeploySnapshot;
      failures = 0;
      if (next.busy) {
        log("Deploy is running in another tab; waiting…", "warn");
        await sleep(5_000);
      } else if (next.phase === "finalize" && snap.phase === "finalize") {
        await sleep(2_000); // deploy tx sent, not yet confirmed
      }
      snap = next;
      show(snap);
    } catch (err) {
      const e = err as { message?: string; data?: { code?: string } };
      const code = e.data?.code;
      // BAD_REQUEST / PRECONDITION_FAILED are final (the server already marked the row).
      if (code === "BAD_REQUEST" || code === "PRECONDITION_FAILED" || code === "NOT_FOUND" || ++failures > 4) {
        throw err;
      }
      log(`${e.message ?? String(err)} — retrying…`, "warn");
      await sleep(3_000 * failures);
    }
  }

  set({
    deployStatus: "success",
    deployPhase: "complete",
    deployProgress: snap.progress,
    deployedProgramId: snap.programId,
    deployTxSignature: snap.txSignature,
    deployExplorerUrl: snap.explorerUrl ?? null,
    deployTxExplorerUrl: snap.txExplorerUrl ?? null,
  });
  log(`Deployed! Program: ${snap.programId}`);
  if (snap.txSignature) log(`TX: ${snap.txSignature}`);
}

function reportDeployError(err: unknown, get: () => BuildState, set: (partial: Partial<BuildState>) => void) {
  const msg = err instanceof Error ? err.message : String(err);
  for (const line of msg.split("\n")) {
    if (line.trim()) get().addLog({ line: line.trim(), level: "error", timestamp: Date.now() });
  }
  set({ deployStatus: "error", deployPhase: "error", deployErrors: [msg] });
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useBuildStore = create<BuildState>((set, get) => ({
  ...INITIAL,

  addLog: (log) => set((s) => ({ compileLogs: [...s.compileLogs, log] })),

  clearLogs: () => set({ compileLogs: [] }),

  reset: () => set(INITIAL),

  // ─── Compile ────────────────────────────────────────────────────────────
  startCompile: async (projectId: string) => {
    set({
      compileStatus: "queued",
      compileLogs: [],
      compileErrors: [],
      compileWarnings: [],
      compileBinarySize: null,
    });

    try {
      // Ensure project is saved (with IR) before compiling
      const { useProjectStore } = await import("./project-store");
      const { isDirty } = useProjectStore.getState();

      if (isDirty) {
        await useProjectStore.getState().save();
      }

      get().addLog({
        line: "Project saved, generating IR…",
        level: "info",
        timestamp: Date.now(),
      });

      const { getVanillaClient } = await import("@/lib/trpc/client");
      const client = getVanillaClient();

      // Pinocchio builds run in the browser; anything else, or any browser failure, uses the server.
      const framework = useProjectStore.getState().framework.toUpperCase();
      if (await compileInBrowser(projectId, framework, client, get, set)) return;

      const result = await client.compile.start.mutate({ projectId });

      set({ compileStatus: "building", compileJobId: result.jobId });

      if ("pending" in result && result.pending) {
        for (const line of result.logs ?? []) {
          get().addLog({ line, level: logLevel(line), timestamp: Date.now() });
        }
        await pollCompile(result.jobId, client, get, set);
        return;
      }

      if (result.logs && Array.isArray(result.logs)) {
        for (const line of result.logs) {
          get().addLog({ line, level: logLevel(line), timestamp: Date.now() });
        }
      }

      if (result.error) {
        set({
          compileStatus: "error",
          compileErrors: [result.error],
        });
      } else if (result.binaryBuilt) {
        get().addLog({
          line: `Compilation successful — ${result.binarySize ?? 0} bytes (${result.compileMethod ?? "unknown"})`,
          level: "info",
          timestamp: Date.now(),
        });
        set({
          compileStatus: "success",
          compileBinarySize: result.binarySize ?? null,
        });
      } else {
        const errMsg = result.errors?.length
          ? result.errors.join("\n")
          : "Compilation produced no binary.";
        set({
          compileStatus: "error",
          compileErrors: [errMsg],
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ compileStatus: "error", compileErrors: [msg] });
    }
  },

  // ─── Test ───────────────────────────────────────────────────────────────
  // `testCases` is accepted for API compatibility but not sent: the server runs
  // the generated crate's tests, which can't execute custom cases yet.
  startTest: async (projectId, _testCases, runtime = "cargo-smoke") => {
    set({
      testStatus: "running",
      testResults: [],
      testLogs: [],
      testSummary: null,
      testRunner: null,
      testRuntime: runtime,
      testCommand: null,
      testSetupCommand: null,
      testDuration: null,
    });

    const toLogs = (resp: { logs?: unknown; errors?: unknown; warnings?: unknown }): BuildLogLine[] => [
      ...(Array.isArray(resp.logs)
        ? (resp.logs as string[]).map((line) => ({ line, level: logLevel(line), timestamp: Date.now() }))
        : []),
      ...(Array.isArray(resp.errors)
        ? (resp.errors as string[]).map((line) => ({ line, level: "error" as const, timestamp: Date.now() }))
        : []),
      ...(Array.isArray(resp.warnings)
        ? (resp.warnings as string[]).map((line) => ({ line, level: "warn" as const, timestamp: Date.now() }))
        : []),
    ];

    try {
      // Tests read the saved project, so save unsaved edits first (as compile does).
      await saveIfDirty();

      const { getVanillaClient } = await import("@/lib/trpc/client");
      const client = getVanillaClient();
      let resp = await client.test.run.mutate({ projectId, runtime });
      set({ testRunId: resp.runId, testLogs: toLogs(resp) });

      // GitHub Actions runs finish outside the request: poll the run.
      const started = Date.now();
      while (resp.pending) {
        if (Date.now() - started > POLL_MAX_MS) throw new Error("Test run is taking too long. Check the test history later.");
        await sleep(POLL_INTERVAL_MS);
        if (get().testRunId !== resp.runId) return; // a newer run replaced this one
        try {
          resp = (await client.test.status.query({ runId: resp.runId })) as typeof resp;
        } catch {
          continue;
        }
        set({ testLogs: toLogs(resp) });
      }

      set({
        testResults: resp.resultItems,
        testSummary: resp.results,
        testStatus: resp.results.failed === 0 && resp.status !== "error" ? "passed" : "failed",
        testRunner: typeof resp.runner === "string" ? resp.runner : null,
        testRuntime: (resp.runtime as GeneratedTestRuntime | undefined) ?? runtime,
        testCommand: typeof resp.command === "string" ? resp.command : null,
        testSetupCommand: typeof resp.setupCommand === "string" ? resp.setupCommand : null,
        testDuration: typeof resp.duration === "number" ? resp.duration : null,
        testLogs: toLogs(resp),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({
        testStatus: "failed",
        testLogs: [{ line: msg, level: "error", timestamp: Date.now() }],
      });
    }
  },

  // ─── Deploy ─────────────────────────────────────────────────────────────
  // Flow:
  //   1. Check the deployer balance; if low, fund it from the user's wallet
  //      on the SAME network (one wallet prompt).
  //   2. deploy.start → deploy.step (repeat) → deploy.finalize (repeat).
  //      Each call is short; the server keeps progress on the Deployment row,
  //      so a reload resumes via resumeDeploy().
  startDeploy: async (
    projectId: string,
    network: "DEVNET" | "MAINNET" | "LOCALNET" = "DEVNET",
    walletContext?: {
      publicKey: { toBase58: () => string } | null;
      signTransaction: ((tx: unknown) => Promise<unknown>) | undefined;
      connected: boolean;
    } | null,
  ) => {
    set({
      deployStatus: "deploying",
      deployPhase: "preparing",
      deployErrors: [],
      deployProgress: null,
      deployedProgramId: null,
      deployTxSignature: null,
      deployExplorerUrl: null,
      deployTxExplorerUrl: null,
    });

    try {
      const { getVanillaClient } = await import("@/lib/trpc/client");
      const client = getVanillaClient();

      get().addLog({ line: "Checking deployer balance…", level: "info", timestamp: Date.now() });
      const bal = await client.deploy.checkBalance.query({ projectId, network });

      if (bal.address && !bal.funded) {
        const deficitLamports = bal.needed - bal.balance;
        const deficitSol = (deficitLamports / 1e9).toFixed(2);

        if (walletContext?.connected && walletContext.publicKey && walletContext.signTransaction) {
          const MAX_FUND_LAMPORTS = 5 * 1e9; // 5 SOL max auto-fund
          if (deficitLamports > MAX_FUND_LAMPORTS) {
            get().addLog({
              line: `Funding exceeds safety limit (${deficitSol} SOL > ${(MAX_FUND_LAMPORTS / 1e9).toFixed(1)} SOL max). Use manual funding.`,
              level: "error",
              timestamp: Date.now(),
            });
            set({
              deployStatus: "error",
              deployErrors: [`Amount exceeds safety limit. Manually send ${deficitSol} SOL to:\n${bal.address}`],
            });
            return;
          }

          get().addLog({
            line: `Deployer needs ~${deficitSol} SOL. Opening wallet to fund…`,
            level: "info",
            timestamp: Date.now(),
          });

          const { Connection, Transaction, SystemProgram, PublicKey } = await import("@solana/web3.js");
          const connection = new Connection(fundingRpcUrl(network), "confirmed");
          const fromPubkey = new PublicKey(walletContext.publicKey.toBase58());
          const transferAmount = Math.min(deficitLamports + 0.01 * 1e9, MAX_FUND_LAMPORTS);

          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
          const transferTx = new Transaction({ blockhash, lastValidBlockHeight, feePayer: fromPubkey }).add(
            SystemProgram.transfer({
              fromPubkey,
              toPubkey: new PublicKey(bal.address),
              lamports: Math.ceil(transferAmount),
            }),
          );

          get().addLog({ line: "Waiting for wallet signature to fund deployer…", level: "info", timestamp: Date.now() });
          const signed = (await walletContext.signTransaction(transferTx)) as { serialize: () => Uint8Array };
          const sig = await connection.sendRawTransaction(signed.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          });
          await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

          get().addLog({
            line: `Funded! ${deficitSol} SOL sent to ${bal.address.slice(0, 8)}…`,
            level: "info",
            timestamp: Date.now(),
          });
        } else {
          get().addLog({
            line: `Insufficient funds. Connect wallet to fund automatically, or send at least ${deficitSol} SOL to ${bal.address}`,
            level: "error",
            timestamp: Date.now(),
          });
          if (network === "DEVNET") {
            get().addLog({ line: `https://faucet.solana.com/?address=${bal.address}`, level: "info", timestamp: Date.now() });
          }
          set({
            deployStatus: "error",
            deployErrors: [
              `Connect your wallet to fund the deployer, or send ${deficitSol} SOL to:\n${bal.address}` +
                (network === "DEVNET" ? `\n\nFaucet: https://faucet.solana.com/?address=${bal.address}` : ""),
            ],
          });
          return;
        }
      } else if (bal.address) {
        get().addLog({
          line: `Balance OK: ${(bal.balance / 1e9).toFixed(2)} SOL`,
          level: "info",
          timestamp: Date.now(),
        });
      }

      const first = await client.deploy.start.mutate({ projectId, network });
      get().addLog({
        line: first.resumed
          ? `Resuming deploy of ${first.programId} (${first.progress?.current ?? 0}/${first.progress?.total ?? 0} chunks written)…`
          : `Deploying ${first.programId} (${first.isUpgrade ? "upgrade" : "new program"})…`,
        level: "info",
        timestamp: Date.now(),
      });
      set({ deploymentId: first.deploymentId });
      await driveDeploy(first, client, get, set);
    } catch (err: unknown) {
      reportDeployError(err, get, set);
    }
  },

  resumeDeploy: async (projectId: string) => {
    if (get().deployStatus === "deploying" || get().deployStatus === "confirming") return;
    try {
      const { getVanillaClient } = await import("@/lib/trpc/client");
      const client = getVanillaClient();
      const { pending, reclaimable } = await client.deploy.active.query({ projectId });
      if (reclaimable.length > 0) {
        get().addLog({
          line: `${reclaimable.length} failed deploy(s) still hold buffer SOL. Reclaim it from the deploy history.`,
          level: "warn",
          timestamp: Date.now(),
        });
      }
      if (!pending) return;
      get().addLog({
        line: `Resuming the deploy of ${pending.programId} that was in progress…`,
        level: "info",
        timestamp: Date.now(),
      });
      set({ deployErrors: [], deploymentId: pending.deploymentId });
      await driveDeploy(pending, client, get, set);
    } catch (err) {
      reportDeployError(err, get, set);
    }
  },

  reclaimDeployBuffer: async (deploymentId: string) => {
    const { getVanillaClient } = await import("@/lib/trpc/client");
    const client = getVanillaClient();
    const res = await client.deploy.reclaimBuffer.mutate({ deploymentId });
    get().addLog({ line: res.message, level: res.closed ? "info" : "warn", timestamp: Date.now() });
    return res.message;
  },

  // ─── Reset Program Keypair ──────────────────────────────────────────────
  resetProgramKeypair: async (projectId: string) => {
    const { getVanillaClient } = await import("@/lib/trpc/client");
    const client = getVanillaClient();
    const result = await client.deploy.resetProgramKeypair.mutate({
      projectId,
    });
    get().addLog({
      line: `Program keypair reset. New program ID: ${result.programId}`,
      level: "info",
      timestamp: Date.now(),
    });
    get().addLog({
      line: "Next deploy will create a fresh program with upgrade headroom.",
      level: "info",
      timestamp: Date.now(),
    });

    // Update the program node in the flow store so generated code uses new ID
    const { useFlowStore } = await import("@/store/flow-store");
    const nodes = useFlowStore.getState().nodes;
    const programNode = nodes.find((n) => n.type === "program");
    if (programNode) {
      useFlowStore.getState().updateNodeData(programNode.id, {
        programId: result.programId,
      });
    }

    return result.programId;
  },
}));
