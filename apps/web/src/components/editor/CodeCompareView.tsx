"use client";

// CodeCompareView — side-by-side Anchor vs Pinocchio code comparison.
// Generates both frameworks from the current IR and shows them in split panes.

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useCodeStore } from "@/store/code-store";
import type { GeneratedFile } from "@/store/code-store";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading editor…
    </div>
  ),
});

type Framework = "anchor" | "pinocchio";

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
}: {
  label: string;
  files: GeneratedFile[];
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  color: string;
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
  const [state, setState] = useState<CompareState>({
    anchor: null,
    pinocchio: null,
    loading: false,
    error: null,
  });
  const [anchorFile, setAnchorFile] = useState<string | null>(null);
  const [pinocchioFile, setPinocchioFile] = useState<string | null>(null);

  useEffect(() => {
    if (!irJson) {
      setState({ anchor: null, pinocchio: null, loading: false, error: null });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    Promise.all([import("@solflow/codegen")]).then(([{ generateCode }]) => {
      try {
        const anchorResult = generateCode(irJson, "anchor");
        const pinocchioResult = generateCode(irJson, "pinocchio");

        setState({
          anchor: anchorResult.files,
          pinocchio: pinocchioResult.files,
          loading: false,
          error: null,
        });

        setAnchorFile(anchorResult.files[0]?.path ?? null);
        setPinocchioFile(pinocchioResult.files[0]?.path ?? null);
      } catch (err) {
        setState({
          anchor: null,
          pinocchio: null,
          loading: false,
          error: err instanceof Error ? err.message : "Code generation failed",
        });
      }
    });
  }, [irJson]);

  if (!irJson) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Add nodes to the canvas to compare Anchor vs Pinocchio output.
      </div>
    );
  }

  if (state.loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
        Generating comparison…
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        {state.error}
      </div>
    );
  }

  if (!state.anchor || !state.pinocchio) return null;

  return (
    <div className="flex h-full overflow-hidden">
      <Pane
        label="Anchor"
        files={state.anchor}
        activeFile={anchorFile}
        onSelectFile={setAnchorFile}
        color="bg-violet-500/10"
      />
      <Pane
        label="Pinocchio"
        files={state.pinocchio}
        activeFile={pinocchioFile}
        onSelectFile={setPinocchioFile}
        color="bg-cyan-500/10"
      />
    </div>
  );
}
