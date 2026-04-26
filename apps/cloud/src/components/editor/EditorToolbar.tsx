"use client";

// EditorToolbar — top bar with workflow name, undo/redo, save, run.

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
} from "lucide-react";
import { useWorkflowStore, useUndo, useRedo, useCanUndo, useCanRedo } from "@/store/workflow-store";
import { useEditorUIStore } from "@/store/editor-ui-store";
import { useExecutionStore } from "@/store/execution-store";

export function EditorToolbar() {
  const workflowName = useWorkflowStore((s) => s.workflowName);
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

  const handleRun = async () => {
    if (isRunning) return;
    setIsRunning(true);

    const executionId = crypto.randomUUID();
    startExecution(executionId);
    addLog("info", `Starting execution ${executionId}`);

    // Simple linear execution through connected nodes
    try {
      // Find trigger nodes (no incoming edges)
      const triggerNodes = nodes.filter(
        (n) => !(edges.some((e) => e.target === n.id)),
      );

      if (triggerNodes.length === 0) {
        addLog("error", "No trigger node found. Add a trigger to start.");
        completeExecution("error");
        setIsRunning(false);
        return;
      }

      // Execute nodes in topological order
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

        // Simulate execution with a small delay for visual feedback
        await new Promise((r) => setTimeout(r, 500));

        // For now, mock execution success
        setNodeStatus(nodeId, "success");
        setNodeOutput(nodeId, { result: "ok", timestamp: Date.now() });
        addLog("info", `${node.type} completed successfully`);

        // Add downstream nodes to queue
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
          className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title="Save workflow"
        >
          <Save size={12} />
          Save
        </button>

        <button
          onClick={handleRun}
          disabled={isRunning || nodes.length === 0}
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
