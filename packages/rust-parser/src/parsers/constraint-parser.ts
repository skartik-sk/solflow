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

  for (const token of tokens) {
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
    }
  }

  // token::authority = X
  const tokenAuthMatch = trimmed.match(/^token::authority\s*=\s*(\w+)$/);
  if (tokenAuthMatch) return { type: "token-authority", authority: tokenAuthMatch[1] };

  // token::mint = X
  const tokenMintMatch = trimmed.match(/^token::mint\s*=\s*(\w+)$/);
  if (tokenMintMatch) return { type: "token-mint", mint: tokenMintMatch[1] };

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
      return { type: "has-one", field: token.field || "", target: token.target || token.field || "" };
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
    case "custom":
      return { type: "custom", expression: token.expression || "" };
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
