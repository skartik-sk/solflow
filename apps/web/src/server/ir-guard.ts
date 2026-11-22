// Validates the parts of a project's IR that codegen writes into Cargo.toml and
// Rust identifiers. The generated crate is compiled on a GitHub Actions runner,
// so a name or version carrying a newline or quote could inject Cargo.toml
// sections (e.g. a malicious [build-dependencies] build script). Codegen also
// escapes (defence in depth); this rejects bad input at the boundary.

import { z } from "zod";

/** A Rust identifier (snake_case or PascalCase), no raw identifiers. */
const rustIdent = z
  .string()
  .max(64)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "must be a Rust identifier (letters, digits, underscores)");

/** Program (crate) name: identifier characters only (codegen snake-cases it). */
const crateName = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "must contain only letters, digits and underscores");

/** SemVer 2.0 (no leading v). */
const semver = z
  .string()
  .max(64)
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
    "must be a semantic version like 0.1.0",
  );

/** Free text that may reach Cargo.toml or a Rust string/doc comment: one line, no quotes or backslashes. */
const tomlSafeText = z
  .string()
  .max(500)
  .refine((s) => !/[\r\n"\\\u0000-\u001f\u007f]/.test(s), "must be one line without quotes, backslashes or control characters");

/** Text that may reach a Rust doc comment: one line, no control characters. */
const oneLine = z
  .string()
  .max(2000)
  .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), "must be one line without control characters");

const base58Address = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "must be a base58 address");

const named = z.object({ name: rustIdent }).passthrough();

const IrGuardSchema = z
  .object({
    program: z
      .object({
        name: crateName,
        version: semver,
        description: oneLine.optional(),
        license: tomlSafeText.optional(),
        programId: base58Address.optional().or(z.literal("")),
      })
      .passthrough(),
    instructions: z
      .array(
        named.extend({
          accounts: z.array(named).max(200).optional(),
          args: z.array(named).max(200).optional(),
        }),
      )
      .max(200),
    states: z.array(named.extend({ fields: z.array(named).max(200).optional() })).max(200).optional(),
    errors: z.array(named).max(500).optional(),
    events: z.array(named.extend({ fields: z.array(named).max(200).optional() })).max(200).optional(),
  })
  .passthrough();

export type IrGuardResult = { ok: true } | { ok: false; message: string };

/** Check an IR object; returns a readable message naming the first bad field. */
export function validateIrForBuild(ir: unknown): IrGuardResult {
  const res = IrGuardSchema.safeParse(ir);
  if (res.success) return { ok: true };
  const issue = res.error.issues[0];
  const path = issue.path.join(".");
  return { ok: false, message: `Invalid project IR at ${path || "(root)"}: ${issue.message}` };
}
