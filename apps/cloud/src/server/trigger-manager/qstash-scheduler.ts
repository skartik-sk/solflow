// apps/cloud/src/server/trigger-manager/qstash-scheduler.ts
// Stateless cron scheduling via Upstash QStash — the serverless replacement for
// BullMQ repeatable jobs. Each cron trigger becomes a QStash schedule that POSTs
// to /api/cron/fire?workflowId=... on the workflow's cron expression.
//
// Requires env:
//   QSTASH_TOKEN          — Upstash QStash token
//   CLOUD_PUBLIC_BASE_URL — public base URL of the deployed cloud app (e.g. https://cloud.example.com)
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
  return `${process.env.CLOUD_PUBLIC_BASE_URL}/api/cron/fire?workflowId=${encodeURIComponent(workflowId)}`;
}

/**
 * Create (or replace) a QStash schedule for a workflow's cron trigger.
 * Returns the new schedule id.
 */
export async function qstashCreateSchedule(opts: {
  workflowId: string;
  cron: string;
}): Promise<string> {
  if (!isQstashConfigured()) {
    throw new Error("QStash not configured (QSTASH_TOKEN / CLOUD_PUBLIC_BASE_URL missing)");
  }
  // Replace any existing schedule for this workflow first (idempotent activate).
  await qstashDeleteScheduleForWorkflow(opts.workflowId);

  const destination = fireEndpoint(opts.workflowId);
  const res = await fetch(`${QSTASH_BASE}/schedules/${encodeURIComponent(destination)}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ cron: opts.cron }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`QStash create schedule failed: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { scheduleId?: string };
  if (!data.scheduleId) throw new Error("QStash did not return a scheduleId");
  return data.scheduleId;
}

/** Delete every QStash schedule whose destination targets this workflow. */
export async function qstashDeleteScheduleForWorkflow(workflowId: string): Promise<void> {
  if (!isQstashConfigured()) return;
  const needle = `workflowId=${encodeURIComponent(workflowId)}`;
  const res = await fetch(`${QSTASH_BASE}/schedules`, { headers: authHeaders() });
  if (!res.ok) return;
  const schedules = (await res.json()) as Array<{
    scheduleId: string;
    destination?: string;
  }>;
  await Promise.all(
    schedules
      .filter((s) => s.destination?.includes(needle))
      .map((s) =>
        fetch(`${QSTASH_BASE}/schedules/${s.scheduleId}`, {
          method: "DELETE",
          headers: authHeaders(),
        }).catch(() => undefined),
      ),
  );
}
