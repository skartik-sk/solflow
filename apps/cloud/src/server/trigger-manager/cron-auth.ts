// Authenticates calls to /api/cron/fire and /api/cron/reconcile.
//
// QStash signs every delivery with a JWT (HS256) in the `Upstash-Signature`
// header, keyed by QSTASH_CURRENT_SIGNING_KEY (or QSTASH_NEXT_SIGNING_KEY
// during key rotation). Claims: iss "Upstash", sub = destination URL, exp/nbf,
// body = base64url(sha256(raw body)). Verified here with node:crypto.
//
// A shared CRON_SECRET (X-Cron-Secret, forwarded by QStash, or
// `Authorization: Bearer`, sent by Vercel Cron) is accepted too.
// In production, with neither configured, every call is refused (fail closed).
// SERVER ONLY.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const CLOCK_SKEW_SECONDS = 60;

export type CronAuthResult =
  | { ok: true; via: "signature" | "secret" | "dev-open" }
  | { ok: false; status: 401 | 500; error: string };

function base64UrlNormalize(value: string): string {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Verify one Upstash-Signature JWT against one signing key. */
export function verifyUpstashSignature(options: {
  token: string;
  signingKey: string;
  rawBody: string;
  /** Called with the `sub` claim (destination URL); return false to reject. */
  checkSubject?: (sub: string) => boolean;
  nowSeconds?: number;
}): { ok: true } | { ok: false; error: string } {
  const parts = options.token.split(".");
  if (parts.length !== 3) return { ok: false, error: "Malformed signature" };
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string };
  let payload: { iss?: string; sub?: string; exp?: number; nbf?: number; body?: string };
  try {
    header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { ok: false, error: "Malformed signature" };
  }
  if (header.alg !== "HS256") return { ok: false, error: "Unsupported signature algorithm" };

  const expected = createHmac("sha256", options.signingKey)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");
  if (!safeEqualString(base64UrlNormalize(signatureB64), expected)) {
    return { ok: false, error: "Invalid signature" };
  }

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (payload.iss !== "Upstash") return { ok: false, error: "Invalid signature issuer" };
  if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_SECONDS < now) {
    return { ok: false, error: "Signature expired" };
  }
  if (typeof payload.nbf === "number" && payload.nbf - CLOCK_SKEW_SECONDS > now) {
    return { ok: false, error: "Signature not yet valid" };
  }

  const bodyHash = createHash("sha256").update(options.rawBody).digest("base64url");
  if (typeof payload.body !== "string" || base64UrlNormalize(payload.body) !== bodyHash) {
    return { ok: false, error: "Body hash mismatch" };
  }

  if (options.checkSubject && (typeof payload.sub !== "string" || !options.checkSubject(payload.sub))) {
    return { ok: false, error: "Signature is for a different destination" };
  }
  return { ok: true };
}

export function authenticateCronRequest(options: {
  headers: Headers;
  rawBody: string;
  checkSubject?: (sub: string) => boolean;
  env?: Record<string, string | undefined>;
  nowSeconds?: number;
}): CronAuthResult {
  const env = options.env ?? process.env;
  const signingKeys = [env.QSTASH_CURRENT_SIGNING_KEY, env.QSTASH_NEXT_SIGNING_KEY].filter(
    (key): key is string => Boolean(key),
  );
  const secret = env.CRON_SECRET || undefined;

  const signature = options.headers.get("upstash-signature");
  if (signature && signingKeys.length > 0) {
    for (const signingKey of signingKeys) {
      const result = verifyUpstashSignature({
        token: signature,
        signingKey,
        rawBody: options.rawBody,
        checkSubject: options.checkSubject,
        nowSeconds: options.nowSeconds,
      });
      if (result.ok) return { ok: true, via: "signature" };
    }
  }

  if (secret) {
    const headerSecret = options.headers.get("x-cron-secret");
    const bearer = options.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (
      (headerSecret && safeEqualString(headerSecret, secret)) ||
      (bearer && safeEqualString(bearer, secret))
    ) {
      return { ok: true, via: "secret" };
    }
  }

  if (signingKeys.length === 0 && !secret) {
    if (env.NODE_ENV === "production") {
      return {
        ok: false,
        status: 500,
        error:
          "Cron endpoint is not configured: set QSTASH_CURRENT_SIGNING_KEY/QSTASH_NEXT_SIGNING_KEY or CRON_SECRET.",
      };
    }
    return { ok: true, via: "dev-open" };
  }

  return { ok: false, status: 401, error: "Unauthorized" };
}

/** True when `sub` is the fire endpoint for this workflow (stops reuse of a signature for another workflow). */
export function subjectMatchesFire(sub: string, workflowId: string): boolean {
  try {
    const url = new URL(sub);
    return (
      url.pathname.replace(/\/+$/, "") === "/api/cron/fire" &&
      url.searchParams.get("workflowId") === workflowId
    );
  } catch {
    return false;
  }
}
