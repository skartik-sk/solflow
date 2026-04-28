import type { AuditFinding, AuditFixSuggestion } from "./types";

const RULE_FIXES: Record<
  string,
  Pick<AuditFixSuggestion, "summary" | "graphAction" | "codeAction" | "confidence">
> = {
  "SOL-001": {
    summary: "Require the authority account to sign, not only match a stored pubkey.",
    graphAction: "Enable signer on the authority/source account node.",
    codeAction: "Add `Signer` or `#[account(signer)]` and keep the pubkey/domain check.",
    confidence: "high",
  },
  "SOL-002": {
    summary: "Validate the owner before reading or trusting unchecked account data.",
    graphAction: "Add an owner constraint or convert the node to a typed account.",
    codeAction: "Check `account.owner == expected_program_id` before deserialization.",
    confidence: "high",
  },
  "SOL-003": {
    summary: "Prevent type cosplay by proving the account type/discriminator.",
    graphAction: "Use a typed account or add discriminator and owner validation.",
    codeAction: "Verify discriminator bytes before deserializing state.",
    confidence: "medium",
  },
  "SOL-004": {
    summary: "Derive PDAs canonically and keep user-controlled bump values out of trust decisions.",
    graphAction: "Use fixed seeds and a canonical bump on the PDA constraint node.",
    codeAction: "Use `find_program_address` or Anchor `seeds` plus `bump`.",
    confidence: "medium",
  },
  "SOL-010": {
    summary: "Use checked arithmetic for every balance, amount, and counter mutation.",
    graphAction: "Enable checked arithmetic on the math node.",
    codeAction: "Use `checked_add`, `checked_sub`, `checked_mul`, or checked conversions.",
    confidence: "high",
  },
  "SOL-011": {
    summary: "Avoid narrowing casts unless the value is range-checked first.",
    graphAction: "Add a require/constraint node that bounds the value before the cast.",
    codeAction: "Replace `as` with `try_from` or validate min/max before casting.",
    confidence: "medium",
  },
  "SOL-020": {
    summary: "Make PDA seed tuples unique across accounts and authority domains.",
    graphAction: "Add user, authority, mint, or namespace seed material to the PDA node.",
    codeAction: "Avoid identical literal-only seed tuples; include domain-specific pubkeys or fixed prefixes.",
    confidence: "medium",
  },
  "SOL-021": {
    summary: "Store and verify the canonical bump for PDA derivations.",
    graphAction: "Add a canonical bump field to the PDA seeds constraint.",
    codeAction: "Use Anchor `bump` or persist `bump = account.bump` after canonical derivation.",
    confidence: "medium",
  },
  "SOL-022": {
    summary: "Make PDA-like account validation explicit with seeds and bump.",
    graphAction: "Fill both seeds and bump on the PDA account constraint.",
    codeAction: "Add `seeds = [...]` and `bump`, or use an explicit address/owner/custom validation if it is not a PDA.",
    confidence: "high",
  },
  "SOL-023": {
    summary: "Do not trust shared PDA domains without an owner or authority boundary.",
    graphAction: "Add has-one, owner, or authority scoping to the PDA path.",
    codeAction: "Bind state ownership to the expected authority/account domain.",
    confidence: "medium",
  },
  "SOL-030": {
    summary: "Validate token mint before trusting a token account balance or transfer.",
    graphAction: "Set the expected token mint on the token account node.",
    codeAction: "Check `token_account.mint == expected_mint` before token operations.",
    confidence: "high",
  },
  "SOL-031": {
    summary: "Validate token authority/owner before signing or moving tokens.",
    graphAction: "Set token authority and require signer/owner constraints.",
    codeAction: "Check token owner/delegate and signer before transfer/approve/burn.",
    confidence: "high",
  },
  "SOL-040": {
    summary: "Validate CPI target programs before invoking them.",
    graphAction: "Add an address/program constraint to the CPI program account.",
    codeAction: "Require the CPI program id to match the expected SPL/System/Jupiter id.",
    confidence: "high",
  },
  "SOL-041": {
    summary: "Reload accounts after CPI before reading values that the CPI may mutate.",
    graphAction: "Add a reload/refresh step after the CPI node.",
    codeAction: "Call `reload()` or re-borrow data after CPI before using balances/state.",
    confidence: "medium",
  },
  "SOL-042": {
    summary: "CPI target program accounts should be strict program types, not arbitrary AccountInfo.",
    graphAction: "Change the CPI target node to a typed program account where possible.",
    codeAction: "Use `Program<'info, Token>` or add an address constraint pinned to the expected program.",
    confidence: "medium",
  },
  "SOL-050": {
    summary: "Validate instruction inputs before using them in math or transfers.",
    graphAction: "Add require/constraint nodes for numeric argument bounds.",
    codeAction: "Add `require!` checks for zero, min/max, and domain-specific limits before mutation.",
    confidence: "medium",
  },
  "SOL-051": {
    summary: "Zero sensitive account data before or during close flows.",
    graphAction: "Add an explicit zeroing step or mark the close path as Anchor-managed.",
    codeAction: "Use Anchor close semantics where safe, or explicitly overwrite sensitive fields before draining lamports.",
    confidence: "medium",
  },
  "SOL-052": {
    summary: "Close disposable initialized accounts to avoid stranded lamports/state.",
    graphAction: "Add a close target to temporary/disposable account nodes.",
    codeAction: "Use `close = receiver` or explicit close/lamport drain logic.",
    confidence: "medium",
  },
  "SOL-060": {
    summary: "Bound loops so instruction compute use stays predictable.",
    graphAction: "Add a max-length require node before iteration.",
    codeAction: "Reject oversized vectors/account lists before loops or split work across instructions.",
    confidence: "medium",
  },
  "SOL-061": {
    summary: "Keep realloc growth within Solana's per-instruction limits.",
    graphAction: "Add a maximum realloc size or chunked resize path.",
    codeAction: "Limit each realloc to <= 10,240 bytes or split growth across multiple instructions.",
    confidence: "medium",
  },
  "SOL-062": {
    summary: "Zero newly reallocated bytes to avoid stale data exposure.",
    graphAction: "Enable realloc zeroing on the realloc account node.",
    codeAction: "Use `realloc::zero = true` or manually initialize new bytes.",
    confidence: "high",
  },
  "SOL-070": {
    summary: "Mark accounts mutable when logic writes to them.",
    graphAction: "Enable mut on the account node that is modified by logic.",
    codeAction: "Add `mut` to the account constraint or use a mutable account wrapper.",
    confidence: "high",
  },
  "SOL-071": {
    summary: "Review init-if-needed flows for state reset and reinitialization risk.",
    graphAction: "Prefer explicit init or add state-exists guards.",
    codeAction: "Guard initialization with state flags and authority checks.",
    confidence: "low",
  },
  "SOL-072": {
    summary: "Use typed account validation instead of raw AccountInfo for data accounts.",
    graphAction: "Convert data AccountInfo nodes to typed state/account nodes.",
    codeAction: "Replace AccountInfo with a typed account wrapper or explicit owner/discriminator checks.",
    confidence: "medium",
  },
  "SOL-073": {
    summary: "Add uniqueness/domain constraints to sensitive account sets.",
    graphAction: "Add has-one, address, seeds, or authority constraints.",
    codeAction: "Reject duplicate/same-account inputs for distinct security roles.",
    confidence: "medium",
  },
};

export function getFixSuggestion(finding: AuditFinding): AuditFixSuggestion {
  const template = RULE_FIXES[finding.ruleId] ?? {
    summary: finding.recommendation || "Review this finding and add the missing validation.",
    graphAction: "Inspect the target node and add the missing constraint.",
    codeAction: finding.recommendation,
    confidence: "low" as const,
  };
  const location = [
    finding.location.instructionName,
    finding.location.accountName,
  ].filter(Boolean).join(":");

  return {
    findingKey: `${finding.ruleId}:${location || finding.title}`,
    ruleId: finding.ruleId,
    title: `Fix ${finding.ruleId}: ${finding.title}`,
    nodeId: finding.location.nodeId,
    ...template,
  };
}

export function attachFixSuggestions(findings: AuditFinding[]): AuditFixSuggestion[] {
  return findings.map(getFixSuggestion);
}
