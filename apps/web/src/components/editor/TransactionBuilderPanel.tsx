// apps/web/src/components/editor/TransactionBuilderPanel.tsx
// Bottom-panel "txbuilder" tab — construct, simulate, and send a transaction
// for any instruction defined in the IR. Uses @solana/kit for RPC and
// transaction building, wallet adapter for signing.

"use client";

import React, { useState, useCallback } from "react";
import {
  createSolanaRpc,
} from "@solana/kit";
import { useCodeStore } from "@/store/code-store";
import { useProjectStore, resolveRpcUrl, normalizeNetwork } from "@/store/project-store";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Connection,
  Transaction as Web3Transaction,
  TransactionInstruction as Web3TransactionInstruction,
  PublicKey,
} from "@solana/web3.js";
import type { Instruction, Account, InstructionArg } from "@solflow/ir";

// ─── helpers ─────────────────────────────────────────────────────────────────

type SimulateResult = {
  success: boolean;
  logs: string[];
  unitsConsumed?: number;
  error?: string;
};

type Network = "devnet" | "mainnet" | "localnet" | string;

function typeLabel(type: unknown): string {
  if (typeof type === "string") return type;
  if (type && typeof type === "object") {
    const t = type as Record<string, unknown>;
    if ("vec" in t) return `Vec<${typeLabel(t.vec)}>`;
    if ("option" in t) return `Option<${typeLabel(t.option)}>`;
    if ("defined" in t) return String(t.defined);
    if ("array" in t)
      return `[${typeLabel((t.array as unknown[])[0])}; ${(t.array as unknown[])[1]}]`;
  }
  return "unknown";
}

// ─── TxBuilderPanel ──────────────────────────────────────────────────────────

export function TransactionBuilderPanel() {
  const irJson = useCodeStore((s) => s.irJson);
  const network = useProjectStore((s) => s.network);
  const customEndpoints = useProjectStore((s) => s.customEndpoints);
  const framework = useProjectStore((s) => s.framework);
  const wallet = useWallet();

  const [selectedIx, setSelectedIx] = useState<string>("");
  // Same ids as the top bar ("mainnet", not "mainnet-beta") so resolveRpcUrl maps them.
  const [selectedNetwork, setSelectedNetwork] = useState<Network>(
    customEndpoints.some((e) => e.id === network) ? network : normalizeNetwork(network),
  );
  const [programId, setProgramId] = useState<string>(
    irJson?.program?.programId ?? "",
  );
  const [accounts, setAccounts] = useState<Record<string, string>>({});
  const [args, setArgs] = useState<Record<string, string>>({});
  const [payer, setPayer] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [simResult, setSimResult] = useState<SimulateResult | null>(null);
  const [sendSig, setSendSig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allInstructions: Instruction[] = irJson?.instructions ?? [];
  const instruction = allInstructions.find((ix) => ix.name === selectedIx) ?? null;

  // ─── When instruction selection changes, reset fields ───────────
  const handleSelectIx = useCallback(
    (name: string) => {
      setSelectedIx(name);
      setSimResult(null);
      setSendSig(null);
      setError(null);
      const ix = allInstructions.find((i) => i.name === name);
      if (!ix) return;
      setAccounts(
        Object.fromEntries(ix.accounts.map((a: Account) => [a.name, ""])),
      );
      setArgs(
        Object.fromEntries(
          (ix.args ?? []).map((a: InstructionArg) => [a.name, ""]),
        ),
      );
    },
    [allInstructions],
  );

  /** Build account keys shared by both simulate and send. */
  function buildAccountKeys(ix: Instruction) {
    return ix.accounts.map((acc: Account) => {
      const pubkeyStr = accounts[acc.name] || "";
      const pubkey = pubkeyStr ? new PublicKey(pubkeyStr) : PublicKey.unique();
      const isSigner = acc.constraints.some((c) => c.type === "signer");
      const isWritable = acc.constraints.some(
        (c) =>
          c.type === "mut" ||
          c.type === "init" ||
          c.type === "init-if-needed" ||
          c.type === "realloc",
      );
      return { pubkey, isSigner, isWritable };
    });
  }

  /** Build instruction data bytes shared by both simulate and send. */
  async function buildData(ix: Instruction): Promise<Buffer> {
    // Loaded on demand: it pulls in @solflow/sdk-gen for the shared discriminators.
    const { encodeInstructionData } = await import("./tx-encoding");
    const ixIndex = allInstructions.findIndex((i) => i.name === ix.name);
    return Buffer.from(encodeInstructionData(framework, ix.name, ixIndex, ix.args ?? [], args));
  }

  // ─── Simulate using @solana/kit RPC ─────────────────────────────
  const simulate = useCallback(async () => {
    if (!instruction || !programId.trim()) {
      setError("Select an instruction and enter a program ID.");
      return;
    }
    setLoading(true);
    setError(null);
    setSimResult(null);
    setSendSig(null);

    try {
      const rpcUrl = resolveRpcUrl(selectedNetwork, customEndpoints);
      // Create @solana/kit RPC for blockhash fetching
      const rpc = createSolanaRpc(rpcUrl);
      const connection = new Connection(rpcUrl, "confirmed");

      const programPk = new PublicKey(programId.trim());
      const feePayerPk = payer.trim()
        ? new PublicKey(payer.trim())
        : wallet.publicKey ?? new PublicKey("11111111111111111111111111111111");

      const keys = buildAccountKeys(instruction);
      const data = await buildData(instruction);

      const ix = new Web3TransactionInstruction({ keys, programId: programPk, data });

      // Fetch blockhash via @solana/kit RPC
      const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

      const tx = new Web3Transaction({
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: Number(latestBlockhash.lastValidBlockHeight),
        feePayer: feePayerPk,
      });
      tx.add(ix);

      // Simulate via web3.js (well-typed, wallet-compatible)
      const simulation = await connection.simulateTransaction(tx, undefined, false);

      if (simulation.value.err) {
        setSimResult({
          success: false,
          logs: simulation.value.logs ?? [],
          unitsConsumed: simulation.value.unitsConsumed ?? undefined,
          error:
            typeof simulation.value.err === "string"
              ? simulation.value.err
              : JSON.stringify(simulation.value.err),
        });
      } else {
        setSimResult({
          success: true,
          logs: simulation.value.logs ?? [],
          unitsConsumed: simulation.value.unitsConsumed ?? undefined,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setLoading(false);
    }
  }, [instruction, programId, selectedNetwork, payer, accounts, args, allInstructions, framework, wallet.publicKey]);

  // ─── Send (wallet adapter + @solana/kit RPC) ──────────────────
  const send = useCallback(async () => {
    if (!instruction || !programId.trim()) {
      setError("Select an instruction and enter a program ID.");
      return;
    }
    if (!wallet.connected || !wallet.publicKey || !wallet.signTransaction) {
      setError("Connect your wallet via the top-bar wallet button to sign and send transactions.");
      return;
    }
    setLoading(true);
    setError(null);
    setSendSig(null);

    try {
      const rpcUrl = resolveRpcUrl(selectedNetwork, customEndpoints);

      // Use @solana/kit RPC for blockhash fetching
      const rpc = createSolanaRpc(rpcUrl);
      // web3.js Connection for sendRawTransaction (wallet compat)
      const connection = new Connection(rpcUrl, "confirmed");

      const programPk = new PublicKey(programId.trim());
      const feePayerPk = wallet.publicKey;

      const keys = buildAccountKeys(instruction);
      const data = await buildData(instruction);

      const ix = new Web3TransactionInstruction({ keys, programId: programPk, data });

      // Fetch blockhash via @solana/kit RPC
      const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

      const web3Tx = new Web3Transaction({
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: Number(latestBlockhash.lastValidBlockHeight),
        feePayer: feePayerPk,
      });
      web3Tx.add(ix);

      const signed = await wallet.signTransaction(web3Tx);
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      // Confirm via web3.js
      await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: Number(latestBlockhash.lastValidBlockHeight),
        },
        "confirmed",
      );

      setSendSig(signature);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setLoading(false);
    }
  }, [instruction, programId, selectedNetwork, payer, accounts, args, allInstructions, framework, wallet]);

  // ─── Render ──────────────────────────────────────────────────────

  if (allInstructions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
        Generate code first — instructions will appear here for transaction
        building.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Controls row ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 min-h-10">
        <select
          value={selectedIx}
          onChange={(e) => handleSelectIx(e.target.value)}
          className="rounded-md border border-white/[0.08] bg-card px-2 py-1 text-[12px] focus:outline-none focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
        >
          <option value="">— select instruction —</option>
          {allInstructions.map((ix) => (
            <option key={ix.id} value={ix.name}>
              {ix.name}
            </option>
          ))}
        </select>

        <select
          value={selectedNetwork}
          onChange={(e) => setSelectedNetwork(e.target.value as Network)}
          className="rounded-md border border-white/[0.08] bg-card px-2 py-1 text-[12px] focus:outline-none focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
        >
          <option value="devnet">Devnet</option>
          <option value="mainnet">Mainnet</option>
          <option value="localnet">Localnet</option>
          {customEndpoints.length > 0 && (
            <optgroup label="Custom">
              {customEndpoints.map((ep) => (
                <option key={ep.id} value={ep.id}>{ep.name}</option>
              ))}
            </optgroup>
          )}
        </select>

        <input
          type="text"
          placeholder="Program ID"
          value={programId}
          onChange={(e) => setProgramId(e.target.value)}
          className="w-64 rounded-md border border-white/[0.08] bg-background/60 px-2 py-1 font-mono text-[12px] focus:outline-none focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
        />

        <button
          onClick={simulate}
          disabled={loading || !selectedIx}
          className="inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-[background-color,transform] duration-150 ease-out hover:bg-[#7fe0e6] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
        >
          {loading ? "Simulating…" : "Simulate"}
        </button>

        <button
          onClick={send}
          disabled={loading || !selectedIx}
          className="rounded-md border border-white/[0.08] px-3 py-1 text-[12px] hover:bg-white/[0.06] disabled:opacity-50"
        >
          Send
        </button>
      </div>

      {/* ── Form ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!instruction && (
          <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
            Select an instruction above to build a transaction.
          </div>
        )}

        {instruction && (
          <div className="divide-y divide-white/[0.05] px-4 py-3 space-y-4">
            {/* Fee payer */}
            <div>
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                Fee Payer
              </p>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  placeholder="pubkey (leave empty to use wallet)"
                  value={payer}
                  onChange={(e) => setPayer(e.target.value)}
                  className="flex-1 rounded-md border border-white/[0.08] bg-background/60 px-2 py-1 font-mono text-[12px] focus:outline-none focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
                />
                {wallet.publicKey && (
                  <button
                    onClick={() => setPayer(wallet.publicKey!.toBase58())}
                    title="Use connected wallet"
                    className="shrink-0 rounded-md border border-white/[0.08] px-1.5 py-1 text-[11px] text-primary hover:bg-white/[0.06] transition-colors duration-150 ease-out"
                  >
                    Wallet
                  </button>
                )}
              </div>
            </div>

            {/* Accounts */}
            {instruction.accounts.length > 0 && (
              <div className="pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    Accounts
                  </p>
                  {wallet.publicKey && instruction.accounts.some((a: Account) => a.constraints.some((c) => c.type === "signer")) && (
                    <button
                      onClick={() => {
                        const updated = { ...accounts };
                        for (const acc of instruction.accounts) {
                          if (acc.constraints.some((c) => c.type === "signer") && !updated[acc.name]) {
                            updated[acc.name] = wallet.publicKey!.toBase58();
                          }
                        }
                        setAccounts(updated);
                        if (!payer) setPayer(wallet.publicKey!.toBase58());
                      }}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Auto-fill signers
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {instruction.accounts.map((acc: Account) => {
                    const isSigner = acc.constraints.some(
                      (c) => c.type === "signer",
                    );
                    const isMut = acc.constraints.some((c) => c.type === "mut");
                    return (
                      <div key={acc.id} className="flex items-center gap-2">
                        <span className="w-36 shrink-0 font-mono text-[11px]">
                          {acc.name}
                        </span>
                        <span className="flex gap-1 shrink-0">
                          {isSigner && (
                            <span className="rounded bg-yellow-500/10 px-1 py-0.5 text-[11px] text-yellow-400">
                              signer
                            </span>
                          )}
                          {isMut && (
                            <span className="rounded bg-blue-500/10 px-1 py-0.5 text-[11px] text-blue-400">
                              writable
                            </span>
                          )}
                        </span>
                        <input
                          type="text"
                          placeholder="pubkey"
                          value={accounts[acc.name] ?? ""}
                          onChange={(e) =>
                            setAccounts((prev) => ({
                              ...prev,
                              [acc.name]: e.target.value,
                            }))
                          }
                          className="flex-1 rounded-md border border-white/[0.08] bg-background/60 px-2 py-0.5 font-mono text-[11px] placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
                        />
                        {wallet.publicKey && isSigner && (
                          <button
                            onClick={() =>
                              setAccounts((prev) => ({
                                ...prev,
                                [acc.name]: wallet.publicKey!.toBase58(),
                              }))
                            }
                            title="Use connected wallet"
                            className="shrink-0 rounded-md border border-white/[0.08] px-1.5 py-0.5 text-[11px] text-primary hover:bg-white/[0.06] transition-colors duration-150 ease-out"
                          >
                            Me
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Args */}
            {(instruction.args ?? []).length > 0 && (
              <div className="pt-3">
                <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
                  Arguments
                </p>
                <div className="space-y-1.5">
                  {(instruction.args ?? []).map((arg: InstructionArg) => (
                    <div key={arg.name} className="flex items-center gap-2">
                      <span className="w-36 shrink-0 font-mono text-[11px]">
                        {arg.name}
                      </span>
                      <span className="shrink-0 rounded bg-muted/50 px-1 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {typeLabel(arg.type)}
                      </span>
                      <input
                        type="text"
                        placeholder="value"
                        value={args[arg.name] ?? ""}
                        onChange={(e) =>
                          setArgs((prev) => ({
                            ...prev,
                            [arg.name]: e.target.value,
                          }))
                        }
                        className="flex-1 rounded-md border border-white/[0.08] bg-background/60 px-2 py-0.5 font-mono text-[11px] placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
                {error}
              </div>
            )}

            {/* Send signature */}
            {sendSig && (
              <div className="rounded border border-green-500/30 bg-green-500/10 px-3 py-2 text-[12px] text-green-400 font-mono break-all">
                Sent: {sendSig}
              </div>
            )}

            {/* Simulation result */}
            {simResult && (
              <div className="pt-2">
                <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
                  Simulation Result
                </p>
                <div
                  className={`rounded border px-3 py-2 ${
                    simResult.success
                      ? "border-green-500/30 bg-green-500/5"
                      : "border-red-500/30 bg-red-500/5"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={`text-[12px] font-semibold ${
                        simResult.success ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {simResult.success ? "Success (simulated)" : "Failed"}
                    </span>
                    {simResult.unitsConsumed !== undefined && (
                      <span className="text-[11px] text-muted-foreground">
                        ~{simResult.unitsConsumed.toLocaleString()} CU
                      </span>
                    )}
                  </div>
                  {simResult.error && (
                    <p className="mb-2 text-[12px] text-red-400">
                      {simResult.error}
                    </p>
                  )}
                  {simResult.logs.length > 0 && (
                    <pre className="font-mono text-[11px] text-muted-foreground whitespace-pre-wrap">
                      {simResult.logs.join("\n")}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
