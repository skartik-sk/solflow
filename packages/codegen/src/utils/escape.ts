import type { ProgramIR, SolanaType } from "@solflow/ir";

// Defence in depth: the IR comes from user-saved JSON, and generated files are
// compiled on a build server. Names become Rust identifiers and Cargo.toml
// values, free text becomes string literals and comments. Anything that could
// break out of those positions is rejected (identifiers, versions, ids) or
// escaped (free text) here.

const RUST_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
// Loose on purpose (alphanumeric): this guards the string literal, not base58 validity.
const BASE58_ADDRESS = /^[0-9A-Za-z]{32,44}$/;

export function isRustIdent(s: unknown): s is string {
  return typeof s === "string" && RUST_IDENT.test(s);
}

export function isSemver(s: unknown): s is string {
  return typeof s === "string" && SEMVER.test(s);
}

export function isBase58Address(s: unknown): boolean {
  return typeof s === "string" && BASE58_ADDRESS.test(s);
}

/** Text for inside a Rust `"..."` literal. */
export function rustStringContent(s: string): string {
  return s.replace(/[\\"\u0000-\u001f\u007f]/g, (c) => {
    if (c === "\\") return "\\\\";
    if (c === '"') return '\\"';
    if (c === "\n") return "\\n";
    if (c === "\r") return "\\r";
    if (c === "\t") return "\\t";
    return `\\u{${c.charCodeAt(0).toString(16)}}`;
  });
}

/** Text for inside a Rust `b"..."` literal: its UTF-8 bytes, non-printable ones as `\xNN`. */
export function rustByteStringContent(s: string): string {
  let out = "";
  for (const b of new TextEncoder().encode(s)) {
    if (b === 0x5c) out += "\\\\";
    else if (b === 0x22) out += '\\"';
    else if (b >= 0x20 && b < 0x7f) out += String.fromCharCode(b);
    else out += `\\x${b.toString(16).padStart(2, "0")}`;
  }
  return out;
}

/** Free text for a `//` or `///` comment: one line, so it can't end the comment. */
export function commentText(s: string): string {
  return s.replace(/[\r\n\u2028\u2029]+/g, " ").replace(/\*\//g, "* /");
}

function definedName(t: SolanaType): string[] {
  if (typeof t === "string") return [];
  if ("defined" in t) return [t.defined];
  if ("option" in t) return definedName(t.option);
  if ("vec" in t) return definedName(t.vec);
  if ("array" in t) return definedName(t.array[0]);
  if ("hashMap" in t) return [...definedName(t.hashMap[0]), ...definedName(t.hashMap[1])];
  return [];
}

/**
 * Everything in the IR that becomes a Rust identifier, a Cargo.toml value or
 * declare_id! must be well-formed; a value that isn't is refused rather than
 * written out. Returns one message per problem (empty = OK).
 */
export function validateIrForCodegen(ir: ProgramIR): string[] {
  const problems: string[] = [];
  const ident = (what: string, v: unknown) => {
    if (!isRustIdent(v)) problems.push(`${what} ${JSON.stringify(v)} is not a valid Rust identifier`);
  };
  ident("Program name", ir.program.name);
  if (!isSemver(ir.program.version)) {
    problems.push(`Program version ${JSON.stringify(ir.program.version)} is not a semver version (e.g. 0.1.0)`);
  }
  if (ir.program.programId !== undefined && ir.program.programId !== "" && !isBase58Address(ir.program.programId)) {
    problems.push(`Program id ${JSON.stringify(ir.program.programId)} is not a base58 address`);
  }
  const known = new Set(ir.states.map((s) => s.name));
  const checkType = (what: string, t: SolanaType) => {
    for (const name of definedName(t)) {
      if (!known.has(name)) {
        problems.push(`${what} uses type "${name}", which is not defined in this program (custom structs/enums aren't supported yet; use a State or a primitive type)`);
      }
    }
  };
  for (const ix of ir.instructions) {
    ident("Instruction name", ix.name);
    for (const a of ix.args) {
      ident(`Argument of ${ix.name}`, a.name);
      checkType(`Argument ${ix.name}.${a.name}`, a.type);
    }
    for (const acc of ix.accounts) ident(`Account in ${ix.name}`, acc.name);
  }
  for (const st of ir.states) {
    ident("State name", st.name);
    for (const f of st.fields) {
      ident(`Field of ${st.name}`, f.name);
      checkType(`Field ${st.name}.${f.name}`, f.type);
    }
  }
  for (const ev of ir.events) {
    ident("Event name", ev.name);
    for (const f of ev.fields) {
      ident(`Field of ${ev.name}`, f.name);
      checkType(`Field ${ev.name}.${f.name}`, f.type);
    }
  }
  for (const e of ir.errors) ident("Error name", e.name);
  for (const c of ir.constants) ident("Constant name", c.name);
  return [...new Set(problems)];
}

/**
 * A copy of the IR whose free text is safe to write into string literals and
 * comments (error messages escaped, descriptions and safety notes on one line).
 */
export function sanitizeIrText(ir: ProgramIR): ProgramIR {
  const copy = JSON.parse(JSON.stringify(ir)) as ProgramIR;
  const doc = <T extends { description?: string }>(o: T) => {
    if (typeof o.description === "string") o.description = commentText(o.description);
  };
  doc(copy.program);
  for (const ix of copy.instructions) {
    doc(ix);
    ix.args.forEach(doc);
    for (const acc of ix.accounts) {
      doc(acc);
      for (const c of acc.constraints) {
        if (c.type === "safety-comment") c.comment = commentText(c.comment);
      }
    }
  }
  for (const s of [...copy.states, ...copy.events]) {
    doc(s);
    s.fields.forEach(doc);
  }
  for (const e of copy.errors) e.message = rustStringContent(commentText(e.message));
  return copy;
}
