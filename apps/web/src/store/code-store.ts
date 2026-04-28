"use client";

// Code Store — holds generated Rust code, IR snapshot, and codegen errors.
// Kept separate from flow-store so components that only show code don't
// re-render when nodes move on the canvas.

import { create } from "zustand";
import type { ProgramIR } from "@solflow/ir";

export interface CodegenError {
  message: string;
  type?: "codegen" | "compile" | "transform";
  nodeId?: string;
}

export interface CodegenWarning {
  message: string;
  nodeId?: string;
}

export interface GeneratedFile {
  path: string;           // e.g. "src/lib.rs", "Cargo.toml"
  content: string;
  language: "rust" | "toml" | "typescript" | "json";
}

export interface GeneratedProject {
  files: GeneratedFile[];
  errors: CodegenError[];
  warnings: CodegenWarning[];
}

export interface CodeFocusRequest {
  nodeId?: string;
  token?: string;
  line?: number;
  nonce: number;
}

interface CodeState {
  generatedCode: GeneratedProject | null;
  irJson: ProgramIR | null;
  errors: CodegenError[];
  warnings: CodegenWarning[];
  activeFile: string | null;   // Path of the file currently shown in Monaco
  focusRequest: CodeFocusRequest | null;

  // Actions
  setGeneratedCode: (code: GeneratedProject, ir: ProgramIR) => void;
  setError: (error: Error) => void;
  setActiveFile: (path: string) => void;
  focusCodeTarget: (target: Omit<CodeFocusRequest, "nonce">) => void;
  clear: () => void;
}

export const useCodeStore = create<CodeState>((set) => ({
  generatedCode: null,
  irJson: null,
  errors: [],
  warnings: [],
  activeFile: null,
  focusRequest: null,

  setGeneratedCode: (code, ir) =>
    set({
      generatedCode: code,
      irJson: ir,
      errors: code.errors,
      warnings: code.warnings,
      activeFile: code.files[0]?.path ?? null,
      focusRequest: null,
    }),

  setError: (error) =>
    set({
      errors: [{ message: error.message, type: "codegen" as const }],
      generatedCode: null,
      focusRequest: null,
    }),

  setActiveFile: (path) => set({ activeFile: path }),

  focusCodeTarget: (target) =>
    set({
      focusRequest: {
        ...target,
        nonce: Date.now(),
      },
    }),

  clear: () =>
    set({
      generatedCode: null,
      irJson: null,
      errors: [],
      warnings: [],
      activeFile: null,
      focusRequest: null,
    }),
}));
