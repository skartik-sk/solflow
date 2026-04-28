import { describe, expect, it } from "vitest";
import { assertWalletSafety } from "./safety";

describe("assertWalletSafety", () => {
  it("requires explicit automation permission for wallet signing", () => {
    expect(() =>
      assertWalletSafety({
        action: "Token transfer",
        simulationAvailable: true,
        safety: {
          simulationRequired: true,
          manualApprovalRequired: false,
          walletAutomationAllowed: false,
        },
      }),
    ).toThrow(/manual approval/i);
  });

  it("allows wallet signing when automation is explicitly permitted", () => {
    expect(() =>
      assertWalletSafety({
        action: "Token transfer",
        simulationAvailable: true,
        amountLamports: BigInt(1000),
        safety: {
          simulationRequired: true,
          manualApprovalRequired: false,
          walletAutomationAllowed: true,
          spendLimitLamports: 2_000,
        },
      }),
    ).not.toThrow();
  });

  it("still enforces spend limits after automation approval", () => {
    expect(() =>
      assertWalletSafety({
        action: "Token transfer",
        simulationAvailable: true,
        amountLamports: BigInt(3000),
        safety: {
          walletAutomationAllowed: true,
          spendLimitLamports: 2_000,
        },
      }),
    ).toThrow(/spend limit/i);
  });
});
