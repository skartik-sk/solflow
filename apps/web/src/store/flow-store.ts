"use client";

// Flow Store — the core canvas state (nodes, edges, selection, undo/redo).

import { create, useStore } from "zustand";
import { temporal } from "zundo";
import {
  type Node,
  type Edge,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
} from "@xyflow/react";
import { isValidNodeConnection } from "@solflow/flow-nodes";
import { normalizeEditorNodeType } from "@/lib/plugins/editor-nodes";
import { useCodeStore } from "./code-store";
import { useProjectStore } from "./project-store";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlowState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedNodeIds: string[];

  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  addNode: (node: Node) => void;
  removeNode: (nodeId: string) => void;
  updateNodeData: (
    nodeId: string,
    data: Partial<Record<string, unknown>>,
  ) => void;
  duplicateNodes: (nodeIds: string[]) => void;

  removeEdge: (edgeId: string) => void;

  setSelectedNode: (nodeId: string | null) => void;
  setSelectedEdge: (edgeId: string | null) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  selectAllNodes: () => void;
  compactSelectedNodes: (nodeIds: string[]) => void;

  setFlow: (nodes: Node[], edges: Edge[]) => void;
  clearFlow: () => void;

  regenerateCode: () => void;
  _debouncedRegenerate: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

function validateConnection(connection: Connection, nodes: Node[]): boolean {
  const source = nodes.find((n) => n.id === connection.source);
  const target = nodes.find((n) => n.id === connection.target);
  if (!source || !target) return false;
  if (source.id === target.id) return false;
  return isValidNodeConnection(
    normalizeEditorNodeType(source.type),
    normalizeEditorNodeType(target.type),
  );
}

/**
 * Compare two partialized states for structural equality.
 * Ignores: node.selected, node.measured, node.dragging, edge.selected
 * Only real structural changes (add/remove/move/data-change/connect) count.
 */
function structuralEqual(
  past: { nodes: Node[]; edges: Edge[] },
  current: { nodes: Node[]; edges: Edge[] },
): boolean {
  const pn = past.nodes;
  const cn = current.nodes;
  if (pn.length !== cn.length) return false;
  if (past.edges.length !== current.edges.length) return false;

  for (let i = 0; i < pn.length; i++) {
    const a = pn[i];
    const b = cn[i];
    if (a.id !== b.id || a.type !== b.type) return false;
    if (a.position.x !== b.position.x || a.position.y !== b.position.y) return false;
    if (JSON.stringify(a.data) !== JSON.stringify(b.data)) return false;
  }

  for (let i = 0; i < past.edges.length; i++) {
    const a = past.edges[i];
    const b = current.edges[i];
    if (a.id !== b.id || a.source !== b.source || a.target !== b.target) return false;
  }

  return true;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useFlowStore = create<FlowState>()(
  temporal(
    (set, get) => {
      const debouncedRegen = debounce(() => get().regenerateCode(), 300);

      return {
        nodes: [],
        edges: [],
        selectedNodeId: null,
        selectedEdgeId: null,
        selectedNodeIds: [],

        // ─── React Flow handlers ──────────────────────────────
        onNodesChange: (changes) => {
          const newNodes = applyNodeChanges(changes, get().nodes);
          let dirty = false;
          let lastSelectedId: string | null = get().selectedNodeId;

          for (const change of changes) {
            if (change.type === "select" && change.selected) {
              lastSelectedId = change.id;
            }
            if (change.type === "remove" || change.type === "position") {
              dirty = true;
            }
          }

          const selectedNodeIds = newNodes
            .filter((n) => n.selected)
            .map((n) => n.id);

          set({ nodes: newNodes, selectedNodeId: lastSelectedId, selectedNodeIds });
          get()._debouncedRegenerate();
          if (dirty) useProjectStore.getState().markDirty();
        },

        onEdgesChange: (changes) => {
          const newEdges = applyEdgeChanges(changes, get().edges);
          let dirty = false;
          let lastSelectedEdgeId: string | null = get().selectedEdgeId;

          for (const change of changes) {
            if (change.type === "select" && change.selected) {
              lastSelectedEdgeId = change.id;
            }
            if (change.type === "remove") dirty = true;
          }

          set({ edges: newEdges, selectedEdgeId: lastSelectedEdgeId });
          get()._debouncedRegenerate();
          if (dirty) useProjectStore.getState().markDirty();
        },

        onConnect: (connection) => {
          if (!validateConnection(connection, get().nodes)) return;
          set({
            edges: addEdge(
              { ...connection, type: "smoothstep", animated: true, style: { strokeWidth: 2 } },
              get().edges,
            ),
          });
          get()._debouncedRegenerate();
          useProjectStore.getState().markDirty();
        },

        // ─── Node mutations ───────────────────────────────────
        addNode: (node) => {
          set({ nodes: [...get().nodes, node] });
          get()._debouncedRegenerate();
          useProjectStore.getState().markDirty();
        },

        removeNode: (nodeId) => {
          set({
            nodes: get().nodes.filter((n) => n.id !== nodeId),
            edges: get().edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
            selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
            selectedNodeIds: get().selectedNodeIds.filter((id) => id !== nodeId),
          });
          get()._debouncedRegenerate();
          useProjectStore.getState().markDirty();
        },

        updateNodeData: (nodeId, data) => {
          set({
            nodes: get().nodes.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n,
            ),
          });
          get()._debouncedRegenerate();
          useProjectStore.getState().markDirty();
        },

        duplicateNodes: (nodeIds) => {
          const toDup = get().nodes.filter((n) => nodeIds.includes(n.id));
          const idMap = new Map<string, string>();

          const newNodes: Node[] = toDup.map((node) => {
            const newId = crypto.randomUUID();
            idMap.set(node.id, newId);
            return { ...node, id: newId, position: { x: node.position.x + 50, y: node.position.y + 50 }, selected: false };
          });

          const internalEdges = get().edges.filter(
            (e) => nodeIds.includes(e.source) && nodeIds.includes(e.target),
          );
          const newEdges: Edge[] = internalEdges.map((edge) => ({
            ...edge,
            id: crypto.randomUUID(),
            source: idMap.get(edge.source)!,
            target: idMap.get(edge.target)!,
          }));

          set({ nodes: [...get().nodes, ...newNodes], edges: [...get().edges, ...newEdges] });
          get()._debouncedRegenerate();
          useProjectStore.getState().markDirty();
        },

        // ─── Edge mutations ───────────────────────────────────
        removeEdge: (edgeId) => {
          set({ edges: get().edges.filter((e) => e.id !== edgeId) });
          get()._debouncedRegenerate();
          useProjectStore.getState().markDirty();
        },

        // ─── Selection ────────────────────────────────────────
        setSelectedNode: (nodeId) => {
          const nodes = get().nodes.map((n) => ({
            ...n,
            selected: nodeId ? n.id === nodeId : false,
          }));
          set({
            nodes,
            selectedNodeId: nodeId,
            selectedNodeIds: nodeId ? [nodeId] : [],
            selectedEdgeId: null,
          });
        },
        setSelectedEdge: (edgeId) => set({ selectedEdgeId: edgeId }),
        setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),
        selectAllNodes: () => {
          const nodes = get().nodes.map((n) => ({ ...n, selected: true }));
          set({ nodes, selectedNodeIds: nodes.map((n) => n.id), selectedNodeId: nodes[nodes.length - 1]?.id ?? null });
        },
        compactSelectedNodes: (nodeIds: string[]) => {
          if (nodeIds.length === 0) return;
          const nodes = get().nodes;
          const selected = nodes.filter((n) => nodeIds.includes(n.id));
          const minX = Math.min(...selected.map((n) => n.position.x));
          const minY = Math.min(...selected.map((n) => n.position.y));
          const GAP_X = 280;
          const GAP_Y = 180;
          const changes = selected.map((n, i) => ({
            id: n.id,
            type: "position" as const,
            position: { x: minX + (i % 4) * GAP_X, y: minY + Math.floor(i / 4) * GAP_Y },
            dragging: false,
          }));
          get().onNodesChange(changes);
        },

        // ─── Bulk ─────────────────────────────────────────────
        setFlow: (nodes, edges) => {
          set({ nodes, edges, selectedNodeId: null, selectedEdgeId: null, selectedNodeIds: [] });
          get().regenerateCode();
        },

        clearFlow: () => {
          set({ nodes: [], edges: [], selectedNodeId: null, selectedEdgeId: null, selectedNodeIds: [] });
          useCodeStore.getState().clear();
        },

        // ─── Code generation ──────────────────────────────────
        regenerateCode: () => {
          const { nodes, edges } = get();
          const framework = useProjectStore.getState().framework;
          Promise.all([import("@solflow/ir"), import("@solflow/codegen")]).then(
            ([{ flowToIR }, { generateCode }]) => {
              try {
                const ir = flowToIR(nodes, edges);
                const result = generateCode(ir, framework);
                useCodeStore.getState().setGeneratedCode(result, ir);
              } catch (err) {
                useCodeStore.getState().setError(err as Error);
              }
            },
          );
        },

        _debouncedRegenerate: debouncedRegen,
      };
    },
    {
      limit: 100,
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
      }),
      // Only create undo entries for real structural changes.
      // Selection clicks, hover, etc. won't pollute the history.
      equality: (pastState, currentState) => structuralEqual(pastState, currentState),
    },
  ),
);

// ─── Undo / Redo hooks ───────────────────────────────────────────────────────

export function useUndo() {
  return useFlowStore.temporal.getState().undo;
}

export function useRedo() {
  return useFlowStore.temporal.getState().redo;
}

export function useCanUndo() {
  return useStore(useFlowStore.temporal, (s) => s.pastStates.length > 0);
}

export function useCanRedo() {
  return useStore(useFlowStore.temporal, (s) => s.futureStates.length > 0);
}
