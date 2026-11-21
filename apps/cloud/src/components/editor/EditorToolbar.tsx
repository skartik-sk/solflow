"use client";

// EditorToolbar — top bar with workflow name, undo/redo, save, run, activate.

import React from "react";
import Link from "next/link";
import type { Edge, Node } from "@xyflow/react";
import {
  ChevronLeft,
  Undo2,
  Redo2,
  Save,
  Play,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Loader2,
  Power,
  PowerOff,
  Share2,
  ShieldCheck,
} from "lucide-react";
import {
  useWorkflowStore,
  useUndo,
  useRedo,
  useCanUndo,
  useCanRedo,
} from "@/store/workflow-store";
import { useEditorUIStore } from "@/store/editor-ui-store";
import { useExecutionStore } from "@/store/execution-store";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { redactPreviewValue } from "@/lib/cloud-workflow-features";
import {
  EdDivider,
  SolMark,
  edBtn,
  edGhostBtn,
  edIconBtn,
  edPrimaryBtn,
  edx,
} from "./editor-chrome";

function serializeWorkflowDefinition(nodes: Node[], edges: Edge[]) {
  const serializedNodes = nodes.map((n) => {
    const nodeData = n.data as { data?: unknown } | undefined;
    const rawData =
      nodeData?.data &&
      typeof nodeData.data === "object" &&
      !Array.isArray(nodeData.data)
        ? nodeData.data
        : n.data ?? {};
    return {
      id: n.id,
      type: n.type ?? "unknown",
      position: n.position,
      data:
        rawData && typeof rawData === "object" && !Array.isArray(rawData)
          ? (rawData as Record<string, unknown>)
          : {},
    };
  });
  const serializedEdges = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
  }));
  return { nodes: serializedNodes, edges: serializedEdges };
}

type PolledNodeResult = {
  nodeId: string;
  nodeType: string;
  status: string;
  inputSnapshot: unknown;
  outputSnapshot: unknown;
  error?: string | null;
  duration?: number | null;
  logs?: unknown;
  startedAt?: string | Date | null;
  completedAt?: string | Date | null;
};

function encodePreviewSnapshot(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function EditorToolbar() {
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const workflowId = useWorkflowStore((s) => s.workflowId);
  const workflowStatus = useWorkflowStore((s) => s.workflowStatus);
  const setWorkflowStatus = useWorkflowStore((s) => s.setWorkflowStatus);
  const isDirty = useWorkflowStore((s) => s.isDirty);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const workflowSettings = useWorkflowStore((s) => s.workflowSettings);

  const undo = useUndo();
  const redo = useRedo();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  const paletteOpen = useEditorUIStore((s) => s.paletteOpen);
  const propertiesOpen = useEditorUIStore((s) => s.propertiesOpen);
  const isRunning = useEditorUIStore((s) => s.isRunning);
  const togglePalette = useEditorUIStore((s) => s.togglePalette);
  const toggleProperties = useEditorUIStore((s) => s.toggleProperties);
  const setIsRunning = useEditorUIStore((s) => s.setIsRunning);
  const openBottomPanelTab = useEditorUIStore((s) => s.openBottomPanelTab);

  const startExecution = useExecutionStore((s) => s.startExecution);
  const resetRun = useExecutionStore((s) => s.resetRun);
  const setSimulationReport = useExecutionStore((s) => s.setSimulationReport);
  const setNodeResult = useExecutionStore((s) => s.setNodeResult);
  const completeExecution = useExecutionStore((s) => s.completeExecution);
  const addLog = useExecutionStore((s) => s.addLog);

  const isActive = workflowStatus === "ACTIVE";
  const activate = trpc.workflow.activate.useMutation({
    onSuccess: (data) => {
      if (data?.status) setWorkflowStatus(data.status);
      toast.success("Workflow activated");
    },
    onError: (err) => toast.error(`Activation failed: ${err.message}`),
  });
  const deactivate = trpc.workflow.deactivate.useMutation({
    onSuccess: (data) => {
      if (data?.status) setWorkflowStatus(data.status);
      toast.success("Workflow deactivated");
    },
    onError: (err) => toast.error(`Deactivation failed: ${err.message}`),
  });

  const handleToggleActive = async () => {
    if (!workflowId) return;
    if (isActive) {
      await deactivate.mutateAsync({ id: workflowId });
    } else {
      await activate.mutateAsync({ id: workflowId });
    }
  };

  const runExecution = trpc.execution.run.useMutation();
  const simulateWorkflow = trpc.workflow.simulate.useMutation();
  const utils = trpc.useUtils();

  const saveWorkflow = trpc.workflow.update.useMutation({
    onSuccess: () => {
      toast.success("Workflow saved");
      useWorkflowStore.setState({ isDirty: false });
    },
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });

  const handleSave = async () => {
    if (!workflowId) {
      toast.error("Cannot save — no workflow ID");
      return;
    }
    await saveWorkflow.mutateAsync({
      id: workflowId,
      definition: serializeWorkflowDefinition(nodes, edges),
      settings: workflowSettings,
    });
  };

  const runSimulation = async () => {
    if (!workflowId) {
      toast.error("Cannot preflight - no workflow ID");
      return null;
    }
    const definition = serializeWorkflowDefinition(nodes, edges);
    const report = await simulateWorkflow.mutateAsync({
      workflowId,
      definition,
      settings: workflowSettings,
    });
    setSimulationReport(report);
    openBottomPanelTab("simulation");
    return { definition, report };
  };

  const handlePreflight = async () => {
    try {
      const result = await runSimulation();
      if (!result) return;
      if (result.report.blocked) {
        toast.error("Preflight found blockers");
      } else if (result.report.warnings.length > 0) {
        toast.message("Preflight ready with warnings");
      } else {
        toast.success("Preflight ready");
      }
    } catch (err) {
      toast.error(
        `Preflight failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const handleSharePreview = async () => {
    if (typeof window === "undefined") return;
    const definition = serializeWorkflowDefinition(nodes, edges);
    const snapshot = {
      name: workflowName,
      status: workflowStatus,
      generatedAt: new Date().toISOString(),
      definition: redactPreviewValue(definition),
      settings: redactPreviewValue(workflowSettings),
    };
    const url = `${window.location.origin}/preview?snapshot=${encodeURIComponent(encodePreviewSnapshot(snapshot))}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Preview link copied");
    } catch {
      toast.error("Could not copy preview link");
    }
  };

  const handleRun = async () => {
    if (isRunning) return;
    resetRun();
    openBottomPanelTab("logs");
    if (!workflowId) {
      addLog("error", "Workflow must finish loading before it can run");
      toast.error("Workflow is not ready yet");
      return;
    }
    if (nodes.length === 0) {
      addLog("error", "Add at least one trigger node before running");
      toast.error("Add a node before running");
      return;
    }
    setIsRunning(true);
    addLog("info", "Manual run requested");

    try {
      if (workflowId.startsWith("mock-")) {
        throw new Error("Workflow must be saved before it can run");
      }

      const simulation = await runSimulation();
      if (!simulation) {
        setIsRunning(false);
        return;
      }
      addLog(
        "info",
        `Preflight complete: ${simulation.report.riskLevel} risk, ${simulation.report.estimatedFeeSol} SOL estimated fee`,
      );
      for (const warning of simulation.report.warnings) {
        addLog("warn", `Preflight warning: ${warning}`);
      }
      for (const blocker of simulation.report.blockers) {
        addLog("error", `Preflight blocker: ${blocker}`);
      }
      if (simulation.report.blocked) {
        throw new Error(
          `Preflight blocked run: ${simulation.report.blockers.join(" ")}`,
        );
      }

      await utils.client.workflow.update.mutate({
        id: workflowId,
        definition: simulation.definition,
        settings: workflowSettings,
      });
      useWorkflowStore.setState({ isDirty: false });
      if (isDirty) addLog("info", "Latest workflow changes saved for this run");

      // Trigger execution via tRPC
      const execution = await runExecution.mutateAsync({ workflowId });
      const executionId = execution.id;

      startExecution(executionId);
      addLog("info", `Execution ${executionId} queued`);
      openBottomPanelTab("executions");

      // Poll for results
      const seenNodeLogs = new Set<string>();
      const pollInterval = setInterval(async () => {
        try {
          const result = await utils.client.execution.get.query({
            id: executionId,
          });
          if (!result) return;

          // Update node statuses from DB results
          if (result.nodeResults) {
            for (const nr of result.nodeResults as PolledNodeResult[]) {
              const baseResult = {
                nodeType: nr.nodeType,
                input: nr.inputSnapshot,
                output: nr.outputSnapshot,
                error: nr.error ?? undefined,
                duration: nr.duration ?? undefined,
                logs: Array.isArray(nr.logs) ? nr.logs : [],
                startedAt: nr.startedAt
                  ? new Date(nr.startedAt).getTime()
                  : undefined,
                completedAt: nr.completedAt
                  ? new Date(nr.completedAt).getTime()
                  : undefined,
              };
              const nodeLogKey = `${nr.nodeId}:${nr.status}`;
              if (nr.status === "COMPLETED") {
                setNodeResult(nr.nodeId, { ...baseResult, status: "success" });
                if (!seenNodeLogs.has(nodeLogKey)) {
                  seenNodeLogs.add(nodeLogKey);
                  addLog(
                    "info",
                    `${nr.nodeType} completed (${nr.duration ?? 0}ms)`,
                  );
                }
              } else if (nr.status === "FAILED") {
                setNodeResult(nr.nodeId, { ...baseResult, status: "error" });
                if (!seenNodeLogs.has(nodeLogKey)) {
                  seenNodeLogs.add(nodeLogKey);
                  addLog(
                    "error",
                    `${nr.nodeType} failed: ${nr.error ?? "Unknown error"}`,
                  );
                }
              } else if (nr.status === "RUNNING") {
                setNodeResult(nr.nodeId, { ...baseResult, status: "running" });
                if (!seenNodeLogs.has(nodeLogKey)) {
                  seenNodeLogs.add(nodeLogKey);
                  addLog("info", `${nr.nodeType} started`);
                }
              } else if (nr.status === "SKIPPED") {
                setNodeResult(nr.nodeId, { ...baseResult, status: "skipped" });
                if (!seenNodeLogs.has(nodeLogKey)) {
                  seenNodeLogs.add(nodeLogKey);
                  addLog(
                    "warn",
                    `${nr.nodeType} skipped: ${nr.error ?? "Dependency skipped"}`,
                  );
                }
              } else if (nr.status === "WAITING") {
                setNodeResult(nr.nodeId, { ...baseResult, status: "running" });
                if (!seenNodeLogs.has(nodeLogKey)) {
                  seenNodeLogs.add(nodeLogKey);
                  addLog(
                    "warn",
                    `${nr.nodeType} waiting: ${nr.error ?? "Manual approval required"}`,
                  );
                }
              }
            }
          }

          // Check if execution is complete
          if (
            result.status === "COMPLETED" ||
            result.status === "FAILED" ||
            result.status === "CANCELLED" ||
            result.status === "TIMED_OUT"
          ) {
            clearInterval(pollInterval);
            const finalStatus =
              result.status === "COMPLETED" ? "success" : "error";
            completeExecution(finalStatus);
            addLog("info", `Workflow execution ${finalStatus}`);
            openBottomPanelTab("executions");
            setIsRunning(false);
            utils.execution.list.invalidate();
          }
        } catch {
          // Polling error — continue
        }
      }, 1500);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (useEditorUIStore.getState().isRunning) {
          completeExecution("error");
          addLog("error", "Execution timed out");
          setIsRunning(false);
        }
      }, 300_000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      completeExecution("error");
      addLog("error", `Execution failed: ${message}`);
      openBottomPanelTab("logs");
      setIsRunning(false);
    }
  };

  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-3 overflow-x-auto border-b border-border bg-card px-2.5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.02)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* Left: back, panels toggle, name, status */}
      <div className="flex min-w-0 shrink-0 items-center gap-1">
        <Link
          href="/dashboard"
          className="group flex h-7 items-center gap-0.5 rounded-md pl-0.5 pr-1 text-muted-foreground outline-none transition-colors duration-150 ease-out hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          title="Back to dashboard"
          aria-label="Back to dashboard"
        >
          <ChevronLeft
            size={14}
            className="transition-transform duration-150 ease-out group-hover:-translate-x-0.5 motion-reduce:transition-none"
          />
          <SolMark size={22} />
        </Link>
        <button
          onClick={togglePalette}
          className={edIconBtn}
          title={paletteOpen ? "Close palette" : "Open palette"}
          aria-label={paletteOpen ? "Close palette" : "Open palette"}
          aria-pressed={paletteOpen}
        >
          {paletteOpen ? (
            <PanelLeftClose size={14} />
          ) : (
            <PanelLeftOpen size={14} />
          )}
        </button>

        <span className="px-0.5 text-[13px] text-white/15" aria-hidden>
          /
        </span>

        <div className="flex min-w-0 items-center gap-1.5">
          <h1
            className="max-w-[200px] truncate px-0.5 text-[13px] font-semibold tracking-[-0.01em] text-foreground"
            title={workflowName}
          >
            {workflowName}
          </h1>
          {isDirty && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
              title="Unsaved changes"
            />
          )}
        </div>

        <span className="ml-1.5 hidden shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/60 lg:inline">
          {nodes.length} nodes, {edges.length} connections
        </span>
        <span
          className={`ml-1.5 inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium ${
            isActive
              ? "border-green-500/20 bg-green-500/10 text-green-400"
              : "border-white/[0.08] bg-white/[0.03] text-muted-foreground"
          }`}
          title={
            isActive
              ? "Triggers are active"
              : "Manual runs still work while inactive"
          }
        >
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-green-400" : "bg-white/25"}`}
          />
          {isActive ? "Triggers active" : "Manual run mode"}
        </span>
      </div>

      {/* Right: undo/redo, save, run */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => undo()}
          disabled={!canUndo}
          className={edIconBtn}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Undo2 size={13} />
        </button>
        <button
          onClick={() => redo()}
          disabled={!canRedo}
          className={edIconBtn}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          <Redo2 size={13} />
        </button>

        <EdDivider />

        <button
          onClick={handleSave}
          disabled={!workflowId || saveWorkflow.isPending}
          className={edGhostBtn}
          title="Save workflow"
        >
          {saveWorkflow.isPending ? (
            <Loader2 size={12} className="animate-spin motion-reduce:animate-none" />
          ) : (
            <Save size={12} />
          )}
          Save
        </button>

        <button
          onClick={handleSharePreview}
          disabled={nodes.length === 0}
          className={edGhostBtn}
          title="Copy shareable workflow preview"
        >
          <Share2 size={12} />
          Share
        </button>

        <button
          onClick={handleToggleActive}
          disabled={!workflowId || activate.isPending || deactivate.isPending}
          className={
            isActive
              ? edx(
                  edBtn,
                  "bg-green-500/10 text-green-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_0_1px_rgba(74,222,128,0.25)] hover:bg-green-500/15 hover:text-green-300",
                )
              : edBtn
          }
          title={isActive ? "Deactivate workflow" : "Activate workflow"}
          aria-pressed={isActive}
        >
          {activate.isPending || deactivate.isPending ? (
            <Loader2 size={12} className="animate-spin motion-reduce:animate-none" />
          ) : isActive ? (
            <PowerOff size={12} />
          ) : (
            <Power size={12} />
          )}
          {isActive ? "Active" : "Activate"}
        </button>

        <button
          onClick={handlePreflight}
          disabled={
            !workflowId || simulateWorkflow.isPending || nodes.length === 0
          }
          className={edBtn}
          title="Preflight workflow before running"
        >
          {simulateWorkflow.isPending ? (
            <Loader2 size={12} className="animate-spin motion-reduce:animate-none" />
          ) : (
            <ShieldCheck size={12} />
          )}
          Preflight
        </button>

        <button
          onClick={handleRun}
          disabled={
            isRunning ||
            runExecution.isPending ||
            simulateWorkflow.isPending ||
            nodes.length === 0
          }
          className={edx(edPrimaryBtn, "ml-0.5")}
          title="Run workflow"
        >
          {isRunning ? (
            <Loader2 size={12} className="animate-spin motion-reduce:animate-none" />
          ) : (
            <Play size={12} />
          )}
          {isRunning ? "Running..." : "Run"}
        </button>

        <EdDivider />

        <button
          onClick={toggleProperties}
          className={edIconBtn}
          title={propertiesOpen ? "Close properties" : "Open properties"}
          aria-label={propertiesOpen ? "Close properties" : "Open properties"}
          aria-pressed={propertiesOpen}
        >
          {propertiesOpen ? (
            <PanelRightClose size={14} />
          ) : (
            <PanelRightOpen size={14} />
          )}
        </button>
      </div>
    </header>
  );
}
