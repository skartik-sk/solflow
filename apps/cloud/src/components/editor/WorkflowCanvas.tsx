"use client";

// WorkflowCanvas — React Flow canvas for the cloud workflow editor.

import React, { useCallback, useRef, useState, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ConnectionLineType,
  SelectionMode,
  useReactFlow,
  type ReactFlowInstance,
  type DefaultEdgeOptions,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  cloudNodeTypes,
  CATEGORY_COLORS,
  type CloudFlowNodeData,
} from "@solflow/cloud-nodes";
import { getIconByName } from "@solflow/cloud-nodes";
import { useWorkflowStore } from "@/store/workflow-store";
import { useExecutionStore } from "@/store/execution-store";

const connectionLineStyle: React.CSSProperties = {
  strokeWidth: 2,
  stroke: "#3b82f6",
};

const fitViewOptions = { padding: 0.2 };
const snapGrid: [number, number] = [16, 16];
const deleteKeyCode = ["Backspace", "Delete"];
const defaultEdgeOptions: DefaultEdgeOptions = {
  type: "smoothstep",
  animated: true,
  style: { strokeWidth: 2 },
};

// ─── Execution status overlay on nodes ─────────────────────────────────────

function ExecutionOverlayLayer() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const nodeResults = useExecutionStore((s) => s.nodeResults);
  const { fitView } = useReactFlow();

  if (nodeResults.size === 0) return null;

  return (
    <>
      {nodes
        .filter((n) => nodeResults.has(n.id))
        .map((n) => {
          const result = nodeResults.get(n.id)!;
          if (result.status === "idle") return null;
          const color =
            result.status === "running"
              ? "rgba(59,130,246,0.75)"
              : result.status === "success"
                ? "rgba(34,197,94,0.75)"
                : "rgba(239,68,68,0.75)";
          const width = (n as { measured?: { width?: number } }).measured?.width ?? 180;
          const height = (n as { measured?: { height?: number } }).measured?.height ?? 60;

          return (
            <div
              key={n.id}
              style={{
                position: "absolute",
                left: n.position.x - 3,
                top: n.position.y - 3,
                width: width + 6,
                height: height + 6,
                borderRadius: 12,
                border: `2px solid ${color}`,
                boxShadow: result.status === "running" ? `0 0 12px 3px ${color}` : `0 0 6px 2px ${color}`,
                pointerEvents: "none",
                zIndex: 10,
                animation: result.status === "running" ? "pulse-ring 1.5s ease-in-out infinite" : undefined,
              }}
            />
          );
        })}
      <style>{`
        @keyframes pulse-ring {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </>
  );
}

// ─── Fit View Button ────────────────────────────────────────────────────────

function FitViewButton() {
  const { fitView } = useReactFlow();
  return (
    <button
      onClick={() => fitView({ padding: 0.2, duration: 300 })}
      className="absolute bottom-3 left-3 z-10 flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-lg hover:bg-accent hover:text-foreground transition-colors"
      title="Fit to screen"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
      </svg>
    </button>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function WorkflowCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode } =
    useWorkflowStore();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  const minimapNodeColor = useCallback(
    (n: { data?: { category?: string } }) => {
      const cat = (n.data as CloudFlowNodeData)?.category;
      return cat ? CATEGORY_COLORS[cat] : "#666";
    },
    [],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("application/solflow-cloud-node");
      if (!raw || !rfInstance) return;

      const def = JSON.parse(raw);
      const bounds = wrapperRef.current?.getBoundingClientRect();
      if (!bounds) return;

      const position = rfInstance.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      const node = {
        id: crypto.randomUUID(),
        type: def.type,
        position,
        data: {
          label: def.label,
          type: def.type,
          category: def.category,
          icon: def.icon,
          color: def.color,
          properties: def.properties,
          inputs: def.inputs,
          outputs: def.outputs,
          data: def.defaultData ?? {},
        } as CloudFlowNodeData,
      };

      addNode(node);
    },
    [rfInstance, addNode],
  );

  return (
    <div ref={wrapperRef} className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={cloudNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setRfInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={connectionLineStyle}
        fitView
        fitViewOptions={fitViewOptions}
        snapToGrid
        snapGrid={snapGrid}
        deleteKeyCode={deleteKeyCode}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panOnDrag={[1]}
        panActivationKeyCode="Space"
        multiSelectionKeyCode="Shift"
        minZoom={0.2}
        maxZoom={2}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        defaultEdgeOptions={defaultEdgeOptions}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls
          showInteractive
          className="rounded-xl border border-border bg-card shadow-lg"
        />
        <MiniMap
          nodeColor={minimapNodeColor}
          zoomable
          pannable
          className="rounded-xl border border-border bg-card shadow-lg"
          style={{ width: 140, height: 90 }}
        />
        <ExecutionOverlayLayer />
        <FitViewButton />
      </ReactFlow>
    </div>
  );
}
