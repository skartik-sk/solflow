import type { CloudSafetyControls } from "../types";

interface WalletSafetyInput {
  safety?: CloudSafetyControls;
  action: string;
  amountLamports?: bigint;
  tokenMints?: string[];
  slippageBps?: number;
  simulationAvailable: boolean;
}
export function assertWalletSafety(input: WalletSafetyInput): void {
  const safety = input.safety;
  if (!safety) return;

  if (safety.manualApprovalRequired === true || safety.walletAutomationAllowed !== true) {
    throw new Error(
      `${input.action} is waiting for manual approval before signing. Approve this execution replay or explicitly allow automated wallet actions for this workflow.`,
    );
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

  const allowedMints = new Set((safety.allowedMints ?? []).filter(Boolean));
  if (allowedMints.size > 0) {
    for (const mint of input.tokenMints ?? []) {
      if (mint && !allowedMints.has(mint)) {
        throw new Error(`${input.action} uses mint ${mint}, which is not in the allowed mint list.`);
      }
    }
  }
}
