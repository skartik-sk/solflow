interface LimiterConfig {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

const store = new Map<string, { count: number; windowStart: number }>();

if (typeof setInterval !== "undefined") {
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now - entry.windowStart > 10 * 60_000) {
        store.delete(key);
      }
    }
  }, 60_000);
  cleanupInterval.unref?.();
}

function check(key: string, config: LimiterConfig): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= config.windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: config.limit - 1,
      resetAt: now + config.windowMs,
      limit: config.limit,
    };
  }

  if (entry.count >= config.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.windowStart + config.windowMs,
      limit: config.limit,
    };
  }

  entry.count += 1;
  store.set(key, entry);

  return {
    allowed: true,
    remaining: config.limit - entry.count,
    resetAt: entry.windowStart + config.windowMs,
    limit: config.limit,
  };
}

export function clientIpFromHeaders(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
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

export function authPostRateLimit(ip: string): RateLimitResult {
  return check(`auth-post:${ip}`, { limit: 30, windowMs: 5 * 60_000 });
}

export function manualExecutionRateLimit(userId: string): RateLimitResult {
  return check(`manual-execution:${userId}`, { limit: 20, windowMs: 60_000 });
}

export function workflowLifecycleRateLimit(userId: string): RateLimitResult {
  return check(`workflow-lifecycle:${userId}`, { limit: 20, windowMs: 60_000 });
}

export function webhookRateLimit(path: string, ip: string): RateLimitResult {
  return check(`webhook:${path}:${ip}`, { limit: 120, windowMs: 60_000 });
}

export function resetRateLimitStoreForTests(): void {
  if (process.env.NODE_ENV === "test") {
    store.clear();
  }
}
