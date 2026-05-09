"use client";

// Cloud Dashboard - compact operational home after login.

import React, { useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  Boxes,
  CheckCircle2,
  Clock,
  KeyRound,
  Plus,
  Wallet,
  Workflow,
  XCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { AppShell } from "@/components/layout/AppShell";
import { NewWorkflowDialog } from "@/components/workflows/NewWorkflowDialog";

function statusClass(status: string): string {
  if (status === "ACTIVE" || status === "COMPLETED") return "bg-emerald-500/10 text-emerald-300";
  if (status === "FAILED" || status === "TIMED_OUT") return "bg-red-500/10 text-red-300";
  if (status === "RUNNING") return "bg-blue-500/10 text-blue-300";
  return "bg-muted text-muted-foreground";
}

function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function DashboardPage() {
  const [showNewWorkflow, setShowNewWorkflow] = useState(false);
  const { data: workflows } = trpc.workflow.list.useQuery();
  const { data: executionData } = trpc.execution.list.useQuery({ limit: 8 });

  const workflowItems = workflows ?? [];
  const recentExecutions = executionData?.items ?? [];
  const activeWorkflows = workflowItems.filter((workflow: any) => workflow.status === "ACTIVE");
  const completedRuns = recentExecutions.filter((execution: any) => execution.status === "COMPLETED").length;
  const successRate =
    recentExecutions.length > 0 ? Math.round((completedRuns / recentExecutions.length) * 100) : 0;
  const nextRun = activeWorkflows
    .map((workflow: any) => workflow.nextRunAt)
    .filter(Boolean)
    .sort((a: string, b: string) => new Date(a).getTime() - new Date(b).getTime())[0];

  return (
    <AppShell>
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cloud dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Run history, workflow status, wallets, and credentials in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowNewWorkflow(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus size={13} />
            New Workflow
          </button>
          <Link
            href="/marketplace"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <Boxes size={13} />
            Marketplace
          </Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
        <DashboardAction href="/marketplace" icon={<Boxes size={17} />} title="Marketplace" detail="Use templates" />
        <DashboardAction href="/wallets" icon={<Wallet size={17} />} title="Wallets" detail="Signing wallets" />
        <DashboardAction href="/credentials" icon={<KeyRound size={17} />} title="Credentials" detail="Provider keys" />
        <DashboardAction href="/assistant" icon={<Bot size={17} />} title="Assistant" detail="Prompt to graph" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
        <DashboardMetric icon={<Workflow size={15} />} label="Active workflows" value={`${activeWorkflows.length}`} />
        <DashboardMetric icon={<Activity size={15} />} label="Recent runs" value={`${recentExecutions.length}`} />
        <DashboardMetric icon={<BarChart3 size={15} />} label="Success rate" value={recentExecutions.length ? `${successRate}%` : "-"} />
        <DashboardMetric icon={<Clock size={15} />} label="Next run" value={formatTime(nextRun)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Workflows
            </h2>
            <Link href="/workflows" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>

          {workflowItems.length > 0 ? (
            <div className="rounded-xl border border-border bg-card">
              {workflowItems.slice(0, 8).map((workflow: any) => (
                <Link
                  key={workflow.id}
                  href={`/editor/${workflow.id}`}
                  className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3 last:border-b-0 hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{workflow.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {workflow._count?.executions ?? 0} runs - Updated {formatTime(workflow.updatedAt)}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${statusClass(workflow.status)}`}>
                    {workflow.status}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
              <Workflow className="mx-auto mb-3 h-9 w-9 text-muted-foreground/30" />
              <p className="text-sm font-medium">No workflows yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create one from scratch or start from a marketplace template.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewWorkflow(true)}
                  className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
                >
                  New Workflow
                </button>
                <Link
                  href="/marketplace"
                  className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-semibold text-foreground"
                >
                  Marketplace
                </Link>
              </div>
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Runs
            </h2>
            <Link href="/executions" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>

          {recentExecutions.length > 0 ? (
            <div className="rounded-xl border border-border bg-card">
              {recentExecutions.slice(0, 6).map((execution: any) => (
                <Link
                  key={execution.id}
                  href={`/executions/${execution.id}`}
                  className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3 text-sm last:border-b-0 hover:bg-accent/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {execution.status === "COMPLETED" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    ) : execution.status === "FAILED" || execution.status === "TIMED_OUT" ? (
                      <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                    ) : (
                      <Activity className="h-4 w-4 shrink-0 text-blue-400" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{execution.workflow?.name ?? "Workflow"}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(execution.startedAt ?? execution.createdAt)}
                      </p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${statusClass(execution.status)}`}>
                    {execution.status}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              No runs yet. Manual runs from the editor will appear here.
            </div>
          )}
        </section>
      </div>
      {showNewWorkflow && (
        <NewWorkflowDialog onClose={() => setShowNewWorkflow(false)} />
      )}
    </AppShell>
  );
}

function DashboardAction({
  href,
  icon,
  title,
  detail,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/35 hover:bg-accent/30"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
    </Link>
  );
}

function DashboardMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className="truncate text-lg font-bold">{value}</p>
    </div>
  );
}
