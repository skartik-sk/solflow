import { beforeEach, describe, expect, it } from "vitest";
import {
  isIpAllowed,
  redactWebhookHeaders,
  webhookClientIp,
  webhookEventId,
  webhookSecretMatches,
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

  it("uses a durable seen-check so replays are caught across instances (no Redis)", async () => {
    const now = Date.now();
    const timestamp = String(now);
    const rawBody = "{}";
    const headers = {
      "x-webhook-timestamp": timestamp,
      "x-webhook-signature": signWebhookPayload("secret", timestamp, rawBody),
    };
    // Another instance already stored this replay key on an execution row.
    const seen = async (key: string) => key === `${timestamp}:${headers["x-webhook-signature"]}`;
    expect(
      await validateWebhookReplayProtection({ headers, secret: "secret", rawBody, now, seen }),
    ).toMatchObject({ ok: false, status: 409 });
  });

  it("compares the header-auth secret exactly", () => {
    expect(webhookSecretMatches("abc", "abc")).toBe(true);
    expect(webhookSecretMatches("abcd", "abc")).toBe(false);
    expect(webhookSecretMatches(undefined, "abc")).toBe(false);
    expect(webhookSecretMatches("abc", null)).toBe(false);
  });

  it("allowlists the real client IP only, by exact IP or CIDR", () => {
    const allow = ["203.0.113.7", "10.0.0.0/8", "2001:db8::/32", "https://evil.example", "example.com"];
    expect(isIpAllowed("203.0.113.7", allow)).toBe(true);
    expect(isIpAllowed("10.1.2.3", allow)).toBe(true);
    expect(isIpAllowed("2001:db8::1", allow)).toBe(true);
    expect(isIpAllowed("203.0.113.70", allow)).toBe(false); // no substring match
    expect(isIpAllowed("11.0.0.1", allow)).toBe(false);
    expect(isIpAllowed(undefined, allow)).toBe(false);
    // host/origin entries never match
    expect(isIpAllowed("93.184.216.34", ["example.com"])).toBe(false);
  });

  it("takes the client IP from x-real-ip / first x-forwarded-for hop, never Origin/Referer", () => {
    expect(webhookClientIp({ "x-real-ip": "198.51.100.4", "x-forwarded-for": "1.1.1.1" })).toBe("198.51.100.4");
    expect(webhookClientIp({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" })).toBe("198.51.100.4");
    expect(webhookClientIp({ "x-forwarded-for": "::ffff:198.51.100.4" })).toBe("198.51.100.4");
    expect(webhookClientIp({ origin: "203.0.113.7", referer: "http://203.0.113.7/" })).toBeUndefined();
  });

  it("reads a sender delivery id for dedup", () => {
    expect(webhookEventId({ "webhook-id": "msg_1" })).toBe("msg_1");
    expect(webhookEventId({ "x-github-delivery": "abc" })).toBe("abc");
    expect(webhookEventId({ "content-type": "application/json" })).toBeUndefined();
  });
});
