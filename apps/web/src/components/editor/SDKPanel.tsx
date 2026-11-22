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
  const framework = useProjectStore((s) => s.framework);
  const [result, setResult] = useState<SDKResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null);
  const [copied, setCopied] = useState(false);
  const saveIfDirty = useProjectStore((s) => s.saveIfDirty);

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

  // The SDK is generated from the saved project: save pending edits first.
  async function handleGenerate() {
    if (!projectId) return;
    try {
      await saveIfDirty();
    } catch {
      toast.error("Save failed. Generating from the last saved version.");
    }
    generate.mutate({ projectId });
  }

  async function handleDownload() {
    if (!projectId) return;
    try {
      await saveIfDirty();
    } catch {
      toast.error("Save failed. Downloading the last saved version.");
    }
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
      const root = irToCodamaIDL(irJson, { framework });
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
      <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
        No project loaded.
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: file tree + IDL export ─────────────────────────── */}
      <div className="flex w-56 shrink-0 flex-col border-r border-border bg-card">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5 min-h-10">
          <span className="text-[12px] font-semibold text-foreground">
            SDK Files
          </span>
          <button
            onClick={() => void handleGenerate()}
            disabled={generate.isPending}
            className="inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-[5px] bg-primary px-2 text-[11px] font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-[background-color,transform] duration-150 ease-out hover:bg-[#7fe0e6] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
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
                className={`w-full truncate px-3 py-1 text-left text-[12px] transition-colors duration-150 ease-out ${
                  selectedFile?.path === f.path
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-white/[0.06] hover:text-accent-foreground"
                }`}
                title={f.path}
              >
                {f.path.replace(/^src\/generated\//, "")}
              </button>
            ))
          ) : (
            <div className="px-3 py-8 text-center text-[11px] text-muted-foreground/60">
              Click Generate to create the TypeScript SDK.
            </div>
          )}
        </div>

        {/* IDL Export section */}
        <div className="shrink-0 border-t border-border p-2 space-y-1">
          <p className="px-1 text-[11px] font-semibold text-muted-foreground/60">
            Export IDL
          </p>
          <button
            onClick={handleExportAnchorIDL}
            disabled={!irJson}
            className="w-full rounded-md border border-white/[0.08] bg-background px-2 py-1 text-[11px] text-foreground hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 ease-out text-left"
          >
            Anchor IDL (.json)
          </button>
          <button
            onClick={handleExportCodamaIDL}
            disabled={!irJson}
            className="w-full rounded-md border border-white/[0.08] bg-background px-2 py-1 text-[11px] text-foreground hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 ease-out text-left"
          >
            Codama IDL (.json)
          </button>
          {/* Download SDK zip */}
          {result && (
            <button
              onClick={handleDownload}
              disabled={download.isFetching}
              className="w-full rounded border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors duration-150 ease-out"
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
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-3 py-1.5 min-h-10">
              <span className="font-mono text-[12px] text-muted-foreground">
                {selectedFile.path}
              </span>
              <button
                onClick={() => handleCopy(selectedFile.content)}
                className="rounded-md border border-white/[0.08] px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-white/[0.06] hover:text-accent-foreground transition-colors duration-150 ease-out"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            {/* File content */}
            <pre className="min-h-0 flex-1 overflow-auto bg-[#0c0d10] p-3 font-mono text-[12px] leading-[1.6] text-foreground/90">
              {selectedFile.content}
            </pre>
          </>
        ) : result ? (
          <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
            Select a file to view its contents.
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-[13px] text-muted-foreground">
            <div className="text-3xl text-muted-foreground/30">{"{ }"}</div>
            <p>Generate a TypeScript SDK compatible with Solana Kit.</p>
            <p className="text-[12px] text-muted-foreground/60">
              Uses Codama to produce type-safe instruction builders and
              decoders.
            </p>
            <p className="text-[12px] text-muted-foreground/60">
              Or export the Anchor / Codama IDL directly from the left panel.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
