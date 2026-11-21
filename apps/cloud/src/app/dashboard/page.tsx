"use client";

// Cloud Dashboard - compact operational home after login.

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, Boxes, KeyRound, Plus, Wallet } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { AppShell } from "@/components/layout/AppShell";
import { NewWorkflowDialog } from "@/components/workflows/NewWorkflowDialog";
import { EmptyPanel, PageHeader, SectionHead, StatusPill, btnPrimary, btnQuiet, focusRing, panel, rowClass } from "@/components/ui-kit/cloud-ui";
import { RunsMini, WorkflowMini } from "@/components/ui-kit/cloud-minis";

type WorkflowSummary = {
  id: string;
  name: string;
  status: string;
  updatedAt: string | Date;
  nextRunAt?: string | Date | null;
  _count?: { executions?: number };
};

type ExecutionSummary = {
  id: string;
  status: string;
  startedAt?: string | Date | null;
  createdAt?: string | Date | null;
  workflow?: { name?: string | null } | null;
};

function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function DashboardPage() {
  const [showNewWorkflow, setShowNewWorkflow] = useState(false);
  const { data: workflows } = trpc.workflow.list.useQuery();
  const { data: executionData } = trpc.execution.list.useQuery({ limit: 8 });

  const workflowItems = (workflows ?? []) as WorkflowSummary[];
  const recentExecutions = (executionData?.items ?? []) as ExecutionSummary[];
  const activeWorkflows = workflowItems.filter((workflow) => workflow.status === "ACTIVE");
  const completedRuns = recentExecutions.filter((execution) => execution.status === "COMPLETED").length;
  const successRate =
    recentExecutions.length > 0 ? Math.round((completedRuns / recentExecutions.length) * 100) : 0;
  const nextRun = activeWorkflows
    .map((workflow) => workflow.nextRunAt)
    .filter(Boolean)
    .sort((a, b) => new Date(a!).getTime() - new Date(b!).getTime())[0];

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        description="Run history, workflow status, wallets, and credentials in one place."
        actions={
          <>
            <Link href="/marketplace" className={btnQuiet}>
              <Boxes className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              Marketplace
            </Link>
            <button type="button" onClick={() => setShowNewWorkflow(true)} className={btnPrimary}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New workflow
            </button>
          </>
        }
      />

      {/* Stats strip */}
      <dl className={`${panel} grid grid-cols-2 overflow-hidden md:grid-cols-4`}>
        <DashboardMetric label="Active workflows" value={`${activeWorkflows.length}`} />
        <DashboardMetric label="Recent runs" value={`${recentExecutions.length}`} />
        <DashboardMetric label="Success rate" value={recentExecutions.length ? `${successRate}%` : "-"} />
        <DashboardMetric label="Next run" value={formatTime(nextRun)} small />
      </dl>

      {/* Shortcuts */}
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <DashboardAction href="/marketplace" icon={<Boxes className="h-4 w-4" />} title="Marketplace" detail="Use templates" />
        <DashboardAction href="/wallets" icon={<Wallet className="h-4 w-4" />} title="Wallets" detail="Signing wallets" />
        <DashboardAction href="/credentials" icon={<KeyRound className="h-4 w-4" />} title="Credentials" detail="Provider keys" />
        <DashboardAction href="/assistant" icon={<Bot className="h-4 w-4" />} title="Assistant" detail="Prompt to graph" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          <SectionHead
            title="Workflows"
            action={
              <Link href="/workflows" className={`rounded-md text-[12.5px] text-muted-foreground transition-colors hover:text-foreground ${focusRing}`}>
                View all
              </Link>
            }
          />

          {workflowItems.length > 0 ? (
            <div className={panel}>
              {workflowItems.slice(0, 8).map((workflow) => (
                <Link
                  key={workflow.id}
                  href={`/editor/${workflow.id}`}
                  className={`flex items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-150 first:rounded-t-[14px] last:rounded-b-[14px] hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${rowClass}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium">{workflow.name}</p>
                    <p className="mt-0.5 text-[12px] tabular-nums text-muted-foreground">
                      {workflow._count?.executions ?? 0} runs · Updated {formatTime(workflow.updatedAt)}
                    </p>
                  </div>
                  <StatusPill status={workflow.status} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyPanel
              title="No workflows yet"
              body="Create one from scratch or start from a marketplace template."
              art={<WorkflowMini />}
              actions={
                <>
                  <button type="button" onClick={() => setShowNewWorkflow(true)} className={btnPrimary}>
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    New workflow
                  </button>
                  <Link href="/marketplace" className={btnQuiet}>
                    Marketplace
                  </Link>
                </>
              }
            />
          )}
        </section>

        <section className="min-w-0">
          <SectionHead
            title="Recent runs"
            action={
              <Link href="/executions" className={`rounded-md text-[12.5px] text-muted-foreground transition-colors hover:text-foreground ${focusRing}`}>
                View all
              </Link>
            }
          />

          {recentExecutions.length > 0 ? (
            <div className={panel}>
              {recentExecutions.slice(0, 6).map((execution) => (
                <Link
                  key={execution.id}
                  href={`/executions/${execution.id}`}
                  className={`flex items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-150 first:rounded-t-[14px] last:rounded-b-[14px] hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${rowClass}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium">{execution.workflow?.name ?? "Workflow"}</p>
                    <p className="mt-0.5 text-[12px] tabular-nums text-muted-foreground">
                      {formatTime(execution.startedAt ?? execution.createdAt)}
                    </p>
                  </div>
                  <StatusPill status={execution.status} />
                </Link>
              ))}
            </div>
          ) : (
            <div className={`${panel} overflow-hidden`}>
              <div className="relative h-[132px] overflow-hidden border-b border-white/[0.07] bg-background px-4 pt-4" aria-hidden>
                <RunsMini />
              </div>
              <p className="px-4 py-3 text-[12.5px] text-muted-foreground">
                No runs yet. Manual runs from the editor will appear here.
              </p>
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
      className={`group flex items-center gap-3 rounded-[12px] border border-white/[0.07] bg-card px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[border-color,background-color] duration-150 hover:border-white/[0.13] hover:bg-white/[0.02] ${focusRing}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-white/[0.07] bg-background text-muted-foreground transition-colors duration-150 group-hover:text-primary">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{title}</span>
        <span className="block truncate text-[12px] text-muted-foreground">{detail}</span>
      </span>
      <ArrowRight className="ml-auto hidden h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-150 group-hover:translate-x-0.5 sm:block" aria-hidden />
    </Link>
  );
}

function DashboardMetric({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="-mb-px -mr-px min-w-0 border-b border-r border-white/[0.07] px-4 py-3">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 truncate font-semibold tabular-nums tracking-[-0.02em] ${small ? "text-[14px] leading-[27px]" : "text-[18px]"}`}>{value}</dd>
    </div>
  );
}
