"use client";

// ExecutionPanel — bottom panel showing execution logs and node output.

import React from "react";
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

const LOG_COLORS: Record<string, string> = {
  info: "text-blue-400",
  warn: "text-amber-400",
  error: "text-red-400",
};

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

  if (!bottomPanelOpen) {
    return (
      <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-border bg-card/95 shadow-[0_-10px_24px_rgba(0,0,0,0.18)] backdrop-blur">
        <div className="flex h-11 items-center justify-between gap-3 px-2">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => openBottomPanelTab("executions")}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Open run output"
            >
              <ChevronUp size={13} />
              Run output
            </button>
            <span className={`h-2 w-2 rounded-full ${statusDot(status)}`} />
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {status === "running"
                ? "Running"
                : status === "success"
                  ? "Completed"
                  : status === "error"
                    ? "Failed"
                    : "Idle"}
            </span>
            {resultValues.length > 0 && (
              <span className="shrink-0 text-[11px] text-muted-foreground/70">
                {completedCount} ok
                {failedCount ? `, ${failedCount} failed` : ""}
              </span>
            )}
            {warningCount > 0 && (
              <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                {warningCount} preflight
              </span>
            )}
            <span className="truncate font-mono text-[11px] text-muted-foreground/60">
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
                  className="h-7 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
    <div className="absolute bottom-0 left-0 right-0 z-20 flex h-[260px] flex-col border-t border-border bg-card shadow-[0_-12px_30px_rgba(0,0,0,0.18)]">
      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-border px-2">
        <div className="flex items-center gap-1">
          {(["executions", "simulation", "logs", "output"] as const).map(
            (tab) => (
              <button
                key={tab}
                onClick={() => setBottomPanelTab(tab)}
                className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  bottomPanelTab === tab
                    ? "text-foreground border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ),
          )}
          {status === "running" && (
            <span className="ml-2 flex items-center gap-1 text-[10px] text-blue-400">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
              Running
            </span>
          )}
          {status === "success" && (
            <span className="ml-2 text-[10px] text-emerald-400">Completed</span>
          )}
          {status === "error" && (
            <span className="ml-2 text-[10px] text-red-400">Failed</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {executionId && (
            <button
              onClick={() =>
                navigator.clipboard.writeText(
                  `solstudio cloud execution ${executionId}`,
                )
              }
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              title="Copy execution repro command"
            >
              <Copy size={11} />
              Repro
            </button>
          )}
          <button
            onClick={toggleBottomPanel}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Collapse output panel"
          >
            <ChevronDown size={13} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px]">
        {bottomPanelTab === "logs" && (
          <div className="space-y-0.5">
            {logs.length === 0 ? (
              <p className="text-muted-foreground/50">
                No logs yet. Run the workflow to see output.
              </p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-muted-foreground/40 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={LOG_COLORS[log.level]}>
                    [{log.level.toUpperCase()}]
                  </span>
                  <span>{log.message}</span>
                </div>
              ))
            )}
          </div>
        )}

        {bottomPanelTab === "executions" && (
          <div className="space-y-1">
            {nodeResults.size === 0 ? (
              <p className="text-muted-foreground/50">
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
                  className="rounded-md border border-border px-2 py-1.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="block truncate max-w-[260px]">
                        {result.nodeType ?? result.nodeId}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">
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
                      className={`text-[10px] font-medium ${statusColor(result.status)}`}
                    >
                      {result.status}
                    </span>
                  </div>
                  {result.error && (
                    <p className="mt-1 truncate text-[10px] text-red-300/80">
                      {result.error}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {bottomPanelTab === "simulation" && (
          <div className="space-y-2 font-sans">
            {!simulationReport ? (
              <p className="font-mono text-muted-foreground/50">
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
                  <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background p-2 text-[11px]">
                    {simulationReport.route.map((step, index) => (
                      <React.Fragment key={`${step}-${index}`}>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
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
                  <div className="rounded-md border border-border bg-background p-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Wallet delta
                    </p>
                    <div className="space-y-1">
                      {simulationReport.walletDeltas.map((delta, index) => (
                        <div
                          key={index}
                          className="grid grid-cols-[120px_120px_1fr] gap-2 text-[11px]"
                        >
                          <span className="truncate font-mono text-muted-foreground">
                            {delta.asset}
                          </span>
                          <span
                            className={
                              delta.change.startsWith("-")
                                ? "text-red-300"
                                : "text-emerald-300"
                            }
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

                <div className="rounded-md border border-border bg-background p-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Planned effects
                  </p>
                  {simulationReport.transactionPlan.length > 0 ? (
                    <div className="space-y-1">
                      {simulationReport.transactionPlan.map((item) => (
                        <div
                          key={`${item.nodeId}-${item.type}`}
                          className="text-[11px]"
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
                    <p className="font-mono text-[11px] text-muted-foreground/60">
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
              <p className="text-muted-foreground/50">
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
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Node
        </label>
        <select
          value={selectedNodeId}
          onChange={(event) => onSelectNode(event.target.value)}
          className="h-7 max-w-[260px] rounded-md border border-border bg-background px-2 font-mono text-[11px] text-foreground outline-none focus:border-primary"
        >
          {results.map((result) => (
            <option key={result.nodeId} value={result.nodeId}>
              {result.nodeType ?? result.nodeId} · {result.status}
            </option>
          ))}
        </select>

        <div className="flex items-center rounded-md border border-border bg-background p-0.5">
          {(Object.keys(OUTPUT_VIEW_LABELS) as OutputView[]).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => onSelectView(view)}
              className={`h-6 rounded px-2 text-[10px] font-semibold transition-colors ${
                outputView === view
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {OUTPUT_VIEW_LABELS[view]}
            </button>
          ))}
        </div>

        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusColor(selectedResult?.status ?? "idle")}`}
        >
          {selectedResult?.status ?? "idle"}
        </span>
        {typeof selectedResult?.duration === "number" && (
          <span className="text-[10px] text-muted-foreground">
            {selectedResult.duration}ms
          </span>
        )}
        <button
          type="button"
          onClick={handleCopy}
          disabled={!hasPayload}
          className="ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          title="Copy selected view JSON"
        >
          <Copy className="h-3 w-3" />
          Copy
        </button>
      </div>

      {hasPayload ? (
        <pre className="min-h-[145px] flex-1 overflow-auto rounded-md bg-background p-2 font-mono text-[11px] leading-relaxed">
          {typeof payload === "string"
            ? payload
            : JSON.stringify(payload, null, 2)}
        </pre>
      ) : (
        <div className="flex min-h-[145px] flex-1 items-center rounded-md border border-dashed border-border bg-background p-3 font-mono text-[11px] text-muted-foreground/60">
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
  if (status === "success") return "bg-emerald-400";
  if (status === "error") return "bg-red-400";
  if (status === "running") return "animate-pulse bg-blue-400";
  return "bg-muted-foreground/40";
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
          ? "text-emerald-300"
          : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {label}
      </p>
      <p className={`mt-0.5 truncate text-xs font-semibold ${toneClass}`}>
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
    <div className={`rounded-md border p-2 ${cls}`}>
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
        {icon}
        {title}
      </div>
      <ul className="space-y-0.5 text-[11px] leading-relaxed text-current/80">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function statusColor(status: string): string {
  if (status === "success") return "text-emerald-400";
  if (status === "error") return "text-red-400";
  if (status === "running") return "text-blue-400";
  if (status === "skipped") return "text-zinc-400";
  return "text-muted-foreground";
}
