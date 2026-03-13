// Maps SolanaType (from @solflow/ir) to Rust type strings and computes sizes.

import type { SolanaType } from '@solflow/ir';

// ─── SolanaType → Rust type string ───────────────────────────────────────────

export function solanaTypeToRust(type: SolanaType): string {
  if (typeof type === 'string') {
    switch (type) {
      case 'bool':   return 'bool';
      case 'u8':     return 'u8';
      case 'u16':    return 'u16';
      case 'u32':    return 'u32';
      case 'u64':    return 'u64';
      case 'u128':   return 'u128';
      case 'i8':     return 'i8';
      case 'i16':    return 'i16';
      case 'i32':    return 'i32';
      case 'i64':    return 'i64';
      case 'i128':   return 'i128';
      case 'f32':    return 'f32';
      case 'f64':    return 'f64';
      case 'String': return 'String';
      case 'Pubkey': return 'Pubkey';
    }
  }

  if (typeof type === 'object') {
    if ('array' in type) {
      const [inner, size] = type.array;
      return `[${solanaTypeToRust(inner)}; ${size}]`;
    }
    if ('vec' in type) {
      return `Vec<${solanaTypeToRust(type.vec)}>`;
    }
    if ('option' in type) {
      return `Option<${solanaTypeToRust(type.option)}>`;
    }
    if ('defined' in type) {
      return type.defined;
    }
    if ('hashMap' in type) {
      const [k, v] = type.hashMap;
      return `std::collections::HashMap<${solanaTypeToRust(k)}, ${solanaTypeToRust(v)}>`;
    }
    if ('enum' in type) {
      return type.enum.name;
    }
  }

  return 'u64'; // safe fallback
}

// ─── Size calculation (for non-dynamic types) ─────────────────────────────────

export function getTypeSize(type: SolanaType): number {
  if (typeof type === 'string') {
    switch (type) {
      case 'bool':   return 1;
      case 'u8':
      case 'i8':     return 1;
      case 'u16':
      case 'i16':    return 2;
      case 'u32':
      case 'i32':
      case 'f32':    return 4;
      case 'u64':
      case 'i64':
      case 'f64':    return 8;
      case 'u128':
      case 'i128':   return 16;
      case 'Pubkey': return 32;
      case 'String': return -1; // dynamic
    }
  }

  if (typeof type === 'object') {
    if ('array' in type) {
      const inner = getTypeSize(type.array[0]);
      return inner < 0 ? -1 : inner * type.array[1];
    }
    if ('vec' in type)    return -1; // dynamic
    if ('option' in type) {
      const inner = getTypeSize(type.option);
      return inner < 0 ? -1 : 1 + inner;
    }
    if ('defined' in type) return -1; // unknown static size
    if ('hashMap' in type) return -1; // dynamic
    if ('enum' in type)    return 1;  // assume u8 discriminant
  }

  return -1;
}

// ─── Determine whether a type needs #[derive(InitSpace)] ──────────────────────

export function isDynamic(type: SolanaType): boolean {
  return getTypeSize(type) < 0;
}

// ─── Calculate total space for a state (Anchor) ───────────────────────────────
// Returns the space value, or -1 if #[derive(InitSpace)] should be used instead.

export function calculateSpace(fields: Array<{ type: SolanaType }>): number {
  const DISCRIMINATOR = 8;
  let total = DISCRIMINATOR;
  for (const f of fields) {
    const s = getTypeSize(f.type);
    if (s < 0) return -1;
    total += s;
  }
  return total;
}

// ─── Rust size comment for a field ────────────────────────────────────────────

export function sizeComment(type: SolanaType): string | undefined {
  const s = getTypeSize(type);
  if (s < 0) return undefined;
  return `${s} byte${s === 1 ? '' : 's'}`;
}

// ─── pascal_case → snake_case ─────────────────────────────────────────────────

export function toSnakeCase(name: string): string {
  return name
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

// ─── snake_case / snake_case → PascalCase ────────────────────────────────────

export function toPascalCase(name: string): string {
  return name
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');
}

// ─── snake_case → kebab-case ──────────────────────────────────────────────────

export function toKebabCase(name: string): string {
  return name.replace(/_/g, '-');
}
