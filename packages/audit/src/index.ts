// packages/audit/src/index.ts
// Public API for the audit package — runs entirely in-browser, instant.
// Per docs/architecture/14-audit-system.md

import type { ProgramIR } from "@solflow/ir";
import { RULES } from "./rules";
import { getStandardIdsForAuditRule } from "./security-standard";
import type { AuditFinding, AuditReport, AuditRule, AuditSeverity } from "./types";

export type {
  AuditFinding,
  AuditReport,
  AuditRule,
  AuditCategory,
  AuditSeverity,
  NodePatch,
} from "./types";
export {
  SOLANA_SECURITY_STANDARD_RULES,
  getStandardIdsForAuditRule,
} from "./security-standard";

// ─── Severity weights for scoring ────────────────────────────────────────────

const SEVERITY_PENALTY: Record<AuditSeverity, number> = {
  critical: 25,
  high: 15,
  medium: 7,
  low: 3,
  info: 0,
};

// ─── Plugin rules registry ───────────────────────────────────────────────────

let pluginRules: AuditRule[] = [];

/** Register audit rules from external plugins. */
export function registerAuditRules(rules: AuditRule[]) {
  const existing = new Set(pluginRules.map((r) => r.id));
  for (const rule of rules) {
    if (!existing.has(rule.id)) {
      pluginRules.push(rule);
    }
  }
}

/** Clear all plugin rules (useful for testing or hot-reload). */
export function clearPluginRules() {
  pluginRules = [];
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Run all IR-level audit rules against a ProgramIR.
 * Returns a full AuditReport with findings and a 0–100 score.
 * Runs synchronously in-browser — no network calls.
 */
export function runInstantAudit(ir: ProgramIR): AuditReport {
  const findings: AuditFinding[] = [];
  const allRules = [...RULES, ...pluginRules];

  for (const rule of allRules) {
    try {
      const ruleFindings = rule.check(ir);
      const standardIds = [
        ...(rule.standardIds ?? []),
        ...getStandardIdsForAuditRule(rule.id),
      ];
      findings.push(
        ...ruleFindings.map((finding) => ({
          ...finding,
          standardIds: finding.standardIds ?? standardIds,
        })),
      );
    } catch (err) {
      console.error(`Audit rule ${rule.id} (${rule.name}) failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Tally by severity
  const summary = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  let penalty = 0;
  for (const f of findings) {
    summary[f.severity]++;
    penalty += SEVERITY_PENALTY[f.severity];
  }

  const score = Math.max(0, 100 - penalty);

  return { findings, score, summary };
}

/**
 * Get the AuditRule definition by its ID, or undefined if not found.
 * Used by the UI "Fix" button to call rule.autoFix().
 */
export function getRuleById(ruleId: string) {
  return [...RULES, ...pluginRules].find((r) => r.id === ruleId);
}
