// Turns a stored execution row (triggerType + triggerData) into the trigger
// payload the engine hands to trigger nodes (ctx.trigger). Pure — no DB.

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Replay and approval runs wrap the original trigger data, so unwrap them to
 * give the trigger node the original webhook body / cron info / test data.
 */
export function buildEngineTriggerData(
  triggerType: string,
  stored: unknown,
  depth = 0,
): JsonObject {
  if (
    (triggerType === "replay" || triggerType === "approval") &&
    isObject(stored) &&
    typeof stored.originalTriggerType === "string" &&
    depth < 5
  ) {
    return buildEngineTriggerData(
      stored.originalTriggerType,
      stored.originalTriggerData,
      depth + 1,
    );
  }

  if (triggerType === "webhook" || triggerType === "cron") {
    return { ...(isObject(stored) ? stored : {}), triggerType };
  }

  // manual (Run button / CLI) — the stored value is the caller's test data.
  return { triggerType: "manual", data: stored ?? undefined };
}

/**
 * One-time wallet approval is honoured only on runs the server created through
 * execution.approveReplay (triggerType "approval"). Caller-supplied test data
 * can't switch it on.
 */
export function isWalletAutomationApproved(
  triggerType: string,
  stored: unknown,
): boolean {
  return (
    triggerType === "approval" &&
    isObject(stored) &&
    stored.walletAutomationApproved === true
  );
}
