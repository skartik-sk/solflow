// Instruction data encoding for the Transaction Builder: the framework's
// discriminator (shared with the SDK generator) followed by Borsh-encoded args.

import { PublicKey } from "@solana/web3.js";
import { instructionDiscriminator } from "@solflow/sdk-gen";
import type { SolanaType } from "@solflow/ir";

export type TxFramework = "anchor" | "pinocchio" | "quasar";

const INT_BITS: Record<string, { bytes: number; signed: boolean }> = {
  u8: { bytes: 1, signed: false },
  u16: { bytes: 2, signed: false },
  u32: { bytes: 4, signed: false },
  u64: { bytes: 8, signed: false },
  u128: { bytes: 16, signed: false },
  i8: { bytes: 1, signed: true },
  i16: { bytes: 2, signed: true },
  i32: { bytes: 4, signed: true },
  i64: { bytes: 8, signed: true },
  i128: { bytes: 16, signed: true },
};

function encodeInt(type: string, raw: string): Uint8Array {
  const { bytes, signed } = INT_BITS[type];
  const text = raw.trim() === "" ? "0" : raw.trim();
  if (!/^-?\d+$/.test(text)) throw new Error(`"${raw}" is not a valid ${type}`);
  const value = BigInt(text);
  const bits = BigInt(bytes * 8);
  const min = signed ? -(BigInt(1) << (bits - BigInt(1))) : BigInt(0);
  const max = signed ? (BigInt(1) << (bits - BigInt(1))) - BigInt(1) : (BigInt(1) << bits) - BigInt(1);
  if (value < min || value > max) throw new Error(`${text} is out of range for ${type}`);
  // Two's complement, little-endian.
  let v = value < BigInt(0) ? (BigInt(1) << bits) + value : value;
  const out = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) {
    out[i] = Number(v & BigInt(0xff));
    v >>= BigInt(8);
  }
  return out;
}

function encodeFloat(type: "f32" | "f64", raw: string): Uint8Array {
  const value = Number(raw.trim() === "" ? "0" : raw.trim());
  if (!Number.isFinite(value)) throw new Error(`"${raw}" is not a valid ${type}`);
  const out = new Uint8Array(type === "f32" ? 4 : 8);
  const dv = new DataView(out.buffer);
  if (type === "f32") dv.setFloat32(0, value, true);
  else dv.setFloat64(0, value, true);
  return out;
}

function u32(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n, true);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Parse the text box value of a Vec/array arg: a JSON array, or comma-separated values. */
function parseList(raw: string): string[] {
  const text = raw.trim();
  if (text === "") return [];
  if (text.startsWith("[")) {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("Expected a JSON array");
    return parsed.map((v) => (typeof v === "string" ? v : JSON.stringify(v)));
  }
  return text.split(",").map((v) => v.trim());
}

/** Borsh-encode one argument value (as typed in the form) for the given IR type. */
export function encodeArg(type: SolanaType, raw: string): Uint8Array {
  if (typeof type === "string") {
    if (type in INT_BITS) return encodeInt(type, raw);
    switch (type) {
      case "bool": {
        const v = raw.trim().toLowerCase();
        if (v === "true" || v === "1") return Uint8Array.of(1);
        if (v === "false" || v === "0" || v === "") return Uint8Array.of(0);
        throw new Error(`"${raw}" is not a valid bool (use true or false)`);
      }
      case "f32":
      case "f64":
        return encodeFloat(type, raw);
      case "String": {
        const bytes = new TextEncoder().encode(raw);
        return concat([u32(bytes.length), bytes]);
      }
      case "Pubkey":
        try {
          return new PublicKey(raw.trim()).toBytes();
        } catch {
          throw new Error(`"${raw}" is not a valid public key`);
        }
    }
  } else if ("option" in type) {
    if (raw.trim() === "" || raw.trim().toLowerCase() === "none") return Uint8Array.of(0);
    return concat([Uint8Array.of(1), encodeArg(type.option, raw)]);
  } else if ("vec" in type) {
    const items = parseList(raw);
    return concat([u32(items.length), ...items.map((item) => encodeArg(type.vec, item))]);
  } else if ("array" in type) {
    const [inner, len] = type.array;
    const items = parseList(raw);
    if (items.length !== len) throw new Error(`Expected ${len} values, got ${items.length}`);
    return concat(items.map((item) => encodeArg(inner, item)));
  }
  throw new Error(`Encoding ${JSON.stringify(type)} args isn't supported in the Transaction Builder yet`);
}

/** Discriminator + Borsh args, exactly as the generated program decodes them. */
export function encodeInstructionData(
  framework: TxFramework,
  ixName: string,
  ixIndex: number,
  args: { name: string; type: SolanaType }[],
  values: Record<string, string>,
): Uint8Array {
  const parts = [instructionDiscriminator(framework, ixName, Math.max(0, ixIndex))];
  for (const arg of args) {
    try {
      parts.push(encodeArg(arg.type, values[arg.name] ?? ""));
    } catch (err) {
      throw new Error(`Argument "${arg.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return concat(parts);
}
