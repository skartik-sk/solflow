// Shank IDL Parser
// Converts Shank (Metaplex) IDL JSON into the unified IDL format.
// Shank IDLs are structurally similar to Anchor but with Shank-specific fields:
// - metadata.origin === "shank"
// - Accounts may have `relations` field
// - No standard events array

import type {
  UnifiedIdl,
  UnifiedInstruction,
  UnifiedAccountState,
  UnifiedError,
  UnifiedTypeDef,
} from "../types";
import { mapType } from "./type-mapper";

export function parseShankIdl(json: unknown): UnifiedIdl {
  const idl = json as Record<string, unknown>;

  if (!idl.name || !Array.isArray(idl.instructions)) {
    throw new Error("Invalid Shank IDL: missing 'name' or 'instructions'");
  }

  const instructions: UnifiedInstruction[] =
    (idl.instructions as Array<Record<string, unknown>>).map((ix) => ({
      name: ix.name as string,
      args: (Array.isArray(ix.args) ? ix.args : []).map(
        (arg: Record<string, unknown>) => ({
          name: arg.name as string,
          type: mapType(arg.type),
        }),
      ),
      accounts: (Array.isArray(ix.accounts) ? ix.accounts : []).map(
        (acc: Record<string, unknown>) => ({
          name: acc.name as string,
          isMut: (acc.isMut as boolean) ?? false,
          isSigner: (acc.isSigner as boolean) ?? false,
          isOptional: acc.isOptional as boolean | undefined,
          description: acc.desc as string | undefined,
          seeds: (acc.pda as Record<string, unknown> | undefined)?.seeds
            ? ((acc.pda as { seeds: Array<Record<string, unknown>> }).seeds.map(
                (s) => ({
                  type:
                    s.kind === "const"
                      ? "literal"
                      : s.kind === "arg"
                        ? "instruction-arg"
                        : "account-field",
                  value: (s.value ?? s.path ?? "") as string,
                }),
              ))
            : undefined,
          pdaBump: (acc.pda as Record<string, unknown> | undefined)?.program
            ? ((acc.pda as { program: { value?: string } }).program.value)
            : undefined,
        }),
      ),
      description: Array.isArray(ix.docs)
        ? (ix.docs as string[]).join(" ")
        : undefined,
    }));

  const accounts: UnifiedAccountState[] = (
    Array.isArray(idl.accounts) ? idl.accounts : []
  ).map((acc: Record<string, unknown>) => {
    const accType = acc.type as Record<string, unknown>;
    return {
      name: acc.name as string,
      fields: (
        Array.isArray(accType?.fields) ? accType.fields : []
      ).map((f: Record<string, unknown>) => ({
        name: f.name as string,
        type: mapType(f.type),
      })),
    };
  });

  const errors: UnifiedError[] = (
    Array.isArray(idl.errors) ? idl.errors : []
  ).map((e: Record<string, unknown>) => ({
    code: e.code as number,
    name: e.name as string,
    message: (e.msg ?? e.message ?? "") as string,
  }));

  const types: UnifiedTypeDef[] = (
    Array.isArray(idl.types) ? idl.types : []
  ).map((t: Record<string, unknown>) => {
    const tType = t.type as Record<string, unknown>;
    return {
      name: t.name as string,
      fields: (
        Array.isArray(tType?.fields) ? tType.fields : []
      ).map((f: Record<string, unknown>) => ({
        name: f.name as string,
        type: mapType(f.type),
      })),
      variants: Array.isArray(tType?.variants)
        ? (tType.variants as Array<Record<string, unknown>>).map(
            (v: Record<string, unknown>) => ({
              name: v.name as string,
              fields: Array.isArray(v.fields)
                ? (v.fields as Array<Record<string, unknown>>).map(
                    (f: Record<string, unknown>) => ({
                      name: f.name as string,
                      type: mapType(f.type),
                    }),
                  )
                : undefined,
            }),
          )
        : undefined,
    };
  });

  return {
    program: {
      name: idl.name as string,
      version: (idl.version as string) ?? "0.1.0",
      programId: (idl.metadata as Record<string, unknown>)?.address as
        | string
        | undefined,
    },
    instructions,
    accounts,
    errors,
    events: [],
    types,
  };
}
