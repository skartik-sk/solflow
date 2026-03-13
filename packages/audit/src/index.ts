// packages/audit/src/index.ts
// Public API for the audit package — runs entirely in-browser, instant.
// Per docs/architecture/14-audit-system.md

import type { ProgramIR } from "@solflow/ir";
import { RULES } from "./rules";
import type { AuditFinding, AuditReport, AuditSeverity } from "./types";

export type {
  AuditFinding,
  AuditReport,
  AuditRule,
  AuditCategory,
  AuditSeverity,
  NodePatch,
} from "./types";

// ─── Severity weights for scoring ────────────────────────────────────────────

const SEVERITY_PENALTY: Record<AuditSeverity, number> = {
  critical: 25,
  high: 15,
  medium: 7,
  low: 3,
  info: 0,
};

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Run all IR-level audit rules against a ProgramIR.
 * Returns a full AuditReport with findings and a 0–100 score.
 * Runs synchronously in-browser — no network calls.
 */
export function runInstantAudit(ir: ProgramIR): AuditReport {
  const findings: AuditFinding[] = [];

  for (const rule of RULES) {
    try {
      const ruleFindings = rule.check(ir);
      findings.push(...ruleFindings);
    } catch {
      // Never crash the editor because of a bad rule
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
  return RULES.find((r) => r.id === ruleId);
}
