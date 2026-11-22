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
  nodeClipboard: NodeClipboard | null;

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
  copySelectedNodes: () => boolean;
  pasteCopiedNodes: () => boolean;

  removeEdge: (edgeId: string) => void;

  setSelectedNode: (nodeId: string | null) => void;
  setSelectedEdge: (edgeId: string | null) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  selectAllNodes: () => void;
  compactSelectedNodes: (nodeIds: string[]) => void;

  setFlow: (nodes: Node[], edges: Edge[]) => void;
  /** Load a project's saved flow: replaces the canvas and starts a fresh undo history. */
  loadFlow: (nodes: Node[], edges: Edge[]) => void;
  clearFlow: () => void;

  regenerateCode: () => void;
  _debouncedRegenerate: () => void;
}

interface NodeClipboard {
  nodes: Node[];
  edges: Edge[];
  pasteCount: number;
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

function cloneNodeData(data: Node["data"]): Node["data"] {
  try {
    return structuredClone(data);
  } catch {
    return JSON.parse(JSON.stringify(data)) as Node["data"];
  }
}

function cloneEdgeData(data: Edge["data"]): Edge["data"] {
  if (data === undefined) return undefined;
  try {
    return structuredClone(data);
  } catch {
    return JSON.parse(JSON.stringify(data)) as Edge["data"];
  }
}

function cloneNodeSnapshot(node: Node): Node {
  return {
    ...node,
    position: { ...node.position },
    data: cloneNodeData(node.data),
    selected: false,
    dragging: false,
  };
}

function cloneEdgeSnapshot(edge: Edge): Edge {
  return {
    ...edge,
    data: cloneEdgeData(edge.data),
    selected: false,
  };
}

function createId() {
  return crypto.randomUUID();
}

/** Give a node a fresh id if its id is already on the canvas (keeps the readable prefix). */
function withUniqueId(node: Node, nodes: Node[]): Node {
  if (!nodes.some((n) => n.id === node.id)) return node;
  const prefix = node.type || node.id.replace(/-[^-]*$/, "") || "node";
  return { ...node, id: `${prefix}-${createId()}` };
}

function isDragFrame(changes: Parameters<OnNodesChange>[0]): boolean {
  return changes.some((c) => c.type === "position" && c.dragging === true);
}

function isDragEnd(changes: Parameters<OnNodesChange>[0]): boolean {
  return changes.some(
    (c) => (c.type === "position" && c.dragging !== true) || c.type === "remove",
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
      // While a node drag is in progress, history is paused so the whole drag
      // becomes one undo entry (the pre-drag positions).
      let dragActive = false;

      return {
        nodes: [],
        edges: [],
        selectedNodeId: null,
        selectedEdgeId: null,
        selectedNodeIds: [],
        nodeClipboard: null,

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

          const history = useFlowStore.temporal.getState();
          const next = { nodes: newNodes, selectedNodeId: lastSelectedId, selectedNodeIds };
          if (!dragActive && isDragFrame(changes)) {
            set(next); // records the pre-drag state once
            dragActive = true;
            history.pause();
          } else if (dragActive && isDragEnd(changes)) {
            set(next); // still paused: no extra entry for the final frame
            dragActive = false;
            history.resume();
          } else {
            set(next);
          }
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
          // Never let a new node share an id with an existing one: edits and
          // deletes are keyed by id and would hit both.
          set({ nodes: [...get().nodes, withUniqueId(node, get().nodes)] });
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

        copySelectedNodes: () => {
          const state = get();
          const selectedIds =
            state.selectedNodeIds.length > 0
              ? state.selectedNodeIds
              : state.nodes.filter((node) => node.selected).map((node) => node.id);

          if (selectedIds.length === 0) return false;

          const selectedIdSet = new Set(selectedIds);
          const copiedNodes = state.nodes
            .filter((node) => selectedIdSet.has(node.id))
            .map(cloneNodeSnapshot);

          if (copiedNodes.length === 0) return false;

          const copiedEdges = state.edges
            .filter(
              (edge) =>
                selectedIdSet.has(edge.source) && selectedIdSet.has(edge.target),
            )
            .map(cloneEdgeSnapshot);

          set({
            nodeClipboard: {
              nodes: copiedNodes,
              edges: copiedEdges,
              pasteCount: 0,
            },
          });

          return true;
        },

        pasteCopiedNodes: () => {
          const state = get();
          const clipboard = state.nodeClipboard;
          if (!clipboard || clipboard.nodes.length === 0) return false;

          const pasteCount = clipboard.pasteCount + 1;
          const offset = pasteCount * 50;
          const idMap = new Map<string, string>();

          const pastedNodes = clipboard.nodes.map((node) => {
            const newId = createId();
            idMap.set(node.id, newId);
            return {
              ...cloneNodeSnapshot(node),
              id: newId,
              position: {
                x: node.position.x + offset,
                y: node.position.y + offset,
              },
              selected: true,
            };
          });

          const pastedEdges = clipboard.edges.map((edge) => ({
            ...cloneEdgeSnapshot(edge),
            id: createId(),
            source: idMap.get(edge.source)!,
            target: idMap.get(edge.target)!,
          }));

          const pastedNodeIds = pastedNodes.map((node) => node.id);

          set({
            nodes: [
              ...state.nodes.map((node) => ({ ...node, selected: false })),
              ...pastedNodes,
            ],
            edges: [
              ...state.edges.map((edge) => ({ ...edge, selected: false })),
              ...pastedEdges,
            ],
            selectedNodeId: pastedNodeIds.at(-1) ?? null,
            selectedNodeIds: pastedNodeIds,
            selectedEdgeId: null,
            nodeClipboard: {
              ...clipboard,
              pasteCount,
            },
          });
          get()._debouncedRegenerate();
          useProjectStore.getState().markDirty();
          return true;
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

        loadFlow: (nodes, edges) => {
          get().setFlow(nodes, edges);
          useFlowStore.temporal.getState().clear();
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

// ─── Undo / Redo ─────────────────────────────────────────────────────────────

function applyHistory(kind: "undo" | "redo"): boolean {
  const history = useFlowStore.temporal.getState();
  const available = kind === "undo" ? history.pastStates.length : history.futureStates.length;
  if (available === 0) return false;
  history[kind]();

  // Drop selection that points at nodes/edges the history step removed.
  const state = useFlowStore.getState();
  const nodeIds = new Set(state.nodes.map((n) => n.id));
  const edgeIds = new Set(state.edges.map((e) => e.id));
  useFlowStore.setState({
    selectedNodeId: state.selectedNodeId && nodeIds.has(state.selectedNodeId) ? state.selectedNodeId : null,
    selectedNodeIds: state.selectedNodeIds.filter((id) => nodeIds.has(id)),
    selectedEdgeId: state.selectedEdgeId && edgeIds.has(state.selectedEdgeId) ? state.selectedEdgeId : null,
  });

  // The canvas changed: regenerate code and make sure the change gets saved.
  state.regenerateCode();
  useProjectStore.getState().markDirty();
  return true;
}

export function undoFlow(): boolean {
  return applyHistory("undo");
}

export function redoFlow(): boolean {
  return applyHistory("redo");
}

export function useUndo() {
  return undoFlow;
}

export function useRedo() {
  return redoFlow;
}

export function useCanUndo() {
  return useStore(useFlowStore.temporal, (s) => s.pastStates.length > 0);
}

export function useCanRedo() {
  return useStore(useFlowStore.temporal, (s) => s.futureStates.length > 0);
}
