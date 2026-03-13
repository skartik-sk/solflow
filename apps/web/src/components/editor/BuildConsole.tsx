// apps/web/src/components/editor/BuildConsole.tsx
// Bottom panel "console" tab — shows streaming compile/deploy logs.
// Subscribes to useBuildStore for real-time updates.

"use client";

import { useEffect, useRef } from "react";
import { useBuildStore } from "@/store/build-store";

const LEVEL_COLORS: Record<string, string> = {
  info: "text-foreground/80",
  warn: "text-yellow-400",
  error: "text-red-400",
};

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
  const deployedProgramId = useBuildStore((s) => s.deployedProgramId);
  const deployExplorerUrl = useBuildStore((s) => s.deployExplorerUrl);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [compileLogs]);

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
          </span>
        )}
        {deployedProgramId && (
          <span className="ml-auto text-muted-foreground/60">
            Program ID:{" "}
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
        )}
      </div>

      {/* Log lines */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {compileLogs.map((log, i) => (
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
      return "text-green-400";
    case "error":
    case "failed":
      return "text-red-400";
    case "building":
    case "running":
    case "deploying":
    case "confirming":
      return "text-yellow-400";
    default:
      return "text-muted-foreground";
  }
}

function StatusDot({ status }: { status: string }) {
  const color =
    {
      success: "bg-green-400",
      passed: "bg-green-400",
      error: "bg-red-400",
      failed: "bg-red-400",
      building: "bg-yellow-400 animate-pulse",
      running: "bg-yellow-400 animate-pulse",
      deploying: "bg-yellow-400 animate-pulse",
      confirming: "bg-blue-400 animate-pulse",
      queued: "bg-muted-foreground animate-pulse",
    }[status] ?? "bg-muted-foreground";

  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
}
