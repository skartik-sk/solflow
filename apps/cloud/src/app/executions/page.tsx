"use client";

// Executions Page — real execution history from tRPC.

import React from "react";
import Link from "next/link";
import {
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  CircleSlash,
  Timer,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { AppShell } from "@/components/layout/AppShell";

const STATUS_CONFIG: Record<
  string,
  { icon: typeof CheckCircle2; color: string; bg: string }
> = {
  COMPLETED: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  SUCCESS: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  FAILED: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
  RUNNING: { icon: Loader2, color: "text-blue-400", bg: "bg-blue-500/10" },
  QUEUED: { icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
  CANCELLED: { icon: CircleSlash, color: "text-zinc-400", bg: "bg-zinc-500/10" },
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
  const executions = data?.items ?? [];

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-lg font-bold">Executions</h1>
        <p className="text-xs text-muted-foreground">History of workflow executions</p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && executions.length > 0 && (
        <div className="space-y-2">
          {executions.map((exec: any) => {
            const cfg = STATUS_CONFIG[exec.status] ?? STATUS_CONFIG.QUEUED;
            const Icon = cfg.icon;
            const workflowName = exec.workflow?.name ?? "Unknown";

            return (
              <Link
                key={exec.id}
                href={`/executions/${exec.id}`}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4 hover:border-border/80 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}
                  >
                    <Icon
                      size={14}
                      className={`${cfg.color} ${exec.status === "RUNNING" ? "animate-spin" : ""}`}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{workflowName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {exec.triggerType} trigger
                      {exec.errorMessage && (
                        <span className="ml-2 text-red-400">
                          {exec.errorMessage.slice(0, 60)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="hidden md:flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Timer size={10} />
                      {formatDuration(exec.duration)}
                    </span>
                    <span>{exec.nodesExecuted} nodes</span>
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {exec.startedAt ? timeAgo(exec.startedAt) : timeAgo(exec.createdAt)}
                    </span>
                  </div>

                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.bg} ${cfg.color}`}
                  >
                    {exec.status}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {!isLoading && executions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Activity className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No executions yet</p>
          <p className="text-xs text-muted-foreground/60">
            Run a workflow to see execution history
          </p>
        </div>
      )}
    </AppShell>
  );
}
