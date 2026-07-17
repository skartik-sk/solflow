// /api/cron/fire — QStash (or Vercel Cron) calls this on a schedule to fire a
// workflow's cron trigger. This replaces the always-on BullMQ cron worker: cron
// schedules live in QStash and execute on-demand here, so no worker process is
// required and the cloud app stays free / scales to zero.
//
// Schedules are created by the trigger-manager (qstash-scheduler) with a
// destination of .../api/cron/fire?workflowId=<id>. Set CRON_SECRET and have
// QStash forward it as the `x-cron-secret` header so third parties can't fire
// arbitrary workflows.

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma, type Prisma } from "@solflow/db";
import { queueExecution } from "@/server/execution-worker/queue";

export async function POST(request: NextRequest) {
  return fire(request);
}

export async function GET(request: NextRequest) {
  return fire(request);
}

async function fire(request: NextRequest) {
  // Auth: shared secret forwarded by QStash as a header. Skip in dev.
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workflowId = request.nextUrl.searchParams.get("workflowId");
  if (!workflowId) {
    return NextResponse.json({ error: "Missing workflowId" }, { status: 400 });
  }

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
        triggeredAt: new Date().toISOString(),
      },
      definitionSnapshot: workflow.definition as Prisma.InputJsonValue,
    },
  });

  // Serverless: queueExecution runs inline + waits (no always-on worker).
  await queueExecution(execution.id, workflow.id);

  const refreshed = await prisma.workflowExecution.findUnique({
    where: { id: execution.id },
    select: { status: true },
  });

  return NextResponse.json({ ok: true, executionId: execution.id, status: refreshed?.status });
}
