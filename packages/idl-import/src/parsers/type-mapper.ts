// Shared type mapping utility used by all parsers.

import type { SolanaType } from "../types";

export function mapType(raw: unknown): SolanaType {
  if (typeof raw === "string") {
    const lower = raw.toLowerCase();
    if (lower === "publickey" || lower === "pubkey") return "Pubkey";
    if (lower === "string") return "String";
    const primitives = new Set([
      "bool", "u8", "u16", "u32", "u64", "u128",
      "i8", "i16", "i32", "i64", "i128",
      "f32", "f64",
    ]);
    if (primitives.has(lower)) return lower as SolanaType;
    return { defined: raw };
  }

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if ("vec" in obj) return { vec: mapType(obj.vec) };
    if ("option" in obj) return { option: mapType(obj.option) };
    if ("defined" in obj) return { defined: obj.defined as string };
    if ("array" in obj && Array.isArray(obj.array)) {
      return { array: [mapType(obj.array[0]), obj.array[1] as number] };
    }
    if ("generic" in obj) return { defined: obj.generic as string };
    if ("hashMap" in obj && Array.isArray(obj.hashMap)) {
      return { hashMap: [mapType(obj.hashMap[0]), mapType(obj.hashMap[1])] };
    }
  }

  return { defined: "unknown" };
}
