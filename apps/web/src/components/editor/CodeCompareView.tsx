"use client";

// CodeCompareView — side-by-side framework code comparison.
// Generates Anchor plus another framework from the current IR and shows them in split panes.
// Supports diff mode (red/green highlighting) and side-by-side mode.

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useCodeStore } from "@/store/code-store";
import { useCodeViewOptions } from "@/store/settings-store";
import type { GeneratedFile } from "@/store/code-store";
import { generateCode } from "@solflow/codegen";
import type { editor as MonacoEditorTypes } from "monaco-editor";

import { loader as monacoLoader } from "@monaco-editor/react";

if (typeof window !== "undefined") {
  monacoLoader.config({
    paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs" },
  });
}

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
      Loading editor…
    </div>
  ),
});

const DiffEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.DiffEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
        Loading diff editor…
      </div>
    ),
  },
);

type ViewMode = "diff" | "side-by-side";
type CompareFramework = "pinocchio" | "quasar";

const compareOptions: Array<{
  value: CompareFramework;
  label: string;
  color: string;
}> = [
  { value: "pinocchio", label: "Pinocchio", color: "bg-cyan-500/10" },
  { value: "quasar", label: "Quasar", color: "bg-emerald-500/10" },
];

function detectLanguage(path: string): string {
  if (path.endsWith(".rs")) return "rust";
  if (path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".json")) return "json";
  return "plaintext";
}

function shortName(path: string): string {
  return path.split("/").pop() ?? path;
}

// ─── Per-pane viewer ─────────────────────────────────────────────────────────

function Pane({
  label,
  files,
  activeFile,
  onSelectFile,
  color,
  onEditorMount,
}: {
  label: string;
  files: GeneratedFile[];
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  color: string;
  onEditorMount: (editor: MonacoEditorTypes.ICodeEditor) => void;
}) {
  const current = files.find((f) => f.path === activeFile) ?? files[0] ?? null;
  const viewOptions = useCodeViewOptions();

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-border last:border-r-0">
      {/* Pane header */}
      <div
        className={`flex h-8 shrink-0 items-center gap-2 border-b border-border px-3 ${color}`}
      >
        <span className="text-[12px] font-semibold text-foreground">{label}</span>
      </div>

      {/* File tabs */}
      <div className="flex h-8 shrink-0 items-stretch overflow-x-auto border-b border-border bg-card [scrollbar-width:none]">
        {files.map((f) => {
          const isActive = f.path === (activeFile ?? files[0]?.path);
          return (
            <button
              key={f.path}
              onClick={() => onSelectFile(f.path)}
              title={f.path}
              className={`flex shrink-0 items-center gap-1.5 border-r border-white/[0.06] px-3 font-mono text-[12px] outline-none transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${
                isActive
                  ? "bg-background text-foreground shadow-[inset_0_-2px_0_var(--primary)]"
                  : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
              }`}
            >
              {shortName(f.path)}
            </button>
          );
        })}
      </div>

      {/* Monaco */}
      <div className="min-h-0 flex-1">
        {current ? (
          <MonacoEditor
            key={`${label}-${current.path}`}
            value={current.content}
            language={detectLanguage(current.path)}
            theme="vs-dark"
            onMount={onEditorMount}
            options={{
              readOnly: true,
              scrollBeyondLastLine: false,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              ...viewOptions,
              automaticLayout: true,
              scrollbar: {
                verticalScrollbarSize: 4,
                horizontalScrollbarSize: 4,
              },
              renderLineHighlight: "none",
              overviewRulerBorder: false,
              padding: { top: 6, bottom: 6 },
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
            No file selected.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CodeCompareView() {
  const irJson = useCodeStore((s) => s.irJson);
  const [anchorFile, setAnchorFile] = useState<string | null>(null);
  const [compareFile, setCompareFile] = useState<string | null>(null);
  const [compareFramework, setCompareFramework] = useState<CompareFramework>("pinocchio");
  const [viewMode, setViewMode] = useState<ViewMode>("diff");
  const viewOptions = useCodeViewOptions();
  const compareMeta = compareOptions.find((option) => option.value === compareFramework) ?? compareOptions[0];

  // Scroll sync refs
  const anchorEditorRef = useRef<MonacoEditorTypes.ICodeEditor | null>(null);
  const compareEditorRef = useRef<MonacoEditorTypes.ICodeEditor | null>(null);
  const isSyncingScroll = useRef(false);

  const onAnchorMount = useCallback(
    (editor: MonacoEditorTypes.ICodeEditor) => {
      anchorEditorRef.current = editor;
      editor.onDidScrollChange((e) => {
        if (isSyncingScroll.current) return;
        isSyncingScroll.current = true;
        const target = compareEditorRef.current;
        if (target) {
          target.setScrollPosition({
            scrollTop: e.scrollTop,
            scrollLeft: e.scrollLeft,
          });
        }
        isSyncingScroll.current = false;
      });
    },
    [],
  );

  const onCompareMount = useCallback(
    (editor: MonacoEditorTypes.ICodeEditor) => {
      compareEditorRef.current = editor;
      editor.onDidScrollChange((e) => {
        if (isSyncingScroll.current) return;
        isSyncingScroll.current = true;
        const target = anchorEditorRef.current;
        if (target) {
          target.setScrollPosition({
            scrollTop: e.scrollTop,
            scrollLeft: e.scrollLeft,
          });
        }
        isSyncingScroll.current = false;
      });
    },
    [],
  );

  // Memoize generated code — only regenerate when irJson actually changes
  const generated = useMemo(() => {
    if (!irJson) return null;
    try {
      const anchorResult = generateCode(irJson, "anchor");
      const pinocchioResult = generateCode(irJson, "pinocchio");
      const quasarResult = generateCode(irJson, "quasar");
      return {
        anchor: anchorResult.files,
        pinocchio: pinocchioResult.files,
        quasar: quasarResult.files,
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Code generation failed" };
    }
  }, [irJson]);

  // Reset selected files when generated output changes
  const prevGenRef = useRef(generated);
  useEffect(() => {
    if (generated && "anchor" in generated && generated.anchor) {
      if (prevGenRef.current !== generated) {
        setAnchorFile(generated.anchor[0]?.path ?? null);
        setCompareFile(generated[compareFramework]?.[0]?.path ?? null);
      }
    }
    prevGenRef.current = generated;
  }, [compareFramework, generated]);

  // Get currently selected files for diff view
  const anchorCurrent = useMemo(() => {
    if (!generated || !("anchor" in generated) || !generated.anchor) return null;
    return (
      generated.anchor.find((f) => f.path === anchorFile) ??
      generated.anchor[0] ??
      null
    );
  }, [generated, anchorFile]);

  const compareCurrent = useMemo(() => {
    if (!generated || !("anchor" in generated)) return null;
    const files = generated[compareFramework] ?? [];
    return (
      files.find((f) => f.path === compareFile) ??
      files[0] ??
      null
    );
  }, [compareFile, compareFramework, generated]);

  const diffLanguage = anchorCurrent
    ? detectLanguage(anchorCurrent.path)
    : compareCurrent
      ? detectLanguage(compareCurrent.path)
      : "plaintext";

  if (!irJson || !generated) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-[13px] text-muted-foreground">
        Add nodes to the canvas to compare generated framework output.
      </div>
    );
  }

  if ("error" in generated) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center font-mono text-[12px] text-red-400">
        {generated.error}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar with mode toggle */}
      <div className="flex h-9 shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-card px-3 [scrollbar-width:none]">
        <div role="group" aria-label="View mode" className="flex h-6 shrink-0 items-center gap-0.5 rounded-md bg-white/[0.03] p-0.5 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
        <button
          onClick={() => setViewMode("diff")}
          className={`h-5 rounded-[4px] px-2 text-[11px] font-medium outline-none transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-primary ${
            viewMode === "diff"
              ? "bg-[#23262c] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(255,255,255,0.07)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Diff
        </button>
        <button
          onClick={() => setViewMode("side-by-side")}
          className={`h-5 rounded-[4px] px-2 text-[11px] font-medium outline-none transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-primary ${
            viewMode === "side-by-side"
              ? "bg-[#23262c] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(255,255,255,0.07)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Side by Side
        </button>
        </div>
        <div role="group" aria-label="Compare against" className="ml-1 flex h-6 shrink-0 items-center gap-0.5 rounded-md bg-white/[0.03] p-0.5 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
          {compareOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                setCompareFramework(option.value);
                if ("anchor" in generated) {
                  setCompareFile(generated[option.value][0]?.path ?? null);
                }
              }}
              className={`h-5 rounded-[4px] px-2 text-[11px] font-medium outline-none transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-primary ${
                compareFramework === option.value
                  ? "bg-[#23262c] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(255,255,255,0.07)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {viewMode === "diff" && (
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
            Red = Anchor only, Green = {compareMeta.label} only
          </span>
        )}
      </div>

      {/* Content area */}
      {viewMode === "diff" ? (
        <div className="min-h-0 flex-1">
          {anchorCurrent && compareCurrent ? (
            <DiffEditor
              key={`${compareFramework}-${anchorCurrent.path}-${compareCurrent.path}`}
              original={anchorCurrent.content}
              modified={compareCurrent.content}
              originalModelPath={anchorCurrent.path}
              modifiedModelPath={compareCurrent.path}
              language={diffLanguage}
              theme="vs-dark"
              options={{
                readOnly: true,
                renderSideBySide: true,
                scrollBeyondLastLine: false,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                ...viewOptions,
                automaticLayout: true,
                scrollbar: {
                  verticalScrollbarSize: 4,
                  horizontalScrollbarSize: 4,
                },
                renderLineHighlight: "none",
                overviewRulerBorder: false,
                padding: { top: 6, bottom: 6 },
                diffAlgorithm: "advanced",
                renderIndicators: true,
                renderMarginRevertIcon: false,
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
              Select files to compare.
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Pane
            label="Anchor"
            files={generated.anchor}
            activeFile={anchorFile}
            onSelectFile={setAnchorFile}
            color="bg-violet-500/10"
            onEditorMount={onAnchorMount}
          />
          <Pane
            label={compareMeta.label}
            files={generated[compareFramework]}
            activeFile={compareFile}
            onSelectFile={setCompareFile}
            color={compareMeta.color}
            onEditorMount={onCompareMount}
          />
        </div>
      )}
    </div>
  );
}
