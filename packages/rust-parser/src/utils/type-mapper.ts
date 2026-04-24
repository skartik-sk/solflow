// Map Rust types to SolanaType used in the IR schema.
// Handles primitives, Vec<T>, Option<T>, [T; N], Box<T>, HashMap, tuples, references.

import type { SolanaType } from "@solflow/ir";

const PRIMITIVE_MAP: Record<string, SolanaType> = {
  bool: "bool",
  u8: "u8",
  u16: "u16",
  u32: "u32",
  u64: "u64",
  u128: "u128",
  i8: "i8",
  i16: "i16",
  i32: "i32",
  i64: "i64",
  i128: "i128",
  f32: "f32",
  f64: "f64",
  String: "String",
  Pubkey: "Pubkey",
  str: "String",
};

/**
 * Convert a Rust type string to a SolanaType.
 * Handles primitives, Vec<T>, Option<T>, [T; N], Box<T>, references, and defined types.
 */
export function mapRustType(raw: string): SolanaType {
  let t = raw.trim();

  // Strip references: &T, &mut T
  t = t.replace(/^&mut\s+/, "").replace(/^&\s+/, "");

  // Strip lifetimes: 'info
  t = t.replace(/'\w+/g, "");

  // Direct primitive match
  if (PRIMITIVE_MAP[t.trim()]) return PRIMITIVE_MAP[t.trim()];

  // Vec<T>
  const vecMatch = t.match(/^Vec\s*<(.+)>$/);
  if (vecMatch) return { vec: mapRustType(vecMatch[1]) };

  // Option<T>
  const optMatch = t.match(/^Option\s*<(.+)>$/);
  if (optMatch) return { option: mapRustType(optMatch[1]) };

  // [T; N] — fixed array
  const arrMatch = t.match(/^\[(.+);\s*(\d+)\]$/);
  if (arrMatch) return { array: [mapRustType(arrMatch[1]), parseInt(arrMatch[2])] };

  // Box<T> — unwrap
  const boxMatch = t.match(/^Box\s*<(.+)>$/);
  if (boxMatch) return mapRustType(boxMatch[1]);

  // HashMap<K, V>
  const hmMatch = t.match(/^HashMap\s*<\s*(.+?)\s*,\s*(.+?)\s*>$/);
  if (hmMatch) return { hashMap: [mapRustType(hmMatch[1]), mapRustType(hmMatch[2])] };

  // BTreeMap<K, V>
  const btmMatch = t.match(/^BTreeMap\s*<\s*(.+?)\s*,\s*(.+?)\s*>$/);
  if (btmMatch) return { hashMap: [mapRustType(btmMatch[1]), mapRustType(btmMatch[2])] };

  // (A, B, ...) tuple
  const tupleMatch = t.match(/^\((.+)\)$/);
  if (tupleMatch) {
    const parts = splitTopLevelCommas(tupleMatch[1]);
    if (parts.length > 1) {
      return { defined: `(${parts.map(p => mapRustType(p.trim())).map(t => typeof t === "string" ? t : JSON.stringify(t)).join(", ")})` };
    }
  }

  // Defined type (struct/enum name)
  return { defined: t.trim() };
}

/**
 * Detect what kind of Anchor account type a Rust type represents.
 */
export function detectAccountKind(rustType: string): {
  accountType: string;
  stateType?: string;
} {
  const t = rustType.trim();

  if (t.startsWith("Signer<") || t === "Signer") return { accountType: "signer" };
  if (t === "SystemAccount<" || t.startsWith("SystemAccount<") || t === "SystemAccount")
    return { accountType: "system-account" };
  if (t.startsWith("Program<")) return { accountType: "system-program" };
  if (t.startsWith("Account<"))
    return { accountType: "account", stateType: extractGeneric(t) };
  if (t.startsWith("AccountLoader<"))
    return { accountType: "account", stateType: extractGeneric(t) };
  if (t.startsWith("TokenAccount<") || t.startsWith("InterfaceAccount<"))
    return { accountType: "token-account" };
  if (t.startsWith("Mint<") || t.startsWith("InterfaceMint<"))
    return { accountType: "mint" };
  if (t.startsWith("Interface<"))
    return { accountType: "account", stateType: extractGeneric(t) };
  if (t.startsWith("AssociatedToken<"))
    return { accountType: "associated-token" };
  if (t === "UncheckedAccount" || t === "AccountInfo<" || t === "&AccountInfo" || t === "AccountInfo")
    return { accountType: "unchecked-account" };
  if (t === "System<" || t.startsWith("System<") || t === "System")
    return { accountType: "system-program" };
  if (t === "Token<" || t.startsWith("Token<") || t === "Token")
    return { accountType: "token-program" };
  if (t === "Rent" || t === "Rent<") return { accountType: "rent" };
  if (t === "Clock" || t === "Clock<") return { accountType: "clock" };
  if (t.startsWith("Syscall<")) return { accountType: "system-program" };
  if (t.startsWith("Option<Account<")) {
    const inner = extractGeneric(t.replace(/^Option<</, "").replace(/>$/, ""));
    return { accountType: "account", stateType: inner };
  }
  if (t.startsWith("Option<"))
    return { accountType: "unchecked-account" };

  return { accountType: "account" };
}

function extractGeneric(t: string): string {
  // Find the last top-level identifier before the closing >
  const openAngle = t.indexOf("<");
  if (openAngle === -1) return t;

  // Extract content between first < and matching >
  let depth = 0;
  let endAngle = -1;
  for (let i = openAngle; i < t.length; i++) {
    if (t[i] === "<") depth++;
    else if (t[i] === ">") {
      depth--;
      if (depth === 0) { endAngle = i; break; }
    }
  }
  if (endAngle === -1) return t;

  const inner = t.slice(openAngle + 1, endAngle).trim();

  // Split on comma at depth 0 to separate lifetime from type
  let commaDepth = 0;
  let lastComma = -1;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "<") commaDepth++;
    else if (inner[i] === ">") commaDepth--;
    else if (inner[i] === "," && commaDepth === 0) lastComma = i;
  }

  // Take the part after the last top-level comma (skips lifetime, takes the type)
  const typePart = lastComma >= 0 ? inner.slice(lastComma + 1).trim() : inner;

  // If it starts with a lifetime like 'info, skip it
  if (typePart.startsWith("'")) {
    const afterLifetime = typePart.indexOf(",");
    return afterLifetime >= 0 ? typePart.slice(afterLifetime + 1).trim() : typePart;
  }

  return typePart;
}

function splitTopLevelCommas(src: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let ci = 0;

  while (ci < src.length) {
    const ch = src[ci];
    if (ch === '"') {
      current += ch;
      ci++;
      while (ci < src.length && src[ci] !== '"') {
        if (src[ci] === "\\") { current += src[ci]; ci++; }
        current += src[ci];
        ci++;
      }
      if (ci < src.length) { current += src[ci]; ci++; }
      continue;
    }
    if (ch === "<" || ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ">" || ch === ")" || ch === "]" || ch === "}") depth--;

    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
    ci++;
  }
  if (current.trim()) parts.push(current);

  return parts;
}
