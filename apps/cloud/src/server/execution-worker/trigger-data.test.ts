import { describe, expect, it } from "vitest";
import { buildEngineTriggerData, isWalletAutomationApproved } from "./trigger-data";

describe("buildEngineTriggerData", () => {
  it("wraps manual test data so the manual trigger can expose it", () => {
    expect(buildEngineTriggerData("manual", { body: { a: 1 } })).toEqual({
      triggerType: "manual",
      data: { body: { a: 1 } },
    });
  });

  it("passes webhook request data through", () => {
    const stored = { triggerType: "webhook", method: "POST", body: { x: 1 }, query: {}, headers: {} };
    expect(buildEngineTriggerData("webhook", stored)).toMatchObject({ triggerType: "webhook", body: { x: 1 } });
  });

  it("unwraps replay and approval runs to the original trigger", () => {
    const webhook = { triggerType: "webhook", body: { amount: 3 } };
    const replay = { replayOf: "e1", originalTriggerType: "webhook", originalTriggerData: webhook };
    const approval = { approvalOf: "e2", walletAutomationApproved: true, originalTriggerType: "replay", originalTriggerData: replay };
    expect(buildEngineTriggerData("approval", approval)).toMatchObject({ triggerType: "webhook", body: { amount: 3 } });
  });
});

describe("isWalletAutomationApproved", () => {
  it("honours approval only on server-created approval runs", () => {
    expect(isWalletAutomationApproved("approval", { walletAutomationApproved: true })).toBe(true);
  });

  it("ignores walletAutomationApproved in caller test data (bypass removed)", () => {
    expect(isWalletAutomationApproved("manual", { walletAutomationApproved: true })).toBe(false);
    expect(isWalletAutomationApproved("webhook", { walletAutomationApproved: true })).toBe(false);
    expect(
      isWalletAutomationApproved("replay", {
        originalTriggerType: "approval",
        originalTriggerData: { walletAutomationApproved: true },
      }),
    ).toBe(false);
  });
});
