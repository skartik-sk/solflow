// @solflow/idl-import — Unified IDL types and format detection

// ─── Solana Types (mirrors @solflow/ir SolanaType) ─────────────────────────

export type SolanaTypePrimitive =
  | "bool"
  | "u8" | "u16" | "u32" | "u64" | "u128"
  | "i8" | "i16" | "i32" | "i64" | "i128"
  | "f32" | "f64"
  | "String"
  | "Pubkey";

export type SolanaType =
  | SolanaTypePrimitive
  | { array: [SolanaType, number] }
  | { vec: SolanaType }
  | { option: SolanaType }
  | { defined: string }
  | { hashMap: [SolanaType, SolanaType] };

// ─── Unified IDL ─────────────────────────────────────────────────────────

export type IdlFormat = "anchor" | "shank" | "kinobi" | "unknown";

export interface UnifiedIdl {
  program: {
    name: string;
    version: string;
    description?: string;
    programId?: string;
  };
  instructions: UnifiedInstruction[];
  accounts: UnifiedAccountState[];
  errors: UnifiedError[];
  events: UnifiedEvent[];
  types: UnifiedTypeDef[];
}

export interface UnifiedInstruction {
  name: string;
  args: { name: string; type: SolanaType; description?: string }[];
  accounts: UnifiedAccountRef[];
  description?: string;
}

export interface UnifiedAccountRef {
  name: string;
  isMut: boolean;
  isSigner: boolean;
  isOptional?: boolean;
  description?: string;
  seeds?: { type: string; value: string }[];
  pdaBump?: string;
}

export interface UnifiedAccountState {
  name: string;
  fields: { name: string; type: SolanaType; description?: string }[];
}

export interface UnifiedError {
  code: number;
  name: string;
  message: string;
}

export interface UnifiedEvent {
  name: string;
  fields: { name: string; type: SolanaType; description?: string }[];
}

export interface UnifiedTypeDef {
  name: string;
  fields: { name: string; type: SolanaType; description?: string }[];
  variants?: { name: string; fields?: { name: string; type: SolanaType }[] }[];
}

// ─── Format Detection ────────────────────────────────────────────────────

export function detectFormat(json: unknown): IdlFormat {
  if (!json || typeof json !== "object") return "unknown";
  const obj = json as Record<string, unknown>;

  // Kinobi: has a `nodes` object or `rootProgram` key
  if (typeof obj.nodes === "object" && obj.nodes !== null) return "kinobi";
  if ("rootProgram" in obj) return "kinobi";
  if ("kinobiVersion" in obj) return "kinobi";

  // Must have instructions array to be Anchor or Shank
  if (!Array.isArray(obj.instructions)) return "unknown";

  // Shank: metadata.origin === "shank"
  const meta = obj.metadata as Record<string, unknown> | undefined;
  if (meta && meta.origin === "shank") return "shank";

  // Anchor: has instructions + version string or metadata.address
  if (typeof obj.version === "string") return "anchor";
  if (meta && typeof meta.address === "string") return "anchor";

  // Fallback: try Anchor
  return "anchor";
}
