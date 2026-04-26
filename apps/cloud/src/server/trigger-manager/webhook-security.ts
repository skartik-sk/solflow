import { createHmac, timingSafeEqual } from "node:crypto";
import { getExecutionQueue } from "../execution-worker/queue";

const DEFAULT_REPLAY_WINDOW_MS = 5 * 60_000;
const seenReplayKeys = new Map<string, number>();

export type WebhookSecurityHeaders = Record<string, string>;

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
  const reserved = await reserveReplayKey(replayKey, windowMs, now);
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
): Promise<boolean> {
  if (process.env.NODE_ENV === "test" || process.env.CLOUD_WEBHOOK_REPLAY_STORE === "memory") {
    cleanupReplayKeys(now);
    if (seenReplayKeys.has(replayKey)) {
      return false;
    }
    seenReplayKeys.set(replayKey, now + ttlMs);
    return true;
  }

  const queue = getExecutionQueue();
  const client = await queue.client;
  const redis = client as unknown as {
    set: (
      key: string,
      value: string,
      px: "PX",
      ttl: number,
      nx: "NX",
    ) => Promise<"OK" | null>;
  };

  const result = await redis.set(
    `cloud:webhook:replay:${replayKey}`,
    "1",
    "PX",
    ttlMs,
    "NX",
  );

  return result === "OK";
}

function safeEqualHex(a: string, b: string): boolean {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) {
    return false;
  }
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
