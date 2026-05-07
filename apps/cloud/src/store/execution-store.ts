"use client";

// Execution Store — tracks workflow execution state and per-node results.

import { create } from "zustand";
import type { WorkflowSimulationReport } from "@/lib/cloud-workflow-features";

export interface NodeExecutionResult {
  nodeId: string;
  nodeType?: string;
  status: "idle" | "running" | "success" | "error" | "skipped";
  input?: unknown;
  output?: unknown;
  error?: string;
  duration?: number;
  logs?: Array<{ timestamp: number; level: string; message: string; data?: unknown }>;
  startedAt?: number;
  completedAt?: number;
}

interface ExecutionState {
  executionId: string | null;
  status: "idle" | "running" | "success" | "error";
  simulationReport: WorkflowSimulationReport | null;
  nodeResults: Map<string, NodeExecutionResult>;
  logs: Array<{ timestamp: number; level: "info" | "warn" | "error"; message: string }>;

  setSimulationReport: (report: WorkflowSimulationReport | null) => void;
  startExecution: (executionId: string) => void;
  resetRun: () => void;
  setNodeStatus: (nodeId: string, status: NodeExecutionResult["status"]) => void;
  setNodeResult: (nodeId: string, result: Partial<NodeExecutionResult>) => void;
  setNodeOutput: (nodeId: string, output: unknown) => void;
  setNodeError: (nodeId: string, error: string) => void;
  completeExecution: (status: "success" | "error") => void;
  reset: () => void;
  addLog: (level: "info" | "warn" | "error", message: string) => void;
}

export const useExecutionStore = create<ExecutionState>()((set, get) => ({
  executionId: null,
  status: "idle",
  simulationReport: null,
  nodeResults: new Map(),
  logs: [],

  setSimulationReport: (report) => set({ simulationReport: report }),

  startExecution: (executionId) => {
    set({
      executionId,
      status: "running",
      nodeResults: new Map(),
    });
  },

  resetRun: () => {
    set({
      executionId: null,
      status: "idle",
      nodeResults: new Map(),
      logs: [],
    });
  },

  setNodeStatus: (nodeId, status) => {
    const results = new Map(get().nodeResults);
    const existing = results.get(nodeId) || { nodeId, status: "idle" };
    results.set(nodeId, {
      ...existing,
      status,
      startedAt: status === "running" ? Date.now() : existing.startedAt,
      completedAt: status === "success" || status === "error" || status === "skipped" ? Date.now() : existing.completedAt,
    });
    set({ nodeResults: results });
  },

  setNodeResult: (nodeId, result) => {
    const results = new Map(get().nodeResults);
    const existing = results.get(nodeId) || { nodeId, status: "idle" };
    results.set(nodeId, { ...existing, ...result, nodeId });
    set({ nodeResults: results });
  },

  setNodeOutput: (nodeId, output) => {
    const results = new Map(get().nodeResults);
    const existing = results.get(nodeId) || { nodeId, status: "idle" };
    results.set(nodeId, { ...existing, output });
    set({ nodeResults: results });
  },

  setNodeError: (nodeId, error) => {
    const results = new Map(get().nodeResults);
    const existing = results.get(nodeId) || { nodeId, status: "idle" };
    results.set(nodeId, { ...existing, status: "error", error, completedAt: Date.now() });
    set({ nodeResults: results });
  },

  completeExecution: (status) => {
    set({ status });
  },

  reset: () => {
    set({
      executionId: null,
      status: "idle",
      simulationReport: null,
      nodeResults: new Map(),
      logs: [],
    });
  },

  addLog: (level, message) => {
    set({ logs: [...get().logs, { timestamp: Date.now(), level, message }] });
  },
}));
