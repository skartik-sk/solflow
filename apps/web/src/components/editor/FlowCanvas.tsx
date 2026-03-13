// FlowCanvas — the React Flow canvas component.
// Must be client-side only (React Flow requires the DOM).

"use client";

import React, { useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ConnectionLineType,
  useNodes,
  type OnConnect,
  type ReactFlowInstance,
  type DefaultEdgeOptions,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  nodeTypes,
  NODE_COLOR_MAP,
  createNodeFromType,
  type NodeTypeName,
} from "@solflow/flow-nodes";
import { useFlowStore } from "@/store/flow-store";
import { useUIStore } from "@/store/ui-store";
import { setRFInstance } from "@/lib/rf-instance";

// ─── Stable constants (defined outside the component to avoid referential
//     inequality causing React Flow to re-process them on every render) ────────

const connectionLineStyle: React.CSSProperties = {
  strokeWidth: 2,
  stroke: "#4a47a3",
};

const fitViewOptions = { padding: 0.2 };
const snapGrid: [number, number] = [16, 16];
const deleteKeyCode = ["Backspace", "Delete"];
const defaultEdgeOptions: DefaultEdgeOptions = {
  type: "smoothstep",
  animated: true,
  style: { strokeWidth: 2 },
};

// ─── Diff overlay color map ───────────────────────────────────────────────────

const DIFF_RING: Record<"added" | "removed" | "modified", string> = {
  added: "rgba(34,197,94,0.75)", // green-500
  removed: "rgba(239,68,68,0.75)", // red-500
  modified: "rgba(234,179,8,0.75)", // yellow-500
};

// ─── DiffOverlayLayer — renders inside the ReactFlow context ─────────────────
// Uses useNodes() to get current node positions + sizes, then renders
// absolutely-positioned rings over each node that has a diff status.

function DiffOverlayLayer() {
  const nodes = useNodes();
  const diffOverlay = useUIStore((s) => s.diffOverlay);

  if (!diffOverlay) return null;

  // Build a lookup: nodeId → diff status
  const statusMap = new Map<string, "added" | "removed" | "modified">();
  for (const n of diffOverlay.nodes.added) statusMap.set(n.id, "added");
  for (const n of diffOverlay.nodes.removed) statusMap.set(n.id, "removed");
  for (const n of diffOverlay.nodes.modified) statusMap.set(n.id, "modified");

  if (statusMap.size === 0) return null;

  return (
    <>
      {nodes
        .filter((n) => statusMap.has(n.id))
        .map((n) => {
          const status = statusMap.get(n.id)!;
          const color = DIFF_RING[status];
          // measured gives us pixel dimensions after layout
          const width =
            (n as { measured?: { width?: number } }).measured?.width ?? 160;
          const height =
            (n as { measured?: { height?: number } }).measured?.height ?? 60;

          return (
            <div
              key={n.id}
              style={{
                position: "absolute",
                left: n.position.x - 4,
                top: n.position.y - 4,
                width: width + 8,
                height: height + 8,
                borderRadius: 10,
                border: `2px solid ${color}`,
                boxShadow: `0 0 8px 2px ${color}`,
                pointerEvents: "none",
                zIndex: 10,
              }}
              title={`${status} in this version`}
            />
          );
        })}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FlowCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode } =
    useFlowStore();

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  // Capture the React Flow instance for screen→flow coordinate conversion
  const [rfInstance, setRfInstance] = React.useState<ReactFlowInstance | null>(
    null,
  );

  // Also register it globally so other panels (e.g. AuditPanel) can call focusNode()
  const handleInit = React.useCallback((instance: ReactFlowInstance) => {
    setRfInstance(instance);
    setRFInstance(instance);
  }, []);

  // Memoize the minimap nodeColor callback — stable reference
  const minimapNodeColor = useCallback(
    (n: { type?: string }) => NODE_COLOR_MAP[n.type ?? ""] ?? "#666",
    [],
  );

  // ─── Drag-and-drop from palette ──────────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData(
        "application/solflow-node",
      ) as NodeTypeName;
      if (!type || !rfInstance) return;

      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;

      const position = rfInstance.screenToFlowPosition
        ? rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        : {
            // Fallback: rough calculation
            x: e.clientX - bounds.left,
            y: e.clientY - bounds.top,
          };

      const newNode = createNodeFromType(type, position);
      addNode(newNode);
    },
    [rfInstance, addNode],
  );

  return (
    <div ref={reactFlowWrapper} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect as OnConnect}
        onInit={handleInit}
        onDrop={onDrop}
        onDragOver={onDragOver}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={connectionLineStyle}
        fitView
        fitViewOptions={fitViewOptions}
        snapToGrid
        snapGrid={snapGrid}
        deleteKeyCode={deleteKeyCode}
        multiSelectionKeyCode="Shift"
        minZoom={0.2}
        maxZoom={2}
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
        {/* Diff overlay rings — rendered inside ReactFlow so positions are in flow coords */}
        <DiffOverlayLayer />
      </ReactFlow>
    </div>
  );
}
