// apps/cloud/src/server/trigger-manager/qstash-scheduler.ts
// Stateless cron scheduling via Upstash QStash — the serverless replacement for
// BullMQ repeatable jobs. Each cron trigger becomes a QStash schedule that POSTs
// to /api/cron/fire?workflowId=... on the workflow's cron expression.
//
// Requires env:
//   QSTASH_TOKEN          — Upstash QStash token
//   CLOUD_PUBLIC_BASE_URL — public base URL of the deployed cloud app (e.g. https://cloud.example.com)
//   QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY — verify fires (see cron-auth.ts)
//   CRON_SECRET (optional)  — also forwarded as X-Cron-Secret on every fire
//
// When these are NOT set, the trigger-manager falls back to BullMQ (dev/VM),
// so this module is a no-op there.
//
// SERVER ONLY.

const QSTASH_BASE = "https://qstash.upstash.io/v2";

export function isQstashConfigured(): boolean {
  return Boolean(process.env.QSTASH_TOKEN && process.env.CLOUD_PUBLIC_BASE_URL);
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.QSTASH_TOKEN}` };
}

function fireEndpoint(workflowId: string): string {
  const base = (process.env.CLOUD_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/api/cron/fire?workflowId=${encodeURIComponent(workflowId)}`;
}

/** Stable schedule id per workflow, so re-creating a schedule replaces it. */
export function qstashScheduleId(workflowId: string): string {
  return `solstudio-wf-${workflowId}`;
}

/**
 * Headers for POST /v2/schedules/<destination>. QStash reads the schedule from
 * the `Upstash-Cron` header (a JSON body is forwarded as the message body, not
 * read as the cron). A timezone is set with a `CRON_TZ=<tz> ` prefix.
 * `Upstash-Forward-*` headers are forwarded to /api/cron/fire on every fire.
 */
export function buildQstashScheduleHeaders(opts: {
  workflowId: string;
  cron: string;
  timezone?: string;
  cronSecret?: string;
}): Record<string, string> {
  const tz = opts.timezone?.trim();
  const headers: Record<string, string> = {
    ...authHeaders(),
    "Content-Type": "application/json",
    "Upstash-Cron": tz ? `CRON_TZ=${tz} ${opts.cron}` : opts.cron,
    "Upstash-Method": "POST",
    "Upstash-Schedule-Id": qstashScheduleId(opts.workflowId),
    "Upstash-Retries": "0",
  };
  if (opts.cronSecret) headers["Upstash-Forward-X-Cron-Secret"] = opts.cronSecret;
  return headers;
}

/**
 * Create (or replace) a QStash schedule for a workflow's cron trigger.
 * Returns the new schedule id.
 */
export async function qstashCreateSchedule(opts: {
  workflowId: string;
  cron: string;
  timezone?: string;
}): Promise<string> {
  if (!isQstashConfigured()) {
    throw new Error("QStash not configured (QSTASH_TOKEN / CLOUD_PUBLIC_BASE_URL missing)");
  }
  // Remove any older schedules for this workflow (ones created before stable ids).
  await qstashDeleteScheduleForWorkflow(opts.workflowId);

  const destination = fireEndpoint(opts.workflowId);
  const res = await fetch(`${QSTASH_BASE}/schedules/${encodeURIComponent(destination)}`, {
    method: "POST",
    headers: buildQstashScheduleHeaders({
      ...opts,
      cronSecret: process.env.CRON_SECRET || undefined,
    }),
    body: JSON.stringify({ workflowId: opts.workflowId }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`QStash create schedule failed: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { scheduleId?: string };
  if (!data.scheduleId) throw new Error("QStash did not return a scheduleId");
  return data.scheduleId;
}

/** Delete every QStash schedule whose destination targets this workflow. Throws if QStash can't be reached. */
export async function qstashDeleteScheduleForWorkflow(workflowId: string): Promise<number> {
  if (!isQstashConfigured()) return 0;
  const res = await fetch(`${QSTASH_BASE}/schedules`, { headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`QStash list schedules failed: HTTP ${res.status}`);
  }
  const schedules = (await res.json()) as Array<{
    scheduleId: string;
    destination?: string;
  }>;
  const matches = schedules.filter(
    (s) =>
      s.scheduleId === qstashScheduleId(workflowId) ||
      scheduleTargetsWorkflow(s.destination, workflowId),
  );
  const results = await Promise.all(
    matches.map((s) =>
      fetch(`${QSTASH_BASE}/schedules/${encodeURIComponent(s.scheduleId)}`, {
        method: "DELETE",
        headers: authHeaders(),
      }).then((r) => r.ok || r.status === 404, () => false),
    ),
  );
  if (results.some((ok) => !ok)) {
    throw new Error(`QStash delete schedule failed for workflow ${workflowId}`);
  }
  return matches.length;
}

/** Exact workflowId match (a substring match would also hit ids that share a prefix). */
export function scheduleTargetsWorkflow(destination: string | undefined, workflowId: string): boolean {
  if (!destination) return false;
  try {
    return new URL(destination).searchParams.get("workflowId") === workflowId;
  } catch {
    return false;
  }
}
