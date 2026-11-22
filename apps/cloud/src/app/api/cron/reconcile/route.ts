// /api/cron/reconcile — re-creates cron schedules (and webhook paths) for every
// ACTIVE workflow, e.g. after QStash schedules were lost or a deploy changed
// CLOUD_PUBLIC_BASE_URL. Authenticated like /api/cron/fire (CRON_SECRET as
// `Authorization: Bearer` or X-Cron-Secret, or a QStash signature).
// Pass ?cursor=<workflowId> to continue a run that hit the time budget.

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@solflow/db";
import { authenticateCronRequest } from "@/server/trigger-manager/cron-auth";
import { getTriggerManager } from "@/server/trigger-manager";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIME_BUDGET_MS = 45_000;
const BATCH = 100;

export async function POST(request: NextRequest) {
  return reconcile(request);
}

export async function GET(request: NextRequest) {
  return reconcile(request);
}

async function reconcile(request: NextRequest) {
  const rawBody = request.method === "GET" ? "" : await request.text();
  const auth = authenticateCronRequest({
    headers: request.headers,
    rawBody,
    checkSubject: (sub) => {
      try {
        return new URL(sub).pathname.replace(/\/+$/, "") === "/api/cron/reconcile";
      } catch {
        return false;
      }
    },
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const startedAt = Date.now();
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const workflows = await prisma.workflow.findMany({
    where: { status: "ACTIVE" },
    orderBy: { id: "asc" },
    take: BATCH,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true },
  });

  const manager = getTriggerManager();
  const failed: Array<{ workflowId: string; error: string }> = [];
  let processed = 0;
  let nextCursor: string | undefined;
  for (const workflow of workflows) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      nextCursor = workflows[processed - 1]?.id;
      break;
    }
    try {
      await manager.syncIfActive(workflow.id);
    } catch (error) {
      failed.push({
        workflowId: workflow.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    processed += 1;
  }
  if (!nextCursor && workflows.length === BATCH) {
    nextCursor = workflows[workflows.length - 1].id;
  }

  return NextResponse.json({ ok: failed.length === 0, processed, failed, nextCursor });
}
