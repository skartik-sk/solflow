"use client";

// Flow Store — the core canvas state (nodes, edges, selection, undo/redo).
//
// Uses:
//   - zustand/middleware: subscribeWithSelector
//   - zundo: temporal middleware for undo/redo (limit 50)
//   - @xyflow/react helpers: applyNodeChanges, applyEdgeChanges, addEdge
//   - @solflow/ir: flowToIR (flow → IR)
//   - @solflow/flow-nodes: isValidNodeConnection (edge validation)

import { create, useStore } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
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
import { useCodeStore } from "./code-store";
import { useProjectStore } from "./project-store";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlowState {
  // ─── Canvas data ──────────────────────────────────────────────
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;

  // ─── React Flow event handlers ────────────────────────────────
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  // ─── Node mutations ───────────────────────────────────────────
  addNode: (node: Node) => void;
  removeNode: (nodeId: string) => void;
  updateNodeData: (
    nodeId: string,
    data: Partial<Record<string, unknown>>,
  ) => void;
  duplicateNodes: (nodeIds: string[]) => void;

  // ─── Edge mutations ───────────────────────────────────────────
  removeEdge: (edgeId: string) => void;

  // ─── Selection ────────────────────────────────────────────────
  setSelectedNode: (nodeId: string | null) => void;
  setSelectedEdge: (edgeId: string | null) => void;

  // ─── Bulk ─────────────────────────────────────────────────────
  setFlow: (nodes: Node[], edges: Edge[]) => void;
  clearFlow: () => void;

  // ─── Code generation ──────────────────────────────────────────
  regenerateCode: () => void;
  _debouncedRegenerate: () => void;
}

// ─── Debounce helper (no lodash dep on store module) ─────────────────────────

function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number,
): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

// ─── Connection validation ────────────────────────────────────────────────────

function validateConnection(connection: Connection, nodes: Node[]): boolean {
  const source = nodes.find((n) => n.id === connection.source);
  const target = nodes.find((n) => n.id === connection.target);
  if (!source || !target) return false;
  if (source.id === target.id) return false;
  return isValidNodeConnection(source.type ?? "", target.type ?? "");
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useFlowStore = create<FlowState>()(
  subscribeWithSelector(
    temporal(
      (set, get) => {
        // Build the debounced regenerate once, outside the returned object
        // so it's a stable function reference (not recreated on each set).
        const debouncedRegen = debounce(() => {
          get().regenerateCode();
        }, 300);

        return {
          nodes: [],
          edges: [],
          selectedNodeId: null,
          selectedEdgeId: null,

          // ─── React Flow handlers ──────────────────────────────
          onNodesChange: (changes) => {
            set({ nodes: applyNodeChanges(changes, get().nodes) });
            get()._debouncedRegenerate();

            for (const change of changes) {
              if (change.type === "select") {
                set({
                  selectedNodeId: change.selected ? change.id : null,
                });
              }
              if (change.type === "remove" || change.type === "position") {
                useProjectStore.getState().markDirty();
              }
            }
          },

          onEdgesChange: (changes) => {
            set({ edges: applyEdgeChanges(changes, get().edges) });
            get()._debouncedRegenerate();

            for (const change of changes) {
              if (change.type === "select") {
                set({
                  selectedEdgeId: change.selected ? change.id : null,
                });
              }
              if (change.type === "remove") {
                useProjectStore.getState().markDirty();
              }
            }
          },

          onConnect: (connection) => {
            if (!validateConnection(connection, get().nodes)) return;
            set({
              edges: addEdge(
                {
                  ...connection,
                  type: "smoothstep",
                  animated: true,
                  style: { strokeWidth: 2 },
                },
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
              edges: get().edges.filter(
                (e) => e.source !== nodeId && e.target !== nodeId,
              ),
              selectedNodeId:
                get().selectedNodeId === nodeId ? null : get().selectedNodeId,
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
              return {
                ...node,
                id: newId,
                position: { x: node.position.x + 50, y: node.position.y + 50 },
                selected: false,
              };
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

            set({
              nodes: [...get().nodes, ...newNodes],
              edges: [...get().edges, ...newEdges],
            });
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
          setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),
          setSelectedEdge: (edgeId) => set({ selectedEdgeId: edgeId }),

          // ─── Bulk ─────────────────────────────────────────────
          setFlow: (nodes, edges) => {
            set({ nodes, edges, selectedNodeId: null, selectedEdgeId: null });
            get().regenerateCode();
          },

          clearFlow: () => {
            set({
              nodes: [],
              edges: [],
              selectedNodeId: null,
              selectedEdgeId: null,
            });
            useCodeStore.getState().clear();
          },

          // ─── Code generation ──────────────────────────────────
          regenerateCode: () => {
            const { nodes, edges } = get();
            const framework = useProjectStore.getState().framework;

            // Dynamically import to keep the store bundle lean and break the
            // potential circular dep between codegen → ir → flow-nodes.
            Promise.all([
              import("@solflow/ir"),
              import("@solflow/codegen"),
            ]).then(([{ flowToIR }, { generateCode }]) => {
              try {
                const ir = flowToIR(nodes, edges);
                const result = generateCode(ir, framework);
                useCodeStore.getState().setGeneratedCode(result, ir);
              } catch (err) {
                useCodeStore.getState().setError(err as Error);
              }
            });
          },

          _debouncedRegenerate: debouncedRegen,
        };
      },
      {
        // zundo config — only track nodes + edges in undo history
        limit: 50,
        partialize: (state) => ({
          nodes: state.nodes,
          edges: state.edges,
        }),
      },
    ),
  ),
);

// ─── Convenience undo/redo hooks ─────────────────────────────────────────────

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
