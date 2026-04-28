export interface SolanaSecurityStandardRule {
  id: `SW${string}`;
  title: string;
  auditRuleIds: string[];
}

export const SOLANA_SECURITY_STANDARD_RULES: SolanaSecurityStandardRule[] = [
  {
    id: "SW001",
    title: "Missing signer or pubkey-only authority validation",
    auditRuleIds: ["SOL-001", "SOL-031"],
  },
  {
    id: "SW002",
    title: "Missing owner check on deserialization",
    auditRuleIds: ["SOL-002"],
  },
  {
    id: "SW003",
    title: "Arbitrary CPI target risk",
    auditRuleIds: ["SOL-040"],
  },
  {
    id: "SW004",
    title: "Non-canonical PDA derivation risk",
    auditRuleIds: ["SOL-004", "SOL-020", "SOL-021", "SOL-022"],
  },
  {
    id: "SW005",
    title: "Unsafe arithmetic or narrowing cast",
    auditRuleIds: ["SOL-010", "SOL-011"],
  },
  {
    id: "SW006",
    title: "Missing account discriminator validation",
    auditRuleIds: ["SOL-003"],
  },
  {
    id: "SW007",
    title: "Unchecked account usage without validation",
    auditRuleIds: ["SOL-002", "SOL-003", "SOL-072"],
  },
  {
    id: "SW008",
    title: "Missing post-CPI account reload",
    auditRuleIds: ["SOL-041"],
  },
  {
    id: "SW009",
    title: "Missing token mint validation",
    auditRuleIds: ["SOL-030"],
  },
  {
    id: "SW010",
    title: "Missing token authority validation",
    auditRuleIds: ["SOL-031"],
  },
  {
    id: "SW011",
    title: "AccountInfo used for data account",
    auditRuleIds: ["SOL-072"],
  },
  {
    id: "SW012",
    title: "Missing seeds + bump on PDA",
    auditRuleIds: ["SOL-021", "SOL-022"],
  },
  {
    id: "SW013",
    title: "Shared PDA across authority domains",
    auditRuleIds: ["SOL-023"],
  },
  {
    id: "SW014",
    title: "PDA seed collision risk",
    auditRuleIds: ["SOL-020"],
  },
  {
    id: "SW015",
    title: "Missing mut on modified accounts",
    auditRuleIds: ["SOL-070"],
  },
  {
    id: "SW016",
    title: "init_if_needed usage manual review",
    auditRuleIds: ["SOL-071"],
  },
  {
    id: "SW017",
    title: "Missing close on disposable accounts",
    auditRuleIds: ["SOL-052"],
  },
  {
    id: "SW018",
    title: "Missing realloc zero true",
    auditRuleIds: ["SOL-062"],
  },
  {
    id: "SW019",
    title: "Missing constraint for uniqueness",
    auditRuleIds: ["SOL-073"],
  },
  {
    id: "SW020",
    title: "AccountInfo as CPI target program",
    auditRuleIds: ["SOL-040", "SOL-042"],
  },
];

export const AUDIT_RULE_TO_STANDARD_IDS = new Map<string, string[]>(
  SOLANA_SECURITY_STANDARD_RULES.flatMap((standardRule) =>
    standardRule.auditRuleIds.map(
      (auditRuleId) => [auditRuleId, standardRule.id] as const,
    ),
  ).reduce<[string, string[]][]>((entries, [auditRuleId, standardId]) => {
    const existing = entries.find(([id]) => id === auditRuleId);
    if (existing) {
      existing[1].push(standardId);
    } else {
      entries.push([auditRuleId, [standardId]]);
    }
    return entries;
  }, []),
);

export function getStandardIdsForAuditRule(ruleId: string): string[] {
  return AUDIT_RULE_TO_STANDARD_IDS.get(ruleId) ?? [];
}
