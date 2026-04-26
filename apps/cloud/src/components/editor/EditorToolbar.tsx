"use client";

// EditorToolbar — top bar with workflow name, undo/redo, save, run, activate.

import React from "react";
import {
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
} from "lucide-react";
import { useWorkflowStore, useUndo, useRedo, useCanUndo, useCanRedo } from "@/store/workflow-store";
import { useEditorUIStore } from "@/store/editor-ui-store";
import { useExecutionStore } from "@/store/execution-store";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";

export function EditorToolbar() {
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const workflowId = useWorkflowStore((s) => s.workflowId);
  const workflowStatus = useWorkflowStore((s) => s.workflowStatus);
  const setWorkflowStatus = useWorkflowStore((s) => s.setWorkflowStatus);
  const isDirty = useWorkflowStore((s) => s.isDirty);
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);

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
  const setNodeStatus = useExecutionStore((s) => s.setNodeStatus);
  const setNodeOutput = useExecutionStore((s) => s.setNodeOutput);
  const setNodeError = useExecutionStore((s) => s.setNodeError);
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
    const serializedNodes = nodes.map((n) => {
      const data = (n.data as any)?.data ?? n.data ?? {};
      return {
        id: n.id,
        type: n.type ?? "unknown",
        position: n.position,
        data: typeof data === "object" ? data : {},
      };
    });
    const serializedEdges = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    }));
    await saveWorkflow.mutateAsync({
      id: workflowId,
      definition: { nodes: serializedNodes, edges: serializedEdges },
    });
  };

  const handleRun = async () => {
    if (isRunning || !workflowId) return;
    setIsRunning(true);

    try {
      // If no tRPC backend, fall back to mock execution
      if (workflowId.startsWith("mock-") || !workflowId.includes("-")) {
        await handleMockRun();
        return;
      }

      // First save the workflow definition
      const serializedNodes = nodes.map((n) => {
        const data = (n.data as any)?.data ?? n.data ?? {};
        return {
          id: n.id,
          type: n.type ?? "unknown",
          position: n.position,
          data: typeof data === "object" ? data : {},
        };
      });
      const serializedEdges = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      }));

      await utils.client.workflow.update.mutate({
        id: workflowId,
        definition: { nodes: serializedNodes, edges: serializedEdges },
      });

      // Trigger execution via tRPC
      const execution = await runExecution.mutateAsync({ workflowId });
      const executionId = execution.id;

      startExecution(executionId);
      addLog("info", `Execution ${executionId} queued`);

      // Poll for results
      const pollInterval = setInterval(async () => {
        try {
          const result = await utils.client.execution.get.query({ id: executionId });
          if (!result) return;

          // Update node statuses from DB results
          if (result.nodeResults) {
            for (const nr of result.nodeResults as any[]) {
              if (nr.status === "COMPLETED") {
                setNodeStatus(nr.nodeId, "success");
                setNodeOutput(nr.nodeId, nr.outputSnapshot);
                addLog("info", `${nr.nodeType} completed (${nr.duration ?? 0}ms)`);
              } else if (nr.status === "FAILED") {
                setNodeStatus(nr.nodeId, "error");
                setNodeError(nr.nodeId, nr.error ?? "Unknown error");
                addLog("error", `${nr.nodeType} failed: ${nr.error ?? "Unknown error"}`);
              } else if (nr.status === "RUNNING") {
                setNodeStatus(nr.nodeId, "running");
              }
            }
          }

          // Check if execution is complete
          if (result.status === "COMPLETED" || result.status === "FAILED" || result.status === "CANCELLED") {
            clearInterval(pollInterval);
            const finalStatus = result.status === "COMPLETED" ? "success" : "error";
            completeExecution(finalStatus);
            addLog("info", `Workflow execution ${finalStatus}`);
            openBottomPanelTab("output");
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
        if (isRunning) {
          completeExecution("error");
          addLog("error", "Execution timed out");
          setIsRunning(false);
        }
      }, 300_000);
    } catch (err) {
      // If tRPC fails, fall back to mock
      addLog("warn", `tRPC run failed, using mock: ${err}`);
      await handleMockRun();
    }
  };

  const handleMockRun = async () => {
    const executionId = crypto.randomUUID();
    startExecution(executionId);
    addLog("info", `Starting mock execution ${executionId}`);

    try {
      const triggerNodes = nodes.filter(
        (n) => !(edges.some((e) => e.target === n.id)),
      );

      if (triggerNodes.length === 0) {
        addLog("error", "No trigger node found. Add a trigger to start.");
        completeExecution("error");
        setIsRunning(false);
        return;
      }

      const visited = new Set<string>();
      const queue = triggerNodes.map((n) => n.id);

      while (queue.length > 0) {
        const nodeId = queue.shift()!;
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);

        const node = nodes.find((n) => n.id === nodeId);
        if (!node) continue;

        setNodeStatus(nodeId, "running");
        addLog("info", `Executing ${node.type}`);

        await new Promise((r) => setTimeout(r, 500));

        setNodeStatus(nodeId, "success");
        setNodeOutput(nodeId, { result: "ok", timestamp: Date.now() });
        addLog("info", `${node.type} completed successfully`);

        const downstream = edges
          .filter((e) => e.source === nodeId)
          .map((e) => e.target);
        queue.push(...downstream);
      }

      completeExecution("success");
      addLog("info", "Workflow execution completed");
      openBottomPanelTab("output");
    } catch (err) {
      completeExecution("error");
      addLog("error", `Execution failed: ${err}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex h-10 items-center justify-between border-b border-border bg-card px-2">
      {/* Left: panels toggle + name */}
      <div className="flex items-center gap-2">
        <button
          onClick={togglePalette}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title={paletteOpen ? "Close palette" : "Open palette"}
        >
          {paletteOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
        </button>

        <div className="flex items-center gap-1.5">
          <h1 className="text-xs font-semibold truncate max-w-[200px]">
            {workflowName}
          </h1>
          {isDirty && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" title="Unsaved changes" />
          )}
        </div>

        <span className="text-[10px] text-muted-foreground/50 ml-1">
          {nodes.length} nodes, {edges.length} connections
        </span>
      </div>

      {/* Right: undo/redo, save, run */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => undo()}
          disabled={!canUndo}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 transition-colors"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={13} />
        </button>
        <button
          onClick={() => redo()}
          disabled={!canRedo}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 transition-colors"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 size={13} />
        </button>

        <div className="mx-1 h-4 w-px bg-border" />

        <button
          onClick={handleSave}
          disabled={!workflowId || saveWorkflow.isPending}
          className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 transition-colors"
          title="Save workflow"
        >
          {saveWorkflow.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Save
        </button>

        <button
          onClick={handleToggleActive}
          disabled={!workflowId || activate.isPending || deactivate.isPending}
          className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
            isActive
              ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          } disabled:opacity-50`}
          title={isActive ? "Deactivate workflow" : "Activate workflow"}
        >
          {(activate.isPending || deactivate.isPending) ? (
            <Loader2 size={12} className="animate-spin" />
          ) : isActive ? (
            <PowerOff size={12} />
          ) : (
            <Power size={12} />
          )}
          {isActive ? "Active" : "Activate"}
        </button>

        <button
          onClick={handleRun}
          disabled={isRunning || runExecution.isPending || nodes.length === 0}
          className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          title="Run workflow"
        >
          {isRunning ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Play size={12} />
          )}
          {isRunning ? "Running..." : "Run"}
        </button>

        <button
          onClick={toggleProperties}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title={propertiesOpen ? "Close properties" : "Open properties"}
        >
          {propertiesOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
        </button>
      </div>
    </div>
  );
}
