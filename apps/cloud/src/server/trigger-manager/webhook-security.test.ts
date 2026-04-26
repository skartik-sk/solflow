import { beforeEach, describe, expect, it } from "vitest";
import {
  redactWebhookHeaders,
  resetWebhookReplayStoreForTests,
  signWebhookPayload,
  validateWebhookReplayProtection,
} from "./webhook-security";

describe("webhook security", () => {
  beforeEach(() => {
    resetWebhookReplayStoreForTests();
  });

  it("accepts a valid timestamped HMAC once", async () => {
    const now = Date.now();
    const timestamp = String(now);
    const rawBody = JSON.stringify({ ok: true });
    const secret = "webhook-secret";
    const signature = signWebhookPayload(secret, timestamp, rawBody);

    const first = await validateWebhookReplayProtection({
      headers: {
        "x-webhook-timestamp": timestamp,
        "x-webhook-signature": signature,
      },
      secret,
      rawBody,
      now,
    });
    const replay = await validateWebhookReplayProtection({
      headers: {
        "x-webhook-timestamp": timestamp,
        "x-webhook-signature": signature,
      },
      secret,
      rawBody,
      now,
    });

    expect(first.ok).toBe(true);
    expect(replay).toMatchObject({ ok: false, status: 409 });
  });

  it("rejects stale timestamps and invalid signatures", async () => {
    const now = Date.now();
    const timestamp = String(now - 10 * 60_000);
    const rawBody = "{}";

    expect(
      await validateWebhookReplayProtection({
        headers: {
          "x-webhook-timestamp": timestamp,
          "x-webhook-signature": signWebhookPayload("secret", timestamp, rawBody),
        },
        secret: "secret",
        rawBody,
        now,
      }),
    ).toMatchObject({ ok: false, status: 401 });

    expect(
      await validateWebhookReplayProtection({
        headers: {
          "x-webhook-timestamp": String(now),
          "x-webhook-signature": "deadbeef",
        },
        secret: "secret",
        rawBody,
        now,
      }),
    ).toMatchObject({ ok: false, status: 401 });
  });

  it("redacts secret-like headers for trigger data and logs", () => {
    expect(
      redactWebhookHeaders({
        authorization: "Bearer token",
        "x-webhook-secret": "secret",
        "x-webhook-signature": "signature",
        "content-type": "application/json",
      }),
    ).toEqual({
      authorization: "[redacted]",
      "x-webhook-secret": "[redacted]",
      "x-webhook-signature": "[redacted]",
      "content-type": "application/json",
    });
  });
});
