"use client";

// WorkflowCanvas — React Flow canvas for the cloud workflow editor.

import React, { useCallback, useMemo, useRef, useState } from "react";
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
import { Maximize2 } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";
import { useExecutionStore } from "@/store/execution-store";

const connectionLineStyle: React.CSSProperties = {
  strokeWidth: 2,
  stroke: "#58d3db",
};

const fitViewOptions = { padding: 0.2 };
const snapGrid: [number, number] = [16, 16];
const deleteKeyCode = ["Backspace", "Delete"];
const defaultEdgeOptions: DefaultEdgeOptions = {
  type: "smoothstep",
  animated: true,
  style: { strokeWidth: 2 },
};

const EDGE_STATUS_COLOR: Record<string, string> = {
  running: "#58d3db",
  success: "#34d399",
  error: "#f87171",
  skipped: "#a1a1aa",
};

// ─── Fit View Button ────────────────────────────────────────────────────────

function FitViewButton() {
  const { fitView } = useReactFlow();
  return (
    <button
      onClick={() => fitView({ padding: 0.2, duration: 300 })}
      className="absolute bottom-[183px] left-[15px] z-10 flex h-[30px] w-[30px] items-center justify-center rounded-[10px] border border-white/[0.08] bg-popover text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_20px_-10px_rgba(0,0,0,0.8)] outline-none transition-[color,background-color,transform] duration-150 ease-out hover:bg-[#1b1e23] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary active:scale-[0.97] motion-reduce:transition-none"
      title="Fit to screen"
      aria-label="Fit canvas to screen"
    >
      <Maximize2 size={13} />
    </button>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function WorkflowCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode } =
    useWorkflowStore();
  const nodeResults = useExecutionStore((s) => s.nodeResults);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  const displayNodes = useMemo(
    () =>
      nodes.map((node) => {
        const result = nodeResults.get(node.id);
        if (!result || result.status === "idle") return node;

        return {
          ...node,
          data: {
            ...node.data,
            status: result.status,
            outputPreview: result.output,
          },
        };
      }),
    [nodes, nodeResults],
  );

  const displayEdges = useMemo(
    () =>
      edges.map((edge) => {
        const source = nodeResults.get(edge.source);
        const target = nodeResults.get(edge.target);
        const status =
          target?.status && target.status !== "idle"
            ? target.status
            : source?.status && source.status !== "idle"
              ? source.status
              : undefined;

        if (!status) return edge;

        return {
          ...edge,
          // Visual only: editor.css colours the path by run status
          className: [edge.className, `ss-edge-${status}`].filter(Boolean).join(" "),
          animated: status === "running" || edge.animated,
          style: {
            ...edge.style,
            stroke: EDGE_STATUS_COLOR[status] ?? edge.style?.stroke,
            strokeWidth: status === "running" ? 3 : 2,
          },
        };
      }),
    [edges, nodeResults],
  );

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
        nodes={displayNodes}
        edges={displayEdges}
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
        <Controls showInteractive className="ss-ed-controls" />
        <MiniMap
          nodeColor={minimapNodeColor}
          zoomable
          pannable
          className="ss-ed-minimap"
          style={{ width: 140, height: 90 }}
        />
        <FitViewButton />
      </ReactFlow>
    </div>
  );
}
