"use client";

// CodeCompareView — side-by-side Anchor vs Pinocchio code comparison.
// Generates both frameworks from the current IR and shows them in split panes.

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

type Framework = "anchor" | "pinocchio" | "quasar";

interface CompareState {
  anchor: GeneratedFile[] | null;
  pinocchio: GeneratedFile[] | null;
  loading: boolean;
  error: string | null;
}

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
  syncedEditor,
  onEditorMount,
}: {
  label: string;
  files: GeneratedFile[];
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  color: string;
  syncedEditor: React.MutableRefObject<MonacoEditorTypes.ICodeEditor | null>;
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
  const [pinocchioFile, setPinocchioFile] = useState<string | null>(null);

  // Scroll sync refs
  const anchorEditorRef = useRef<MonacoEditorTypes.ICodeEditor | null>(null);
  const pinocchioEditorRef = useRef<MonacoEditorTypes.ICodeEditor | null>(null);
  const isSyncingScroll = useRef(false);

  const onAnchorMount = useCallback(
    (editor: MonacoEditorTypes.ICodeEditor) => {
      anchorEditorRef.current = editor;
      editor.onDidScrollChange((e) => {
        if (isSyncingScroll.current) return;
        isSyncingScroll.current = true;
        const target = pinocchioEditorRef.current;
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

  const onPinocchioMount = useCallback(
    (editor: MonacoEditorTypes.ICodeEditor) => {
      pinocchioEditorRef.current = editor;
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
      return { anchor: anchorResult.files, pinocchio: pinocchioResult.files };
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
        setPinocchioFile(generated.pinocchio?.[0]?.path ?? null);
      }
    }
    prevGenRef.current = generated;
  }, [generated]);

  if (!irJson || !generated) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Add nodes to the canvas to compare Anchor vs Pinocchio output.
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
    <div className="flex h-full overflow-hidden">
      <Pane
        label="Anchor"
        files={generated.anchor}
        activeFile={anchorFile}
        onSelectFile={setAnchorFile}
        color="bg-violet-500/10"
        syncedEditor={pinocchioEditorRef}
        onEditorMount={onAnchorMount}
      />
      <Pane
        label="Pinocchio"
        files={generated.pinocchio}
        activeFile={pinocchioFile}
        onSelectFile={setPinocchioFile}
        color="bg-cyan-500/10"
        syncedEditor={anchorEditorRef}
        onEditorMount={onPinocchioMount}
      />
    </div>
  );
}
