// apps/web/src/components/editor/SDKPanel.tsx
// Bottom panel "sdk" tab — generates and downloads a TypeScript SDK via Codama.
// Also provides one-click IDL export (Anchor IDL + Codama IDL JSON).

"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useProjectStore } from "@/store/project-store";
import { useCodeStore } from "@/store/code-store";
import { toast } from "sonner";

interface GeneratedFile {
  path: string;
  content: string;
}

interface SDKResult {
  files: GeneratedFile[];
  packageName: string;
  idlJson: string;
  downloadUrl: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function downloadJson(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SDKPanel() {
  const projectId = useProjectStore((s) => s.projectId);
  const projectName = useProjectStore((s) => s.projectName);
  const irJson = useCodeStore((s) => s.irJson);
  const [result, setResult] = useState<SDKResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = trpc.sdk.generate.useMutation({
    onSuccess: (data) => {
      setResult(data as SDKResult);
      const first = (data as SDKResult).files[0];
      if (first) setSelectedFile(first);
      toast.success("SDK generated successfully");
    },
    onError: (err) => {
      toast.error(`SDK generation failed: ${err.message}`);
    },
  });

  const download = trpc.sdk.download.useQuery(
    { projectId: projectId ?? "" },
    {
      enabled: false, // manual trigger only
    },
  );

  async function handleDownload() {
    if (!projectId) return;
    const data = await download.refetch();
    if (!data.data) return;
    const { base64, filename } = data.data;
    const blob = new Blob(
      [Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
      {
        type: "application/zip",
      },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCopy(content: string) {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleExportAnchorIDL() {
    if (!irJson) return toast.error("No IR available. Add nodes first.");
    try {
      const { irToAnchorIDL } = await import("@solflow/sdk-gen");
      const idl = irToAnchorIDL(irJson);
      const slug = (projectName ?? "program")
        .toLowerCase()
        .replace(/\s+/g, "-");
      downloadJson(JSON.stringify(idl, null, 2), `${slug}-anchor-idl.json`);
      toast.success("Anchor IDL exported");
    } catch (err) {
      toast.error(
        `IDL export failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async function handleExportCodamaIDL() {
    if (!irJson) return toast.error("No IR available. Add nodes first.");
    try {
      const { irToCodamaIDL } = await import("@solflow/sdk-gen");
      const root = irToCodamaIDL(irJson);
      const slug = (projectName ?? "program")
        .toLowerCase()
        .replace(/\s+/g, "-");
      downloadJson(JSON.stringify(root, null, 2), `${slug}-codama-idl.json`);
      toast.success("Codama IDL exported");
    } catch (err) {
      toast.error(
        `IDL export failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No project loaded.
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: file tree + IDL export ─────────────────────────── */}
      <div className="flex w-56 shrink-0 flex-col border-r border-border bg-card">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            SDK Files
          </span>
          <button
            onClick={() => generate.mutate({ projectId })}
            disabled={generate.isPending}
            className="rounded bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            {generate.isPending ? "Generating…" : "Generate"}
          </button>
        </div>

        {/* File list */}
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {result ? (
            result.files.map((f) => (
              <button
                key={f.path}
                onClick={() => setSelectedFile(f)}
                className={`w-full truncate px-3 py-1 text-left text-xs transition-colors ${
                  selectedFile?.path === f.path
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
                title={f.path}
              >
                {f.path.replace(/^src\/generated\//, "")}
              </button>
            ))
          ) : (
            <div className="px-3 py-8 text-center text-[10px] text-muted-foreground/60">
              Click Generate to create the TypeScript SDK.
            </div>
          )}
        </div>

        {/* IDL Export section */}
        <div className="shrink-0 border-t border-border p-2 space-y-1">
          <p className="px-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Export IDL
          </p>
          <button
            onClick={handleExportAnchorIDL}
            disabled={!irJson}
            className="w-full rounded border border-border bg-background px-2 py-1 text-[10px] text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left"
          >
            Anchor IDL (.json)
          </button>
          <button
            onClick={handleExportCodamaIDL}
            disabled={!irJson}
            className="w-full rounded border border-border bg-background px-2 py-1 text-[10px] text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left"
          >
            Codama IDL (.json)
          </button>
          {/* Download SDK zip */}
          {result && (
            <button
              onClick={handleDownload}
              disabled={download.isFetching}
              className="w-full rounded border border-primary/40 bg-primary/10 px-2 py-1 text-[10px] text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
            >
              {download.isFetching ? "Zipping…" : "Download SDK ZIP"}
            </button>
          )}
        </div>
      </div>

      {/* ── Right: file content ──────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {selectedFile ? (
          <>
            {/* File header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-2">
              <span className="font-mono text-xs text-muted-foreground">
                {selectedFile.path}
              </span>
              <button
                onClick={() => handleCopy(selectedFile.content)}
                className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            {/* File content */}
            <pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-foreground/90">
              {selectedFile.content}
            </pre>
          </>
        ) : result ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a file to view its contents.
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <div className="text-3xl text-muted-foreground/30">{"{ }"}</div>
            <p>Generate a TypeScript SDK compatible with Solana Kit.</p>
            <p className="text-xs text-muted-foreground/60">
              Uses Codama to produce type-safe instruction builders and
              decoders.
            </p>
            <p className="text-xs text-muted-foreground/60">
              Or export the Anchor / Codama IDL directly from the left panel.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
