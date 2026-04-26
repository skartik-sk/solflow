// apps/web/src/lib/rate-limit.ts
// Lightweight in-memory sliding-window rate limiter.
// Keyed by any string (IP address, userId, etc.).
// NOTE: This is a single-process in-memory store — fine for development and
// single-instance deployments. Replace with Redis (ioredis INCR + EXPIRE) for
// multi-instance / edge deployments.

interface LimiterConfig {
  /** How many requests are allowed per window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

interface LimiterResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in the current window */
  remaining: number;
  /** Unix timestamp (ms) when the current window resets */
  resetAt: number;
}

export interface NamedLimiterResult extends LimiterResult {
  limit: number;
}

// Map<key, { count, windowStart }>
const store = new Map<string, { count: number; windowStart: number }>();

// Periodic cleanup: purge expired entries every 60 seconds to prevent unbounded growth
if (typeof setInterval !== "undefined") {
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      // Remove entries older than 10 minutes (well past any reasonable window)
      if (now - entry.windowStart > 10 * 60_000) {
        store.delete(key);
      }
    }
  }, 60_000);
  cleanupInterval.unref?.();
}

/**
 * Check and increment the rate-limit counter for `key`.
 * Call this at the top of a handler; if `allowed` is false, return 429.
 */
export function rateLimit(key: string, config: LimiterConfig): LimiterResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= config.windowMs) {
    // New window
    store.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: config.limit - 1,
      resetAt: now + config.windowMs,
    };
  }

  if (entry.count >= config.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.windowStart + config.windowMs,
    };
  }

  entry.count += 1;
  store.set(key, entry);
  return {
    allowed: true,
    remaining: config.limit - entry.count,
    resetAt: entry.windowStart + config.windowMs,
  };
}

function withLimit(result: LimiterResult, limit: number): NamedLimiterResult {
  return { ...result, limit };
}

export function clientIpFromHeaders(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

export function rateLimitHeaders(result: NamedLimiterResult): HeadersInit {
  const retryAfterSeconds = Math.max(
    0,
    Math.ceil((result.resetAt - Date.now()) / 1000),
  );

  return {
    "Retry-After": String(retryAfterSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetAt),
  };
}

// ── Pre-configured limiters ──────────────────────────────────────────────────

/** 20 nonce requests per IP per minute (generous — covers page refreshes) */
export function nonceRateLimit(ip: string): NamedLimiterResult {
  const limit = 20;
  return withLimit(rateLimit(`nonce:${ip}`, { limit, windowMs: 60_000 }), limit);
}

/** 30 auth POST requests per IP per 5 minutes */
export function authPostRateLimit(ip: string): NamedLimiterResult {
  const limit = 30;
  return withLimit(rateLimit(`auth-post:${ip}`, { limit, windowMs: 5 * 60_000 }), limit);
}

/** 5 compile jobs per user per 5 minutes */
export function compileRateLimit(userId: string): NamedLimiterResult {
  const limit = 5;
  return withLimit(rateLimit(`compile:${userId}`, { limit, windowMs: 5 * 60_000 }), limit);
}

/** 3 deploy jobs per user per 10 minutes */
export function deployRateLimit(userId: string): NamedLimiterResult {
  const limit = 3;
  return withLimit(rateLimit(`deploy:${userId}`, { limit, windowMs: 10 * 60_000 }), limit);
}

export function resetRateLimitStoreForTests(): void {
  if (process.env.NODE_ENV === "test") {
    store.clear();
  }
}
