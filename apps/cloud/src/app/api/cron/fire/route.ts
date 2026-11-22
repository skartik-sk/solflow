// /api/cron/fire — QStash (or Vercel Cron) calls this on a schedule to fire a
// workflow's cron trigger. This replaces the always-on BullMQ cron worker: cron
// schedules live in QStash and execute on-demand here, so no worker process is
// required and the cloud app stays free / scales to zero.
//
// Schedules are created by the trigger-manager (qstash-scheduler) with a
// destination of .../api/cron/fire?workflowId=<id>. Every call must carry a
// valid Upstash-Signature (QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY)
// or the CRON_SECRET; in production with neither configured it fails closed.
//
// The run is created QUEUED and executed after the response with after()
// (see queueExecution), so this returns at once and the run finishes inside
// maxDuration.

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma, type Prisma } from "@solflow/db";
import { queueExecution } from "@/server/execution-worker/queue";
import { maybeSweepStaleExecutions } from "@/server/execution-worker/stale-sweep";
import {
  authenticateCronRequest,
  subjectMatchesFire,
} from "@/server/trigger-manager/cron-auth";
import { getTriggerManager } from "@/server/trigger-manager";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return fire(request);
}

export async function GET(request: NextRequest) {
  return fire(request);
}

async function fire(request: NextRequest) {
  const workflowId = request.nextUrl.searchParams.get("workflowId");
  const rawBody = request.method === "GET" ? "" : await request.text();

  const auth = authenticateCronRequest({
    headers: request.headers,
    rawBody,
    checkSubject: (sub) => Boolean(workflowId) && subjectMatchesFire(sub, workflowId!),
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!workflowId) {
    return NextResponse.json({ error: "Missing workflowId" }, { status: 400 });
  }

  await maybeSweepStaleExecutions();

  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, status: "ACTIVE" },
  });
  // Not-found/inactive is a 200 so QStash doesn't keep retrying.
  if (!workflow) {
    return NextResponse.json(
      { ok: true, skipped: true, reason: "Workflow not found or inactive" },
      { status: 200 },
    );
  }

  const execution = await prisma.workflowExecution.create({
    data: {
      workflowId: workflow.id,
      status: "QUEUED",
      triggerType: "cron",
      triggerData: {
        cronExpression: workflow.cronExpression,
        timezone: workflow.cronTimezone ?? "UTC",
        triggeredAt: new Date().toISOString(),
      },
      definitionSnapshot: workflow.definition as Prisma.InputJsonValue,
    },
  });

  await queueExecution(execution.id, workflow.id);
  await getTriggerManager()
    .refreshNextRun(workflow.id)
    .catch(() => undefined);

  return NextResponse.json({ ok: true, executionId: execution.id, status: "QUEUED" });
}
