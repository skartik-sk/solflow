// Rust AST subset — enough to cover Solana/Anchor program patterns.
// Matches the spec in docs/architecture/05-code-generation.md.

// ─── Top-level file ───────────────────────────────────────────────────────────

export interface RustFile {
  path: string;    // relative path, e.g. "src/lib.rs"
  items: RustItem[];
}

// ─── File items ───────────────────────────────────────────────────────────────

export type RustItem =
  | RustUseStatement
  | RustStructDef
  | RustEnumDef
  | RustImplBlock
  | RustFnDef
  | RustMacroDef
  | RustModDecl
  | RustAttribute
  | RustConstDef
  | RustTypeAlias
  | RustRawCode;

// ─── Use statement ────────────────────────────────────────────────────────────

export interface RustUseStatement {
  kind: 'use';
  path: string;   // e.g. "anchor_lang::prelude::*"
}

// ─── Module declaration ───────────────────────────────────────────────────────

export interface RustModDecl {
  kind: 'mod';
  name: string;
  visibility: 'pub' | 'pub(crate)' | '';
}

// ─── Raw code block ───────────────────────────────────────────────────────────

export interface RustRawCode {
  kind: 'raw';
  code: string;
}

// ─── Attribute (#[...] or #![...]) ───────────────────────────────────────────

export interface RustAttribute {
  kind: 'attribute';
  outer: boolean;     // true = #[...], false = #![...]
  content: string;    // raw attribute content
}

// ─── Constant definition ──────────────────────────────────────────────────────

export interface RustConstDef {
  kind: 'const';
  name: string;
  type: RustType;
  value: string;       // raw expression string
  visibility: 'pub' | 'pub(crate)' | '';
}

// ─── Type alias ───────────────────────────────────────────────────────────────

export interface RustTypeAlias {
  kind: 'type-alias';
  name: string;
  type: RustType;
  visibility: 'pub' | 'pub(crate)' | '';
}

// ─── Struct definition ────────────────────────────────────────────────────────

export interface RustStructDef {
  kind: 'struct';
  name: string;
  generics?: string[];
  fields: RustField[];
  attributes: RustAttribute[];
  visibility: 'pub' | 'pub(crate)' | '';
  isZeroCopy: boolean;
}

export interface RustField {
  name: string;
  type: RustType;
  attributes: RustAttribute[];
  visibility: 'pub' | 'pub(crate)' | '';
  docComment?: string;
}

// ─── Enum definition ──────────────────────────────────────────────────────────

export interface RustEnumDef {
  kind: 'enum';
  name: string;
  variants: RustEnumVariant[];
  attributes: RustAttribute[];
  visibility: 'pub' | '';
}

export interface RustEnumVariant {
  name: string;
  fields?: RustField[];
  discriminant?: number;
  attributes: RustAttribute[];
}

// ─── Impl block ───────────────────────────────────────────────────────────────

export interface RustImplBlock {
  kind: 'impl';
  typeName: string;
  traitName?: string;
  generics?: string[];
  items: RustFnDef[];
}

// ─── Macro definition (macro_rules!) ─────────────────────────────────────────

export interface RustMacroDef {
  kind: 'macro-def';
  name: string;
  body: string;   // raw macro body
}

// ─── Function definition ──────────────────────────────────────────────────────

export interface RustFnDef {
  kind: 'fn';
  name: string;
  generics?: string[];
  params: RustParam[];
  returnType?: RustType;
  body: RustStatement[];
  attributes: RustAttribute[];
  visibility: 'pub' | 'pub(crate)' | '';
  isUnsafe: boolean;
}

export interface RustParam {
  name: string;
  type: RustType;
}

// ─── Statements ───────────────────────────────────────────────────────────────

export type RustStatement =
  | { kind: 'let'; name: string; type?: RustType; mutable: boolean; value: RustExpr }
  | { kind: 'assign'; target: RustExpr; value: RustExpr }
  | { kind: 'expr'; expr: RustExpr }
  | { kind: 'return'; value?: RustExpr }
  | { kind: 'if'; condition: RustExpr; thenBlock: RustStatement[]; elseBlock?: RustStatement[] }
  | { kind: 'match'; expr: RustExpr; arms: { pattern: string; body: RustStatement[] }[] }
  | { kind: 'for'; var: string; iter: RustExpr; body: RustStatement[] }
  | { kind: 'raw'; code: string }
  ;

// ─── Expressions ─────────────────────────────────────────────────────────────

export type RustExpr =
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'ident'; name: string }
  | { kind: 'field-access'; object: RustExpr; field: string }
  | { kind: 'method-call'; object: RustExpr; method: string; args: RustExpr[] }
  | { kind: 'fn-call'; name: string; args: RustExpr[] }
  | { kind: 'macro-call'; name: string; args: string }
  | { kind: 'binary'; op: string; left: RustExpr; right: RustExpr }
  | { kind: 'unary'; op: string; operand: RustExpr }
  | { kind: 'reference'; mutable: boolean; expr: RustExpr }
  | { kind: 'try'; expr: RustExpr }
  | { kind: 'struct-init'; name: string; fields: { name: string; value: RustExpr }[] }
  | { kind: 'closure'; params: string[]; body: RustStatement[] }
  | { kind: 'raw'; code: string }
  ;

// ─── Types ───────────────────────────────────────────────────────────────────

export type RustType =
  | { kind: 'simple'; name: string }
  | { kind: 'generic'; name: string; params: RustType[] }
  | { kind: 'reference'; lifetime?: string; mutable: boolean; type: RustType }
  | { kind: 'array'; type: RustType; size: number }
  | { kind: 'option'; type: RustType }
  | { kind: 'vec'; type: RustType }
  | { kind: 'result'; ok: RustType; err: RustType }
  | { kind: 'raw'; code: string }
  ;
