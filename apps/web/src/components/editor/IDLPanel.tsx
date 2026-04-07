// apps/web/src/components/editor/IDLPanel.tsx
// Bottom-panel "idl" tab — shows the generated Anchor IDL and Codama IDL
// from the current IR. Users can view, copy, and download both formats.

"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useCodeStore } from "@/store/code-store";
import { useProjectStore } from "@/store/project-store";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type IdlFormat = "anchor" | "codama";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function downloadJson(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function IDLPanel() {
  const irJson = useCodeStore((s) => s.irJson);
  const projectName = useProjectStore((s) => s.projectName);

  const [format, setFormat] = useState<IdlFormat>("anchor");
  const [idlJson, setIdlJson] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Generate IDL when IR or format changes
  useEffect(() => {
    if (!irJson) {
      setIdlJson(null);
      setError(null);
      return;
    }

    (async () => {
      try {
        if (format === "anchor") {
          const { irToAnchorIDL } = await import("@solflow/sdk-gen");
          const idl = irToAnchorIDL(irJson);
          setIdlJson(JSON.stringify(idl, null, 2));
          setError(null);
        } else {
          const { irToCodamaIDL } = await import("@solflow/sdk-gen");
          const root = irToCodamaIDL(irJson);
          setIdlJson(JSON.stringify(root, null, 2));
          setError(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "IDL generation failed");
        setIdlJson(null);
      }
    })();
  }, [irJson, format]);

  const slug = useMemo(
    () => (projectName ?? "program").toLowerCase().replace(/\s+/g, "-"),
    [projectName],
  );

  const handleCopy = useCallback(async () => {
    if (!idlJson) return;
    await navigator.clipboard.writeText(idlJson);
    setCopied(true);
    toast.success("IDL copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  }, [idlJson]);

  const handleDownload = useCallback(() => {
    if (!idlJson) return;
    const ext = format === "anchor" ? "anchor-idl" : "codama-idl";
    downloadJson(idlJson, `${slug}-${ext}.json`);
    toast.success(`${format === "anchor" ? "Anchor" : "Codama"} IDL downloaded`);
  }, [idlJson, format, slug]);

  // Parse IDL to show summary
  const idlSummary = useMemo(() => {
    if (!idlJson) return null;
    try {
      const parsed = JSON.parse(idlJson);
      if (format === "anchor") {
        const instructions = parsed.instructions?.length ?? 0;
        const accounts = parsed.accounts?.length ?? 0;
        const types = parsed.types?.length ?? 0;
        const events = parsed.events?.length ?? 0;
        const errors = parsed.errors?.length ?? 0;
        const name = parsed.name ?? parsed.metadata?.name ?? "unknown";
        const version =
          parsed.version ?? parsed.metadata?.version ?? "0.1.0";
        return { name, version, instructions, accounts, types, events, errors };
      } else {
        // Codama
        const instructions =
          parsed.instructions?.items?.length ??
          parsed.instructions?.length ??
          0;
        const accounts =
          parsed.accounts?.items?.length ??
          parsed.accounts?.length ??
          0;
        const name = parsed.name ?? "unknown";
        return { name, version: parsed.version ?? "-", instructions, accounts };
      }
    } catch {
      return null;
    }
  }, [idlJson, format]);

  if (!irJson) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <div className="text-3xl text-muted-foreground/30">{"{ }"}</div>
        <p>Add nodes to the canvas to generate an IDL.</p>
        <p className="text-xs text-muted-foreground/60">
          The IDL is automatically derived from your program&apos;s IR
          (instructions, accounts, types).
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: Summary + Controls ─────────────────────────── */}
      <div className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            IDL
          </span>
          {/* Format toggle */}
          <div className="flex rounded border border-border overflow-hidden">
            <button
              onClick={() => setFormat("anchor")}
              className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                format === "anchor"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              Anchor
            </button>
            <button
              onClick={() => setFormat("codama")}
              className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                format === "codama"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              Codama
            </button>
          </div>
        </div>

        {/* Summary */}
        {idlSummary && (
          <div className="shrink-0 border-b border-border px-3 py-3 space-y-1.5">
            <p className="font-mono text-xs font-semibold text-foreground">
              {idlSummary.name}
            </p>
            <p className="text-[10px] text-muted-foreground">
              v{idlSummary.version}
            </p>
            <div className="mt-2 space-y-1">
              <SummaryRow label="Instructions" count={idlSummary.instructions} />
              <SummaryRow label="Accounts" count={idlSummary.accounts} />
              {format === "anchor" && (
                <>
                  <SummaryRow label="Types" count={idlSummary.types} />
                  <SummaryRow
                    label="Events"
                    count={(idlSummary as any).events}
                  />
                  <SummaryRow
                    label="Errors"
                    count={(idlSummary as any).errors}
                  />
                </>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto shrink-0 border-t border-border p-2 space-y-1">
          <button
            onClick={handleCopy}
            disabled={!idlJson}
            className="w-full rounded border border-border bg-background px-2 py-1 text-[10px] text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left"
          >
            {copied ? "Copied!" : "Copy to clipboard"}
          </button>
          <button
            onClick={handleDownload}
            disabled={!idlJson}
            className="w-full rounded border border-primary/40 bg-primary/10 px-2 py-1 text-[10px] text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left"
          >
            Download {format === "anchor" ? "Anchor" : "Codama"} IDL
          </button>
        </div>
      </div>

      {/* ── Right: IDL JSON viewer ──────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {error ? (
          <div className="flex h-full items-center justify-center p-4">
            <div className="rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400 max-w-lg">
              <p className="font-semibold mb-1">IDL Generation Error</p>
              <pre className="whitespace-pre-wrap">{error}</pre>
            </div>
          </div>
        ) : idlJson ? (
          <>
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-2">
              <span className="font-mono text-xs text-muted-foreground">
                {slug}-{format === "anchor" ? "anchor" : "codama"}-idl.json
              </span>
              <span className="text-[10px] text-muted-foreground/60">
                {idlJson.length.toLocaleString()} chars
              </span>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-foreground/90">
              {idlJson}
            </pre>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Generating IDL…
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryRow({ label, count }: { label: string; count: number }) {
  if (!count) return null;
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{count}</span>
    </div>
  );
}
