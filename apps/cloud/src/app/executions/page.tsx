"use client";

// Executions Page — real execution history from tRPC.

import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyPanel, PageHeader, SkeletonRows, StatusPill, btnQuiet, panel, rowClass } from "@/components/ui-kit/cloud-ui";
import { RunsMini } from "@/components/ui-kit/cloud-minis";

type ExecutionListItem = {
  id: string;
  status: string;
  triggerType: string;
  errorMessage?: string | null;
  duration?: number | null;
  nodesExecuted?: number | null;
  startedAt?: string | Date | null;
  createdAt: string | Date;
  workflow?: { name?: string | null } | null;
};

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function timeAgo(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

export default function ExecutionsPage() {
  const { data, isLoading } = trpc.execution.list.useQuery({ limit: 50 });
  const executions = (data?.items ?? []) as ExecutionListItem[];

  return (
    <AppShell>
      <PageHeader title="Runs" description="History of workflow executions, newest first" />

      {isLoading && <SkeletonRows rows={6} />}

      {!isLoading && executions.length > 0 && (
        <div className={`${panel} overflow-hidden`}>
          <div className="hidden h-9 grid-cols-[112px_minmax(0,1fr)_96px_64px_72px_80px_16px] items-center gap-4 border-b border-white/[0.07] px-4 text-[12px] text-muted-foreground md:grid">
            <span>Status</span>
            <span>Workflow</span>
            <span>Trigger</span>
            <span className="text-right">Nodes</span>
            <span className="text-right">Duration</span>
            <span className="text-right">Started</span>
            <span />
          </div>
          {executions.map((exec) => {
            const workflowName = exec.workflow?.name ?? "Unknown";
            const started = exec.startedAt ? timeAgo(exec.startedAt) : timeAgo(exec.createdAt);

            return (
              <Link
                key={exec.id}
                href={`/executions/${exec.id}`}
                className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors duration-150 hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary md:grid-cols-[112px_minmax(0,1fr)_96px_64px_72px_80px_16px] md:gap-4 ${rowClass}`}
              >
                <span className="order-2 justify-self-end md:order-none md:justify-self-start">
                  <StatusPill status={exec.status} />
                </span>
                <span className="order-1 min-w-0 md:order-none">
                  <span className="block truncate text-[13.5px] font-medium">{workflowName}</span>
                  {exec.errorMessage && (
                    <span className="mt-0.5 block truncate text-[12px] text-red-400">
                      {exec.errorMessage.slice(0, 60)}
                    </span>
                  )}
                  <span className="mt-0.5 block text-[12px] tabular-nums text-muted-foreground md:hidden">
                    {exec.triggerType} · {exec.nodesExecuted} nodes · {formatDuration(exec.duration)} · {started}
                  </span>
                </span>
                <span className="hidden truncate text-[12.5px] capitalize text-muted-foreground md:block">{exec.triggerType.toLowerCase()}</span>
                <span className="hidden text-right font-mono text-[12px] tabular-nums text-muted-foreground md:block">{exec.nodesExecuted}</span>
                <span className="hidden text-right font-mono text-[12px] tabular-nums text-muted-foreground md:block">{formatDuration(exec.duration)}</span>
                <span className="hidden text-right text-[12px] tabular-nums text-muted-foreground md:block">{started}</span>
                <ChevronRight className="hidden h-4 w-4 text-muted-foreground/50 transition-transform duration-150 group-hover:translate-x-0.5 md:block" aria-hidden />
              </Link>
            );
          })}
        </div>
      )}

      {!isLoading && executions.length === 0 && (
        <EmptyPanel
          title="No executions yet"
          body="Run a workflow to see execution history. Each run keeps its trigger data, node outputs and logs."
          art={<RunsMini />}
          actions={
            <Link href="/workflows" className={btnQuiet}>
              Open workflows
            </Link>
          }
        />
      )}
    </AppShell>
  );
}
