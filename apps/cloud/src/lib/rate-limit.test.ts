import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clientIpFromHeaders,
  manualExecutionRateLimit,
  rateLimitHeaders,
  resetRateLimitStoreForTests,
  webhookRateLimit,
} from "./rate-limit";

describe("cloud rate limits", () => {
  beforeEach(() => {
    resetRateLimitStoreForTests();
    vi.useRealTimers();
  });

  it("limits manual workflow executions per user", () => {
    let result = manualExecutionRateLimit("user-1");
    expect(result.allowed).toBe(true);

    for (let i = 0; i < 19; i += 1) {
      result = manualExecutionRateLimit("user-1");
    }

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
    expect(manualExecutionRateLimit("user-1").allowed).toBe(false);
    expect(manualExecutionRateLimit("user-2").allowed).toBe(true);
  });

  it("separates webhook limits by path and IP", () => {
    for (let i = 0; i < 120; i += 1) {
      expect(webhookRateLimit("path-a", "ip-a").allowed).toBe(true);
    }

    expect(webhookRateLimit("path-a", "ip-a").allowed).toBe(false);
    expect(webhookRateLimit("path-b", "ip-a").allowed).toBe(true);
    expect(webhookRateLimit("path-a", "ip-b").allowed).toBe(true);
  });

  it("reads the first forwarded IP and emits standard headers", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.10, 10.0.0.5",
    });

    expect(clientIpFromHeaders(headers)).toBe("203.0.113.10");

    const limitHeaders = rateLimitHeaders({
      allowed: false,
      remaining: 0,
      limit: 20,
      resetAt: Date.now() + 30_000,
    });

    expect(limitHeaders).toMatchObject({
      "X-RateLimit-Limit": "20",
      "X-RateLimit-Remaining": "0",
    });
  });
});
