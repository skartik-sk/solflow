// Which audit findings can be auto-fixed from the editor ("Apply Fix").

import type { AuditFinding, AuditRule } from "@solflow/audit";

/** Rule ids among `findings` whose rule ships an autoFix. */
export function fixableRuleIds(
  findings: Pick<AuditFinding, "ruleId">[],
  getRuleById: (ruleId: string) => Pick<AuditRule, "autoFix"> | undefined,
): Set<string> {
  const ids = new Set<string>();
  for (const finding of findings) {
    if (getRuleById(finding.ruleId)?.autoFix) ids.add(finding.ruleId);
  }
  return ids;
}
