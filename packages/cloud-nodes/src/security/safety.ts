import type { CloudSafetyControls } from "../types";

interface WalletSafetyInput {
  safety?: CloudSafetyControls;
  action: string;
  amountLamports?: bigint;
  tokenMints?: string[];
  slippageBps?: number;
  simulationAvailable: boolean;
}

export interface CloudSafetyPolicyAssessment {
  level: "manual" | "ready" | "weak";
  issues: string[];
  warnings: string[];
}

export function assessCloudSafetyPolicy(
  safety?: CloudSafetyControls,
): CloudSafetyPolicyAssessment {
  if (!safety || safety.manualApprovalRequired !== false || safety.walletAutomationAllowed !== true) {
    return {
      level: "manual",
      issues: [],
      warnings: ["Wallet actions require per-run approval."],
    };
  }

  const issues: string[] = [];
  const warnings: string[] = [];

  if (safety.simulationRequired !== true) {
    issues.push("Require transaction simulation before signing.");
  }
  if (!Array.isArray(safety.allowedMints) || safety.allowedMints.filter(Boolean).length === 0) {
    issues.push("Add at least one allowed mint before enabling automated signing.");
  }
  if (
    typeof safety.maxSlippageBps !== "number" ||
    !Number.isFinite(safety.maxSlippageBps) ||
    safety.maxSlippageBps > 100
  ) {
    issues.push("Set max slippage to 100 bps or lower.");
  }
  if (
    typeof safety.spendLimitLamports !== "number" ||
    !Number.isFinite(safety.spendLimitLamports) ||
    safety.spendLimitLamports <= 0
  ) {
    warnings.push("Set a native SOL spend limit for workflows that can spend SOL.");
  }

  return {
    level: issues.length === 0 ? "ready" : "weak",
    issues,
    warnings,
  };
}

export function assertWalletSafety(input: WalletSafetyInput): void {
  const safety = input.safety;
  if (!safety) return;
  const oneTimeApproval = safety.oneTimeApproval === true;

  if (!oneTimeApproval && (safety.manualApprovalRequired === true || safety.walletAutomationAllowed !== true)) {
    throw new Error(
      `${input.action} is waiting for manual approval before signing. Approve this execution replay or explicitly allow automated wallet actions for this workflow.`,
    );
  }

  const assessment = assessCloudSafetyPolicy(safety);
  const contextualIssues = [...assessment.issues];
  const allowedMints = new Set((safety.allowedMints ?? []).filter(Boolean));

  if (
    input.amountLamports !== undefined &&
    (typeof safety.spendLimitLamports !== "number" ||
      !Number.isFinite(safety.spendLimitLamports) ||
      safety.spendLimitLamports <= 0)
  ) {
    contextualIssues.push("Set a native SOL spend limit for this wallet action.");
  }

  if ((input.tokenMints ?? []).filter(Boolean).length > 0 && allowedMints.size === 0) {
    contextualIssues.push("Add allowed mints for this wallet action.");
  }

  if (!oneTimeApproval && contextualIssues.length > 0) {
    throw new Error(`${input.action} blocked by Cloud policy: ${contextualIssues.join(" ")}`);
  }

  if (safety.simulationRequired && !input.simulationAvailable) {
    throw new Error(`${input.action} requires simulation, but this wallet runtime cannot simulate transactions.`);
  }

  if (
    typeof safety.spendLimitLamports === "number" &&
    Number.isFinite(safety.spendLimitLamports) &&
    input.amountLamports !== undefined &&
    input.amountLamports > BigInt(Math.trunc(safety.spendLimitLamports))
  ) {
    throw new Error(`${input.action} exceeds the configured spend limit.`);
  }

  if (
    typeof safety.maxSlippageBps === "number" &&
    Number.isFinite(safety.maxSlippageBps) &&
    typeof input.slippageBps === "number" &&
    input.slippageBps > safety.maxSlippageBps
  ) {
    throw new Error(`${input.action} exceeds the configured max slippage.`);
  }

  if (allowedMints.size > 0) {
    for (const mint of input.tokenMints ?? []) {
      if (mint && !allowedMints.has(mint)) {
        throw new Error(`${input.action} uses mint ${mint}, which is not in the allowed mint list.`);
      }
    }
  }
}
