"use client";

// ExecutionPanel — bottom panel showing execution logs and node output.

import React from "react";
import { X, Terminal, ChevronDown, ChevronUp } from "lucide-react";
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
  const logs = useExecutionStore((s) => s.logs);
  const nodeResults = useExecutionStore((s) => s.nodeResults);

  if (!bottomPanelOpen) return null;

  return (
    <div className="flex h-[200px] flex-col border-t border-border bg-card">
      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-border px-2">
        <div className="flex items-center gap-1">
          {(["executions", "logs", "output"] as const).map((tab) => (
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
        <button
          onClick={toggleBottomPanel}
          className="text-muted-foreground hover:text-foreground"
        >
          <ChevronDown size={13} />
        </button>
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
              <p className="text-muted-foreground/50">No executions yet.</p>
            ) : (
              Array.from(nodeResults.values()).map((result) => (
                <div
                  key={result.nodeId}
                  className="flex items-center justify-between rounded-md border border-border px-2 py-1"
                >
                  <span className="truncate max-w-[200px]">{result.nodeId.slice(0, 8)}...</span>
                  <span
                    className={`text-[10px] font-medium ${
                      result.status === "success"
                        ? "text-emerald-400"
                        : result.status === "error"
                          ? "text-red-400"
                          : result.status === "running"
                            ? "text-blue-400"
                            : "text-muted-foreground"
                    }`}
                  >
                    {result.status}
                  </span>
                  {result.completedAt && result.startedAt && (
                    <span className="text-[10px] text-muted-foreground/50">
                      {result.completedAt - result.startedAt}ms
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {bottomPanelTab === "output" && (
          <div className="space-y-2">
            {nodeResults.size === 0 ? (
              <p className="text-muted-foreground/50">No output yet. Run the workflow to see results.</p>
            ) : (
              Array.from(nodeResults.values())
                .filter((r) => r.output)
                .map((result) => (
                  <div key={result.nodeId}>
                    <p className="text-muted-foreground/60 mb-0.5">
                      {result.nodeId.slice(0, 8)}...
                    </p>
                    <pre className="rounded-md bg-background p-2 text-[11px] overflow-x-auto">
                      {JSON.stringify(result.output, null, 2)}
                    </pre>
                  </div>
                ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
