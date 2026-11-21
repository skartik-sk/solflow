"use client";

// ImportDialog — modal dialog for importing Solana IDL files.
// Supports paste, drag-and-drop, and file browse.
// Auto-detects Anchor / Shank / Kinobi format.

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Upload, FileJson, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { idlToFlow, detectFormat } from "@solflow/idl-import";
import type { IdlFormat } from "@solflow/idl-import";
import { useFlowStore } from "@/store/flow-store";
import { useProjectStore } from "@/store/project-store";
import { edBtn, edPrimaryBtn, edx } from "@/components/ui-kit/editor-ui";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

interface ParsedPreview {
  format: IdlFormat;
  detectedFormat: IdlFormat;
  stats: { instructions: number; accounts: number; errors: number; events: number };
}

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nodes = useFlowStore((s) => s.nodes);
  const setFlow = useFlowStore((s) => s.setFlow);
  const markDirty = useProjectStore((s) => s.markDirty);
  const hasExistingNodes = nodes.length > 0;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Parse and validate the JSON
  const parseAndPreview = useCallback((text: string) => {
    setJsonText(text);
    setError(null);
    setPreview(null);

    if (!text.trim()) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError("Invalid JSON format. Please paste a valid Solana IDL.");
      return;
    }

    // Quick format detection for preview
    const detectedFormat = detectFormat(parsed);
    const isUnknown = detectedFormat === "unknown";

    setIsParsing(true);
    try {
      const result = idlToFlow(parsed);
      setPreview({
        format: isUnknown ? "anchor" : result.format,
        detectedFormat,
        stats: result.stats,
      });
      if (isUnknown) {
        setError(null);
      }
    } catch (err) {
      if (isUnknown) {
        setError(
          "Could not detect IDL format. Supported formats: Anchor, Shank, Kinobi. Make sure the JSON has a valid program structure with instructions array.",
        );
      } else {
        setError((err as Error).message ?? "Failed to parse IDL");
      }
    } finally {
      setIsParsing(false);
    }
  }, []);

  // Handle text input
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    parseAndPreview(e.target.value);
  };

  // Handle file drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const file = e.dataTransfer.files[0];
      if (!file) return;

      if (file.size > MAX_FILE_SIZE) {
        setError("File too large. Maximum size is 5MB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        parseAndPreview(text);
      };
      reader.readAsText(file);
    },
    [parseAndPreview],
  );

  // Handle file browse
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > MAX_FILE_SIZE) {
        setError("File too large. Maximum size is 5MB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        parseAndPreview(text);
      };
      reader.readAsText(file);
    },
    [parseAndPreview],
  );

  // Handle import confirmation
  const handleImport = () => {
    if (!jsonText.trim()) return;

    try {
      const result = idlToFlow(JSON.parse(jsonText));
      setFlow(result.nodes, result.edges);
      markDirty();
      toast.success(
        `Imported ${result.stats.instructions} instruction${result.stats.instructions !== 1 ? "s" : ""}`,
      );
      onClose();
    } catch (err) {
      toast.error((err as Error).message ?? "Import failed");
    }
  };

  const formatLabel: Record<string, string> = {
    anchor: "Anchor",
    shank: "Shank",
    kinobi: "Kinobi",
    codama: "Codama",
    unknown: "Unknown (trying Anchor)",
  };

  const formatColor: Record<string, string> = {
    anchor: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    shank: "bg-violet-500/15 text-violet-400 border-violet-500/30",
    kinobi: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    codama: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Dialog */}
      <div role="dialog" aria-modal="true" aria-labelledby="import-dialog-title" className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.08] bg-popover shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_32px_80px_-24px_rgba(0,0,0,0.85)]">
        <div className="px-4 pb-4 pt-4">
        <h2 id="import-dialog-title" className="text-[14px] font-semibold tracking-[-0.01em]">Import Contract</h2>
        <p className="mb-3 mt-1 text-[13px] text-muted-foreground">
          Paste an IDL JSON or drop a <code className="rounded-[4px] bg-white/[0.06] px-1 font-mono text-[12px] text-foreground/85">.json</code>{" "}
          file to visualize the contract as flow nodes.
        </p>

        {/* Dropzone / Textarea */}
        <div
          className={`relative rounded-[10px] border border-dashed bg-[#0c0d10] transition-colors duration-150 ease-out ${
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-white/[0.12] hover:border-white/[0.2]"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <textarea
            value={jsonText}
            onChange={handleTextChange}
            placeholder='Paste IDL JSON here, or drag & drop a .json file...\n\nExample: { "version": "0.1.0", "name": "my_program", "instructions": [...] }'
            aria-label="IDL JSON"
            className="min-h-[180px] w-full resize-none rounded-[10px] bg-transparent px-3 py-2.5 pr-24 font-mono text-[12px] leading-[1.6] outline-none placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-primary/25"
            spellCheck={false}
          />

          {/* File browse overlay button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={edx(edBtn, "absolute right-2 top-2")}
          >
            <Upload size={11} />
            Browse
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {/* Parsing indicator */}
        {isParsing && (
          <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            Detecting format...
          </div>
        )}

        {/* Preview stats */}
        {preview && !error && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle size={14} className="text-green-400" />
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  preview.detectedFormat === "unknown"
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    : (formatColor[preview.format] ?? formatColor.anchor)
                }`}
              >
                <FileJson size={10} className="mr-1" />
                {formatLabel[preview.detectedFormat] ?? formatLabel[preview.format] ?? "Anchor"} IDL
              </span>
            </div>
            {preview.detectedFormat === "unknown" && (
              <p className="text-[11px] text-amber-400/80">
                Format not recognized but parsed successfully as Anchor IDL.
              </p>
            )}
            <p className="text-[12px] text-muted-foreground">
              {preview.stats.instructions} instruction
              {preview.stats.instructions !== 1 ? "s" : ""} &middot;{" "}
              {preview.stats.accounts} account
              {preview.stats.accounts !== 1 ? "s" : ""}
              {preview.stats.errors > 0 &&
                ` · ${preview.stats.errors} error${preview.stats.errors !== 1 ? "s" : ""}`}
              {preview.stats.events > 0 &&
                ` · ${preview.stats.events} event${preview.stats.events !== 1 ? "s" : ""}`}
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-3 flex items-start gap-2 text-[12px] text-red-400">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Existing flow warning */}
        {hasExistingNodes && preview && (
          <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-[12px] text-amber-300">
            This will replace your current flow ({nodes.length} node
            {nodes.length !== 1 ? "s" : ""}). Save first if you want to keep it.
          </div>
        )}

        </div>

        {/* Footer */}
        <div className="flex h-12 items-center justify-end gap-2 border-t border-white/[0.06] bg-card/60 px-3">
          <button
            type="button"
            onClick={onClose}
            className={edBtn}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!preview || isParsing}
            className={edPrimaryBtn}
          >
            <Upload size={12} />
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
