import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { authenticateCronRequest, subjectMatchesFire, verifyUpstashSignature } from "./cron-auth";

const KEY = "sig_current_test";
const NEXT = "sig_next_test";
const NOW = 1_800_000_000;
const FIRE = "https://cloud.example.com/api/cron/fire?workflowId=wf_1";

function sign(key: string, claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = createHmac("sha256", key).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

function claims(body: string, extra: Record<string, unknown> = {}) {
  return {
    iss: "Upstash",
    sub: FIRE,
    exp: NOW + 300,
    nbf: NOW - 1,
    iat: NOW - 1,
    jti: "j1",
    body: createHash("sha256").update(body).digest("base64url"),
    ...extra,
  };
}

const env = { QSTASH_CURRENT_SIGNING_KEY: KEY, QSTASH_NEXT_SIGNING_KEY: NEXT, NODE_ENV: "production" };
const check = (sub: string) => subjectMatchesFire(sub, "wf_1");

function auth(headers: Record<string, string>, body = "", e: Record<string, string | undefined> = env) {
  return authenticateCronRequest({ headers: new Headers(headers), rawBody: body, checkSubject: check, env: e, nowSeconds: NOW });
}

describe("cron auth (Upstash-Signature)", () => {
  it("accepts a valid signature from the current or next key", () => {
    const body = '{"workflowId":"wf_1"}';
    expect(auth({ "upstash-signature": sign(KEY, claims(body)) }, body)).toEqual({ ok: true, via: "signature" });
    expect(auth({ "upstash-signature": sign(NEXT, claims(body)) }, body)).toEqual({ ok: true, via: "signature" });
  });

  it("accepts the legacy padded base64 body hash", () => {
    const body = "x";
    const padded = createHash("sha256").update(body).digest("base64");
    expect(auth({ "upstash-signature": sign(KEY, claims(body, { body: padded })) }, body).ok).toBe(true);
  });

  it("rejects a wrong key, a tampered body, an expired token and another workflow's token", () => {
    const body = "{}";
    expect(auth({ "upstash-signature": sign("other", claims(body)) }, body)).toMatchObject({ ok: false, status: 401 });
    expect(auth({ "upstash-signature": sign(KEY, claims(body)) }, '{"x":1}')).toMatchObject({ ok: false, status: 401 });
    expect(auth({ "upstash-signature": sign(KEY, claims(body, { exp: NOW - 120 })) }, body)).toMatchObject({ ok: false });
    expect(
      auth({ "upstash-signature": sign(KEY, claims(body, { sub: "https://cloud.example.com/api/cron/fire?workflowId=wf_2" })) }, body),
    ).toMatchObject({ ok: false });
    expect(auth({}, body)).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects alg none", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify(claims(""))).toString("base64url");
    expect(verifyUpstashSignature({ token: `${header}.${payload}.`, signingKey: KEY, rawBody: "", nowSeconds: NOW }).ok).toBe(false);
  });

  it("accepts CRON_SECRET via X-Cron-Secret or Bearer", () => {
    const e = { CRON_SECRET: "s3cret", NODE_ENV: "production" };
    expect(auth({ "x-cron-secret": "s3cret" }, "", e)).toEqual({ ok: true, via: "secret" });
    expect(auth({ authorization: "Bearer s3cret" }, "", e)).toEqual({ ok: true, via: "secret" });
    expect(auth({ "x-cron-secret": "nope" }, "", e)).toMatchObject({ ok: false, status: 401 });
  });

  it("fails closed in production with nothing configured, open only in dev", () => {
    expect(auth({}, "", { NODE_ENV: "production" })).toMatchObject({ ok: false, status: 500 });
    expect(auth({}, "", { NODE_ENV: "development" })).toEqual({ ok: true, via: "dev-open" });
  });

  it("matches the fire subject exactly", () => {
    expect(subjectMatchesFire(FIRE, "wf_1")).toBe(true);
    expect(subjectMatchesFire(FIRE, "wf_")).toBe(false);
    expect(subjectMatchesFire("https://x/api/other?workflowId=wf_1", "wf_1")).toBe(false);
  });
});
