import { createHmac, timingSafeEqual } from "node:crypto";
import { BlockList, isIP } from "node:net";

const DEFAULT_REPLAY_WINDOW_MS = 5 * 60_000;
const seenReplayKeys = new Map<string, number>();

export type WebhookSecurityHeaders = Record<string, string>;

/**
 * Durable "seen" check for replay keys, shared across serverless instances
 * (the trigger manager checks stored executions). Returns true if already seen.
 */
export type ReplaySeenCheck = (replayKey: string, sinceMs: number) => Promise<boolean>;

export type ReplayValidationResult =
  | { ok: true; replayKey: string }
  | { ok: false; status: number; error: string };

export function redactWebhookHeaders(
  headers: WebhookSecurityHeaders,
): WebhookSecurityHeaders {
  const redacted: WebhookSecurityHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    redacted[key] =
      lower.includes("authorization") ||
      lower.includes("secret") ||
      lower.includes("signature") ||
      lower.includes("token") ||
      lower.includes("key")
        ? "[redacted]"
        : value;
  }
  return redacted;
}

export function signWebhookPayload(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

export async function validateWebhookReplayProtection(options: {
  headers: WebhookSecurityHeaders;
  secret: string | null | undefined;
  rawBody: string;
  now?: number;
  windowMs?: number;
  seen?: ReplaySeenCheck;
}): Promise<ReplayValidationResult> {
  const secret = options.secret;
  if (!secret) {
    return {
      ok: false,
      status: 500,
      error: "Webhook replay protection is enabled but no secret is configured",
    };
  }

  const timestamp = options.headers["x-webhook-timestamp"];
  const signature = options.headers["x-webhook-signature"];
  if (!timestamp || !signature) {
    return {
      ok: false,
      status: 401,
      error: "Missing webhook replay protection headers",
    };
  }

  const now = options.now ?? Date.now();
  const windowMs = options.windowMs ?? DEFAULT_REPLAY_WINDOW_MS;
  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > windowMs) {
    return {
      ok: false,
      status: 401,
      error: "Webhook timestamp is outside the allowed replay window",
    };
  }

  const expected = signWebhookPayload(secret, timestamp, options.rawBody);
  if (!safeEqualHex(signature, expected)) {
    return { ok: false, status: 401, error: "Invalid webhook signature" };
  }

  const replayKey = `${timestamp}:${signature}`;
  const reserved = await reserveReplayKey(replayKey, windowMs, now, options.seen);
  if (!reserved) {
    return { ok: false, status: 409, error: "Webhook replay detected" };
  }
  return { ok: true, replayKey };
}

export function resetWebhookReplayStoreForTests(): void {
  if (process.env.NODE_ENV === "test") {
    seenReplayKeys.clear();
  }
}

function cleanupReplayKeys(now: number): void {
  for (const [key, expiresAt] of seenReplayKeys) {
    if (expiresAt <= now) {
      seenReplayKeys.delete(key);
    }
  }
}

async function reserveReplayKey(
  replayKey: string,
  ttlMs: number,
  now: number,
  seen?: ReplaySeenCheck,
): Promise<boolean> {
  // In-memory first (same instance), then the durable check if given. Redis is
  // not required: serverless instances share state through the database.
  cleanupReplayKeys(now);
  if (seenReplayKeys.has(replayKey)) {
    return false;
  }
  if (seen && (await seen(replayKey, now - ttlMs))) {
    return false;
  }
  seenReplayKeys.set(replayKey, now + ttlMs);
  return true;
}

/** Constant-time compare for the header-auth secret. */
export function webhookSecretMatches(
  provided: string | undefined,
  expected: string | null | undefined,
): boolean {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The real client IP. On Vercel `x-real-ip` and the first `x-forwarded-for`
 * hop are set by the platform edge. Never Origin/Referer (caller-controlled).
 */
export function webhookClientIp(headers: WebhookSecurityHeaders): string | undefined {
  const candidates = [
    headers["x-real-ip"]?.trim(),
    headers["x-forwarded-for"]?.split(",")[0]?.trim(),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const ip = normalizeIp(candidate);
    if (ip) return ip;
  }
  return undefined;
}

function normalizeIp(value: string): string | undefined {
  let ip = value.trim();
  if (ip.startsWith("[") && ip.includes("]")) ip = ip.slice(1, ip.indexOf("]"));
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) ip = mapped[1];
  return isIP(ip) ? ip : undefined;
}

/**
 * Exact IP or CIDR match. Entries that aren't an IP or CIDR (hostnames,
 * origins) never match, so a misconfigured allowlist fails closed.
 */
export function isIpAllowed(ip: string | undefined, allowlist: string[]): boolean {
  if (!ip) return false;
  const family = isIP(ip) === 6 ? "ipv6" : "ipv4";
  const list = new BlockList();
  for (const raw of allowlist) {
    const entry = raw.trim();
    const [address, prefixRaw] = entry.split("/");
    const addressFamily = isIP(address);
    if (!addressFamily) continue;
    const type = addressFamily === 6 ? "ipv6" : "ipv4";
    if (prefixRaw === undefined) {
      list.addAddress(address, type);
      continue;
    }
    const prefix = Number(prefixRaw);
    const maxPrefix = addressFamily === 6 ? 128 : 32;
    if (!/^\d+$/.test(prefixRaw) || prefix < 0 || prefix > maxPrefix) continue;
    list.addSubnet(address, prefix, type);
  }
  return list.check(ip, family);
}

const EVENT_ID_HEADERS = [
  "webhook-id", // Standard Webhooks
  "x-webhook-id",
  "x-event-id",
  "x-webhook-event-id",
  "x-github-delivery",
  "x-shopify-webhook-id",
  "x-helius-webhook-id",
];

/** Sender-provided delivery id, used to drop duplicate deliveries. */
export function webhookEventId(headers: WebhookSecurityHeaders): string | undefined {
  for (const name of EVENT_ID_HEADERS) {
    const value = headers[name]?.trim();
    if (value) return value.slice(0, 200);
  }
  return undefined;
}

function safeEqualHex(a: string, b: string): boolean {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) {
    return false;
  }
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
