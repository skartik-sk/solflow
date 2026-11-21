// apps/web/src/components/editor/BuildErrors.tsx
// Bottom panel "errors" tab — shows compiler errors and warnings.

"use client";

import { useCallback } from "react";
import { Copy, CheckCircle2, TriangleAlert } from "lucide-react";
import { useBuildStore } from "@/store/build-store";
import { toast } from "sonner";
import { EdEmptyState, edIconBtn, edx } from "@/components/ui-kit/editor-ui";

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
      <EdEmptyState icon={<TriangleAlert size={15} />}>
        Build errors and warnings will appear here.
      </EdEmptyState>
    );
  }

  if (
    compileStatus === "success" &&
    compileErrors.length === 0 &&
    compileWarnings.length === 0
  ) {
    return (
      <EdEmptyState tone="success" icon={<CheckCircle2 size={15} />}>
        Build succeeded — no errors or warnings
      </EdEmptyState>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Summary bar */}
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-border px-3 text-[12px] font-medium tabular-nums">
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
            <span className="text-muted-foreground animate-pulse motion-reduce:animate-none">
              Building…
            </span>
          )}
        {(compileErrors.length > 0 || compileWarnings.length > 0) && (
          <button
            onClick={handleCopy}
            title="Copy errors to clipboard"
            aria-label="Copy errors"
            className={edx(edIconBtn, "ml-auto h-6 w-6")}
          >
            <Copy size={12} />
          </button>
        )}
      </div>

      {/* Errors */}
      <div className="min-h-0 flex-1 divide-y divide-white/[0.05] overflow-y-auto bg-[#0c0d10]">
        {compileErrors.map((err, i) => (
          <div key={`err-${i}`} className="flex items-start gap-2.5 px-3 py-2 transition-colors duration-150 hover:bg-white/[0.02]">
            <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] bg-red-500/15 font-mono text-[10px] font-bold text-red-400">
              E
            </span>
            <span className="whitespace-pre-wrap break-all font-mono text-[12px] leading-[1.55] text-red-300">
              {err}
            </span>
          </div>
        ))}

        {compileWarnings.map((warn, i) => (
          <div key={`warn-${i}`} className="flex items-start gap-2.5 px-3 py-2 transition-colors duration-150 hover:bg-white/[0.02]">
            <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] bg-amber-500/15 font-mono text-[10px] font-bold text-amber-400">
              W
            </span>
            <span className="whitespace-pre-wrap break-all font-mono text-[12px] leading-[1.55] text-amber-200/85">
              {warn}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
