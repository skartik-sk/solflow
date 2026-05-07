// apps/web/src/components/editor/BuildErrors.tsx
// Bottom panel "errors" tab — shows compiler errors and warnings.

"use client";

import { useCallback } from "react";
import { Copy } from "lucide-react";
import { useBuildStore } from "@/store/build-store";
import { toast } from "sonner";

export function BuildErrors() {
  const compileErrors = useBuildStore((s) => s.compileErrors);
  const compileWarnings = useBuildStore((s) => s.compileWarnings);
  const compileStatus = useBuildStore((s) => s.compileStatus);

  const handleCopy = useCallback(async () => {
    const lines = [
      ...compileErrors.map((e) => `ERROR: ${e}`),
      ...compileWarnings.map((w) => `WARN: ${w}`),
    ];
    if (lines.length === 0) return;
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Errors copied");
  }, [compileErrors, compileWarnings]);

  if (
    compileStatus === "idle" &&
    compileErrors.length === 0 &&
    compileWarnings.length === 0
  ) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Build errors and warnings will appear here.
      </div>
    );
  }

  if (
    compileStatus === "success" &&
    compileErrors.length === 0 &&
    compileWarnings.length === 0
  ) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm">
        <div className="text-2xl">✓</div>
        <p className="font-medium text-green-400">
          Build succeeded — no errors or warnings
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Summary bar */}
      <div className="flex shrink-0 items-center gap-4 border-b border-border px-4 py-2 text-xs">
        {compileErrors.length > 0 && (
          <span className="text-red-400">
            {compileErrors.length} error{compileErrors.length !== 1 ? "s" : ""}
          </span>
        )}
        {compileWarnings.length > 0 && (
          <span className="text-yellow-400">
            {compileWarnings.length} warning
            {compileWarnings.length !== 1 ? "s" : ""}
          </span>
        )}
        {compileErrors.length === 0 &&
          compileWarnings.length === 0 &&
          compileStatus === "building" && (
            <span className="text-muted-foreground animate-pulse">
              Building…
            </span>
          )}
        {(compileErrors.length > 0 || compileWarnings.length > 0) && (
          <button
            onClick={handleCopy}
            title="Copy errors to clipboard"
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
          >
            <Copy size={12} />
          </button>
        )}
      </div>

      {/* Errors */}
      <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-border/50">
        {compileErrors.map((err, i) => (
          <div key={`err-${i}`} className="flex items-start gap-3 px-4 py-2.5">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-[10px] font-bold text-red-400">
              E
            </span>
            <span className="font-mono text-xs text-red-300 break-all">
              {err}
            </span>
          </div>
        ))}

        {compileWarnings.map((warn, i) => (
          <div key={`warn-${i}`} className="flex items-start gap-3 px-4 py-2.5">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-yellow-500/20 text-[10px] font-bold text-yellow-400">
              W
            </span>
            <span className="font-mono text-xs text-yellow-300/80 break-all">
              {warn}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
