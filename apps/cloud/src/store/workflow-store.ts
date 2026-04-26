"use client";

// Workflow Store — canvas state for the cloud workflow editor.

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
import { isValidCloudConnection } from "@solflow/cloud-nodes";
import type { CloudFlowNodeData } from "@solflow/cloud-nodes";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkflowState {
  workflowId: string | null;
  workflowName: string;
  workflowStatus: string;
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedNodeIds: string[];

  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  addNode: (node: Node | Record<string, unknown>) => void;
  removeNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, data: Partial<Record<string, unknown>>) => void;
  duplicateNodes: (nodeIds: string[]) => void;
  removeEdge: (edgeId: string) => void;

  setSelectedNode: (nodeId: string | null) => void;
  setSelectedNodeIds: (ids: string[]) => void;

  setWorkflow: (id: string, name: string, nodes: Node[], edges: Edge[]) => void;
  clearWorkflow: () => void;
  setWorkflowStatus: (status: string) => void;
  markDirty: () => void;
  isDirty: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateConnection(connection: Connection, nodes: Node[]): boolean {
  const source = nodes.find((n) => n.id === connection.source);
  const target = nodes.find((n) => n.id === connection.target);
  if (!source || !target) return false;
  if (source.id === target.id) return false;

  const sourceData = source.data as unknown as CloudFlowNodeData;
  const targetData = target.data as unknown as CloudFlowNodeData;
  if (!sourceData?.category || !targetData?.category) return false;

  // Find the port types from the handle IDs
  const sourcePort = sourceData.outputs?.find((p) => p.label === connection.sourceHandle);
  const targetPort = targetData.inputs?.find((p) => p.label === connection.targetHandle);
  const sourcePortType = sourcePort?.type ?? "main";
  const targetPortType = targetPort?.type ?? "main";

  return isValidCloudConnection(
    sourceData.category,
    targetData.category,
    sourcePortType,
    targetPortType,
  );
}

function structuralEqual(
  past: { nodes: Node[]; edges: Edge[] },
  current: { nodes: Node[]; edges: Edge[] },
): boolean {
  if (past.nodes.length !== current.nodes.length) return false;
  if (past.edges.length !== current.edges.length) return false;

  for (let i = 0; i < past.nodes.length; i++) {
    const a = past.nodes[i];
    const b = current.nodes[i];
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

export const useWorkflowStore = create<WorkflowState>()(
  temporal(
    (set, get) => ({
      workflowId: null,
      workflowName: "Untitled Workflow",
      workflowStatus: "DRAFT",
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedNodeIds: [],
      isDirty: false,

      onNodesChange: (changes) => {
        const newNodes = applyNodeChanges(changes, get().nodes);
        let lastSelectedId: string | null = get().selectedNodeId;

        for (const change of changes) {
          if (change.type === "select" && change.selected) {
            lastSelectedId = change.id;
          }
        }

        const selectedNodeIds = newNodes
          .filter((n) => n.selected)
          .map((n) => n.id);

        set({ nodes: newNodes, selectedNodeId: lastSelectedId, selectedNodeIds });
      },

      onEdgesChange: (changes) => {
        const newEdges = applyEdgeChanges(changes, get().edges);
        set({ edges: newEdges });
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
        get().markDirty();
      },

      addNode: (node) => {
        set({ nodes: [...get().nodes, node as Node] });
        get().markDirty();
      },

      removeNode: (nodeId) => {
        set({
          nodes: get().nodes.filter((n) => n.id !== nodeId),
          edges: get().edges.filter(
            (e) => e.source !== nodeId && e.target !== nodeId,
          ),
          selectedNodeId:
            get().selectedNodeId === nodeId ? null : get().selectedNodeId,
          selectedNodeIds: get().selectedNodeIds.filter((id) => id !== nodeId),
        });
        get().markDirty();
      },

      updateNodeData: (nodeId, data) => {
        set({
          nodes: get().nodes.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    ...data,
                    data: { ...((n.data as unknown as CloudFlowNodeData).data ?? {}), ...data },
                  },
                }
              : n,
          ),
        });
        get().markDirty();
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
        get().markDirty();
      },

      removeEdge: (edgeId) => {
        set({ edges: get().edges.filter((e) => e.id !== edgeId) });
        get().markDirty();
      },

      setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),
      setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),

      setWorkflow: (id, name, nodes, edges) => {
        set({
          workflowId: id,
          workflowName: name,
          nodes,
          edges,
          selectedNodeId: null,
          selectedNodeIds: [],
          isDirty: false,
        });
      },

      clearWorkflow: () => {
        set({
          nodes: [],
          edges: [],
          selectedNodeId: null,
          selectedNodeIds: [],
          isDirty: false,
        });
      },

      setWorkflowStatus: (status) => set({ workflowStatus: status }),

      markDirty: () => set({ isDirty: true }),
    }),
    {
      limit: 50,
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
      }),
      equality: (pastState, currentState) =>
        structuralEqual(pastState, currentState),
    },
  ),
);

// ─── Undo / Redo hooks ───────────────────────────────────────────────────────

export function useUndo() {
  return useWorkflowStore.temporal.getState().undo;
}

export function useRedo() {
  return useWorkflowStore.temporal.getState().redo;
}

export function useCanUndo() {
  return useStore(useWorkflowStore.temporal, (s) => s.pastStates.length > 0);
}

export function useCanRedo() {
  return useStore(useWorkflowStore.temporal, (s) => s.futureStates.length > 0);
}
