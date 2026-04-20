// apps/web/src/components/editor/AccountStateInspector.tsx
// Bottom-panel "inspector" tab — fetch a Solana account by pubkey,
// deserialize its data against the IR state schema, display fields in a table.

"use client";

import React, { useState, useCallback } from "react";
import { useCodeStore } from "@/store/code-store";
import { useProjectStore, resolveRpcUrl } from "@/store/project-store";
import type { State, Field, EnumDefinition } from "@solflow/ir";

// ─── helpers ─────────────────────────────────────────────────────────────────

type Network = "devnet" | "mainnet-beta" | "localnet" | string;

interface AccountInfo {
  lamports: number;
  owner: string;
  executable: boolean;
  rentEpoch: number;
  data: string; // base64
}

interface ParsedField {
  name: string;
  type: string;
  rawOffset: number | null;
  value: string;
}

/** Very lightweight base64 → Uint8Array for browser */
function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function typeLabel(type: unknown): string {
  if (typeof type === "string") return type;
  if (type && typeof type === "object") {
    const t = type as Record<string, unknown>;
    if ("array" in t)
      return `[${typeLabel((t.array as unknown[])[0])}; ${(t.array as unknown[])[1]}]`;
    if ("vec" in t) return `Vec<${typeLabel(t.vec)}>`;
    if ("option" in t) return `Option<${typeLabel(t.option)}>`;
    if ("defined" in t) return String(t.defined);
    if ("hashMap" in t) return `HashMap`;
    if ("enum" in t) {
      const enumDef = t.enum as { name?: string } | undefined;
      return enumDef?.name ? `enum ${enumDef.name}` : "enum";
    }
  }
  return "unknown";
}

/** Fixed-size byte widths for primitives (Borsh layout) */
const BORSH_SIZE: Record<string, number> = {
  bool: 1,
  u8: 1,
  i8: 1,
  u16: 2,
  i16: 2,
  u32: 4,
  i32: 4,
  f32: 4,
  u64: 8,
  i64: 8,
  f64: 8,
  u128: 16,
  i128: 16,
  Pubkey: 32,
};

/** Decode a field from a DataView at `offset`. Returns value string and byte size consumed. */
function decodeField(
  dv: DataView,
  offset: number,
  type: unknown,
  states: State[],
  depth = 0,
): { value: string; size: number } {
  // Guard against deeply nested recursion
  if (depth > 8) {
    return { value: "(too deeply nested)", size: 0 };
  }

  // ── Complex types (object descriptors) ──────────────────────────────────
  if (typeof type === "object" && type !== null) {
    const t = type as Record<string, unknown>;

    // Vec<T>: 4-byte LE length + N items
    if ("vec" in t) {
      return decodeVec(dv, offset, t.vec, states, depth);
    }

    // Option<T>: 1-byte flag (0=None, 1=Some) + optional T
    if ("option" in t) {
      return decodeOption(dv, offset, t.option, states, depth);
    }

    // Array<T, N>: fixed-size [T; N] — no length prefix
    if ("array" in t) {
      const arr = t.array as unknown[];
      const innerType = arr[0];
      const count = typeof arr[1] === "number" ? arr[1] : 0;
      return decodeFixedArray(dv, offset, innerType, count, states, depth);
    }

    // Defined type reference — look up in IR states and recursively decode
    if ("defined" in t) {
      const typeName = String(t.defined);
      const state = states.find((s) => s.name === typeName);
      if (state) {
        return decodeStruct(dv, offset, state.fields, states, depth);
      }
      return { value: `(unknown type: ${typeName})`, size: 0 };
    }

    if ("hashMap" in t) {
      const mapTypes = t.hashMap as unknown[];
      return decodeHashMap(dv, offset, mapTypes[0], mapTypes[1], states, depth);
    }

    if ("enum" in t) {
      return decodeEnum(dv, offset, t.enum as EnumDefinition, states, depth);
    }

    // Fallback — raw hex
    return rawHex(dv, offset);
  }

  // ── Primitive string types ──────────────────────────────────────────────
  try {
    switch (type) {
      case "bool":
        return { value: dv.getUint8(offset) ? "true" : "false", size: 1 };
      case "u8":
        return { value: String(dv.getUint8(offset)), size: 1 };
      case "i8":
        return { value: String(dv.getInt8(offset)), size: 1 };
      case "u16":
        return { value: String(dv.getUint16(offset, true)), size: 2 };
      case "i16":
        return { value: String(dv.getInt16(offset, true)), size: 2 };
      case "u32":
        return { value: String(dv.getUint32(offset, true)), size: 4 };
      case "i32":
        return { value: String(dv.getInt32(offset, true)), size: 4 };
      case "f32":
        return { value: dv.getFloat32(offset, true).toFixed(6), size: 4 };
      case "u64":
        return { value: String(dv.getBigUint64(offset, true)), size: 8 };
      case "i64":
        return { value: String(dv.getBigInt64(offset, true)), size: 8 };
      case "f64":
        return { value: dv.getFloat64(offset, true).toFixed(10), size: 8 };
      case "u128": {
        const lo = dv.getBigUint64(offset, true);
        const hi = dv.getBigUint64(offset + 8, true);
        return { value: String((hi << BigInt(64)) | lo), size: 16 };
      }
      case "i128": {
        const lo = dv.getBigUint64(offset, true);
        const hi = dv.getBigInt64(offset + 8, true);
        return { value: String((hi << BigInt(64)) | lo), size: 16 };
      }
      case "Pubkey": {
        const bytes: number[] = [];
        for (let i = 0; i < 32; i++) bytes.push(dv.getUint8(offset + i));
        return {
          value: `0x${bytes.map((b) => b.toString(16).padStart(2, "0")).join("")}`,
          size: 32,
        };
      }
      case "String": {
        const len = dv.getUint32(offset, true);
        const chars: string[] = [];
        for (let i = 0; i < len && offset + 4 + i < dv.byteLength; i++)
          chars.push(String.fromCharCode(dv.getUint8(offset + 4 + i)));
        return { value: chars.join(""), size: 4 + len };
      }
      default:
        return { value: "?", size: BORSH_SIZE[type as string] ?? 0 };
    }
  } catch {
    return { value: "decode error", size: BORSH_SIZE[type as string] ?? 0 };
  }
}

/** Decode Vec<T>: 4-byte LE length prefix + N elements */
function decodeVec(
  dv: DataView,
  offset: number,
  innerType: unknown,
  states: State[],
  depth: number,
): { value: string; size: number } {
  if (offset + 4 > dv.byteLength) return { value: "(truncated)", size: 0 };
  const len = dv.getUint32(offset, true);
  const cap = Math.min(len, 64);
  let pos = offset + 4;
  const items: string[] = [];
  for (let i = 0; i < cap; i++) {
    if (pos >= dv.byteLength) break;
    const { value, size } = decodeField(dv, pos, innerType, states, depth + 1);
    items.push(value);
    if (size === 0) break;
    pos += size;
  }
  const suffix = len > cap ? `, … (${len} total)` : "";
  return { value: `[${items.join(", ")}${suffix}]`, size: pos - offset };
}

/** Decode Option<T>: 1-byte flag (0=None, 1=Some(T)) */
function decodeOption(
  dv: DataView,
  offset: number,
  innerType: unknown,
  states: State[],
  depth: number,
): { value: string; size: number } {
  if (offset + 1 > dv.byteLength) return { value: "(truncated)", size: 0 };
  const flag = dv.getUint8(offset);
  if (flag === 0) {
    return { value: "None", size: 1 };
  }
  const { value, size } = decodeField(dv, offset + 1, innerType, states, depth + 1);
  return { value: `Some(${value})`, size: 1 + size };
}

/** Decode [T; N]: fixed-size array with no length prefix */
function decodeFixedArray(
  dv: DataView,
  offset: number,
  innerType: unknown,
  count: number,
  states: State[],
  depth: number,
): { value: string; size: number } {
  const cap = Math.min(count, 64);
  let pos = offset;
  const items: string[] = [];
  for (let i = 0; i < cap; i++) {
    if (pos >= dv.byteLength) break;
    const { value, size } = decodeField(dv, pos, innerType, states, depth + 1);
    items.push(value);
    if (size === 0) break;
    pos += size;
  }
  const suffix = count > cap ? `, … (${count} total)` : "";
  return { value: `[${items.join(", ")}${suffix}]`, size: pos - offset };
}

/** Decode a struct (defined type) by looking up its fields in the IR states */
function decodeStruct(
  dv: DataView,
  offset: number,
  fields: Field[],
  states: State[],
  depth: number,
): { value: string; size: number } {
  let pos = offset;
  const entries: string[] = [];
  for (const field of fields) {
    if (pos >= dv.byteLength) break;
    const { value, size } = decodeField(dv, pos, field.type, states, depth + 1);
    entries.push(`${field.name}: ${value}`);
    if (size === 0) break;
    pos += size;
  }
  return { value: `{ ${entries.join(", ")} }`, size: pos - offset };
}

/** Decode HashMap<K, V>: 4-byte LE length + N key-value pairs (Borsh) */
function decodeHashMap(
  dv: DataView,
  offset: number,
  keyType: unknown,
  valueType: unknown,
  states: State[],
  depth: number,
): { value: string; size: number } {
  if (offset + 4 > dv.byteLength) return { value: "(truncated)", size: 0 };
  const len = dv.getUint32(offset, true);
  const cap = Math.min(len, 32);
  let pos = offset + 4;
  const entries: string[] = [];
  for (let i = 0; i < cap; i++) {
    if (pos >= dv.byteLength) break;
    const key = decodeField(dv, pos, keyType, states, depth + 1);
    if (key.size === 0) break;
    pos += key.size;
    if (pos >= dv.byteLength) break;
    const val = decodeField(dv, pos, valueType, states, depth + 1);
    if (val.size === 0) break;
    pos += val.size;
    entries.push(`${key.value} => ${val.value}`);
  }
  const suffix = len > cap ? `, … (${len} total)` : "";
  return { value: `{${entries.join(", ")}${suffix}}`, size: pos - offset };
}

/** Decode an enum with variants and optional fields (Borsh) */
function decodeEnum(
  dv: DataView,
  offset: number,
  enumDef: EnumDefinition,
  states: State[],
  depth: number,
): { value: string; size: number } {
  if (offset + 1 > dv.byteLength) return { value: "(truncated)", size: 0 };
  const variantIdx = dv.getUint8(offset);
  let pos = offset + 1;

  if (variantIdx >= enumDef.variants.length) {
    return { value: `variant #${variantIdx} (out of range)`, size: 1 };
  }

  const variant = enumDef.variants[variantIdx];
  const variantName = variant.name;

  if (!variant.fields || variant.fields.length === 0) {
    return { value: `${enumDef.name}::${variantName}`, size: 1 };
  }

  const fieldValues: string[] = [];
  for (const field of variant.fields) {
    if (pos >= dv.byteLength) break;
    const { value, size } = decodeField(dv, pos, field.type, states, depth + 1);
    fieldValues.push(`${field.name}: ${value}`);
    if (size === 0) break;
    pos += size;
  }

  return {
    value: `${enumDef.name}::${variantName} { ${fieldValues.join(", ")} }`,
    size: pos - offset,
  };
}

/** Fallback: show first 8 bytes as hex */
function rawHex(dv: DataView, offset: number): { value: string; size: number } {
  const slice: number[] = [];
  for (let i = 0; i < Math.min(8, dv.byteLength - offset); i++)
    slice.push(dv.getUint8(offset + i));
  return {
    value: `0x${slice.map((b) => b.toString(16).padStart(2, "0")).join("")}…`,
    size: 0,
  };
}

/** Parse account data bytes against a State schema's fields (skips 8-byte Anchor discriminator) */
function parseAccountData(bytes: Uint8Array, state: State, allStates: State[]): ParsedField[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Anchor accounts start with an 8-byte discriminator
  let offset = 8;
  let skipped = false;
  return state.fields.map((field: Field) => {
    if (skipped) {
      return {
        name: field.name,
        type: typeLabel(field.type),
        rawOffset: null,
        value: "(skipped — prior field has unknown size)",
      };
    }
    if (offset >= bytes.byteLength) {
      return {
        name: field.name,
        type: typeLabel(field.type),
        rawOffset: offset,
        value: "(out of bounds)",
      };
    }
    const rawOffset = offset;
    const { value, size } = decodeField(dv, offset, field.type, allStates);
    offset += size;
    if (size === 0) skipped = true;
    return { name: field.name, type: typeLabel(field.type), rawOffset, value };
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AccountStateInspector() {
  const irJson = useCodeStore((s) => s.irJson);
  const network = useProjectStore((s) => s.network);
  const customEndpoints = useProjectStore((s) => s.customEndpoints);

  const [pubkey, setPubkey] = useState("");
  const [selectedState, setSelectedState] = useState<string>("");
  const [selectedNetwork, setSelectedNetwork] = useState<Network>(
    network === "mainnet"
      ? "mainnet-beta"
      : network === "localnet"
        ? "localnet"
        : "devnet",
  );
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
      const rpcUrl = resolveRpcUrl(selectedNetwork, customEndpoints);
      // Route through server-side proxy to avoid CORS
      const response = await fetch("/api/solana-rpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network: selectedNetwork,
          rpcUrl,
          method: "getAccountInfo",
          params: [pubkey.trim(), { encoding: "base64" }],
        }),
      });
      const json = await response.json();
      if (json.error) {
        setError(json.error.message ?? "RPC error");
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
          setParsedFields(parseAccountData(bytes, state, states));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, [pubkey, selectedNetwork, selectedState, states, customEndpoints]);

  const deserialize = useCallback(() => {
    if (!accountInfo || !selectedState) return;
    const state = states.find((s) => s.name === selectedState);
    if (!state) return;
    const bytes = b64ToBytes(accountInfo.data);
    setParsedFields(parseAccountData(bytes, state, states));
  }, [accountInfo, selectedState, states]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Controls ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <input
          type="text"
          placeholder="Account pubkey…"
          value={pubkey}
          onChange={(e) => setPubkey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchAccount()}
          className="w-72 rounded border border-border bg-muted/30 px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        />

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

        {states.length > 0 && (
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="rounded border border-border bg-card px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
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
          className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Fetching…" : "Fetch"}
        </button>

        {accountInfo && selectedState && (
          <button
            onClick={deserialize}
            className="rounded border border-border px-3 py-1 text-xs hover:bg-accent"
          >
            Deserialize
          </button>
        )}
      </div>

      {/* ── Content ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && (
          <div className="px-4 py-3 text-xs text-red-400 font-mono">
            {error}
          </div>
        )}

        {!accountInfo && !error && !loading && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Enter a pubkey and click Fetch to inspect an on-chain account.
          </div>
        )}

        {accountInfo && (
          <div className="divide-y divide-border/40">
            {/* Raw account info */}
            <div className="px-4 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Account Info
              </p>
              <table className="w-full text-xs">
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
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Fields ({selectedState})
                </p>
                <table className="w-full text-xs">
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
                  <tbody className="divide-y divide-border/20">
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
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Raw Data (first 128 bytes)
              </p>
              <pre className="font-mono text-[10px] text-muted-foreground break-all whitespace-pre-wrap">
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
