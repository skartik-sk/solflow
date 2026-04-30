import { describe, expect, it } from "vitest";
import { assessCloudSafetyPolicy, assertWalletSafety } from "./safety";

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
          maxSlippageBps: 50,
          allowedMints: ["So11111111111111111111111111111111111111112"],
        },
      }),
    ).not.toThrow();
  });

  it("blocks weak automated wallet policy before signing", () => {
    expect(() =>
      assertWalletSafety({
        action: "Jupiter swap",
        simulationAvailable: true,
        slippageBps: 50,
        safety: {
          simulationRequired: true,
          manualApprovalRequired: false,
          walletAutomationAllowed: true,
        },
      }),
    ).toThrow(/Cloud policy/i);
  });

  it("allows one-time approved replays without persistent automation limits", () => {
    expect(() =>
      assertWalletSafety({
        action: "Token transfer",
        simulationAvailable: true,
        amountLamports: BigInt(1000),
        safety: {
          simulationRequired: true,
          manualApprovalRequired: false,
          walletAutomationAllowed: true,
          oneTimeApproval: true,
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
          manualApprovalRequired: false,
          simulationRequired: true,
          spendLimitLamports: 2_000,
          maxSlippageBps: 50,
          allowedMints: ["So11111111111111111111111111111111111111112"],
        },
      }),
    ).toThrow(/spend limit/i);
  });
});

describe("assessCloudSafetyPolicy", () => {
  it("reports ready automation only when strict controls are present", () => {
    expect(
      assessCloudSafetyPolicy({
        simulationRequired: true,
        manualApprovalRequired: false,
        walletAutomationAllowed: true,
        maxSlippageBps: 50,
        allowedMints: ["So11111111111111111111111111111111111111112"],
      }).level,
    ).toBe("ready");
  });
});
