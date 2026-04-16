// apps/web/src/components/editor/BuildConsole.tsx
// Bottom panel "console" tab — shows streaming compile/deploy logs.
// Subscribes to useBuildStore for real-time updates.

"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Search, X, Trash2, Copy } from "lucide-react";
import { useBuildStore } from "@/store/build-store";
import { toast } from "sonner";

const LEVEL_COLORS: Record<string, string> = {
  info: "text-foreground/80",
  warn: "text-yellow-400",
  error: "text-red-400",
};

type LogLevel = "all" | "info" | "warn" | "error";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function BuildConsole() {
  const compileStatus = useBuildStore((s) => s.compileStatus);
  const compileLogs = useBuildStore((s) => s.compileLogs);
  const deployStatus = useBuildStore((s) => s.deployStatus);
  const deployPhase = useBuildStore((s) => s.deployPhase);
  const deployProgress = useBuildStore((s) => s.deployProgress);
  const deployedProgramId = useBuildStore((s) => s.deployedProgramId);
  const deployExplorerUrl = useBuildStore((s) => s.deployExplorerUrl);
  const deployTxSignature = useBuildStore((s) => s.deployTxSignature);
  const deployTxExplorerUrl = useBuildStore((s) => s.deployTxExplorerUrl);
  const clearLogs = useBuildStore((s) => s.clearLogs);

  const bottomRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<LogLevel>("all");

  // Copy all logs to clipboard
  const handleCopy = useCallback(async () => {
    const text = compileLogs
      .map((l) => `[${formatTime(l.timestamp)}] ${l.line}`)
      .join("\n");
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.success("Logs copied");
  }, [compileLogs]);

  // Filter logs by search term and level
  const filteredLogs = useMemo(() => {
    let logs = compileLogs;
    if (levelFilter !== "all") {
      logs = logs.filter((l) => l.level === levelFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      logs = logs.filter((l) => l.line.toLowerCase().includes(q));
    }
    return logs;
  }, [compileLogs, search, levelFilter]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filteredLogs]);

  const isIdle = compileStatus === "idle" && deployStatus === "idle";

  if (isIdle && compileLogs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Console output will appear here during compile/deploy.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#0d0d0d] font-mono text-xs">
      {/* Status bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 bg-card/50 px-3 py-1.5 text-[11px]">
        {compileStatus !== "idle" && (
          <span className="flex items-center gap-1.5">
            <StatusDot status={compileStatus} />
            <span className="text-muted-foreground">Compile:</span>
            <span className={statusColor(compileStatus)}>{compileStatus}</span>
          </span>
        )}
        {deployStatus !== "idle" && (
          <span className="flex items-center gap-1.5">
            <StatusDot status={deployStatus} />
            <span className="text-muted-foreground">Deploy:</span>
            <span className={statusColor(deployStatus)}>
              {deployPhase ?? deployStatus}
            </span>
            {deployProgress && deployPhase === "writing" && (
              <span className="ml-1 flex items-center gap-1.5">
                <span className="text-muted-foreground/60">
                  {deployProgress.current}/{deployProgress.total}
                </span>
                <span className="inline-flex h-1.5 w-16 overflow-hidden rounded-full bg-muted-foreground/20">
                  <span
                    className="rounded-full bg-yellow-400 transition-all duration-300"
                    style={{
                      width: `${Math.round((deployProgress.current / deployProgress.total) * 100)}%`,
                    }}
                  />
                </span>
                <span className="text-muted-foreground/50 text-[10px]">
                  {Math.round((deployProgress.current / deployProgress.total) * 100)}%
                </span>
              </span>
            )}
          </span>
        )}
        {deployedProgramId && (
          <span className="ml-auto flex items-center gap-3 text-muted-foreground/60">
            <span>
              Program:{" "}
              {deployExplorerUrl ? (
                <a
                  href={deployExplorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 underline hover:text-blue-300"
                >
                  {deployedProgramId.slice(0, 8)}…
                </a>
              ) : (
                <span className="text-foreground/70">
                  {deployedProgramId.slice(0, 8)}…
                </span>
              )}
            </span>
            {deployTxSignature && (
              <span>
                TX:{" "}
                {deployTxExplorerUrl ? (
                  <a
                    href={deployTxExplorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-400 underline hover:text-blue-300"
                  >
                    {deployTxSignature.slice(0, 8)}…
                  </a>
                ) : (
                  <span className="text-foreground/70">
                    {deployTxSignature.slice(0, 8)}…
                  </span>
                )}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/30 px-3 py-1">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter logs…"
            className="w-full rounded border border-border/40 bg-background/50 py-0.5 pl-6 pr-5 text-[11px] outline-none focus:border-primary/50"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
            >
              <X size={10} />
            </button>
          )}
        </div>

        {/* Level filter pills */}
        <div className="flex rounded border border-border/40 overflow-hidden">
          {(["all", "info", "warn", "error"] as LogLevel[]).map((lv) => (
            <button
              key={lv}
              onClick={() => setLevelFilter(lv)}
              className={`px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                levelFilter === lv
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:bg-accent/50"
              }`}
            >
              {lv === "all" ? "All" : lv.charAt(0).toUpperCase() + lv.slice(1)}
            </button>
          ))}
        </div>

        {/* Log count */}
        <span className="text-[10px] text-muted-foreground/50 shrink-0">
          {filteredLogs.length}/{compileLogs.length}
        </span>

        {/* Clear */}
        {compileLogs.length > 0 && (
          <>
            <button
              onClick={handleCopy}
              title="Copy logs to clipboard"
              className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors"
            >
              <Copy size={12} />
            </button>
            <button
              onClick={clearLogs}
              title="Clear logs"
              className="shrink-0 text-muted-foreground/40 hover:text-red-400 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>

      {/* Log lines */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {filteredLogs.length === 0 && compileLogs.length > 0 && (
          <p className="text-muted-foreground/40 py-2">
            No logs match &ldquo;{search}&rdquo;
            {levelFilter !== "all" ? ` (${levelFilter})` : ""}
          </p>
        )}
        {filteredLogs.map((log, i) => (
          <div key={i} className="flex gap-2 leading-5">
            <span className="shrink-0 text-muted-foreground/40">
              {formatTime(log.timestamp)}
            </span>
            <span className={LEVEL_COLORS[log.level] ?? LEVEL_COLORS.info}>
              {log.line}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(s: string): string {
  switch (s) {
    case "success":
    case "passed":
    case "complete":
      return "text-green-400";
    case "error":
    case "failed":
      return "text-red-400";
    case "building":
    case "running":
    case "deploying":
    case "confirming":
      return "text-yellow-400";
    case "writing":
    case "buffer":
    case "cleanup":
      return "text-blue-400";
    default:
      return "text-muted-foreground";
  }
}

function StatusDot({ status }: { status: string }) {
  const color =
    {
      success: "bg-green-400",
      passed: "bg-green-400",
      complete: "bg-green-400",
      error: "bg-red-400",
      failed: "bg-red-400",
      building: "bg-yellow-400 animate-pulse",
      running: "bg-yellow-400 animate-pulse",
      deploying: "bg-yellow-400 animate-pulse",
      confirming: "bg-blue-400 animate-pulse",
      writing: "bg-blue-400 animate-pulse",
      buffer: "bg-yellow-400 animate-pulse",
      cleanup: "bg-blue-400 animate-pulse",
      queued: "bg-muted-foreground animate-pulse",
    }[status] ?? "bg-muted-foreground";

  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
}
