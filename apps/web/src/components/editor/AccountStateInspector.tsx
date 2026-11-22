// apps/web/src/components/editor/AccountStateInspector.tsx
// Bottom-panel "inspector" tab — fetch a Solana account by pubkey,
// deserialize its data against the IR state schema, display fields in a table.

"use client";

import React, { useState, useCallback } from "react";
import { useCodeStore } from "@/store/code-store";
import { useProjectStore, normalizeNetwork } from "@/store/project-store";
import type { State } from "@solflow/ir";
import { b64ToBytes, parseAccountData, type ParsedField } from "./account-decode";

// ─── helpers ─────────────────────────────────────────────────────────────────

type Network = "devnet" | "mainnet" | "localnet" | string;

interface AccountInfo {
  lamports: number;
  owner: string;
  executable: boolean;
  rentEpoch: number;
  data: string; // base64
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AccountStateInspector() {
  const irJson = useCodeStore((s) => s.irJson);
  const network = useProjectStore((s) => s.network);

  const [pubkey, setPubkey] = useState("");
  const [selectedState, setSelectedState] = useState<string>("");
  const framework = useProjectStore((s) => s.framework);
  // Same ids as the top bar ("mainnet", not "mainnet-beta").
  const [selectedNetwork, setSelectedNetwork] = useState<Network>(normalizeNetwork(network));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [parsedFields, setParsedFields] = useState<ParsedField[] | null>(null);

  const states: State[] = irJson?.states ?? [];

  const fetchAccount = useCallback(async () => {
    if (!pubkey.trim()) return;
    setLoading(true);
    setError(null);
    setAccountInfo(null);
    setParsedFields(null);

    try {
      // Route through the server-side proxy (avoids CORS). The proxy maps the
      // network id to an RPC URL itself; it never takes a client-supplied URL.
      const response = await fetch("/api/solana-rpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network: normalizeNetwork(selectedNetwork),
          method: "getAccountInfo",
          params: [pubkey.trim(), { encoding: "base64" }],
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (json.error || !response.ok) {
        const err = json.error;
        setError(typeof err === "string" ? err : err?.message ?? `RPC error (${response.status})`);
        return;
      }
      if (!json.result?.value) {
        setError("Account not found");
        return;
      }
      const info: AccountInfo = {
        lamports: json.result.value.lamports,
        owner: json.result.value.owner,
        executable: json.result.value.executable,
        rentEpoch: json.result.value.rentEpoch,
        data: json.result.value.data[0], // base64 string
      };
      setAccountInfo(info);

      // Auto-deserialize if a state is selected
      if (selectedState) {
        const state = states.find((s) => s.name === selectedState);
        if (state) {
          const bytes = b64ToBytes(info.data);
          setParsedFields(parseAccountData(bytes, state, states, framework));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, [pubkey, selectedNetwork, selectedState, states, framework]);

  const deserialize = useCallback(() => {
    if (!accountInfo || !selectedState) return;
    const state = states.find((s) => s.name === selectedState);
    if (!state) return;
    const bytes = b64ToBytes(accountInfo.data);
    setParsedFields(parseAccountData(bytes, state, states, framework));
  }, [accountInfo, selectedState, states, framework]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Controls ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 min-h-10">
        <input
          type="text"
          placeholder="Account pubkey…"
          value={pubkey}
          onChange={(e) => setPubkey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchAccount()}
          className="w-72 rounded-md border border-white/[0.08] bg-background/60 px-2 py-1 font-mono text-[12px] focus:outline-none focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
        />

        <select
          value={selectedNetwork}
          onChange={(e) => setSelectedNetwork(e.target.value as Network)}
          className="rounded-md border border-white/[0.08] bg-card px-2 py-1 text-[12px] focus:outline-none focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
        >
          <option value="devnet">Devnet</option>
          <option value="mainnet">Mainnet</option>
          <option value="localnet">Localnet</option>
        </select>

        {states.length > 0 && (
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="rounded-md border border-white/[0.08] bg-card px-2 py-1 text-[12px] focus:outline-none focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
          >
            <option value="">— select state —</option>
            {states.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        <button
          onClick={fetchAccount}
          disabled={loading || !pubkey.trim()}
          className="inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-[background-color,transform] duration-150 ease-out hover:bg-[#7fe0e6] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
        >
          {loading ? "Fetching…" : "Fetch"}
        </button>

        {accountInfo && selectedState && (
          <button
            onClick={deserialize}
            className="rounded-md border border-white/[0.08] px-3 py-1 text-[12px] hover:bg-white/[0.06]"
          >
            Deserialize
          </button>
        )}
      </div>

      {/* ── Content ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && (
          <div className="px-4 py-3 text-[12px] text-red-400 font-mono">
            {error}
          </div>
        )}

        {!accountInfo && !error && !loading && (
          <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
            Enter a pubkey and click Fetch to inspect an on-chain account.
          </div>
        )}

        {accountInfo && (
          <div className="divide-y divide-white/[0.05]">
            {/* Raw account info */}
            <div className="px-4 py-3">
              <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
                Account Info
              </p>
              <table className="w-full text-[12px]">
                <tbody>
                  <tr>
                    <td className="pr-4 py-0.5 text-muted-foreground">
                      Lamports
                    </td>
                    <td className="font-mono">
                      {accountInfo.lamports.toLocaleString()} (
                      {(accountInfo.lamports / 1e9).toFixed(9)} SOL)
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-4 py-0.5 text-muted-foreground">Owner</td>
                    <td className="font-mono break-all">{accountInfo.owner}</td>
                  </tr>
                  <tr>
                    <td className="pr-4 py-0.5 text-muted-foreground">
                      Executable
                    </td>
                    <td className="font-mono">
                      {accountInfo.executable ? "yes" : "no"}
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-4 py-0.5 text-muted-foreground">
                      Data size
                    </td>
                    <td className="font-mono">
                      {Math.ceil((accountInfo.data.length * 3) / 4)} bytes
                      (base64 len {accountInfo.data.length})
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Deserialized fields */}
            {parsedFields && (
              <div className="px-4 py-3">
                <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
                  Fields ({selectedState})
                </p>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="pb-1 pr-4 text-left font-medium">Field</th>
                      <th className="pb-1 pr-4 text-left font-medium">Type</th>
                      <th className="pb-1 pr-4 text-left font-medium">
                        Offset
                      </th>
                      <th className="pb-1 text-left font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {parsedFields.map((f) => (
                      <tr key={f.name}>
                        <td className="py-0.5 pr-4 font-mono font-medium">
                          {f.name}
                        </td>
                        <td className="py-0.5 pr-4 text-muted-foreground">
                          {f.type}
                        </td>
                        <td className="py-0.5 pr-4 font-mono text-muted-foreground/60">
                          {f.rawOffset ?? "—"}
                        </td>
                        <td className="py-0.5 font-mono break-all">
                          {f.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Raw data hex dump (first 128 bytes) */}
            <div className="px-4 py-3">
              <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
                Raw Data (first 128 bytes)
              </p>
              <pre className="font-mono text-[11px] text-muted-foreground break-all whitespace-pre-wrap">
                {(() => {
                  const bytes = b64ToBytes(accountInfo.data).slice(0, 128);
                  return Array.from(bytes)
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join(" ");
                })()}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
