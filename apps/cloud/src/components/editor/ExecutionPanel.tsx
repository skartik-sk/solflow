"use client";

// ExecutionPanel — bottom panel showing execution logs and node output.

import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Copy,
  ShieldCheck,
} from "lucide-react";
import { useEditorUIStore } from "@/store/editor-ui-store";
import { useExecutionStore } from "@/store/execution-store";
import type { NodeExecutionResult } from "@/store/execution-store";
import { useWorkflowStore } from "@/store/workflow-store";
import { trpc } from "@/lib/trpc/client";
import { edChipBtn, edGhostBtn, edIconBtn, edx } from "./editor-chrome";

const LOG_COLORS: Record<string, string> = {
  info: "text-foreground/85",
  warn: "text-amber-300",
  error: "text-red-400",
};

const LOG_DOT: Record<string, string> = {
  info: "bg-white/20",
  warn: "bg-amber-400",
  error: "bg-red-400",
};

const tabCls = (active: boolean) =>
  `ss-ed-tab relative flex h-9 items-center px-2.5 text-[12px] font-medium outline-none transition-colors duration-150 ease-out ${
    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
  }`;

const panelCard =
  "rounded-[10px] border border-white/[0.07] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

const TAB_LABELS = {
  executions: "Runs",
  simulation: "Preflight",
  logs: "Logs",
  output: "Output",
} as const;

type OutputView = "output" | "input" | "error" | "logs" | "timing" | "raw";

const OUTPUT_VIEW_LABELS: Record<OutputView, string> = {
  output: "Output",
  input: "Input",
  error: "Error",
  logs: "Logs",
  timing: "Timing",
  raw: "Raw",
};

export function ExecutionPanel() {
  const bottomPanelOpen = useEditorUIStore((s) => s.bottomPanelOpen);
  const bottomPanelTab = useEditorUIStore((s) => s.bottomPanelTab);
  const setBottomPanelTab = useEditorUIStore((s) => s.setBottomPanelTab);
  const openBottomPanelTab = useEditorUIStore((s) => s.openBottomPanelTab);
  const toggleBottomPanel = useEditorUIStore((s) => s.toggleBottomPanel);

  const status = useExecutionStore((s) => s.status);
  const executionId = useExecutionStore((s) => s.executionId);
  const simulationReport = useExecutionStore((s) => s.simulationReport);
  const logs = useExecutionStore((s) => s.logs);
  const nodeResults = useExecutionStore((s) => s.nodeResults);
  const [selectedOutputNodeId, setSelectedOutputNodeId] = React.useState("");
  const [outputView, setOutputView] = React.useState<OutputView>("output");
  const [bottomPanelHeight, setBottomPanelHeight] = React.useState(256);
  const isDraggingRef = React.useRef(false);
  const startYRef = React.useRef(0);
  const startHeightRef = React.useRef(0);
  const dragCleanupRef = React.useRef<(() => void) | null>(null);
  const latestLog = logs.at(-1);
  const resultValues = Array.from(nodeResults.values());
  const completedCount = resultValues.filter(
    (result) => result.status === "success",
  ).length;
  const failedCount = resultValues.filter(
    (result) => result.status === "error",
  ).length;
  const warningCount =
    (simulationReport?.warnings.length ?? 0) +
    (simulationReport?.blockers.length ?? 0);
  const selectedOutputResult =
    resultValues.find((result) => result.nodeId === selectedOutputNodeId) ??
    resultValues.find((result) => result.output !== undefined) ??
    resultValues[0];

  React.useEffect(() => {
    if (resultValues.length === 0) {
      setSelectedOutputNodeId("");
      return;
    }
    if (!selectedOutputResult) return;
    if (selectedOutputNodeId !== selectedOutputResult.nodeId) {
      setSelectedOutputNodeId(selectedOutputResult.nodeId);
    }
  }, [
    nodeResults,
    resultValues.length,
    selectedOutputNodeId,
    selectedOutputResult,
  ]);

  const onDragStart = React.useCallback(
    (event: React.MouseEvent | React.TouchEvent) => {
      event.preventDefault();
      dragCleanupRef.current?.();
      isDraggingRef.current = true;
      const clientY =
        "touches" in event ? event.touches[0].clientY : event.clientY;
      startYRef.current = clientY;
      startHeightRef.current = bottomPanelHeight;

      const onMove = (moveEvent: MouseEvent | TouchEvent) => {
        if (!isDraggingRef.current) return;
        const currentY =
          "touches" in moveEvent
            ? moveEvent.touches[0].clientY
            : moveEvent.clientY;
        const delta = startYRef.current - currentY;
        const nextHeight = Math.max(
          120,
          Math.min(window.innerHeight - 200, startHeightRef.current + delta),
        );
        setBottomPanelHeight(nextHeight);
      };

      let cleanup = () => {};
      const onUp = () => cleanup();

      cleanup = () => {
        isDraggingRef.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        dragCleanupRef.current = null;
      };

      dragCleanupRef.current = cleanup;
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onUp);
    },
    [bottomPanelHeight],
  );

  React.useEffect(() => {
    return () => dragCleanupRef.current?.();
  }, []);

  if (!bottomPanelOpen) {
    return (
      <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-border bg-card/95 shadow-[0_-10px_24px_rgba(0,0,0,0.25)] backdrop-blur">
        <div className="flex h-11 items-center justify-between gap-3 px-2">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => openBottomPanelTab("executions")}
              className={edx(edGhostBtn, "text-foreground")}
              title="Open run output"
            >
              <ChevronUp size={13} />
              Run output
            </button>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(status)}`} />
            <span className="shrink-0 text-[12px] text-muted-foreground">
              {status === "running"
                ? "Running"
                : status === "success"
                  ? "Completed"
                  : status === "error"
                    ? "Failed"
                    : "Idle"}
            </span>
            {resultValues.length > 0 && (
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/70">
                {completedCount} ok
                {failedCount ? `, ${failedCount} failed` : ""}
              </span>
            )}
            {warningCount > 0 && (
              <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 text-[11px] font-medium text-amber-300">
                {warningCount} preflight
              </span>
            )}
            <span className="hidden truncate font-mono text-[11.5px] text-muted-foreground/60 sm:inline">
              {latestLog
                ? latestLog.message
                : "Run or Preflight to see node logs, warnings, errors, and output."}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {(["executions", "simulation", "logs", "output"] as const).map(
              (tab) => (
                <button
                  key={tab}
                  onClick={() => openBottomPanelTab(tab)}
                  className={edGhostBtn}
                >
                  {TAB_LABELS[tab]}
                </button>
              ),
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 flex min-h-[120px] flex-col border-t border-border bg-card shadow-[0_-12px_30px_rgba(0,0,0,0.3)]"
      style={{ height: bottomPanelHeight }}
    >
      <div
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
        className="group absolute inset-x-0 -top-1 z-10 flex h-2 cursor-ns-resize items-center justify-center"
        title="Drag to resize output panel"
      >
        <div className="h-0.5 w-8 rounded-full bg-white/[0.08] transition-colors duration-150 ease-out group-hover:bg-primary/60" />
      </div>

      {/* Tab bar */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-1.5">
        <div role="tablist" aria-label="Run output" className="flex min-w-0 items-center">
          {(["executions", "simulation", "logs", "output"] as const).map(
            (tab) => (
              <button
                key={tab}
                onClick={() => setBottomPanelTab(tab)}
                role="tab"
                aria-selected={bottomPanelTab === tab}
                data-active={bottomPanelTab === tab}
                className={tabCls(bottomPanelTab === tab)}
              >
                {TAB_LABELS[tab]}
              </button>
            ),
          )}
          {status === "running" && (
            <span className="ml-2 inline-flex h-5 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2 text-[11px] font-medium text-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
              Running
            </span>
          )}
          {status === "success" && (
            <span className="ml-2 inline-flex h-5 items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-2 text-[11px] font-medium text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              Completed
            </span>
          )}
          {status === "error" && (
            <span className="ml-2 inline-flex h-5 items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2 text-[11px] font-medium text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              Failed
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {executionId && (
            <button
              onClick={() =>
                navigator.clipboard.writeText(
                  `solstudio cloud execution ${executionId}`,
                )
              }
              className={edChipBtn}
              title="Copy execution repro command"
            >
              <Copy size={11} />
              Repro
            </button>
          )}
          <button
            onClick={toggleBottomPanel}
            className={edIconBtn}
            title="Collapse output panel"
            aria-label="Collapse output panel"
          >
            <ChevronDown size={13} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-[#0c0d10] px-3 py-2 font-mono text-[12px]">
        {bottomPanelTab === "logs" && (
          <div role="log">
            {logs.length === 0 ? (
              <div className="flex h-[22px] items-center gap-2.5 text-muted-foreground/60">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white/10" />
                No logs yet. Run the workflow to see output.
              </div>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  className="-mx-1.5 flex min-h-[22px] items-start gap-2.5 rounded px-1.5 py-[3px] leading-4 hover:bg-white/[0.025]"
                >
                  <span className="shrink-0 tabular-nums text-muted-foreground/50">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    aria-hidden
                    className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${LOG_DOT[log.level] ?? LOG_DOT.info}`}
                  />
                  <span className="sr-only">{log.level}</span>
                  <span className={`min-w-0 break-words ${LOG_COLORS[log.level] ?? LOG_COLORS.info}`}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {bottomPanelTab === "executions" && (
          <div className="space-y-1">
            {nodeResults.size === 0 ? (
              <p className="py-1 text-muted-foreground/60">
                {status === "running"
                  ? "Run queued. Waiting for the first node result..."
                  : status === "error"
                    ? "No node results were recorded for this failed run. Check the Logs tab for the error."
                    : "No node results yet. Click Run to queue a manual execution."}
              </p>
            ) : (
              Array.from(nodeResults.values()).map((result) => (
                <div
                  key={result.nodeId}
                  className={`${panelCard} px-2.5 py-1.5`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(result.status)}`} />
                      <span className="block max-w-[260px] truncate text-foreground/90">
                        {result.nodeType ?? result.nodeId}
                      </span>
                      <span className="hidden truncate text-[11px] tabular-nums text-muted-foreground/50 sm:inline">
                        {result.nodeId.slice(0, 10)}...
                        {typeof result.duration === "number"
                          ? ` · ${result.duration}ms`
                          : ""}
                        {result.logs?.length
                          ? ` · ${result.logs.length} logs`
                          : ""}
                      </span>
                    </div>
                    <span
                      className={`text-[11px] font-medium ${statusColor(result.status)}`}
                    >
                      {result.status}
                    </span>
                  </div>
                  {result.error && (
                    <p className="mt-1 truncate pl-4 text-[11px] text-red-300/80">
                      {result.error}
                    </p>
                  )}
                </div>
              ))
            )}
            <RecentRuns />
          </div>
        )}

        {bottomPanelTab === "simulation" && (
          <div className="space-y-2 font-sans">
            {!simulationReport ? (
              <p className="py-1 font-mono text-muted-foreground/60">
                No preflight yet. Click Preflight or Run to check risk,
                warnings, blockers, and planned effects.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                  <SimulationMetric
                    label="Risk"
                    value={simulationReport.riskLevel}
                    tone={simulationReport.riskLevel}
                  />
                  <SimulationMetric
                    label="Fee"
                    value={`${simulationReport.estimatedFeeSol} SOL`}
                  />
                  <SimulationMetric
                    label="Nodes"
                    value={`${simulationReport.nodeCount}`}
                  />
                  <SimulationMetric
                    label="Wallet actions"
                    value={`${simulationReport.walletActions}`}
                  />
                  <SimulationMetric
                    label="External calls"
                    value={`${simulationReport.externalCalls}`}
                  />
                </div>

                {simulationReport.route.length > 0 && (
                  <div className={`${panelCard} flex flex-wrap items-center gap-1.5 p-2 text-[12px]`}>
                    {simulationReport.route.map((step, index) => (
                      <React.Fragment key={`${step}-${index}`}>
                        <span className="rounded-[5px] bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-foreground/80 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
                          {step}
                        </span>
                        {index < simulationReport.route.length - 1 && (
                          <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                )}

                {(simulationReport.blockers.length > 0 ||
                  simulationReport.warnings.length > 0) && (
                  <div className="grid gap-2 md:grid-cols-2">
                    {simulationReport.blockers.length > 0 && (
                      <SimulationNotice
                        icon={<AlertTriangle className="h-3.5 w-3.5" />}
                        title="Blocked"
                        tone="high"
                        items={simulationReport.blockers}
                      />
                    )}
                    {simulationReport.warnings.length > 0 && (
                      <SimulationNotice
                        icon={<ShieldCheck className="h-3.5 w-3.5" />}
                        title="Warnings"
                        tone="medium"
                        items={simulationReport.warnings}
                      />
                    )}
                  </div>
                )}

                {simulationReport.walletDeltas.length > 0 && (
                  <div className={`${panelCard} p-2.5`}>
                    <p className="mb-1.5 text-[12px] font-semibold text-foreground">
                      Wallet delta
                    </p>
                    <div className="space-y-1">
                      {simulationReport.walletDeltas.map((delta, index) => (
                        <div
                          key={index}
                          className="grid grid-cols-[120px_120px_1fr] gap-2 text-[12px]"
                        >
                          <span className="truncate font-mono text-muted-foreground">
                            {delta.asset}
                          </span>
                          <span
                            className={`font-mono tabular-nums ${
                              delta.change.startsWith("-")
                                ? "text-red-300"
                                : "text-green-400"
                            }`}
                          >
                            {delta.change}
                          </span>
                          <span className="text-muted-foreground">
                            {delta.reason}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className={`${panelCard} p-2.5`}>
                  <p className="mb-1.5 text-[12px] font-semibold text-foreground">
                    Planned effects
                  </p>
                  {simulationReport.transactionPlan.length > 0 ? (
                    <div className="space-y-1">
                      {simulationReport.transactionPlan.map((item) => (
                        <div
                          key={`${item.nodeId}-${item.type}`}
                          className="text-[12px]"
                        >
                          <span className="font-medium text-foreground">
                            {item.label}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}
                            - {item.effect}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="font-mono text-[11.5px] text-muted-foreground/70">
                      No transaction or wallet effects planned. This run only
                      reads data unless a later node is added.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {bottomPanelTab === "output" && (
          <div className="space-y-2 font-sans">
            {resultValues.length === 0 ? (
              <p className="py-1 font-mono text-muted-foreground/60">
                No output yet. Run the workflow to see node JSON output here.
              </p>
            ) : (
              <OutputInspector
                results={resultValues}
                selectedNodeId={selectedOutputResult?.nodeId ?? ""}
                selectedResult={selectedOutputResult}
                outputView={outputView}
                onSelectNode={setSelectedOutputNodeId}
                onSelectView={setOutputView}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OutputInspector({
  results,
  selectedNodeId,
  selectedResult,
  outputView,
  onSelectNode,
  onSelectView,
}: {
  results: NodeExecutionResult[];
  selectedNodeId: string;
  selectedResult?: NodeExecutionResult;
  outputView: OutputView;
  onSelectNode: (nodeId: string) => void;
  onSelectView: (view: OutputView) => void;
}) {
  const payload = formatOutputPayload(selectedResult, outputView);
  const hasPayload =
    payload !== null && payload !== undefined && payload !== "";

  const handleCopy = async () => {
    if (!selectedResult || typeof navigator === "undefined") return;
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor="ss-output-node"
          className="text-[11px] font-medium text-muted-foreground"
        >
          Node
        </label>
        <select
          id="ss-output-node"
          value={selectedNodeId}
          onChange={(event) => onSelectNode(event.target.value)}
          className="h-7 max-w-[260px] rounded-md border border-white/[0.08] bg-background/60 px-2 font-mono text-[11.5px] text-foreground outline-none transition-[border-color,box-shadow] duration-150 ease-out hover:border-white/[0.14] focus:border-primary/70 focus:ring-2 focus:ring-primary/20"
        >
          {results.map((result) => (
            <option key={result.nodeId} value={result.nodeId}>
              {result.nodeType ?? result.nodeId} · {result.status}
            </option>
          ))}
        </select>

        <div
          role="group"
          aria-label="Output view"
          className="flex h-7 items-center gap-0.5 rounded-lg bg-white/[0.035] p-0.5 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
        >
          {(Object.keys(OUTPUT_VIEW_LABELS) as OutputView[]).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => onSelectView(view)}
              aria-pressed={outputView === view}
              className={`h-6 rounded-md px-2 text-[11.5px] font-medium outline-none transition-[color,background-color,box-shadow] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
                outputView === view
                  ? "bg-[#23262c] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(255,255,255,0.07),0_1px_2px_rgba(0,0,0,0.4)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {OUTPUT_VIEW_LABELS[view]}
            </button>
          ))}
        </div>

        <span
          className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium ${statusColor(selectedResult?.status ?? "idle")}`}
        >
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${statusDot(selectedResult?.status ?? "idle")}`} />
          {selectedResult?.status ?? "idle"}
        </span>
        {typeof selectedResult?.duration === "number" && (
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {selectedResult.duration}ms
          </span>
        )}
        <button
          type="button"
          onClick={handleCopy}
          disabled={!hasPayload}
          className={edx(edChipBtn, "ml-auto")}
          title="Copy selected view JSON"
        >
          <Copy className="h-3 w-3" />
          Copy
        </button>
      </div>

      {hasPayload ? (
        <pre className="min-h-[145px] flex-1 overflow-auto rounded-[10px] border border-white/[0.07] bg-background/70 p-2.5 font-mono text-[12px] leading-relaxed text-foreground/90">
          {typeof payload === "string"
            ? payload
            : JSON.stringify(payload, null, 2)}
        </pre>
      ) : (
        <div className="flex min-h-[145px] flex-1 items-center justify-center rounded-[10px] border border-dashed border-white/[0.08] bg-background/40 p-3 font-mono text-[12px] text-muted-foreground/70">
          {emptyOutputMessage(outputView)}
        </div>
      )}
    </div>
  );
}

function formatOutputPayload(
  result: NodeExecutionResult | undefined,
  view: OutputView,
): unknown {
  if (!result) return null;
  if (view === "output") return result.output ?? null;
  if (view === "input") return result.input ?? null;
  if (view === "error") return result.error ? { message: result.error } : null;
  if (view === "logs") return result.logs?.length ? result.logs : null;
  if (view === "timing") {
    return {
      nodeId: result.nodeId,
      nodeType: result.nodeType,
      status: result.status,
      durationMs: result.duration ?? null,
      startedAt: result.startedAt
        ? new Date(result.startedAt).toISOString()
        : null,
      completedAt: result.completedAt
        ? new Date(result.completedAt).toISOString()
        : null,
    };
  }
  return {
    nodeId: result.nodeId,
    nodeType: result.nodeType,
    status: result.status,
    input: result.input ?? null,
    output: result.output ?? null,
    error: result.error ?? null,
    duration: result.duration ?? null,
    logs: result.logs ?? [],
    startedAt: result.startedAt ?? null,
    completedAt: result.completedAt ?? null,
  };
}

function emptyOutputMessage(view: OutputView): string {
  if (view === "output") return "This node has no output snapshot yet.";
  if (view === "input") return "This node has no input snapshot recorded.";
  if (view === "error") return "No error recorded for this node.";
  if (view === "logs") return "No per-node logs recorded.";
  return "No data recorded for this view.";
}

function statusDot(status: string): string {
  if (status === "success" || status === "completed") return "bg-green-400";
  if (status === "error" || status === "failed" || status === "timed_out") return "bg-red-400";
  if (status === "running") return "animate-pulse bg-primary motion-reduce:animate-none";
  return "bg-white/20";
}

function SimulationMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "low" | "medium" | "high";
}) {
  const toneClass =
    tone === "high"
      ? "text-red-300"
      : tone === "medium"
        ? "text-amber-300"
        : tone === "low"
          ? "text-green-400"
          : "text-foreground";
  return (
    <div className={`${panelCard} px-2.5 py-2`}>
      <p className="text-[11px] font-medium text-muted-foreground">
        {label}
      </p>
      <p className={`mt-0.5 truncate font-mono text-[13px] font-medium capitalize tabular-nums ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

function SimulationNotice({
  icon,
  title,
  tone,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "medium" | "high";
  items: string[];
}) {
  const cls =
    tone === "high"
      ? "border-red-500/30 bg-red-500/5 text-red-200"
      : "border-amber-500/30 bg-amber-500/5 text-amber-100";
  return (
    <div className={`rounded-[10px] border p-2.5 ${cls}`}>
      <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold">
        {icon}
        {title}
      </div>
      <ul className="space-y-0.5 text-[12px] leading-relaxed opacity-85">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** Runs of this workflow from any trigger (cron, webhook, manual), refreshed while visible. */
function RecentRuns() {
  const workflowId = useWorkflowStore((s) => s.workflowId);
  const { data } = trpc.execution.list.useQuery(
    { workflowId: workflowId ?? undefined, limit: 10 },
    { enabled: !!workflowId, refetchInterval: 5_000 },
  );
  const runs = data?.items ?? [];
  if (!workflowId || runs.length === 0) return null;
  return (
    <div className="pt-2 font-sans">
      <p className="pb-1 text-[12px] font-semibold text-foreground">
        Recent runs
      </p>
      {runs.map((run) => (
        <Link
          key={run.id}
          href={`/executions/${run.id}`}
          className="-mx-1 flex h-8 items-center justify-between gap-3 rounded-md border-t border-white/[0.05] px-2 outline-none transition-colors duration-150 ease-out first-of-type:border-t-0 hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(run.status.toLowerCase())}`} />
            <span className="truncate text-foreground/85 capitalize">{run.triggerType.toLowerCase()}</span>
            <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground/60">
              {timeAgo(run.startedAt ?? run.createdAt)}
            </span>
          </span>
          <span className={`text-[11.5px] font-medium ${statusColor(run.status.toLowerCase())}`}>
            {run.status.toLowerCase()}
          </span>
        </Link>
      ))}
    </div>
  );
}

function timeAgo(date: Date | string): string {
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 60_000) return `${Math.max(0, Math.floor(diff / 1000))}s ago`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

function statusColor(status: string): string {
  if (status === "success" || status === "completed") return "text-green-400";
  if (status === "error" || status === "failed" || status === "timed_out") return "text-red-400";
  if (status === "running") return "text-primary";
  if (status === "skipped") return "text-zinc-400";
  return "text-muted-foreground";
}
