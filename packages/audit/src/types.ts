// packages/audit/src/types.ts
// Per docs/architecture/14-audit-system.md

import type { ProgramIR } from "@solflow/ir";

// ─── Severity / Category ─────────────────────────────────────────────────────

export type AuditSeverity = "critical" | "high" | "medium" | "low" | "info";

export type AuditCategory =
  | "access-control"
  | "arithmetic"
  | "account-validation"
  | "pda-security"
  | "token-security"
  | "cpi-security"
  | "data-validation"
  | "reentrancy"
  | "denial-of-service"
  | "information-disclosure";

export type AuditStressCategory =
  | "input-boundary"
  | "arithmetic-boundary"
  | "require-boundary"
  | "account-validation"
  | "pda-validation"
  | "token-validation"
  | "cpi-validation";

export type AuditStressExpectation = "pass" | "fail" | "reject" | "no-panic";

// ─── Finding ─────────────────────────────────────────────────────────────────

export interface AuditFinding {
  ruleId: string;
  standardIds?: string[];
  severity: AuditSeverity;
  title: string;
  description: string;
  location: {
    instructionName?: string;
    accountName?: string;
    nodeId?: string; // React Flow node ID for "Go to Node"
  };
  recommendation: string;
  cweId?: string;
  references?: string[];
}

// ─── Deterministic Stress Tests ──────────────────────────────────────────────

export interface AuditStressTestCase {
  id: string;
  title: string;
  description: string;
  category: AuditStressCategory;
  instructionName: string;
  nodeId?: string;
  target?: string;
  severity: AuditSeverity;
  inputs: Record<string, string | number | boolean>;
  expected: AuditStressExpectation;
  rationale: string;
}

export interface AuditStressSummary {
  total: number;
  bySeverity: Record<AuditSeverity, number>;
  byCategory: Record<AuditStressCategory, number>;
}

// ─── NodePatch ───────────────────────────────────────────────────────────────

/** Describes a partial data update to apply to a single React Flow node. */
export interface NodePatch {
  nodeId: string;
  data: Record<string, unknown>;
}

// ─── Rule ────────────────────────────────────────────────────────────────────

export interface AuditRule {
  id: string;
  standardIds?: string[];
  name: string;
  description: string;
  severity: AuditSeverity;
  category: AuditCategory;
  check: (ir: ProgramIR) => AuditFinding[];
  /**
   * Optional auto-fix: given the full IR, return a list of node data patches.
   * Each patch is applied via `useFlowStore.updateNodeData(patch.nodeId, patch.data)`.
   * Only implement for findings where a deterministic safe fix exists.
   */
  autoFix?: (ir: ProgramIR, finding: AuditFinding) => NodePatch[];
}

// ─── Report ──────────────────────────────────────────────────────────────────

export interface AuditReport {
  findings: AuditFinding[];
  score: number; // 0-100
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  stressTests: AuditStressTestCase[];
  stressSummary: AuditStressSummary;
}
