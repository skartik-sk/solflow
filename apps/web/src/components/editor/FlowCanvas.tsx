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
import { Copy, Trash2, AlignHorizontalSpaceAround, AlignVerticalSpaceAround, Maximize2, ChevronUp, ChevronDown, X, Search } from "lucide-react";
import { edIconBtn, EdDivider, edx } from "@/components/ui-kit/editor-ui";

// ─── Stable constants (defined outside the component to avoid referential
//     inequality causing React Flow to re-process them on every render) ────────

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
      if (e.shiftKey) {
        goPrev();
      } else {
        goNext();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  // Reset match index when query changes
  useEffect(() => {
    setMatchIdx(0);
    if (matches.length > 0) focusMatch(0);
  }, [query]);

  return (
    <div className="absolute right-3 top-3 z-20 flex h-9 items-center gap-1 rounded-[10px] border border-white/[0.08] bg-popover/95 pl-2.5 pr-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_32px_-12px_rgba(0,0,0,0.8)] backdrop-blur-md">
      <Search size={13} className="shrink-0 text-muted-foreground" aria-hidden />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find node…"
        aria-label="Find node"
        className="w-44 bg-transparent px-1 text-[13px] outline-none placeholder:text-muted-foreground/60"
      />
      {query.trim() && (
        <>
          <span className="shrink-0 px-1 font-mono text-[11px] tabular-nums text-muted-foreground">
            {matches.length > 0 ? `${matchIdx + 1}/${matches.length}` : "0/0"}
          </span>
          <button
            onClick={goPrev}
            disabled={matches.length === 0}
            className={edIconBtn}
            title="Previous match (Shift+Enter)"
            aria-label="Previous match"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={goNext}
            disabled={matches.length === 0}
            className={edIconBtn}
            title="Next match (Enter)"
            aria-label="Next match"
          >
            <ChevronDown size={14} />
          </button>
        </>
      )}
      <button
        onClick={onClose}
        className={edIconBtn}
        title="Close (Esc)"
        aria-label="Close search"
      >
        <X size={13} />
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
      className="absolute bottom-[124px] left-[15px] z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-popover text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_20px_-10px_rgba(0,0,0,0.8)] outline-none transition-[color,background-color,transform] duration-150 ease-out hover:bg-[#1b1e23] hover:text-foreground active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
      title="Fit to screen"
      aria-label="Fit canvas to screen"
    >
      <Maximize2 size={14} />
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
    <div className="absolute bottom-4 left-1/2 z-20 flex h-10 -translate-x-1/2 items-center gap-0.5 rounded-xl border border-white/[0.08] bg-popover/95 px-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_16px_40px_-16px_rgba(0,0,0,0.85)] backdrop-blur-md">
      <span className="px-2 text-[12px] font-medium tabular-nums text-foreground/85">
        {selectedNodeIds.length} selected
      </span>
      <EdDivider />
      <button
        onClick={handleDuplicate}
        title="Duplicate selected"
        className={edIconBtn}
      >
        <Copy size={13} />
      </button>
      <button
        onClick={handleAlignH}
        title="Align horizontally"
        className={edIconBtn}
      >
        <AlignHorizontalSpaceAround size={13} />
      </button>
      <button
        onClick={handleAlignV}
        title="Align vertically"
        className={edIconBtn}
      >
        <AlignVerticalSpaceAround size={13} />
      </button>
      <button
        onClick={() => fitView({ nodes: selectedNodeIds.map((id) => ({ id })), padding: 0.2, duration: 300 })}
        title="Focus selection"
        className={edIconBtn}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
      </button>
      <EdDivider />
      <button
        onClick={handleDelete}
        title="Delete selected"
        className={edx(edIconBtn, "text-red-400 hover:bg-red-500/10 hover:text-red-300")}
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
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="rgba(255,255,255,0.09)" />
        <Controls
          showInteractive
          className="ss-ed-controls"
        />
        <MiniMap
          nodeColor={minimapNodeColor}
          zoomable
          pannable
          className="ss-ed-minimap"
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
