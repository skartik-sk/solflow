"use client";

// CodeCompareView — side-by-side framework code comparison.
// Generates Anchor plus another framework from the current IR and shows them in split panes.
// Supports diff mode (red/green highlighting) and side-by-side mode.

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useCodeStore } from "@/store/code-store";
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
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading editor…
    </div>
  ),
});

const DiffEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.DiffEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
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

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-border last:border-r-0">
      {/* Pane header */}
      <div
        className={`flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 ${color}`}
      >
        <span className="text-xs font-semibold text-foreground">{label}</span>
      </div>

      {/* File tabs */}
      <div className="flex shrink-0 overflow-x-auto border-b border-border bg-card">
        {files.map((f) => {
          const isActive = f.path === (activeFile ?? files[0]?.path);
          return (
            <button
              key={f.path}
              onClick={() => onSelectFile(f.path)}
              title={f.path}
              className={`flex shrink-0 items-center gap-1.5 border-r border-border px-3 py-1 text-xs transition-colors hover:bg-accent ${
                isActive
                  ? "border-b-2 border-b-primary bg-background text-foreground"
                  : "text-muted-foreground"
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
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 11,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              lineNumbers: "on",
              wordWrap: "off",
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
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
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
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Add nodes to the canvas to compare generated framework output.
      </div>
    );
  }

  if ("error" in generated) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        {generated.error}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar with mode toggle */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-1.5">
        <button
          onClick={() => setViewMode("diff")}
          className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
            viewMode === "diff"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          Diff
        </button>
        <button
          onClick={() => setViewMode("side-by-side")}
          className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
            viewMode === "side-by-side"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          Side by Side
        </button>
        <div className="ml-2 flex overflow-hidden rounded border border-border">
          {compareOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                setCompareFramework(option.value);
                if ("anchor" in generated) {
                  setCompareFile(generated[option.value][0]?.path ?? null);
                }
              }}
              className={`px-2 py-0.5 text-xs font-medium transition-colors ${
                compareFramework === option.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {viewMode === "diff" && (
          <span className="ml-auto text-[10px] text-muted-foreground">
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
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 11,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                lineNumbers: "on",
                wordWrap: "off",
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
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
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
