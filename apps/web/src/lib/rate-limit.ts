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

// Map<key, { count, windowStart }>
const store = new Map<string, { count: number; windowStart: number }>();

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

// ── Pre-configured limiters ──────────────────────────────────────────────────

/** 20 nonce requests per IP per minute (generous — covers page refreshes) */
export function nonceRateLimit(ip: string): LimiterResult {
  return rateLimit(`nonce:${ip}`, { limit: 20, windowMs: 60_000 });
}

/** 5 compile jobs per user per 5 minutes */
export function compileRateLimit(userId: string): LimiterResult {
  return rateLimit(`compile:${userId}`, { limit: 5, windowMs: 5 * 60_000 });
}

/** 3 deploy jobs per user per 10 minutes */
export function deployRateLimit(userId: string): LimiterResult {
  return rateLimit(`deploy:${userId}`, { limit: 3, windowMs: 10 * 60_000 });
}
