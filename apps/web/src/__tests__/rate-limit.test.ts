import { beforeEach, describe, expect, it } from "vitest";
import {
  authPostRateLimit,
  clientIpFromHeaders,
  nonceRateLimit,
  rateLimitHeaders,
  resetRateLimitStoreForTests,
} from "../lib/rate-limit";

describe("web rate limits", () => {
  beforeEach(() => {
    resetRateLimitStoreForTests();
  });

  it("limits nonce requests by IP", () => {
    for (let i = 0; i < 20; i += 1) {
      expect(nonceRateLimit("ip-a").allowed).toBe(true);
    }

    expect(nonceRateLimit("ip-a").allowed).toBe(false);
    expect(nonceRateLimit("ip-b").allowed).toBe(true);
  });

  it("limits auth POST requests separately from nonce requests", () => {
    for (let i = 0; i < 30; i += 1) {
      expect(authPostRateLimit("ip-a").allowed).toBe(true);
    }

    expect(authPostRateLimit("ip-a").allowed).toBe(false);
    expect(nonceRateLimit("ip-a").allowed).toBe(true);
  });

  it("normalizes client IP and response headers", () => {
    const ip = clientIpFromHeaders(
      new Headers({ "x-forwarded-for": "198.51.100.8, 10.0.0.1" }),
    );
    expect(ip).toBe("198.51.100.8");

    expect(
      rateLimitHeaders({
        allowed: false,
        remaining: 0,
        limit: 30,
        resetAt: Date.now() + 1_000,
      }),
    ).toMatchObject({
      "X-RateLimit-Limit": "30",
      "X-RateLimit-Remaining": "0",
    });
  });
});
