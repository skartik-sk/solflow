// packages/plugin-sdk/src/types.ts
// Core type definitions for the SolFlow plugin system.

import type { ComponentType } from "react";
import type { NodeProps } from "@xyflow/react";

// ─── IR Fragment ──────────────────────────────────────────────────────────────

export interface IRFragment {
  type: "integration";
  pluginId: string;
  integrationId: string;
  config: Record<string, unknown>;
}

// ─── Account / State / Import helpers ────────────────────────────────────────

export interface AccountDefinition {
  name: string;
  type: string;
  isMut?: boolean;
  isSigner?: boolean;
  customType?: string;
  address?: unknown;
}

export interface StateFieldDefinition {
  name: string;
  rustType: string;
}

export interface RustImport {
  path: string;
  items: string[];
  framework: "anchor" | "pinocchio" | "quasar" | "both";
}

// ─── Node handle ──────────────────────────────────────────────────────────────

export interface NodeHandle {
  id: string;
  type: "logic-in" | "logic-out" | "data-in" | "data-out";
  position: "top" | "bottom" | "left" | "right";
  label?: string;
}

// ─── Property schema ─────────────────────────────────────────────────────────

export interface PropertySchema {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "pubkey" | "boolean" | "json" | "code";
  required: boolean;
  options?: { label: string; value: string }[];
  default?: unknown;
  description?: string;
  validation?: (value: unknown) => string | null;
}

// ─── Code generation ─────────────────────────────────────────────────────────

export interface GeneratedCode {
  /** Code to inject into the instruction body */
  bodyCode: string;
  /** Additional accounts required */
  accounts: AccountDefinition[];
  /** Additional Rust import strings */
  imports: string[];
  /** Optional state fields */
  stateFields?: StateFieldDefinition[];
}

export interface CodegenContext {
  framework: "anchor" | "pinocchio" | "quasar";
  instructionName: string;
  availableAccounts: string[];
  programName: string;
}

export interface PluginCodegenHooks {
  anchor?: (
    nodeData: Record<string, unknown>,
    context: CodegenContext,
  ) => GeneratedCode;
  pinocchio?: (
    nodeData: Record<string, unknown>,
    context: CodegenContext,
  ) => GeneratedCode;
}

// ─── Cargo dependency ─────────────────────────────────────────────────────────

export interface CargoDependency {
  name: string;
  version: string;
  features?: string[];
  framework: "anchor" | "pinocchio" | "quasar" | "both";
}

// ─── Marketplace trust metadata ─────────────────────────────────────────────

export type PluginTrustLevel = "first-party" | "verified" | "community" | "untrusted";

export interface PluginSecurityMetadata {
  trustLevel: PluginTrustLevel;
  publisher: string;
  verified?: boolean;
  audited?: boolean;
  signatureAlgorithm?: "ECDSA-P256-SHA256";
  publicKeyId?: string;
  manifestDigest?: string;
  signature?: string;
  provenance?: string;
  publishedAt?: string;
}

export interface PluginTrustPolicy {
  allowedTrustLevels?: PluginTrustLevel[];
  requireSignature?: boolean;
  requireAuditRules?: boolean;
  requireProvenance?: boolean;
  firstPartyAuthors?: string[];
  trustedPublisherKeys?: Record<string, JsonWebKey>;
}

export interface PluginTrustReport {
  accepted: boolean;
  trustLevel: PluginTrustLevel;
  errors: string[];
  warnings: string[];
}

export interface PluginSignatureVerification {
  verified: boolean;
  digest: string;
  publicKeyId?: string;
  algorithm?: string;
  reason?: string;
}

// ─── Audit rule ──────────────────────────────────────────────────────────────
// Must be compatible with @solflow/audit AuditRule.

export type AuditSeverity = "critical" | "high" | "medium" | "low" | "info";
export type AuditCategory =
  | "access-control" | "arithmetic" | "account-validation"
  | "pda-security" | "token-security" | "cpi-security"
  | "data-validation" | "reentrancy" | "denial-of-service" | "information-disclosure";

export interface AuditFinding {
  ruleId: string;
  severity: AuditSeverity;
  title: string;
  description: string;
  location: { instructionName?: string; accountName?: string; nodeId?: string };
  recommendation: string;
  cweId?: string;
  references?: string[];
}

export interface AuditRule {
  id: string;
  name: string;
  description: string;
  severity: AuditSeverity;
  category: AuditCategory;
  check: (ir: import("@solflow/ir").ProgramIR) => AuditFinding[];
  autoFix?: (ir: import("@solflow/ir").ProgramIR, finding: AuditFinding) => Array<{ nodeId: string; data: Record<string, unknown> }>;
}

// ─── Plugin node definition ──────────────────────────────────────────────────

export interface PluginNodeDefinition {
  /** Node type ID (namespaced with plugin id, e.g. "metaplex:mint-nft") */
  type: string;
  label: string;
  category: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<NodeProps<any>>;
  properties: PropertySchema[];
  handles: NodeHandle[];
  defaultData: Record<string, unknown>;
  toIR: (nodeData: Record<string, unknown>) => IRFragment;
}

// ─── Top-level plugin ─────────────────────────────────────────────────────────

export interface SolFlowPlugin {
  /** Unique plugin identifier (e.g. "metaplex") */
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  /** Icon URL or emoji */
  icon: string;
  website?: string;
  security?: PluginSecurityMetadata;
  nodes: PluginNodeDefinition[];
  cargoDependencies: CargoDependency[];
  imports: RustImport[];
  codegen: PluginCodegenHooks;
  auditRules?: AuditRule[];
}
