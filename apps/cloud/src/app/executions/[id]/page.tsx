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
  ShieldCheck,
  GitCompare,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Pause,
  Play,
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
  WAITING: {
    icon: ShieldCheck,
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
  },
  TIMED_OUT: {
    icon: Timer,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
  },
  CANCELLED: {
    icon: CircleSlash,
    color: "text-zinc-400",
    bg: "bg-zinc-500/10",
    border: "border-zinc-500/30",
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

function getReplaySourceId(triggerData: unknown): string | null {
  if (!triggerData || typeof triggerData !== "object") return null;
  const data = triggerData as Record<string, unknown>;
  const replayOf = data.replayOf ?? data.approvalOf;
  return typeof replayOf === "string" ? replayOf : null;
}

type ExecutionNodeLog = {
  timestamp?: number | string | Date | null;
  level?: string | null;
  message?: string | null;
  data?: unknown;
};

type ExecutionNodeResult = {
  id?: string;
  nodeId: string;
  nodeType: string;
  status: string;
  duration?: number | null;
  error?: string | null;
  logs?: ExecutionNodeLog[] | unknown;
  inputSnapshot?: unknown;
  outputSnapshot?: unknown;
  startedAt?: string | Date | null;
  completedAt?: string | Date | null;
};

function hasWalletApprovalRequest(
  execution: { errorMessage?: string | null } | null | undefined,
  nodeResults: ExecutionNodeResult[],
): boolean {
  const messages = [
    execution?.errorMessage,
    ...nodeResults.map((result) => result?.error),
  ].filter((message): message is string => typeof message === "string");
  return messages.some((message) =>
    message.toLowerCase().includes("manual approval"),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value), null, 2);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value ?? null;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortJson((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
}

export default function ExecutionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const executionId = params.id as string;

  const { data: execution, isLoading } = trpc.execution.get.useQuery({
    id: executionId,
  });
  const replaySourceId = getReplaySourceId(execution?.triggerData);
  const { data: replaySource } = trpc.execution.get.useQuery(
    { id: replaySourceId ?? "" },
    { enabled: Boolean(replaySourceId) },
  );

  const reRun = trpc.execution.run.useMutation();
  const replayExecution = trpc.execution.replay.useMutation();
  const approveReplay = trpc.execution.approveReplay.useMutation();
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

  const handleReplay = async () => {
    try {
      const newExec = await replayExecution.mutateAsync({ executionId });
      toast.success("Replay started from saved inputs");
      router.push(`/executions/${newExec.id}`);
      utils.execution.list.invalidate();
    } catch {
      toast.error("Failed to replay execution");
    }
  };

  const handleApproveReplay = async () => {
    try {
      const newExec = await approveReplay.mutateAsync({ executionId });
      toast.success("Approved replay queued");
      router.push(`/executions/${newExec.id}`);
      utils.execution.list.invalidate();
    } catch {
      toast.error("Failed to approve replay");
    }
  };

  const nodeResults = (execution?.nodeResults ?? []) as ExecutionNodeResult[];
  const needsWalletApproval = hasWalletApprovalRequest(execution, nodeResults);

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
                <button
                  onClick={handleReplay}
                  disabled={replayExecution.isPending}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 transition-colors"
                >
                  <RotateCw size={11} className={replayExecution.isPending ? "animate-spin" : ""} />
                  Replay
                </button>
                {needsWalletApproval && (
                  <button
                    onClick={handleApproveReplay}
                    disabled={approveReplay.isPending}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 text-xs font-medium text-amber-300 hover:bg-amber-500/10 disabled:opacity-50 transition-colors"
                  >
                    <ShieldCheck size={11} className={approveReplay.isPending ? "animate-pulse" : ""} />
                    Approve replay
                  </button>
                )}
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

            {needsWalletApproval && (
              <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-xs font-semibold text-amber-300 mb-1">
                  Wallet action waiting for approval
                </p>
                <p className="text-xs leading-relaxed text-amber-100/70">
                  This workflow tried to sign a transfer or swap without the automation permission. Approve a replay for this run, or enable wallet automation in workflow safety settings when spend, mint, and slippage limits are strict enough.
                </p>
              </div>
            )}

            {replaySourceId && (
              <ReplayDiffPanel
                currentResults={nodeResults}
                sourceResults={(replaySource?.nodeResults ?? []) as ExecutionNodeResult[]}
                sourceId={replaySourceId}
                isLoading={!replaySource}
              />
            )}

            <ExecutionReplayPanel nodeResults={nodeResults} />

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
                  {nodeResults.map((nr, idx) => {
                    return (
                      <NodeResultCard
                        key={nr.id}
                        index={idx + 1}
                        nodeId={nr.nodeId}
                        nodeType={nr.nodeType}
                        status={nr.status}
                        duration={nr.duration}
                        error={nr.error}
                        logs={Array.isArray(nr.logs) ? nr.logs : []}
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

function ReplayDiffPanel({
  currentResults,
  sourceResults,
  sourceId,
  isLoading,
}: {
  currentResults: ExecutionNodeResult[];
  sourceResults: ExecutionNodeResult[];
  sourceId: string;
  isLoading: boolean;
}) {
  const sourceByNode = new Map(sourceResults.map((result) => [result.nodeId, result]));
  const rows = currentResults.map((current) => {
    const source = sourceByNode.get(current.nodeId);
    return {
      nodeId: current.nodeId,
      nodeType: current.nodeType,
      statusChanged: source?.status !== current.status,
      durationDelta:
        typeof source?.duration === "number" && typeof current.duration === "number"
          ? current.duration - source.duration
          : null,
      outputChanged: stableJson(source?.outputSnapshot) !== stableJson(current.outputSnapshot),
      errorChanged: (source?.error ?? null) !== (current.error ?? null),
      currentStatus: current.status,
      sourceStatus: source?.status ?? "missing",
    };
  });

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-semibold">Replay diff</p>
            <p className="text-[11px] text-muted-foreground">
              Compared with {sourceId.slice(0, 12)}...
            </p>
          </div>
        </div>
        {isLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-background/50 p-3 text-xs text-muted-foreground">
            No replay node results yet.
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.nodeId}
              className="rounded-lg border border-border bg-background/50 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{row.nodeType}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {row.nodeId.slice(0, 12)}...
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    row.statusChanged
                      ? "bg-amber-500/10 text-amber-300"
                      : "bg-emerald-500/10 text-emerald-300"
                  }`}
                >
                  {row.sourceStatus} → {row.currentStatus}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                <span>
                  duration{" "}
                  {row.durationDelta == null
                    ? "—"
                    : `${row.durationDelta >= 0 ? "+" : ""}${row.durationDelta}ms`}
                </span>
                {row.outputChanged && <span className="text-cyan-300">output changed</span>}
                {row.errorChanged && <span className="text-red-300">error changed</span>}
                {!row.outputChanged && !row.errorChanged && !row.statusChanged && (
                  <span>same result</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ExecutionReplayPanel({ nodeResults }: { nodeResults: ExecutionNodeResult[] }) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);

  React.useEffect(() => {
    setActiveIndex(0);
    setPlaying(false);
  }, [nodeResults.length]);

  React.useEffect(() => {
    if (!playing || nodeResults.length <= 1) return;
    const id = window.setInterval(() => {
      setActiveIndex((index) => {
        const next = index + 1;
        if (next >= nodeResults.length) {
          window.clearInterval(id);
          setPlaying(false);
          return index;
        }
        return next;
      });
    }, 1200);
    return () => window.clearInterval(id);
  }, [playing, nodeResults.length]);

  if (nodeResults.length === 0) return null;

  const active = nodeResults[Math.min(activeIndex, nodeResults.length - 1)];
  const cfg = NODE_STATUS_CONFIG[active.status] ?? NODE_STATUS_CONFIG.QUEUED;
  const Icon = cfg.icon;
  const logs = Array.isArray(active.logs) ? active.logs : [];

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Execution Replay</p>
          <p className="text-[11px] text-muted-foreground">
            Step through node inputs, outputs, timing, logs, and failure points.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPlaying((value) => !value)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {playing ? "Pause" : "Play"}
        </button>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {nodeResults.map((result, index) => {
          const stepCfg = NODE_STATUS_CONFIG[result.status] ?? NODE_STATUS_CONFIG.QUEUED;
          const activeStep = index === activeIndex;
          return (
            <button
              key={result.id ?? result.nodeId}
              type="button"
              onClick={() => {
                setActiveIndex(index);
                setPlaying(false);
              }}
              className={`min-w-[132px] rounded-lg border px-3 py-2 text-left transition-colors ${
                activeStep
                  ? `${stepCfg.border} ${stepCfg.bg} ring-2 ring-primary/30`
                  : "border-border bg-background hover:bg-accent/50"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusDotColor(result.status) }} />
                <span className="truncate text-xs font-semibold">{result.nodeType}</span>
              </div>
              <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                {result.nodeId?.slice(0, 12)}...
              </p>
            </button>
          );
        })}
      </div>

      <div className={`rounded-lg border ${cfg.border} ${cfg.bg} p-3`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${cfg.color} ${active.status === "RUNNING" ? "animate-spin" : ""}`} />
            <div>
              <p className="text-xs font-semibold">{active.nodeType}</p>
              <p className="font-mono text-[10px] text-muted-foreground">{active.nodeId}</p>
            </div>
          </div>
          <div className="flex gap-2 text-[10px] text-muted-foreground">
            <span>{active.status}</span>
            <span>{formatDuration(active.duration)}</span>
            <span>{formatTime(active.startedAt)}</span>
          </div>
        </div>

        {active.error && (
          <pre className="mb-3 overflow-x-auto rounded-md border border-red-500/20 bg-red-500/5 p-2 font-mono text-[11px] text-red-300">
            {active.error}
          </pre>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          <SnapshotBlock title="Input" value={active.inputSnapshot} />
          <SnapshotBlock title="Output" value={active.outputSnapshot} />
        </div>

        {logs.length > 0 && (
          <div className="mt-3 rounded-md border border-border/50 bg-background p-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Logs
            </p>
            <div className="space-y-1 font-mono text-[11px]">
              {logs.slice(0, 5).map((log, index) => (
                <div key={index} className="grid grid-cols-[70px_48px_1fr] gap-2">
                  <span className="text-muted-foreground/60">
                    {log.timestamp ? formatTime(new Date(log.timestamp)) : "-"}
                  </span>
                  <span className={log.level === "error" ? "text-red-300" : log.level === "warn" ? "text-amber-300" : "text-blue-300"}>
                    {log.level ?? "info"}
                  </span>
                  <span className="truncate">{log.message ?? ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function statusDotColor(status: string): string {
  if (status === "COMPLETED") return "#34d399";
  if (status === "FAILED") return "#f87171";
  if (status === "RUNNING") return "#60a5fa";
  if (status === "WAITING") return "#fbbf24";
  return "#a1a1aa";
}

function SnapshotBlock({ title, value }: { title: string; value: unknown }) {
  const json = stableJson(value ?? null).slice(0, 1800);
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <pre className="max-h-[220px] overflow-auto rounded-md border border-border/50 bg-background p-2 font-mono text-[11px] text-muted-foreground">
        {json}
      </pre>
    </div>
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
  logs,
  inputSnapshot,
  outputSnapshot,
  startedAt,
  completedAt,
}: {
  index: number;
  nodeId: string;
  nodeType: string;
  status: string;
  duration: number | null | undefined;
  error: string | null | undefined;
  logs: ExecutionNodeLog[];
  inputSnapshot: unknown;
  outputSnapshot: unknown;
  startedAt: string | Date | null | undefined;
  completedAt: string | Date | null | undefined;
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

          {logs.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">
                Logs
              </p>
              <div className="max-h-[180px] space-y-1 overflow-y-auto rounded-md bg-muted/30 p-2 font-mono text-[11px]">
                {logs.map((log, index) => (
                  <div key={index} className="grid grid-cols-[70px_48px_1fr] gap-2">
                    <span className="text-muted-foreground/50">
                      {log.timestamp ? formatTime(new Date(log.timestamp)) : "—"}
                    </span>
                    <span className={log.level === "error" ? "text-red-300" : log.level === "warn" ? "text-amber-300" : "text-blue-300"}>
                      {log.level ?? "info"}
                    </span>
                    <span className="truncate">{log.message ?? ""}</span>
                  </div>
                ))}
              </div>
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
