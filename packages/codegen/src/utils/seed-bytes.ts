import type { Instruction, Seed } from "@solflow/ir";

/**
 * How a framework spells a PDA seed's bytes. `key` turns an account name into its address bytes;
 * literals and everything else are shared.
 */
export interface SeedStyle {
  literal: (value: string) => string;
  key: (account: string) => string;
}

const INTEGER = /^[ui](8|16|32|64|128)$/;

/** One seed as a `&[u8]` expression: accounts by address, args by type, other expressions as written. */
export function seedBytes(seed: Seed, style: SeedStyle, ix?: Instruction): string {
  // `signer.key().as_ref()` written out in a flow means the account `signer`.
  if (seed.type === "literal") return style.literal(seed.value);
  const value = seed.value.trim().replace(/^(\w+)\.key\(\)(?:\.to_bytes\(\))?(?:\.as_ref\(\))?$/, "$1");
  // A program constant (`pub const VAULT: &[u8] = b"vault";`) is already bytes.
  if (/^[A-Z][A-Z0-9_]*$/.test(value)) return value;
  const isIdent = /^\w+$/.test(value);
  const arg = isIdent ? ix?.args.find((a) => a.name === value) : undefined;
  const account = isIdent ? ix?.accounts.find((a) => a.name === value) : undefined;
  if (arg) {
    const type = typeof arg.type === "string" ? arg.type : "";
    if (INTEGER.test(type)) return `${value}.to_le_bytes().as_ref()`;
    if (type === "String") return `${value}.as_bytes()`;
    return `${value}.as_ref()`;
  }
  if (account || (isIdent && seed.type !== "instruction-arg")) return style.key(value);
  if (isIdent) return `${value}.as_ref()`;
  // An expression from parsed source, e.g. `config.seed.to_le_bytes()`.
  return /\.(as_ref|as_bytes)\(\)$/.test(value) || value.startsWith("&") ? value : `${value}.as_ref()`;
}
