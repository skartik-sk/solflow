// FlowCanvas — the React Flow canvas component.
// Must be client-side only (React Flow requires the DOM).

"use client";

import React, { useCallback, useRef, useState, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ConnectionLineType,
  SelectionMode,
  useNodes,
  useReactFlow,
  type OnConnect,
  type ReactFlowInstance,
  type DefaultEdgeOptions,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  NODE_COLOR_MAP,
} from "@solflow/flow-nodes";
import { useFlowStore } from "@/store/flow-store";
import { useUIStore } from "@/store/ui-store";
import { setRFInstance } from "@/lib/rf-instance";
import {
  createEditorNodeFromType,
  editorNodeTypes,
  normalizeEditorNodeType,
} from "@/lib/plugins/editor-nodes";
import { Copy, Trash2, AlignHorizontalSpaceAround, AlignVerticalSpaceAround } from "lucide-react";

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

// ─── Canvas search overlay ──────────────────────────────────────────────────

function CanvasSearchOverlay({
  rfInstance,
  onClose,
}: {
  rfInstance: ReactFlowInstance | null;
  onClose: () => void;
}) {
  const nodes = useFlowStore((s) => s.nodes);
  const [query, setQuery] = useState("");
  const [matchIdx, setMatchIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Matching nodes
  const matches = nodes.filter((n) => {
    if (!query.trim()) return false;
    const q = query.toLowerCase();
    const data = n.data as Record<string, unknown>;
    const name = String(data?.name ?? data?.label ?? n.type ?? "");
    return (
      name.toLowerCase().includes(q) ||
      (n.type ?? "").toLowerCase().includes(q)
    );
  });

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Jump to match
  const focusMatch = useCallback(
    (idx: number) => {
      if (!rfInstance || matches.length === 0) return;
      const node = matches[idx];
      if (!node) return;
      rfInstance.fitView({
        nodes: [{ id: node.id }],
        padding: 0.5,
        duration: 300,
      });
    },
    [rfInstance, matches],
  );

  // Navigate matches
  const goNext = () => {
    if (matches.length === 0) return;
    const next = (matchIdx + 1) % matches.length;
    setMatchIdx(next);
    focusMatch(next);
  };

  const goPrev = () => {
    if (matches.length === 0) return;
    const prev = (matchIdx - 1 + matches.length) % matches.length;
    setMatchIdx(prev);
    focusMatch(prev);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.shiftKey ? goPrev() : goNext();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  // Reset match index when query changes
  useEffect(() => {
    setMatchIdx(0);
    if (matches.length > 0) focusMatch(0);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-lg border border-border bg-card shadow-lg px-2 py-1">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find node…"
        className="w-44 bg-transparent px-1 py-0.5 text-xs outline-none placeholder:text-muted-foreground/50"
      />
      {query.trim() && (
        <>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {matches.length > 0 ? `${matchIdx + 1}/${matches.length}` : "0/0"}
          </span>
          <button
            onClick={goPrev}
            disabled={matches.length === 0}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 px-0.5"
            title="Previous match (Shift+Enter)"
          >
            &#x25B2;
          </button>
          <button
            onClick={goNext}
            disabled={matches.length === 0}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 px-0.5"
            title="Next match (Enter)"
          >
            &#x25BC;
          </button>
        </>
      )}
      <button
        onClick={onClose}
        className="text-muted-foreground hover:text-foreground ml-0.5"
        title="Close (Esc)"
      >
        &times;
      </button>
    </div>
  );
}

// ─── Fit to screen button (must be inside ReactFlow context) ────────────────

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

// ─── Floating multi-select toolbar ───────────────────────────────────────────

function MultiSelectToolbar() {
  const selectedNodeIds = useFlowStore((s) => s.selectedNodeIds);
  const nodes = useFlowStore((s) => s.nodes);
  const removeNode = useFlowStore((s) => s.removeNode);
  const duplicateNodes = useFlowStore((s) => s.duplicateNodes);
  const { fitView } = useReactFlow();

  if (selectedNodeIds.length < 2) return null;

  const handleDelete = () => {
    for (const id of selectedNodeIds) removeNode(id);
  };

  const handleDuplicate = () => duplicateNodes(selectedNodeIds);

  const handleAlignH = () => {
    if (selectedNodeIds.length < 2) return;
    const sel = nodes.filter((n) => selectedNodeIds.includes(n.id));
    const sorted = [...sel].sort((a, b) => a.position.x - b.position.x);
    const gap = 200;
    const startX = sorted[0].position.x;
    sorted.forEach((n, i) => {
      useFlowStore.getState().onNodesChange([
        { type: "position", id: n.id, position: { x: startX + i * gap, y: n.position.y }, dragging: false },
      ]);
    });
  };

  const handleAlignV = () => {
    if (selectedNodeIds.length < 2) return;
    const sel = nodes.filter((n) => selectedNodeIds.includes(n.id));
    const sorted = [...sel].sort((a, b) => a.position.y - b.position.y);
    const gap = 100;
    const startY = sorted[0].position.y;
    sorted.forEach((n, i) => {
      useFlowStore.getState().onNodesChange([
        { type: "position", id: n.id, position: { x: n.position.x, y: startY + i * gap }, dragging: false },
      ]);
    });
  };

  return (
    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-xl border border-border bg-card/95 backdrop-blur-md px-2 py-1.5 shadow-xl">
      <span className="px-2 text-[10px] font-medium text-muted-foreground">
        {selectedNodeIds.length} selected
      </span>
      <div className="mx-1 h-4 w-px bg-border" />
      <button
        onClick={handleDuplicate}
        title="Duplicate selected"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <Copy size={13} />
      </button>
      <button
        onClick={handleAlignH}
        title="Align horizontally"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <AlignHorizontalSpaceAround size={13} />
      </button>
      <button
        onClick={handleAlignV}
        title="Align vertically"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <AlignVerticalSpaceAround size={13} />
      </button>
      <button
        onClick={() => fitView({ nodes: selectedNodeIds.map((id) => ({ id })), padding: 0.2, duration: 300 })}
        title="Focus selection"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
      </button>
      <div className="mx-1 h-4 w-px bg-border" />
      <button
        onClick={handleDelete}
        title="Delete selected"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
      >
        <Trash2 size={13} />
      </button>
    </div>
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
  const [searchOpen, setSearchOpen] = useState(false);

  // Also register it globally so other panels (e.g. AuditPanel) can call focusNode()
  const handleInit = React.useCallback((instance: ReactFlowInstance) => {
    setRfInstance(instance);
    setRFInstance(instance);
  }, []);

  // Ctrl+F / Cmd+F to open canvas search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Memoize the minimap nodeColor callback — stable reference
  const minimapNodeColor = useCallback(
    (n: { type?: string }) =>
      NODE_COLOR_MAP[normalizeEditorNodeType(n.type)] ?? "#666",
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
      );
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

      const newNode = createEditorNodeFromType(type, position);
      if (!newNode) return;

      addNode(newNode);
    },
    [rfInstance, addNode],
  );

  return (
    <div ref={reactFlowWrapper} className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={editorNodeTypes}
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
        {/* Diff overlay rings — rendered inside ReactFlow so positions are in flow coords */}
        <DiffOverlayLayer />
        {/* Fit-to-screen button */}
        <FitViewButton />
        {/* Floating multi-select toolbar */}
        <MultiSelectToolbar />
      </ReactFlow>
      {/* Canvas search overlay */}
      {searchOpen && (
        <CanvasSearchOverlay
          rfInstance={rfInstance}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  );
}
