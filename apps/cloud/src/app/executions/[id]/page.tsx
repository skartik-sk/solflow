"use client";

// Execution Detail Page — per-node results timeline with input/output snapshots.

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Timer,
  CircleSlash,
  RotateCw,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";

const NODE_STATUS_CONFIG: Record<
  string,
  { icon: typeof CheckCircle2; color: string; bg: string; border: string }
> = {
  COMPLETED: {
    icon: CheckCircle2,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
  FAILED: {
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
  },
  RUNNING: {
    icon: Loader2,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  QUEUED: {
    icon: Clock,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
  },
  SKIPPED: {
    icon: CircleSlash,
    color: "text-zinc-400",
    bg: "bg-zinc-500/10",
    border: "border-zinc-500/30",
  },
};

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleTimeString();
}

export default function ExecutionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const executionId = params.id as string;

  const { data: execution, isLoading } = trpc.execution.get.useQuery({
    id: executionId,
  });

  const reRun = trpc.execution.run.useMutation();
  const utils = trpc.useUtils();

  const handleReRun = async () => {
    if (!execution?.workflowId) return;
    try {
      const newExec = await reRun.mutateAsync({ workflowId: execution.workflowId });
      toast.success("Workflow re-run started");
      router.push(`/executions/${newExec.id}`);
      utils.execution.list.invalidate();
    } catch {
      toast.error("Failed to re-run workflow");
    }
  };

  const nodeResults = (execution?.nodeResults ?? []) as any[];

  const overallStatus = execution?.status ?? "UNKNOWN";
  const overallCfg =
    NODE_STATUS_CONFIG[overallStatus] ?? NODE_STATUS_CONFIG.QUEUED;
  const OverallIcon = overallCfg.icon;

  return (
    <AppShell>
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && !execution && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <XCircle className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Execution not found</p>
            <Link href="/executions" className="text-xs text-primary hover:underline mt-2">
              Back to executions
            </Link>
          </div>
        )}

        {!isLoading && execution && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Link
                  href="/executions"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <ArrowLeft size={14} />
                </Link>
                <div>
                  <h1 className="text-lg font-bold">
                    {execution.workflow?.name ?? "Execution"}
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    Execution {execution.id.slice(0, 12)}...
                    {" "}&middot; {execution.triggerType} trigger
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${overallCfg.bg} ${overallCfg.color}`}
                >
                  <OverallIcon
                    size={12}
                    className={overallStatus === "RUNNING" ? "animate-spin" : ""}
                  />
                  {overallStatus}
                </span>
                <button
                  onClick={handleReRun}
                  disabled={reRun.isPending}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 transition-colors"
                >
                  <RotateCw size={11} className={reRun.isPending ? "animate-spin" : ""} />
                  Re-run
                </button>
                {execution.workflowId && (
                  <Link
                    href={`/editor/${execution.workflowId}`}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <ExternalLink size={11} />
                    Open Workflow
                  </Link>
                )}
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <SummaryCard
                label="Duration"
                value={formatDuration(execution.duration)}
              />
              <SummaryCard
                label="Nodes"
                value={`${execution.nodesSucceeded ?? 0}/${execution.nodesExecuted ?? 0}`}
              />
              <SummaryCard
                label="Started"
                value={formatTime(execution.startedAt ?? execution.createdAt)}
              />
              <SummaryCard
                label="Completed"
                value={formatTime(execution.completedAt)}
              />
              <SummaryCard
                label="Trigger"
                value={execution.triggerType}
              />
            </div>

            {execution.errorMessage && (
              <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                <p className="text-xs font-semibold text-red-400 mb-1">Error</p>
                <p className="text-xs text-red-300/80 font-mono">
                  {execution.errorMessage}
                </p>
              </div>
            )}

            {/* Node timeline */}
            <div>
              <h2 className="text-sm font-semibold mb-3">Node Execution Timeline</h2>
              {nodeResults.length === 0 ? (
                <div className="rounded-xl border border-border bg-card p-8 text-center">
                  <p className="text-xs text-muted-foreground">
                    No node results available
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {nodeResults.map((nr: any, idx: number) => {
                    const cfg =
                      NODE_STATUS_CONFIG[nr.status] ?? NODE_STATUS_CONFIG.QUEUED;
                    const Icon = cfg.icon;

                    return (
                      <NodeResultCard
                        key={nr.id}
                        index={idx + 1}
                        nodeId={nr.nodeId}
                        nodeType={nr.nodeType}
                        status={nr.status}
                        duration={nr.duration}
                        error={nr.error}
                        inputSnapshot={nr.inputSnapshot}
                        outputSnapshot={nr.outputSnapshot}
                        startedAt={nr.startedAt}
                        completedAt={nr.completedAt}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
    </AppShell>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-0.5">
        {label}
      </p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function NodeResultCard({
  index,
  nodeId,
  nodeType,
  status,
  duration,
  error,
  inputSnapshot,
  outputSnapshot,
  startedAt,
  completedAt,
}: {
  index: number;
  nodeId: string;
  nodeType: string;
  status: string;
  duration: number | null;
  error: string | null;
  inputSnapshot: unknown;
  outputSnapshot: unknown;
  startedAt: string | null;
  completedAt: string | null;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const cfg = NODE_STATUS_CONFIG[status] ?? NODE_STATUS_CONFIG.QUEUED;
  const Icon = cfg.icon;

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-[10px] font-bold text-muted-foreground">
            {index}
          </span>
          <Icon
            size={14}
            className={`${cfg.color} ${status === "RUNNING" ? "animate-spin" : ""}`}
          />
          <div>
            <p className="text-xs font-semibold">{nodeType}</p>
            <p className="text-[10px] text-muted-foreground/60">
              {nodeId.slice(0, 12)}...
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">
            {formatDuration(duration)}
          </span>
          <span className={`text-[10px] font-medium ${cfg.color}`}>{status}</span>
          {expanded ? (
            <ChevronDown size={12} className="text-muted-foreground" />
          ) : (
            <ChevronRight size={12} className="text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/50 bg-background p-3 space-y-3">
          {error && (
            <div>
              <p className="text-[10px] font-semibold text-red-400 mb-0.5">Error</p>
              <pre className="rounded-md bg-red-500/5 border border-red-500/20 p-2 text-[11px] text-red-300/80 overflow-x-auto font-mono">
                {error}
              </pre>
            </div>
          )}

          {inputSnapshot != null && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">
                Input
              </p>
              <pre className="rounded-md bg-muted/30 p-2 text-[11px] overflow-x-auto font-mono max-h-[200px] overflow-y-auto">
                {JSON.stringify(inputSnapshot, null, 2)}
              </pre>
            </div>
          )}

          {outputSnapshot != null && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">
                Output
              </p>
              <pre className="rounded-md bg-muted/30 p-2 text-[11px] overflow-x-auto font-mono max-h-[200px] overflow-y-auto">
                {JSON.stringify(outputSnapshot, null, 2)}
              </pre>
            </div>
          )}

          <div className="flex items-center gap-4 text-[10px] text-muted-foreground/50">
            {startedAt && <span>Started: {formatTime(startedAt)}</span>}
            {completedAt && <span>Completed: {formatTime(completedAt)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
