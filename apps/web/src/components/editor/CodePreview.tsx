"use client";

// CodePreview — Monaco-based code viewer for the bottom panel "Code" tab.
// - Reads from useCodeStore (files, activeFile, errors)
// - Renders file tabs + a read-only Monaco editor
// - Monaco is loaded dynamically (browser-only)
// - Language detection: .rs → "rust", .toml → "toml", .ts → "typescript", .json → "json"
// - Compare toggle: shows side-by-side framework output

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { editor as MonacoEditorTypes } from "monaco-editor";
import type * as MonacoNamespace from "monaco-editor";
import { useCodeStore } from "@/store/code-store";
import type { CodeFocusRequest, GeneratedFile } from "@/store/code-store";
import { CodeCompareView } from "./CodeCompareView";
import { ArrowLeftRight, FileCode2, FileCog, FileJson } from "lucide-react";
import { EdEmptyState, edChipBtn } from "@/components/ui-kit/editor-ui";
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
  const editorRef = useRef<MonacoEditorTypes.ICodeEditor | null>(null);
  const monacoRef = useRef<typeof MonacoNamespace | null>(null);
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
      <EdEmptyState icon={<FileCode2 size={15} />}>
        Add nodes to the canvas to see generated code here.
      </EdEmptyState>
    );
  }

  if (errors.length > 0 && files.length === 0) {
    return (
      <div className="flex h-full flex-col gap-2 overflow-auto p-3">
        {errors.map((e, i) => (
          <div
            key={i}
            className="rounded-lg border border-red-500/25 bg-red-500/[0.07] px-3 py-2 font-mono text-[12px] leading-[1.55] text-red-300"
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
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-card px-3">
          <span className="text-[12px] font-semibold text-foreground">
            Framework Compare
          </span>
          <button
            onClick={() => setCompareMode(false)}
            className={edChipBtn}
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
      <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border bg-card [scrollbar-width:none]">
        <div className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
          {files.map((file) => {
            const isActive = file.path === (activeFile ?? files[0]?.path);
            return (
              <button
                key={file.path}
                onClick={() => handleTabClick(file.path)}
                title={file.path}
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 border-r border-white/[0.06] px-3 font-mono text-[12px] outline-none transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                  isActive
                    ? "bg-background text-foreground shadow-[inset_0_-2px_0_var(--primary)]"
                    : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground",
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
          title="Compare generated framework output side-by-side"
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap border-l border-white/[0.06] px-3 text-[12px] font-medium text-muted-foreground outline-none transition-colors duration-150 ease-out hover:bg-white/[0.04] hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <ArrowLeftRight size={12} />
          Compare
        </button>
      </div>

      {/* Path breadcrumb */}
      {currentFile && (
        <div className="flex h-7 shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] bg-background px-3 font-mono text-[11.5px] text-muted-foreground">
          <span>{currentFile.path}</span>
          {focusTarget?.path === currentFile.path && (
            <span className="rounded-[4px] border border-primary/30 bg-primary/10 px-1.5 text-[11px] text-primary">
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
          <EdEmptyState>No file selected.</EdEmptyState>
        )}
      </div>

      {/* Error / warning banner */}
      {(errors.length > 0 || (generatedCode?.warnings?.length ?? 0) > 0) && (
        <div className="max-h-28 shrink-0 overflow-y-auto border-t border-border bg-card py-1">
          {errors.map((e, i) => (
            <div
              key={`err-${i}`}
              className="flex items-center gap-2 px-3 py-0.5 font-mono text-[12px] text-red-400"
            >
              <span className="font-semibold">Error:</span> {e.message}
            </div>
          ))}
          {generatedCode?.warnings?.map((w, i) => (
            <div
              key={`warn-${i}`}
              className="flex items-center gap-2 px-3 py-0.5 font-mono text-[12px] text-amber-300"
            >
              <span className="font-semibold">Warning:</span> {w.message}
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
    <pre className="h-full overflow-auto bg-[#1e1e1e] p-3 pl-4 font-mono text-[12px] leading-5 text-zinc-200">
      <code>{file.content}</code>
    </pre>
  );
}

// ─── File type icon ───────────────────────────────────────────────────────────

function FileIcon({ path }: { path: string }) {
  if (path.endsWith(".rs")) return <FileCode2 size={13} aria-hidden className="text-[#f2a98a]" />;
  if (path.endsWith(".toml")) return <FileCog size={13} aria-hidden className="text-muted-foreground" />;
  if (path.endsWith(".ts")) return <FileCode2 size={13} aria-hidden className="text-[#8fd1e8]" />;
  if (path.endsWith(".json"))
    return <FileJson size={13} aria-hidden className="text-[#d6b98a]" />;
  return null;
}
