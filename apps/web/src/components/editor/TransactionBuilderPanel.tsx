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
import { useProjectStore, resolveRpcUrl } from "@/store/project-store";
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

type Network = "devnet" | "mainnet-beta" | "localnet" | string;

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

/** Encode instruction arguments into a Uint8Array discriminator + args. */
function encodeInstructionData(
  ixName: string,
  allInstructions: Instruction[],
  ixArgs: InstructionArg[],
  argValues: Record<string, string>,
): Uint8Array {
  const ixIndex = allInstructions.findIndex((i: any) => i.name === ixName);

  // 8-byte discriminator (LE index, matches codegen)
  const discriminator = new Uint8Array(8);
  const view = new DataView(discriminator.buffer);
  view.setUint32(0, ixIndex >= 0 ? ixIndex : 0, true);

  const argParts: Uint8Array[] = [discriminator];

  for (const arg of ixArgs ?? []) {
    const val = argValues[arg.name] ?? "0";
    if (typeof arg.type === "string") {
      switch (arg.type) {
        case "u8": {
          const b = new Uint8Array(1);
          new DataView(b.buffer).setUint8(0, parseInt(val) || 0);
          argParts.push(b);
          break;
        }
        case "u16": {
          const b = new Uint8Array(2);
          new DataView(b.buffer).setUint16(0, parseInt(val) || 0, true);
          argParts.push(b);
          break;
        }
        case "u32": {
          const b = new Uint8Array(4);
          new DataView(b.buffer).setUint32(0, parseInt(val) || 0, true);
          argParts.push(b);
          break;
        }
        case "u64": {
          const b = new Uint8Array(8);
          new DataView(b.buffer).setBigUint64(0, BigInt(parseInt(val) || 0), true);
          argParts.push(b);
          break;
        }
        case "i8": {
          const b = new Uint8Array(1);
          new DataView(b.buffer).setInt8(0, parseInt(val) || 0);
          argParts.push(b);
          break;
        }
        case "i32": {
          const b = new Uint8Array(4);
          new DataView(b.buffer).setInt32(0, parseInt(val) || 0, true);
          argParts.push(b);
          break;
        }
        case "bool": {
          argParts.push(new Uint8Array([val === "true" || val === "1" ? 1 : 0]));
          break;
        }
        default: {
          argParts.push(new Uint8Array(8));
          break;
        }
      }
    } else {
      argParts.push(new Uint8Array(8));
    }
  }

  // Concat all parts
  const totalLen = argParts.reduce((s, p) => s + p.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of argParts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

// ─── TxBuilderPanel ──────────────────────────────────────────────────────────

export function TransactionBuilderPanel() {
  const irJson = useCodeStore((s) => s.irJson);
  const network = useProjectStore((s) => s.network);
  const customEndpoints = useProjectStore((s) => s.customEndpoints);
  const wallet = useWallet();

  const [selectedIx, setSelectedIx] = useState<string>("");
  const [selectedNetwork, setSelectedNetwork] = useState<Network>(
    network === "mainnet"
      ? "mainnet-beta"
      : network === "localnet"
        ? "localnet"
        : "devnet",
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
  function buildData(ix: Instruction): Buffer {
    return Buffer.from(
      encodeInstructionData(ix.name, allInstructions, ix.args ?? [], args),
    );
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
      const data = buildData(instruction);

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
  }, [instruction, programId, selectedNetwork, payer, accounts, args, allInstructions, wallet.publicKey]);

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
      const data = buildData(instruction);

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
  }, [instruction, programId, selectedNetwork, payer, accounts, args, allInstructions, wallet]);

  // ─── Render ──────────────────────────────────────────────────────

  if (allInstructions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Generate code first — instructions will appear here for transaction
        building.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Controls row ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <select
          value={selectedIx}
          onChange={(e) => handleSelectIx(e.target.value)}
          className="rounded border border-border bg-card px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
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
          className="rounded border border-border bg-card px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
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
          className="w-64 rounded border border-border bg-muted/30 px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        />

        <button
          onClick={simulate}
          disabled={loading || !selectedIx}
          className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Simulating…" : "Simulate"}
        </button>

        <button
          onClick={send}
          disabled={loading || !selectedIx}
          className="rounded border border-border px-3 py-1 text-xs hover:bg-accent disabled:opacity-50"
        >
          Send
        </button>
      </div>

      {/* ── Form ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!instruction && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select an instruction above to build a transaction.
          </div>
        )}

        {instruction && (
          <div className="divide-y divide-border/30 px-4 py-3 space-y-4">
            {/* Fee payer */}
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Fee Payer
              </p>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  placeholder="pubkey (leave empty to use wallet)"
                  value={payer}
                  onChange={(e) => setPayer(e.target.value)}
                  className="flex-1 rounded border border-border bg-muted/30 px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {wallet.publicKey && (
                  <button
                    onClick={() => setPayer(wallet.publicKey!.toBase58())}
                    title="Use connected wallet"
                    className="shrink-0 rounded border border-border px-1.5 py-1 text-[9px] text-primary hover:bg-accent transition-colors"
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
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                      className="text-[9px] text-primary hover:underline"
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
                            <span className="rounded bg-yellow-500/10 px-1 py-0.5 text-[9px] text-yellow-400">
                              signer
                            </span>
                          )}
                          {isMut && (
                            <span className="rounded bg-blue-500/10 px-1 py-0.5 text-[9px] text-blue-400">
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
                          className="flex-1 rounded border border-border bg-muted/30 px-2 py-0.5 font-mono text-[11px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
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
                            className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[9px] text-primary hover:bg-accent transition-colors"
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
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Arguments
                </p>
                <div className="space-y-1.5">
                  {(instruction.args ?? []).map((arg: InstructionArg) => (
                    <div key={arg.name} className="flex items-center gap-2">
                      <span className="w-36 shrink-0 font-mono text-[11px]">
                        {arg.name}
                      </span>
                      <span className="shrink-0 rounded bg-muted/50 px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
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
                        className="flex-1 rounded border border-border bg-muted/30 px-2 py-0.5 font-mono text-[11px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {error}
              </div>
            )}

            {/* Send signature */}
            {sendSig && (
              <div className="rounded border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-400 font-mono break-all">
                Sent: {sendSig}
              </div>
            )}

            {/* Simulation result */}
            {simResult && (
              <div className="pt-2">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                      className={`text-xs font-semibold ${
                        simResult.success ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {simResult.success ? "Success (simulated)" : "Failed"}
                    </span>
                    {simResult.unitsConsumed !== undefined && (
                      <span className="text-[10px] text-muted-foreground">
                        ~{simResult.unitsConsumed.toLocaleString()} CU
                      </span>
                    )}
                  </div>
                  {simResult.error && (
                    <p className="mb-2 text-xs text-red-400">
                      {simResult.error}
                    </p>
                  )}
                  {simResult.logs.length > 0 && (
                    <pre className="font-mono text-[10px] text-muted-foreground whitespace-pre-wrap">
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
