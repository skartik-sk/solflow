// apps/web/src/components/editor/BuildConsole.tsx
// Bottom panel "console" tab — shows streaming compile/deploy logs.
// Subscribes to useBuildStore for real-time updates.

"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Search, X, Trash2, Copy } from "lucide-react";
import { useBuildStore } from "@/store/build-store";
import { openFloatingBrowser } from "@/store/floating-browser-store";
import { toast } from "sonner";
import { edIconBtnSm, edx } from "@/components/ui-kit/editor-ui";

const LEVEL_COLORS: Record<string, string> = {
  info: "text-foreground/85",
  warn: "text-amber-300",
  error: "text-red-400",
};

const LEVEL_DOT: Record<string, string> = {
  info: "bg-white/20",
  warn: "bg-amber-400",
  error: "bg-red-400",
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
      <div className="flex h-full flex-col bg-[#0c0d10] px-3 py-2.5 font-mono text-[12px]">
        <div className="flex h-[22px] items-center gap-2.5 text-muted-foreground/70">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white/20" />
          Console output will appear here during compile/deploy.
        </div>
        <div className="flex h-[22px] items-center gap-2.5 text-muted-foreground/45">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white/10" />
          <span>
            Press <span className="text-primary/80">Compile</span> in the top bar to start a build
          </span>
          <span aria-hidden className="h-3.5 w-[7px] animate-pulse bg-white/30 motion-reduce:animate-none" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#0c0d10] font-mono text-[12px]">
      {/* Status bar */}
      <div className="flex h-8 shrink-0 items-center gap-4 overflow-x-auto border-b border-white/[0.06] px-3 text-[11.5px] [scrollbar-width:none]">
        {compileStatus !== "idle" && (
          <span className="flex shrink-0 items-center gap-1.5">
            <StatusDot status={compileStatus} />
            <span className="text-muted-foreground">Compile:</span>
            <span className={statusColor(compileStatus)}>{compileStatus}</span>
          </span>
        )}
        {deployStatus !== "idle" && (
          <span className="flex shrink-0 items-center gap-1.5">
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
                <span className="inline-flex h-1 w-16 overflow-hidden rounded-full bg-white/10">
                  <span
                    className="rounded-full bg-primary transition-[width] duration-300 ease-out"
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
          <span className="ml-auto flex shrink-0 items-center gap-3 text-muted-foreground">
            <span>
              Program:{" "}
              {deployExplorerUrl ? (
                <button
                  onClick={() => openFloatingBrowser(deployExplorerUrl, `Program: ${deployedProgramId.slice(0, 8)}…`)}
                  className="cursor-pointer rounded-sm text-primary underline decoration-primary/30 underline-offset-2 outline-none hover:decoration-primary focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {deployedProgramId.slice(0, 8)}…
                </button>
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
                  <button
                    onClick={() => openFloatingBrowser(deployTxExplorerUrl, `TX: ${deployTxSignature.slice(0, 8)}…`)}
                    className="cursor-pointer rounded-sm text-primary underline decoration-primary/30 underline-offset-2 outline-none hover:decoration-primary focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {deployTxSignature.slice(0, 8)}…
                  </button>
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
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-white/[0.06] px-2">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter logs…"
            aria-label="Filter logs"
            className="h-6 w-full rounded-md border border-white/[0.07] bg-white/[0.02] pl-6 pr-6 font-sans text-[12px] outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-muted-foreground/60 hover:border-white/[0.12] focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear filter"
              className="absolute right-1 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <X size={10} />
            </button>
          )}
        </div>

        {/* Level filter pills */}
        <div role="group" aria-label="Log level" className="flex h-6 items-center gap-0.5 rounded-md bg-white/[0.03] p-0.5 font-sans shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
          {(["all", "info", "warn", "error"] as LogLevel[]).map((lv) => (
            <button
              key={lv}
              onClick={() => setLevelFilter(lv)}
              aria-pressed={levelFilter === lv}
              className={`h-5 rounded-[4px] px-1.5 text-[11px] font-medium outline-none transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-primary ${
                levelFilter === lv
                  ? "bg-[#23262c] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {lv === "all" ? "All" : lv.charAt(0).toUpperCase() + lv.slice(1)}
            </button>
          ))}
        </div>

        {/* Log count */}
        <span className="shrink-0 px-1 text-[11px] tabular-nums text-muted-foreground">
          {filteredLogs.length}/{compileLogs.length}
        </span>

        {/* Clear */}
        {compileLogs.length > 0 && (
          <>
            <button
              onClick={handleCopy}
              title="Copy logs to clipboard"
              aria-label="Copy logs"
              className={``}
            >
              <Copy size={12} />
            </button>
            <button
              onClick={clearLogs}
              title="Clear logs"
              aria-label="Clear logs"
              className={edx(edIconBtnSm, "hover:text-red-400")}
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>

      {/* Log lines */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2" role="log">
        {filteredLogs.length === 0 && compileLogs.length > 0 && (
          <p className="py-1 text-muted-foreground/70">
            No logs match &ldquo;{search}&rdquo;
            {levelFilter !== "all" ? ` (${levelFilter})` : ""}
          </p>
        )}
        {filteredLogs.map((log, i) => (
          <div key={i} className="-mx-1.5 flex min-h-[22px] items-start gap-2.5 rounded px-1.5 py-[3px] leading-4 hover:bg-white/[0.025]">
            <span className="shrink-0 tabular-nums text-muted-foreground/50">
              {formatTime(log.timestamp)}
            </span>
            <span
              aria-hidden
              className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${LEVEL_DOT[log.level] ?? LEVEL_DOT.info}`}
            />
            <span className={`min-w-0 break-words ${LEVEL_COLORS[log.level] ?? LEVEL_COLORS.info}`}>
              <LogLine text={log.line} highlight={search} />
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const URL_RE = /(https?:\/\/[^\s]+)/g;

/** Renders log text with clickable URLs that open in the floating browser. */
function LogLine({ text, highlight }: { text: string; highlight?: string }) {
  const parts = text.split(URL_RE);
  if (parts.length <= 1) {
    return <>{highlight ? highlightMatch(text, highlight) : text}</>;
  }
  return (
    <>
      {parts.map((part, i) => {
        if (URL_RE.test(part)) {
          URL_RE.lastIndex = 0;
          return (
            <button
              key={i}
              onClick={() => openFloatingBrowser(part)}
              className="cursor-pointer rounded-sm text-primary underline decoration-primary/30 underline-offset-2 outline-none hover:decoration-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              {part}
            </button>
          );
        }
        URL_RE.lastIndex = 0;
        return <span key={i}>{highlight ? highlightMatch(part, highlight) : part}</span>;
      })}
    </>
  );
}

/** Highlights matching text with a background color. */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="rounded-sm bg-yellow-400/25 text-yellow-300">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}

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

  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full motion-reduce:animate-none ${color}`} />;
}
