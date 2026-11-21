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
import { EdEmptyState, edBtn, edPrimaryBtn, edx } from "@/components/editor/editor-chrome";

const card =
  "rounded-[14px] border border-white/[0.07] bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
const inset = "rounded-[10px] border border-white/[0.06] bg-background/60";
const sectionTitle = "text-[13px] font-semibold tracking-[-0.01em] text-foreground";
const fieldLabel = "text-[11px] font-medium text-muted-foreground";
const pageBtn = edx(edBtn, "h-8 px-3 text-[12.5px]");

const NODE_STATUS_CONFIG: Record<
  string,
  { icon: typeof CheckCircle2; color: string; bg: string; border: string }
> = {
  COMPLETED: {
    icon: CheckCircle2,
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
  },
  FAILED: {
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
  RUNNING: {
    icon: Loader2,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/25",
  },
  QUEUED: {
    icon: Clock,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  WAITING: {
    icon: ShieldCheck,
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  TIMED_OUT: {
    icon: Timer,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
  },
  CANCELLED: {
    icon: CircleSlash,
    color: "text-muted-foreground",
    bg: "bg-white/[0.04]",
    border: "border-white/[0.08]",
  },
  SKIPPED: {
    icon: CircleSlash,
    color: "text-muted-foreground",
    bg: "bg-white/[0.04]",
    border: "border-white/[0.08]",
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
          <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary motion-reduce:animate-none" />
            Loading execution…
          </div>
        )}

        {!isLoading && !execution && (
          <div className="py-16">
            <EdEmptyState
              icon={<XCircle size={15} />}
              hint="Check the link, or open the run from Executions."
              action={
                <Link href="/executions" className={edBtn}>
                  Back to executions
                </Link>
              }
            >
              Execution not found
            </EdEmptyState>
          </div>
        )}

        {!isLoading && execution && (
          <>
            {/* Header */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Link
                  href="/executions"
                  aria-label="Back to executions"
                  title="Back to executions"
                  className="group flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-150 ease-out hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                >
                  <ArrowLeft
                    size={14}
                    className="transition-transform duration-150 ease-out group-hover:-translate-x-0.5 motion-reduce:transition-none"
                  />
                </Link>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <h1 className="truncate text-[17px] font-semibold tracking-[-0.02em]">
                      {execution.workflow?.name ?? "Execution"}
                    </h1>
                    <span
                      className={`inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium ${overallCfg.border} ${overallCfg.bg} ${overallCfg.color}`}
                    >
                      <OverallIcon
                        size={11}
                        className={overallStatus === "RUNNING" ? "animate-spin motion-reduce:animate-none" : ""}
                      />
                      {overallStatus}
                    </span>
                  </div>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <span className="font-mono text-[11.5px] text-foreground/70">
                      {execution.id.slice(0, 12)}...
                    </span>
                    <span aria-hidden className="text-white/20">&middot;</span>
                    {execution.triggerType} trigger
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={handleReRun}
                  disabled={reRun.isPending}
                  className={pageBtn}
                >
                  <RotateCw size={12} className={reRun.isPending ? "animate-spin motion-reduce:animate-none" : ""} />
                  Re-run
                </button>
                <button
                  onClick={handleReplay}
                  disabled={replayExecution.isPending}
                  className={pageBtn}
                >
                  <RotateCw size={12} className={replayExecution.isPending ? "animate-spin motion-reduce:animate-none" : ""} />
                  Replay
                </button>
                {needsWalletApproval && (
                  <button
                    onClick={handleApproveReplay}
                    disabled={approveReplay.isPending}
                    className={edx(
                      pageBtn,
                      "bg-amber-500/[0.07] text-amber-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_0_1px_rgba(251,191,36,0.3)] hover:bg-amber-500/[0.12] hover:text-amber-200",
                    )}
                  >
                    <ShieldCheck size={12} className={approveReplay.isPending ? "animate-pulse motion-reduce:animate-none" : ""} />
                    Approve replay
                  </button>
                )}
                {execution.workflowId && (
                  <Link
                    href={`/editor/${execution.workflowId}`}
                    className={edx(edPrimaryBtn, "h-8 px-3 text-[12.5px]")}
                  >
                    <ExternalLink size={12} />
                    Open workflow
                  </Link>
                )}
              </div>
            </div>

            {/* Summary cards */}
            <div className={`${card} mb-4 grid grid-cols-2 overflow-hidden sm:grid-cols-3 md:grid-cols-5 [&>*]:border-white/[0.06] max-md:[&>*]:border-b md:[&>*:not(:last-child)]:border-r`}>
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
              <div className="mb-4 rounded-[14px] border border-red-500/20 bg-red-500/[0.05] px-4 py-3">
                <p className="mb-1 flex items-center gap-2 text-[12.5px] font-semibold text-red-400">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-red-400" />
                  Error
                </p>
                <p className="break-words font-mono text-[12px] text-red-300/85">
                  {execution.errorMessage}
                </p>
              </div>
            )}

            {needsWalletApproval && (
              <div className="mb-4 rounded-[14px] border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3">
                <p className="mb-1 flex items-center gap-2 text-[12.5px] font-semibold text-amber-300">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Wallet action waiting for approval
                </p>
                <p className="text-[12.5px] leading-relaxed text-amber-100/70">
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
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className={sectionTitle}>Node timeline</h2>
                <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground/60">
                  {nodeResults.length}
                </span>
              </div>
              {nodeResults.length === 0 ? (
                <div className={`${card} py-10`}>
                  <EdEmptyState hint="Nodes report here as the run reaches them.">
                    No node results available
                  </EdEmptyState>
                </div>
              ) : (
                <div className={`${card} overflow-hidden`}>
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
    <div className={`${card} mb-4 p-4`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
            <GitCompare className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className={sectionTitle}>Replay diff</p>
            <p className="text-[12px] text-muted-foreground">
              Compared with{" "}
              <span className="font-mono text-[11.5px] text-foreground/70">
                {sourceId.slice(0, 12)}...
              </span>
            </p>
          </div>
        </div>
        {isLoading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground motion-reduce:animate-none" />
        )}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.length === 0 ? (
          <div className={`${inset} p-3 text-[12.5px] text-muted-foreground`}>
            No replay node results yet.
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.nodeId}
              className={`${inset} p-3`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-medium">{row.nodeType}</p>
                  <p className="font-mono text-[11px] text-muted-foreground/70">
                    {row.nodeId.slice(0, 12)}...
                  </p>
                </div>
                <span
                  className={`inline-flex h-5 shrink-0 items-center rounded-full border px-2 font-mono text-[10.5px] font-medium ${
                    row.statusChanged
                      ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                      : "border-green-500/20 bg-green-500/10 text-green-400"
                  }`}
                >
                  {row.sourceStatus} → {row.currentStatus}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
                <span className="tabular-nums">
                  duration{" "}
                  {row.durationDelta == null
                    ? "—"
                    : `${row.durationDelta >= 0 ? "+" : ""}${row.durationDelta}ms`}
                </span>
                {row.outputChanged && <span className="text-primary">output changed</span>}
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
    <div className={`${card} mb-4 p-4`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className={sectionTitle}>Step through</p>
          <p className="text-[12px] text-muted-foreground">
            Inputs, outputs, timing and logs for each node in order.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPlaying((value) => !value)}
          aria-pressed={playing}
          className={pageBtn}
        >
          {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {playing ? "Pause" : "Play"}
        </button>
      </div>

      <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
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
              aria-current={activeStep ? "step" : undefined}
              className={`min-w-[136px] shrink-0 rounded-[10px] border px-2.5 py-2 text-left outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
                activeStep
                  ? `${stepCfg.border} bg-white/[0.04] shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_45%,transparent)]`
                  : "border-white/[0.06] bg-background/60 hover:border-white/[0.12] hover:bg-white/[0.03]"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground/60">{index + 1}</span>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: statusDotColor(result.status) }} />
                <span className="truncate text-[12.5px] font-medium">{result.nodeType}</span>
              </div>
              <p className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground/70">
                {result.nodeId?.slice(0, 12)}...
              </p>
            </button>
          );
        })}
      </div>

      <div className={`${inset} p-3`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] ${cfg.bg}`}>
              <Icon className={`h-3.5 w-3.5 ${cfg.color} ${active.status === "RUNNING" ? "animate-spin motion-reduce:animate-none" : ""}`} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold">{active.nodeType}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground/70">{active.nodeId}</p>
            </div>
          </div>
          <div className="flex gap-3 font-mono text-[11.5px] tabular-nums text-muted-foreground">
            <span className={cfg.color}>{active.status}</span>
            <span>{formatDuration(active.duration)}</span>
            <span>{formatTime(active.startedAt)}</span>
          </div>
        </div>

        {active.error && (
          <pre className="mb-3 overflow-x-auto rounded-[8px] border border-red-500/20 bg-red-500/[0.05] p-2.5 font-mono text-[12px] text-red-300">
            {active.error}
          </pre>
        )}

        <div className="grid gap-3 lg:grid-cols-2">
          <SnapshotBlock title="Input" value={active.inputSnapshot} />
          <SnapshotBlock title="Output" value={active.outputSnapshot} />
        </div>

        {logs.length > 0 && (
          <div className="mt-3">
            <p className={`mb-1 ${fieldLabel}`}>Logs</p>
            <LogLines logs={logs.slice(0, 5)} empty="-" />
          </div>
        )}
      </div>
    </div>
  );
}

const LOG_DOT: Record<string, string> = {
  info: "bg-white/20",
  warn: "bg-amber-400",
  error: "bg-red-400",
};

const LOG_TEXT: Record<string, string> = {
  info: "text-foreground/85",
  warn: "text-amber-300",
  error: "text-red-400",
};

/** Mono execution log with level dots, matching the editor's run output. */
function LogLines({ logs, empty, className = "" }: { logs: ExecutionNodeLog[]; empty: string; className?: string }) {
  return (
    <div role="log" className={`rounded-[8px] border border-white/[0.06] bg-[#0c0d10] px-2.5 py-1.5 font-mono text-[12px] ${className}`}>
      {logs.map((log, index) => {
        const level = log.level ?? "info";
        return (
          <div key={index} className="flex min-h-[22px] items-start gap-2.5 py-[3px] leading-4">
            <span className="w-[70px] shrink-0 tabular-nums text-muted-foreground/50">
              {log.timestamp ? formatTime(new Date(log.timestamp)) : empty}
            </span>
            <span aria-hidden className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${LOG_DOT[level] ?? LOG_DOT.info}`} />
            <span className="sr-only">{level}</span>
            <span className={`min-w-0 truncate ${LOG_TEXT[level] ?? LOG_TEXT.info}`}>{log.message ?? ""}</span>
          </div>
        );
      })}
    </div>
  );
}

function statusDotColor(status: string): string {
  if (status === "COMPLETED") return "#4ade80";
  if (status === "FAILED") return "#f87171";
  if (status === "RUNNING") return "#58d3db";
  if (status === "WAITING") return "#fbbf24";
  return "#a1a1aa";
}

function SnapshotBlock({ title, value }: { title: string; value: unknown }) {
  const json = stableJson(value ?? null).slice(0, 1800);
  return (
    <div className="min-w-0">
      <p className={`mb-1 ${fieldLabel}`}>
        {title}
      </p>
      <pre className="max-h-[220px] overflow-auto rounded-[8px] border border-white/[0.06] bg-[#0c0d10] p-2.5 font-mono text-[12px] leading-relaxed text-foreground/80">
        {json}
      </pre>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className={fieldLabel}>{label}</p>
      <p className="mt-0.5 truncate font-mono text-[14px] font-medium tabular-nums tracking-[-0.01em]">{value}</p>
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
    <div className="border-t border-white/[0.06] first:border-t-0">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex h-11 w-full items-center justify-between gap-3 px-3 text-left outline-none transition-colors duration-150 ease-out hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-4"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground/50">
            {index}
          </span>
          <span
            className={`inline-flex h-[22px] w-[104px] shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium ${cfg.border} ${cfg.bg} ${cfg.color}`}
          >
            <Icon
              size={11}
              className={`shrink-0 ${status === "RUNNING" ? "animate-spin motion-reduce:animate-none" : ""}`}
            />
            <span className="truncate">{status}</span>
          </span>
          <p className="min-w-0 truncate text-[13px] font-medium">{nodeType}</p>
          <p className="hidden shrink-0 font-mono text-[11.5px] text-muted-foreground/60 md:block">
            {nodeId.slice(0, 12)}...
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
            {formatDuration(duration)}
          </span>
          {expanded ? (
            <ChevronDown size={13} className="text-muted-foreground" />
          ) : (
            <ChevronRight size={13} className="text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-white/[0.06] bg-background/50 px-3 py-3 sm:px-4">
          {error && (
            <div>
              <p className={`mb-1 ${fieldLabel} text-red-400`}>Error</p>
              <pre className="overflow-x-auto rounded-[8px] border border-red-500/20 bg-red-500/[0.05] p-2.5 font-mono text-[12px] text-red-300/85">
                {error}
              </pre>
            </div>
          )}

          {logs.length > 0 && (
            <div>
              <p className={`mb-1 ${fieldLabel}`}>
                Logs
              </p>
              <LogLines logs={logs} empty="—" className="max-h-[180px] overflow-y-auto" />
            </div>
          )}

          {inputSnapshot != null && (
            <div>
              <p className={`mb-1 ${fieldLabel}`}>
                Input
              </p>
              <pre className="max-h-[200px] overflow-auto rounded-[8px] border border-white/[0.06] bg-[#0c0d10] p-2.5 font-mono text-[12px] leading-relaxed text-foreground/80">
                {JSON.stringify(inputSnapshot, null, 2)}
              </pre>
            </div>
          )}

          {outputSnapshot != null && (
            <div>
              <p className={`mb-1 ${fieldLabel}`}>
                Output
              </p>
              <pre className="max-h-[200px] overflow-auto rounded-[8px] border border-white/[0.06] bg-[#0c0d10] p-2.5 font-mono text-[12px] leading-relaxed text-foreground/80">
                {JSON.stringify(outputSnapshot, null, 2)}
              </pre>
            </div>
          )}

          <div className="flex items-center gap-4 font-mono text-[11px] tabular-nums text-muted-foreground/60">
            {startedAt && <span>Started: {formatTime(startedAt)}</span>}
            {completedAt && <span>Completed: {formatTime(completedAt)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
