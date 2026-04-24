// Constraint parser — parse #[account(...)] attributes.

import type { Constraint } from "@solflow/ir";
import { RE_CONSTRAINT_TOKENS } from "../utils/anchor-patterns";

/**
 * Parse constraint tokens from an #[account(...)] attribute content.
 * Input: the content inside the parens, e.g. "init, payer = user, space = 100"
 */
export function parseConstraints(attrContent: string): Constraint[] {
  const constraints: Constraint[] = [];
  const tokens = tokenizeConstraints(attrContent);

  // Post-process: merge realloc::payer and realloc::zero into preceding realloc token
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "realloc-ns") {
      // Find preceding realloc constraint and merge
      for (let j = constraints.length - 1; j >= 0; j--) {
        if (constraints[j].type === "realloc") {
          const rc = constraints[j] as { type: "realloc"; space: number; payer: string; zeroInit: boolean };
          if (token.field === "payer") rc.payer = token.value || "";
          if (token.field === "zero") rc.zeroInit = token.value === "true";
          break;
        }
      }
      continue;
    }
    const c = parseSingleConstraint(token);
    if (c) constraints.push(c);
  }

  return constraints;
}

interface ConstraintToken {
  type: string;
  value?: string;
  payer?: string;
  space?: string;
  seeds?: string;
  bump?: string;
  target?: string;
  field?: string;
  expression?: string;
  authority?: string;
  mint?: string;
  errorCode?: string;
  zeroInit?: boolean;
}

function tokenizeConstraints(content: string): ConstraintToken[] {
  const tokens: ConstraintToken[] = [];
  // Split by comma, but be careful with nested brackets
  let depth = 0;
  let current = "";

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth--;

    if (ch === "," && depth === 0) {
      if (current.trim()) tokens.push(parseToken(current.trim()));
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(parseToken(current.trim()));

  return tokens;
}

function parseToken(raw: string): ConstraintToken {
  const trimmed = raw.trim();

  // realloc::payer = X, realloc::zero = true (namespaced key-value)
  const reallocNsMatch = trimmed.match(/^realloc::(\w+)\s*=\s*(.+)$/);
  if (reallocNsMatch) {
    return { type: "realloc-ns", field: reallocNsMatch[1], value: reallocNsMatch[2].trim() };
  }

  // token::authority = X, token::mint = X, token::token_program = X
  const tokenKvMatch = trimmed.match(/^token::(\w+)\s*=\s*(.+)$/);
  if (tokenKvMatch) {
    const subKey = tokenKvMatch[1];
    const val = tokenKvMatch[2].trim();
    if (subKey === "authority") return { type: "token-authority", authority: val };
    if (subKey === "mint") return { type: "token-mint", mint: val };
    if (subKey === "token_program") return { type: "custom", expression: `token::token_program = ${val}` };
    return { type: "custom", expression: trimmed };
  }

  // mint::authority = X, mint::decimals = N, mint::freeze_authority = X, mint::token_program = X
  const mintKvMatch = trimmed.match(/^mint::(\w+)\s*=\s*(.+)$/);
  if (mintKvMatch) {
    const subKey = mintKvMatch[1];
    const val = mintKvMatch[2].trim();
    if (subKey === "authority") return { type: "mint-authority", authority: val };
    if (subKey === "decimals") return { type: "mint-decimals", value: val };
    if (subKey === "freeze_authority") return { type: "custom", expression: `mint::freeze_authority = ${val}` };
    if (subKey === "token_program") return { type: "custom", expression: `mint::token_program = ${val}` };
    return { type: "custom", expression: trimmed };
  }

  // associated_token::authority = X, associated_token::mint = X
  const atKvMatch = trimmed.match(/^associated_token::(\w+)\s*=\s*(.+)$/);
  if (atKvMatch) {
    const subKey = atKvMatch[1];
    const val = atKvMatch[2].trim();
    if (subKey === "authority") return { type: "associated-token-authority", authority: val };
    if (subKey === "mint") return { type: "associated-token-mint", mint: val };
    return { type: "custom", expression: trimmed };
  }

  // key = value patterns
  const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
  if (kvMatch) {
    const key = kvMatch[1];
    const value = kvMatch[2].trim();
    switch (key) {
      case "payer":
        return { type: "init", payer: value };
      case "space":
        return { type: "init", space: value };
      case "close":
        return { type: "close", target: value };
      case "has_one":
        return { type: "has_one", field: value, target: value };
      case "constraint":
        return { type: "custom", expression: value };
      case "seeds":
        return { type: "seeds", seeds: value };
      case "bump":
        return { type: "seeds", bump: value };
      case "realloc":
        return { type: "realloc", space: value };
      case "address":
        return { type: "address", value };
      case "owner":
        return { type: "owner", value };
      case "sweep":
        return { type: "custom", expression: `sweep = ${value}` };
    }
  }

  // has_one with error code: has_one = field @ ErrorCode
  const hasOneErrMatch = trimmed.match(/^has_one\s*=\s*(\w+)\s*@\s*(\w+)$/);
  if (hasOneErrMatch) {
    return { type: "has_one", field: hasOneErrMatch[1], target: hasOneErrMatch[1], errorCode: hasOneErrMatch[2] };
  }

  // constraint with error code: constraint = expr @ ErrorCode
  const constraintErrMatch = trimmed.match(/^constraint\s*=\s*(.+?)\s*@\s*(\w+)$/);
  if (constraintErrMatch) {
    return { type: "custom", expression: constraintErrMatch[1].trim(), errorCode: constraintErrMatch[2] };
  }

  // Simple flags
  switch (trimmed) {
    case "signer":
      return { type: "signer" };
    case "mut":
      return { type: "mut" };
    case "init":
      return { type: "init" };
    case "init_if_needed":
      return { type: "init-if-needed" };
    case "bump":
      return { type: "seeds", bump: "" };
    case "executable":
      return { type: "custom", expression: "executable" };
    case "rent_exempt":
    case "rent_exempt = skip":
      return { type: "custom", expression: trimmed };
    case "zero":
      return { type: "custom", expression: "zero" };
    case "dup":
      return { type: "custom", expression: "dup" };
    case "zero_copy":
    case "zero_copy(unsafe)":
      return { type: "custom", expression: "zero_copy" };
  }

  return { type: "custom", expression: trimmed };
}

function parseSingleConstraint(token: ConstraintToken): Constraint | null {
  switch (token.type) {
    case "signer":
      return { type: "signer" };
    case "mut":
      return { type: "mut" };
    case "init":
      return {
        type: "init",
        payer: token.payer || "",
        space: token.space ? (isNaN(Number(token.space)) ? "auto" : parseInt(token.space)) : "auto",
      };
    case "init-if-needed":
      return {
        type: "init-if-needed",
        payer: token.payer || "",
        space: token.space ? (isNaN(Number(token.space)) ? "auto" : parseInt(token.space)) : "auto",
      };
    case "close":
      return { type: "close", target: token.target || "" };
    case "has_one":
      return { type: "has-one", field: token.field || "", target: token.target || token.field || "", errorCode: token.errorCode };
    case "seeds":
      return {
        type: "seeds",
        seeds: parseSeedsExpr(token.seeds || ""),
        bump: token.bump,
      };
    case "token-authority":
      return { type: "token-authority", authority: token.authority || "" };
    case "token-mint":
      return { type: "token-mint", mint: token.mint || "" };
    case "mint-authority":
      return { type: "mint-authority", authority: token.authority || "" };
    case "mint-decimals":
      return { type: "mint-decimals", decimals: parseInt(token.value || "0") || 0 };
    case "associated-token-authority":
      return { type: "associated-token-authority", authority: token.authority || "" };
    case "associated-token-mint":
      return { type: "associated-token-mint", mint: token.mint || "" };
    case "realloc": {
      // Accumulate realloc with payer and zero from subsequent tokens
      const space = token.space ? parseInt(token.space) : 0;
      return { type: "realloc", space, payer: "", zeroInit: false };
    }
    case "realloc-ns":
      // These are handled in post-processing below — return null here,
      // we merge them into realloc tokens during tokenization post-processing
      return null;
    case "address":
      return { type: "address", address: token.value || "" };
    case "owner":
      return { type: "owner", owner: token.value || "" };
    case "custom":
      return { type: "custom", expression: token.expression || "", errorCode: token.errorCode };
    default:
      return null;
  }
}

type SeedType = "literal" | "account-field" | "instruction-arg" | "pubkey";

function parseSeedsExpr(expr: string): Array<{ type: SeedType; value: string }> {
  const seeds: Array<{ type: SeedType; value: string }> = [];
  const inner = expr.replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return seeds;

  for (const part of inner.split(",")) {
    const s = part.trim();
    if (!s) continue;

    if (s.startsWith('"')) {
      seeds.push({ type: "literal", value: s.replace(/"/g, "") });
    } else if (s.includes(".")) {
      seeds.push({ type: "account-field", value: s });
    } else if (s === "bump") {
      seeds.push({ type: "literal", value: "bump" });
    } else {
      seeds.push({ type: "instruction-arg", value: s });
    }
  }

  return seeds;
}

/**
 * Parse individual attribute annotations like #[signer], #[mut], etc.
 * (used when constraints are not in a combined #[account(...)] form)
 */
export function parseAttributeConstraint(attr: string): Constraint | null {
  const trimmed = attr.trim();
  switch (trimmed) {
    case "signer":
      return { type: "signer" };
    case "mut":
      return { type: "mut" };
    default:
      return null;
  }
}
