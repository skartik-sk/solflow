"use client";

// CodePreview — Monaco-based code viewer for the bottom panel "Code" tab.
// - Reads from useCodeStore (files, activeFile, errors)
// - Renders file tabs + a read-only Monaco editor
// - Monaco is loaded dynamically (browser-only)
// - Language detection: .rs → "rust", .toml → "toml", .ts → "typescript", .json → "json"
// - Compare toggle: shows side-by-side Anchor vs Pinocchio view

import React, { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useCodeStore } from "@/store/code-store";
import type { GeneratedFile } from "@/store/code-store";
import { CodeCompareView } from "./CodeCompareView";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Dynamic Monaco import (no SSR) ──────────────────────────────────────────

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading editor…
    </div>
  ),
});

// ─── Language detection ───────────────────────────────────────────────────────

function detectLanguage(file: GeneratedFile): string {
  if (file.language === "rust") return "rust";
  if (file.language === "toml") return "plaintext"; // Monaco has no toml grammar by default
  if (file.language === "typescript") return "typescript";
  if (file.language === "json") return "json";
  // Fallback from extension
  if (file.path.endsWith(".rs")) return "rust";
  if (file.path.endsWith(".toml")) return "plaintext";
  if (file.path.endsWith(".ts")) return "typescript";
  if (file.path.endsWith(".json")) return "json";
  return "plaintext";
}

// ─── Short display name for a file path ──────────────────────────────────────

function shortName(path: string): string {
  return path.split("/").pop() ?? path;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CodePreview() {
  const { generatedCode, activeFile, errors, setActiveFile } = useCodeStore();
  const [compareMode, setCompareMode] = useState(false);

  const files = generatedCode?.files ?? [];
  const currentFile = files.find((f) => f.path === activeFile) ?? files[0] ?? null;

  const handleTabClick = useCallback(
    (path: string) => setActiveFile(path),
    [setActiveFile]
  );

  // ── Empty / error state ──────────────────────────────────────────
  if (!generatedCode && errors.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Add nodes to the canvas to see generated code here.
      </div>
    );
  }

  if (errors.length > 0 && files.length === 0) {
    return (
      <div className="flex h-full flex-col gap-2 overflow-auto p-3">
        {errors.map((e, i) => (
          <div
            key={i}
            className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-mono text-destructive"
          >
            {e.message}
          </div>
        ))}
      </div>
    );
  }

  // ── Compare mode ─────────────────────────────────────────────────
  if (compareMode) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {/* Compare header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-3 py-1.5">
          <span className="text-xs font-semibold text-foreground">
            Anchor vs Pinocchio
          </span>
          <button
            onClick={() => setCompareMode(false)}
            className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Exit Compare
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <CodeCompareView />
        </div>
      </div>
    );
  }

  // ── Normal state ─────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* File tabs + compare toggle */}
      <div className="flex shrink-0 items-center overflow-x-auto border-b border-border bg-card">
        <div className="flex min-w-0 flex-1 overflow-x-auto">
        {files.map((file) => {
          const isActive = file.path === (activeFile ?? files[0]?.path);
          return (
            <button
              key={file.path}
              onClick={() => handleTabClick(file.path)}
              title={file.path}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-r border-border px-3 py-1.5 text-xs transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                isActive
                  ? "border-b-2 border-b-primary bg-background text-foreground"
                  : "text-muted-foreground",
              )}
            >
              <FileIcon path={file.path} />
              {shortName(file.path)}
            </button>
          );
        })}
              </div>
        <button
          onClick={() => setCompareMode(true)}
          title="Compare Anchor vs Pinocchio side-by-side"
          className="shrink-0 border-l border-border px-3 py-1.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors whitespace-nowrap"
        >
          ⇄ Compare
        </button>
      </div>

      {/* Path breadcrumb */}
      {currentFile && (
        <div className="shrink-0 border-b border-border bg-card px-3 py-1 font-mono text-xs text-muted-foreground">
          {currentFile.path}
        </div>
      )}

      {/* Monaco editor */}
      <div className="min-h-0 flex-1">
        {currentFile ? (
          <MonacoEditor
            key={currentFile.path}
            value={currentFile.content}
            language={detectLanguage(currentFile)}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 12,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              lineNumbers: "on",
              wordWrap: "off",
              automaticLayout: true,
              scrollbar: {
                verticalScrollbarSize: 6,
                horizontalScrollbarSize: 6,
              },
              renderLineHighlight: "none",
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
              padding: { top: 8, bottom: 8 },
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No file selected.
          </div>
        )}
      </div>

      {/* Error / warning banner */}
      {(errors.length > 0 || (generatedCode?.warnings?.length ?? 0) > 0) && (
        <div className="shrink-0 border-t border-border bg-card">
          {errors.map((e, i) => (
            <div
              key={`err-${i}`}
              className="flex items-center gap-2 px-3 py-1 text-xs text-destructive"
            >
              <span className="font-bold">Error:</span> {e.message}
            </div>
          ))}
          {generatedCode?.warnings?.map((w, i) => (
            <div
              key={`warn-${i}`}
              className="flex items-center gap-2 px-3 py-1 text-xs text-yellow-500"
            >
              <span className="font-bold">Warning:</span> {w.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── File type icon ───────────────────────────────────────────────────────────

function FileIcon({ path }: { path: string }) {
  if (path.endsWith(".rs")) return <span className="text-orange-400">🦀</span>;
  if (path.endsWith(".toml")) return <span className="text-blue-400">⚙</span>;
  if (path.endsWith(".ts")) return <span className="text-blue-500">TS</span>;
  if (path.endsWith(".json"))
    return <span className="text-yellow-400">{"{}"}</span>;
  return null;
}
