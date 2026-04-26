# Cloud Security Runbook

## Webhook Replay Protection

When replay protection is enabled on a webhook trigger, callers must send:

- `X-Webhook-Timestamp`: Unix timestamp in milliseconds.
- `X-Webhook-Signature`: HMAC-SHA256 hex digest.

The signature payload is:

```text
<timestamp>.<rawBody>
```

The HMAC secret is the workflow webhook secret. Requests outside the replay
window or duplicate signatures are rejected.

Example:

```ts
import { createHmac } from "node:crypto";

const timestamp = String(Date.now());
const rawBody = JSON.stringify({ event: "price-alert", token: "SOL" });
const signature = createHmac("sha256", webhookSecret)
  .update(`${timestamp}.${rawBody}`)
  .digest("hex");

await fetch(webhookUrl, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-webhook-timestamp": timestamp,
    "x-webhook-signature": signature,
  },
  body: rawBody,
});
```

## Health Endpoint

`GET /api/health` returns a minimal public health response in production:

```json
{ "status": "ok", "service": "solstudio-cloud", "timestamp": "..." }
```

Detailed DB, Redis, worker, and queue status is returned only outside production
or when the request includes:

```text
Authorization: Bearer <CLOUD_HEALTH_DETAILS_TOKEN>
```

Set `CLOUD_HEALTH_DETAILS_TOKEN` in production if an uptime monitor needs the
detailed payload.

## Secret Handling

- Cloud wallet private keys are AES-GCM encrypted at rest.
- Decrypted keypairs are cached only briefly and evicted by TTL and max-size
  limits.
- Secret-like webhook headers are redacted before persistence.
- API response selectors must not include encrypted key payloads, credential
  payloads, or webhook secrets.
