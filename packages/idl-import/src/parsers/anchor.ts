// Anchor IDL Parser
// Converts Anchor IDL JSON into the unified IDL format.

import type {
  UnifiedIdl,
  UnifiedInstruction,
  UnifiedAccountState,
  UnifiedError,
  UnifiedEvent,
  UnifiedTypeDef,
} from "../types";
import { mapType } from "./type-mapper";

// ─── Anchor IDL type shapes (what we receive from the user) ──────────────

interface AnchorIdlInstruction {
  name: string;
  docs?: string[];
  accounts: {
    name: string;
    isMut: boolean;
    isSigner: boolean;
    isOptional?: boolean;
    desc?: string;
    relations?: string[];
    address?: string;
    pda?: {
      seeds: Array<{ kind: string; value?: string; path?: string; seed?: { type: string; value: string } }>;
      program?: { value?: string };
    };
  }[];
  args: { name: string; type: unknown; description?: string }[];
  discriminator?: number[];
}

interface AnchorIdl {
  version: string;
  name: string;
  docs?: string[];
  instructions: AnchorIdlInstruction[];
  accounts?: {
    name: string;
    docs?: string[];
    discriminator?: number[];
    type: {
      kind: "struct" | "enum";
      fields?: { name: string; type: unknown; docs?: string[] }[];
      variants?: { name: string; fields?: { name: string; type: unknown }[] }[];
    };
  }[];
  errors?: { code: number; name: string; msg: string }[];
  events?: {
    name: string;
    fields: { name: string; type: unknown; index: boolean }[];
  }[];
  types?: {
    name: string;
    type: {
      kind: "struct" | "enum";
      fields?: { name: string; type: unknown; docs?: string[] }[];
      variants?: { name: string; fields?: { name: string; type: unknown }[] }[];
    };
    docs?: string[];
  }[];
  metadata?: { address?: string; origin?: string };
}

// ─── Parser ──────────────────────────────────────────────────────────────

// Anchor >= 0.30 emits a new IDL spec: name/version under `metadata`, the program id as `address`,
// `writable`/`signer` flags, nested account groups, byte-array const seeds, and account/event
// layouts moved into `types`. Normalize it to the legacy shape the parser below understands.
type NewIdlAccount = {
  name: string;
  writable?: boolean;
  signer?: boolean;
  optional?: boolean;
  relations?: string[];
  address?: string;
  docs?: string[];
  pda?: { seeds?: Array<{ kind: string; value?: unknown; path?: string }> };
  accounts?: NewIdlAccount[];
};

/**
 * A const seed's bytes. Text (valid UTF-8) stays a literal — codegen writes non-ASCII bytes as
 * `\x` escapes; anything else becomes a byte-array expression, since a literal can't hold it.
 */
function constSeed(value: unknown): { type: string; value: string } | undefined {
  if (!Array.isArray(value)) return typeof value === "string" ? { type: "literal", value } : undefined;
  const bytes = Uint8Array.from(value as number[]);
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!/[\u0000-\u001f\u007f]/.test(text)) return { type: "literal", value: text };
  } catch {
    // not UTF-8
  }
  return { type: "pubkey", value: `[${[...bytes].map((b) => `${b}u8`).join(", ")}].as_ref()` };
}

function flattenAccounts(accounts: NewIdlAccount[]): NewIdlAccount[] {
  return accounts.flatMap((acc) => (Array.isArray(acc.accounts) ? flattenAccounts(acc.accounts) : [acc]));
}

export function normalizeAnchorIdl(json: unknown): unknown {
  const raw = json as Record<string, any>;
  if (!raw || typeof raw !== "object" || raw.name || typeof raw.metadata?.name !== "string") return json;

  const types: NonNullable<AnchorIdl["types"]> = raw.types ?? [];
  const typeOf = (name: string) => types.find((t) => t.name === name)?.type;
  const layoutNames = new Set<string>([
    ...(raw.accounts ?? []).map((a: { name: string }) => a.name),
    ...(raw.events ?? []).map((e: { name: string }) => e.name),
  ]);

  return {
    ...raw,
    name: raw.metadata.name,
    version: raw.metadata.version ?? "0.1.0",
    metadata: { ...raw.metadata, address: raw.address ?? raw.metadata.address },
    instructions: (raw.instructions ?? []).map((ix: Record<string, any>) => ({
      ...ix,
      accounts: flattenAccounts(ix.accounts ?? []).map((acc) => ({
        name: acc.name,
        isMut: acc.writable ?? false,
        isSigner: acc.signer ?? false,
        isOptional: acc.optional,
        desc: acc.docs?.join(" "),
        relations: acc.relations,
        address: acc.address,
        pda: acc.pda
          ? { seeds: (acc.pda.seeds ?? []).map((s) => (s.kind === "const" ? { kind: "const", seed: constSeed(s.value) } : { kind: s.kind, value: typeof s.value === "string" ? s.value : undefined, path: s.path })) }
          : undefined,
      })),
    })),
    accounts: (raw.accounts ?? []).map((a: { name: string; docs?: string[]; discriminator?: number[] }) => ({
      name: a.name,
      docs: a.docs,
      discriminator: a.discriminator,
      type: typeOf(a.name) ?? { kind: "struct", fields: [] },
    })),
    events: (raw.events ?? []).map((e: { name: string }) => ({
      name: e.name,
      fields: (typeOf(e.name)?.fields ?? []).map((f) => ({ ...f, index: false })),
    })),
    types: types.filter((t) => !layoutNames.has(t.name)),
  };
}

export function parseAnchorIdl(json: unknown): UnifiedIdl {
  const idl = normalizeAnchorIdl(json) as AnchorIdl;

  if (!idl.name || !Array.isArray(idl.instructions)) {
    throw new Error("Invalid Anchor IDL: missing 'name' or 'instructions'");
  }

  const programId = idl.metadata?.address;

  const warnings: string[] = [];
  for (const ix of idl.instructions) {
    for (const arg of ix.args ?? []) {
      if (/"[ui]256"/.test(JSON.stringify(arg.type))) {
        warnings.push(`${ix.name}.${arg.name}: 256-bit integers are imported as [u8; 32] (little-endian bytes).`);
      }
    }
  }
  const instructions: UnifiedInstruction[] = idl.instructions.map((ix) => ({
    name: ix.name,
    args: (ix.args ?? []).map((arg) => ({
      name: arg.name,
      type: mapType(arg.type),
      description: arg.description,
    })),
    accounts: (ix.accounts ?? []).map((acc) => ({
      name: acc.name,
      isMut: acc.isMut ?? false,
      isSigner: acc.isSigner ?? false,
      isOptional: acc.isOptional,
      description: acc.desc,
      seeds: acc.pda?.seeds?.map((s) => s.seed ?? ({
        type: s.kind === "const"
          ? "literal"
          : s.kind === "arg"
            ? "instruction-arg"
            : "account-field",
        value: s.value ?? s.path ?? "",
      })),
      pdaBump: acc.pda?.program?.value,
      relations: acc.relations,
      address: acc.address,
    })),
    description: ix.docs?.join(" "),
    discriminator: ix.discriminator,
  }));

  const accounts: UnifiedAccountState[] = (idl.accounts ?? []).map((acc) => ({
    name: acc.name,
    discriminator: acc.discriminator,
    fields: (acc.type.fields ?? []).map((f) => ({
      name: f.name,
      type: mapType(f.type),
      description: f.docs?.join(" "),
    })),
  }));

  const errors: UnifiedError[] = (idl.errors ?? []).map((e) => ({
    code: e.code,
    name: e.name,
    message: e.msg,
  }));

  const events: UnifiedEvent[] = (idl.events ?? []).map((ev) => ({
    name: ev.name,
    fields: (ev.fields ?? []).map((f) => ({
      name: f.name,
      type: mapType(f.type),
    })),
  }));

  const types: UnifiedTypeDef[] = (idl.types ?? []).map((t) => ({
    name: t.name,
    fields: (t.type.fields ?? []).map((f) => ({
      name: f.name,
      type: mapType(f.type),
      description: f.docs?.join(" "),
    })),
    variants: t.type.variants?.map((v) => ({
      name: v.name,
      fields: v.fields?.map((f) => ({
        name: f.name,
        type: mapType(f.type),
      })),
    })),
  }));

  return {
    program: {
      name: idl.name,
      version: idl.version ?? "0.1.0",
      description: idl.docs?.join(" "),
      programId,
    },
    instructions,
    accounts,
    errors,
    events,
    types,
    warnings,
  };
}
