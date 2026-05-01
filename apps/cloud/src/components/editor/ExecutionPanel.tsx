"use client";

// ExecutionPanel — bottom panel showing execution logs and node output.

import React from "react";
import { AlertTriangle, ArrowRight, ChevronDown, Copy, ShieldCheck } from "lucide-react";
import { useEditorUIStore } from "@/store/editor-ui-store";
import { useExecutionStore } from "@/store/execution-store";

const LOG_COLORS: Record<string, string> = {
  info: "text-blue-400",
  warn: "text-amber-400",
  error: "text-red-400",
};

export function ExecutionPanel() {
  const bottomPanelOpen = useEditorUIStore((s) => s.bottomPanelOpen);
  const bottomPanelTab = useEditorUIStore((s) => s.bottomPanelTab);
  const setBottomPanelTab = useEditorUIStore((s) => s.setBottomPanelTab);
  const toggleBottomPanel = useEditorUIStore((s) => s.toggleBottomPanel);

  const status = useExecutionStore((s) => s.status);
  const executionId = useExecutionStore((s) => s.executionId);
  const simulationReport = useExecutionStore((s) => s.simulationReport);
  const logs = useExecutionStore((s) => s.logs);
  const nodeResults = useExecutionStore((s) => s.nodeResults);

  if (!bottomPanelOpen) return null;

  return (
    <div className="flex h-[260px] flex-col border-t border-border bg-card shadow-[0_-12px_30px_rgba(0,0,0,0.18)]">
      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-border px-2">
        <div className="flex items-center gap-1">
          {(["executions", "simulation", "logs", "output"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setBottomPanelTab(tab)}
              className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                bottomPanelTab === tab
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
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
              onClick={() => navigator.clipboard.writeText(`solstudio cloud execution ${executionId}`)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              title="Copy execution repro command"
            >
              <Copy size={11} />
              Repro
            </button>
          )}
          <button
            onClick={toggleBottomPanel}
            className="text-muted-foreground hover:text-foreground"
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
              <p className="text-muted-foreground/50">No logs yet. Run the workflow to see output.</p>
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
                No node results yet. Click Run to queue a manual execution.
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
                        {typeof result.duration === "number" ? ` · ${result.duration}ms` : ""}
                        {result.logs?.length ? ` · ${result.logs.length} logs` : ""}
                      </span>
                    </div>
                    <span className={`text-[10px] font-medium ${statusColor(result.status)}`}>
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
                No simulation yet. Click Simulate or Run to preflight the workflow.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                  <SimulationMetric label="Risk" value={simulationReport.riskLevel} tone={simulationReport.riskLevel} />
                  <SimulationMetric label="Fee" value={`${simulationReport.estimatedFeeSol} SOL`} />
                  <SimulationMetric label="Nodes" value={`${simulationReport.nodeCount}`} />
                  <SimulationMetric label="Wallet actions" value={`${simulationReport.walletActions}`} />
                  <SimulationMetric label="External calls" value={`${simulationReport.externalCalls}`} />
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

                {(simulationReport.blockers.length > 0 || simulationReport.warnings.length > 0) && (
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
                        <div key={index} className="grid grid-cols-[120px_120px_1fr] gap-2 text-[11px]">
                          <span className="truncate font-mono text-muted-foreground">{delta.asset}</span>
                          <span className={delta.change.startsWith("-") ? "text-red-300" : "text-emerald-300"}>
                            {delta.change}
                          </span>
                          <span className="text-muted-foreground">{delta.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {simulationReport.transactionPlan.length > 0 && (
                  <div className="rounded-md border border-border bg-background p-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Planned effects
                    </p>
                    <div className="space-y-1">
                      {simulationReport.transactionPlan.map((item) => (
                        <div key={`${item.nodeId}-${item.type}`} className="text-[11px]">
                          <span className="font-medium text-foreground">{item.label}</span>
                          <span className="text-muted-foreground"> - {item.effect}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {bottomPanelTab === "output" && (
          <div className="space-y-2">
            {nodeResults.size === 0 ? (
              <p className="text-muted-foreground/50">
                No output yet. Run the workflow to see node JSON output here.
              </p>
            ) : (
              (() => {
                const outputResults = Array.from(nodeResults.values()).filter((r) => r.output);
                if (outputResults.length === 0) {
                  return (
                    <p className="text-muted-foreground/50">
                      This run has node statuses but no JSON output yet. Check Executions or Logs.
                    </p>
                  );
                }
                return outputResults.map((result) => (
                  <div key={result.nodeId}>
                    <p className="text-muted-foreground/60 mb-0.5">
                      {result.nodeId.slice(0, 8)}...
                    </p>
                    <pre className="rounded-md bg-background p-2 text-[11px] overflow-x-auto">
                      {JSON.stringify(result.output, null, 2)}
                    </pre>
                  </div>
                ));
              })()
            )}
          </div>
        )}
      </div>
    </div>
  );
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
      <p className={`mt-0.5 truncate text-xs font-semibold ${toneClass}`}>{value}</p>
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
