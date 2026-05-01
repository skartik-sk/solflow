"use client";

// CodePreview — Monaco-based code viewer for the bottom panel "Code" tab.
// - Reads from useCodeStore (files, activeFile, errors)
// - Renders file tabs + a read-only Monaco editor
// - Monaco is loaded dynamically (browser-only)
// - Language detection: .rs → "rust", .toml → "toml", .ts → "typescript", .json → "json"
// - Compare toggle: shows side-by-side Anchor vs Pinocchio view

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useCodeStore } from "@/store/code-store";
import type { CodeFocusRequest, GeneratedFile } from "@/store/code-store";
import { CodeCompareView } from "./CodeCompareView";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Dynamic Monaco import (no SSR) ──────────────────────────────────────────
// Configure Monaco to load from CDN — avoids Next.js chunk splitting issues
// with Monaco's AMD worker loader.

import { loader } from "@monaco-editor/react";

if (typeof window !== "undefined") {
  void import("monaco-editor")
    .then((monaco) => {
      loader.config({ monaco });
    })
    .catch(() => {
      // The plain text fallback below keeps generated code visible even if
      // Monaco fails to initialize in a locked-down browser/runtime.
    });
}

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => null,
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

interface CodeFocusTarget {
  path: string;
  line: number;
  matched: string;
}

function findCodeFocusTarget(
  files: GeneratedFile[],
  request: CodeFocusRequest,
): CodeFocusTarget | null {
  if (request.line && files[0]) {
    return { path: files[0].path, line: Math.max(1, request.line), matched: "line" };
  }

  const rawTokens = [
    request.token,
    request.nodeId,
    request.token ? toSnakeCase(request.token) : undefined,
    request.token ? toPascalCase(request.token) : undefined,
  ].filter((value): value is string => Boolean(value?.trim()));

  const tokens = Array.from(new Set(rawTokens));
  if (tokens.length === 0) return null;

  const rankedPatterns = tokens.flatMap((token) => [
    `pub fn ${token}`,
    `fn ${token}`,
    `pub struct ${token}`,
    `struct ${token}`,
    `impl ${token}`,
    `mod ${token}`,
    token,
  ]);

  for (const pattern of rankedPatterns) {
    const lowerPattern = pattern.toLowerCase();
    for (const file of files) {
      const lines = file.content.split(/\r?\n/);
      const lineIndex = lines.findIndex((line) =>
        line.toLowerCase().includes(lowerPattern),
      );
      if (lineIndex >= 0) {
        return { path: file.path, line: lineIndex + 1, matched: pattern };
      }
    }
  }

  return null;
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CodePreview() {
  const { generatedCode, activeFile, errors, focusRequest, setActiveFile } = useCodeStore();
  const [compareMode, setCompareMode] = useState(false);
  const [focusTarget, setFocusTarget] = useState<CodeFocusTarget | null>(null);
  const [monacoReadyPath, setMonacoReadyPath] = useState<string | null>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);

  const files = generatedCode?.files ?? [];
  const currentFile = files.find((f) => f.path === activeFile) ?? files[0] ?? null;
  const monacoReady = !!currentFile && monacoReadyPath === currentFile.path;

  const handleTabClick = useCallback(
    (path: string) => setActiveFile(path),
    [setActiveFile]
  );

  const revealFocusTarget = useCallback(() => {
    if (!focusTarget || !currentFile || focusTarget.path !== currentFile.path) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const model = editor.getModel?.();
    const maxColumn =
      model?.getLineMaxColumn?.(focusTarget.line) ??
      Math.max(1, currentFile.content.split(/\r?\n/)[focusTarget.line - 1]?.length ?? 1);

    editor.revealLineInCenter(focusTarget.line);
    editor.setPosition({ lineNumber: focusTarget.line, column: 1 });
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
      {
        range: new monaco.Range(focusTarget.line, 1, focusTarget.line, maxColumn),
        options: {
          isWholeLine: true,
          className: "solstudio-code-focus-line",
          marginClassName: "solstudio-code-focus-margin",
        },
      },
    ]);
  }, [currentFile, focusTarget]);

  useEffect(() => {
    if (!focusRequest || files.length === 0) return;
    const target = findCodeFocusTarget(files, focusRequest);
    if (!target) {
      setFocusTarget(null);
      return;
    }
    setFocusTarget(target);
    if (target.path !== activeFile) {
      setActiveFile(target.path);
    }
  }, [activeFile, files, focusRequest, setActiveFile]);

  useEffect(() => {
    revealFocusTarget();
  }, [revealFocusTarget]);

  useEffect(() => {
    setMonacoReadyPath(null);
    editorRef.current = null;
    monacoRef.current = null;
    decorationsRef.current = [];
  }, [currentFile?.path]);

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
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3 py-1 font-mono text-xs text-muted-foreground">
          <span>{currentFile.path}</span>
          {focusTarget?.path === currentFile.path && (
            <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300">
              audit focus: line {focusTarget.line}
            </span>
          )}
        </div>
      )}

      {/* Monaco editor */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {currentFile ? (
          <>
            {!monacoReady && <PlainCodeFallback file={currentFile} />}
            <div
              className={cn(
                "absolute inset-0 transition-opacity duration-150",
                monacoReady ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            >
              <MonacoEditor
                key={currentFile.path}
                value={currentFile.content}
                language={detectLanguage(currentFile)}
                theme="vs-dark"
                onMount={(editor, monaco) => {
                  editorRef.current = editor;
                  monacoRef.current = monaco;
                  setMonacoReadyPath(currentFile.path);
                  requestAnimationFrame(revealFocusTarget);
                }}
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
            </div>
          </>
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
      <style jsx global>{`
        .solstudio-code-focus-line {
          background: rgba(34, 211, 238, 0.14);
        }
        .solstudio-code-focus-margin {
          background: rgba(34, 211, 238, 0.7);
        }
      `}</style>
    </div>
  );
}

function PlainCodeFallback({ file }: { file: GeneratedFile }) {
  return (
    <pre className="h-full overflow-auto bg-zinc-950 p-3 font-mono text-[12px] leading-5 text-zinc-200">
      <code>{file.content}</code>
    </pre>
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
