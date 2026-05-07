"use client";

// Build Store — compile, test, and deploy state.
// Per docs/architecture/18-state-management.md → Build Store section.

import { create } from "zustand";

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
  resetProgramKeypair: (projectId: string) => Promise<string>;
  addLog: (log: BuildLogLine) => void;
  clearLogs: () => void;
  reset: () => void;
}

// ─── Initial state ────────────────────────────────────────────────────────────

const INITIAL: Omit<
  BuildState,
  "startCompile" | "startTest" | "startDeploy" | "addLog" | "clearLogs" | "resetProgramKeypair" | "reset"
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
      const result = await client.compile.start.mutate({ projectId });

      set({ compileStatus: "building", compileJobId: result.jobId });

      if (result.logs && Array.isArray(result.logs)) {
        for (const line of result.logs) {
          const level = /^error/i.test(line)
            ? "error"
            : /^warning/i.test(line)
              ? "warn"
              : "info";
          get().addLog({ line, level, timestamp: Date.now() });
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
  startTest: async (projectId, testCases, runtime = "cargo-smoke") => {
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

    try {
      const { getVanillaClient } = await import("@/lib/trpc/client");
      const client = getVanillaClient();
      const resp = await client.test.run.mutate({ projectId, testCases, runtime });

      set({ testRunId: resp.runId });

      if ("resultItems" in resp && Array.isArray(resp.resultItems)) {
        set({
          testResults: resp.resultItems,
          testSummary: resp.results,
          testStatus: resp.results.failed === 0 ? "passed" : "failed",
          testRunner: typeof resp.runner === "string" ? resp.runner : null,
          testRuntime: resp.runtime ?? runtime,
          testCommand: typeof resp.command === "string" ? resp.command : null,
          testSetupCommand:
            typeof resp.setupCommand === "string" ? resp.setupCommand : null,
          testDuration:
            typeof resp.duration === "number" ? resp.duration : null,
          testLogs: [
            ...(Array.isArray(resp.logs)
              ? resp.logs.map((line: string) => ({
                  line,
                  level: (/^error/i.test(line) ? "error" : /^warning/i.test(line) ? "warn" : "info") as
                    | "info"
                    | "warn"
                    | "error",
                  timestamp: Date.now(),
                }))
              : []),
            ...(Array.isArray(resp.errors)
              ? resp.errors.map((line: string) => ({
                  line,
                  level: "error" as const,
                  timestamp: Date.now(),
                }))
              : []),
            ...(Array.isArray(resp.warnings)
              ? resp.warnings.map((line: string) => ({
                  line,
                  level: "warn" as const,
                  timestamp: Date.now(),
                }))
              : []),
          ],
        });
        return;
      }

      const { connectWS, onJobMessage, isTestResult, isTestComplete, subscribeToJob } =
        await import("@/lib/ws");
      connectWS();
      subscribeToJob(resp.runId);

      await new Promise<void>((resolve) => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        const unsubscribe = onJobMessage(resp.runId, (msg) => {
          if (isTestResult(msg)) {
            const data = msg.data as {
              test: string;
              passed: boolean;
              time?: number;
              error?: string;
            };
            set((s) => ({
              testResults: [
                ...s.testResults,
                {
                  name: data.test,
                  status: data.passed ? "passed" : "failed",
                  duration: data.time ?? 0,
                  error: data.error,
                },
              ],
            }));
          } else if (isTestComplete(msg)) {
            const data = msg.data as {
              passed: number;
              failed: number;
              total: number;
            };
            set({
              testStatus: data.failed === 0 ? "passed" : "failed",
              testSummary: {
                passed: data.passed,
                failed: data.failed,
                total: data.total,
              },
            });
            if (timeoutId) clearTimeout(timeoutId);
            unsubscribe();
            resolve();
          }
        });

        timeoutId = setTimeout(() => {
          unsubscribe();
          set({
            testStatus: "failed",
            testLogs: [{ line: "Test timed out after 5 minutes", level: "error" as const, timestamp: Date.now() }],
          });
          resolve();
        }, 300_000);
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
  //   1. Check program keypair balance
  //   2. If low → popup wallet to transfer SOL (1 prompt)
  //   3. Server deploys everything (zero prompts)
  //   Program keypair persists in DB — user only funds once.
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

      // Step 0: Check balance
      get().addLog({
        line: "Checking deployer balance…",
        level: "info",
        timestamp: Date.now(),
      });

      const bal = await client.deploy.checkBalance.query({
        projectId,
        network,
      });

      if (bal.address && !bal.funded) {
        const deficitLamports = bal.needed - bal.balance;
        const deficitSol = (deficitLamports / 1e9).toFixed(2);

        // Try to fund via user's wallet
        if (
          walletContext?.connected &&
          walletContext.publicKey &&
          walletContext.signTransaction
        ) {
          get().addLog({
            line: `Deployer needs ~${deficitSol} SOL. Opening wallet to fund…`,
            level: "info",
            timestamp: Date.now(),
          });

          const { Connection, Transaction, SystemProgram, PublicKey } =
            await import("@solana/web3.js");
          const rpcUrl =
            network === "MAINNET"
              ? (process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
                "https://api.mainnet-beta.solana.com")
              : network === "LOCALNET"
                ? "http://localhost:8899"
                : (process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
                  "https://api.devnet.solana.com");

          const connection = new Connection(rpcUrl, "confirmed");
          const fromPubkey = walletContext.publicKey;
          const toPubkey = new PublicKey(bal.address);

          // Add a small buffer on top of the deficit
          const MAX_FUND_LAMPORTS = 5 * 1e9; // 5 SOL max auto-fund
          const bufferLamports = 0.01 * 1e9;
          const transferAmount = Math.min(deficitLamports + bufferLamports, MAX_FUND_LAMPORTS);

          if (deficitLamports > MAX_FUND_LAMPORTS) {
            get().addLog({
              line: `Funding exceeds safety limit (${(deficitLamports / 1e9).toFixed(2)} SOL > ${(MAX_FUND_LAMPORTS / 1e9).toFixed(1)} SOL max). Use manual funding.`,
              level: "error",
              timestamp: Date.now(),
            });
            set({
              deployStatus: "error",
              deployErrors: [`Amount exceeds safety limit. Manually send ${(deficitSol)} SOL to:\n${bal.address}`],
            });
            return;
          }

          const { blockhash, lastValidBlockHeight } =
            await connection.getLatestBlockhash("confirmed");
          const transferTx = new Transaction({
            blockhash,
            lastValidBlockHeight,
            feePayer: new PublicKey(fromPubkey.toBase58()),
          });
          transferTx.add(
            SystemProgram.transfer({
              fromPubkey: new PublicKey(fromPubkey.toBase58()),
              toPubkey,
              lamports: transferAmount,
            }),
          );

          get().addLog({
            line: "Waiting for wallet signature to fund deployer…",
            level: "info",
            timestamp: Date.now(),
          });

          const signed = (await walletContext.signTransaction(transferTx)) as {
            serialize: () => Uint8Array;
          };
          const sig = await connection.sendRawTransaction(signed.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          });
          await connection.confirmTransaction(
            { signature: sig, blockhash, lastValidBlockHeight },
            "confirmed",
          );

          get().addLog({
            line: `Funded! ${deficitSol} SOL sent to ${bal.address.slice(0, 8)}…`,
            level: "info",
            timestamp: Date.now(),
          });
        } else {
          // No wallet connected — show faucet link
          get().addLog({
            line: `Insufficient funds. Connect wallet to fund automatically, or use faucet:`,
            level: "error",
            timestamp: Date.now(),
          });
          get().addLog({
            line: `https://faucet.solana.com/?address=${bal.address}`,
            level: "info",
            timestamp: Date.now(),
          });
          get().addLog({
            line: `Send at least ${deficitSol} SOL to ${bal.address}`,
            level: "info",
            timestamp: Date.now(),
          });
          set({
            deployStatus: "error",
            deployErrors: [
              `Connect your wallet to fund the deployer, or send ${deficitSol} SOL to:\n${bal.address}\n\nFaucet: https://faucet.solana.com/?address=${bal.address}`,
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

      // Deploy (server handles everything)
      get().addLog({
        line: "Deploying program (this may take 1-2 minutes)…",
        level: "info",
        timestamp: Date.now(),
      });

      // Subscribe to real-time deploy status via WebSocket
      const { connectWS, onWSMessage: onWS, subscribeToJob } =
        await import("@/lib/ws");
      connectWS();

      // We'll get the deploymentId from the first WS message
      let wsDeploymentId: string | null = null;
      const deployUnsubscribe = onWS((msg) => {
        if (msg.type !== "deploy-status") return;
        const jobId = msg.jobId;
        if (wsDeploymentId && jobId !== wsDeploymentId) return;

        // Track the deployment ID from first message and subscribe to job
        if (!wsDeploymentId) {
          wsDeploymentId = jobId;
          subscribeToJob(jobId);
        }

        const data = msg.data as {
          phase: string;
          message?: string;
          log?: string;
          level?: string;
          txSig?: string;
          txSignature?: string;
          programId?: string;
          explorerUrl?: string;
          txExplorerUrl?: string;
          written?: number;
          totalChunks?: number;
          missingChunks?: number;
          verifyPass?: number;
          error?: string;
        };

        // Log the phase message
        const logLine = data.log || data.message || data.phase;
        if (logLine) {
          const level = (data.level === "error" ? "error" : data.level === "warn" ? "warn" : "info") as "info" | "warn" | "error";
          get().addLog({ line: logLine, level, timestamp: Date.now() });
        }

        // Map server phase to deployStatus + deployPhase
        const phaseToStatus: Record<string, DeployStatus> = {
          funding: "deploying",
          funded: "deploying",
          buffer: "deploying",
          writing: "deploying",
          deploying: "confirming",
          cleanup: "confirming",
          complete: "success",
          error: "error",
        };
        set({
          deployStatus: phaseToStatus[data.phase] ?? "deploying",
          deployPhase: data.phase,
        });

        // Track chunk write progress
        if (data.written != null && data.totalChunks != null) {
          set({
            deployProgress: { current: data.written, total: data.totalChunks },
          });
        }

        // Capture early results from WS
        if (data.programId) set({ deployedProgramId: data.programId });
        if (data.txSignature || data.txSig) set({ deployTxSignature: data.txSignature || data.txSig || null });
        if (data.explorerUrl) set({ deployExplorerUrl: data.explorerUrl });
        if (data.txExplorerUrl) set({ deployTxExplorerUrl: data.txExplorerUrl });

        // Handle error phase
        if (data.phase === "error" && data.error) {
          set({ deployErrors: [data.error] });
        }
      });

      const result = await client.deploy.start.mutate({
        projectId,
        network,
      });

      // Unsubscribe from WS after mutate completes
      deployUnsubscribe();

      // Final state from tRPC result (may already be set via WS, but ensure consistency)
      set({
        deployStatus: "success",
        deployPhase: "complete",
        deployedProgramId: result.programId,
        deployTxSignature: result.txSignature,
        deployExplorerUrl: result.explorerUrl ?? null,
        deployTxExplorerUrl: (result as any).txExplorerUrl ?? null,
        deploymentId: result.deploymentId,
      });

      // Only log if WS didn't already stream the final result
      if (!wsDeploymentId) {
        get().addLog({
          line: `Deployed! Program: ${result.programId}`,
          level: "info",
          timestamp: Date.now(),
        });
        get().addLog({
          line: `TX: ${result.txSignature}`,
          level: "info",
          timestamp: Date.now(),
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      for (const line of msg.split("\n")) {
        if (line.trim()) {
          get().addLog({
            line: line.trim(),
            level: "error",
            timestamp: Date.now(),
          });
        }
      }
      set({ deployStatus: "error", deployErrors: [msg] });
    }
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
