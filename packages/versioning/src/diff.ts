// packages/versioning/src/diff.ts
// Flow diff algorithm — exactly as specified in docs/architecture/15-versioning.md

import type { FlowData } from "./hash";

// ─── Public types ──────────────────────────────────────────────────────────────

export interface FlowDiff {
  nodes: {
    added: NodeSummary[];
    removed: NodeSummary[];
    modified: NodeModification[];
    moved: NodeMove[];
  };
  edges: {
    added: EdgeSummary[];
    removed: EdgeSummary[];
  };
  stats: {
    totalChanges: number;
    addedNodes: number;
    removedNodes: number;
    modifiedNodes: number;
    movedNodes: number;
    addedEdges: number;
    removedEdges: number;
  };
}

export interface NodeSummary {
  id: string;
  type: string;
  label: string;
}

export interface NodeModification {
  id: string;
  type: string;
  label: string;
  changes: PropertyChange[];
}

export interface PropertyChange {
  /** Dot-notation path, e.g. "name", "constraints[0].type" */
  path: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface NodeMove {
  id: string;
  type: string;
  oldPosition: { x: number; y: number };
  newPosition: { x: number; y: number };
}

export interface EdgeSummary {
  id: string;
  source: string;
  target: string;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

type FlowNode = FlowData["nodes"][number];
type FlowEdge = FlowData["edges"][number];

function summarizeNode(n: FlowNode): NodeSummary {
  return {
    id: n.id,
    type: n.type ?? "unknown",
    label: (n.data?.name as string | undefined) ?? n.id,
  };
}

function summarizeEdge(e: FlowEdge): EdgeSummary {
  return { id: e.id, source: e.source, target: e.target };
}

/**
 * Recursively diff two plain-object values, collecting PropertyChange records.
 * Arrays are compared element-by-element; primitives are compared by value.
 */
export function deepDiff(
  oldVal: unknown,
  newVal: unknown,
  path = "",
): PropertyChange[] {
  const changes: PropertyChange[] = [];

  if (oldVal === newVal) return changes;

  // Both primitive (or one is null/undefined)
  if (
    typeof oldVal !== "object" ||
    typeof newVal !== "object" ||
    oldVal === null ||
    newVal === null
  ) {
    changes.push({ path, oldValue: oldVal, newValue: newVal });
    return changes;
  }

  // Both arrays
  if (Array.isArray(oldVal) && Array.isArray(newVal)) {
    const len = Math.max(oldVal.length, newVal.length);
    for (let i = 0; i < len; i++) {
      changes.push(
        ...deepDiff(
          i < oldVal.length ? oldVal[i] : undefined,
          i < newVal.length ? newVal[i] : undefined,
          path ? `${path}[${i}]` : `[${i}]`,
        ),
      );
    }
    return changes;
  }

  // Array/object mismatch — treat as wholesale replace
  if (Array.isArray(oldVal) !== Array.isArray(newVal)) {
    changes.push({ path, oldValue: oldVal, newValue: newVal });
    return changes;
  }

  // Both plain objects
  const oldObj = oldVal as Record<string, unknown>;
  const newObj = newVal as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    changes.push(
      ...deepDiff(oldObj[key], newObj[key], path ? `${path}.${key}` : key),
    );
  }

  return changes;
}

// ─── Main diff function ────────────────────────────────────────────────────────

/**
 * Compute a structured diff between two flow snapshots.
 * Matches the spec in docs/architecture/15-versioning.md exactly.
 */
export function computeFlowDiff(
  oldFlow: FlowData,
  newFlow: FlowData,
): FlowDiff {
  const oldNodeMap = new Map(oldFlow.nodes.map((n) => [n.id, n]));
  const newNodeMap = new Map(newFlow.nodes.map((n) => [n.id, n]));
  const oldEdgeMap = new Map(oldFlow.edges.map((e) => [e.id, e]));
  const newEdgeMap = new Map(newFlow.edges.map((e) => [e.id, e]));

  // Added nodes: in new but not in old
  const added = newFlow.nodes
    .filter((n) => !oldNodeMap.has(n.id))
    .map(summarizeNode);

  // Removed nodes: in old but not in new
  const removed = oldFlow.nodes
    .filter((n) => !newNodeMap.has(n.id))
    .map(summarizeNode);

  // Modified and moved nodes: in both but something changed
  const modified: NodeModification[] = [];
  const moved: NodeMove[] = [];

  for (const newNode of newFlow.nodes) {
    const oldNode = oldNodeMap.get(newNode.id);
    if (!oldNode) continue;

    // Position change
    if (
      oldNode.position.x !== newNode.position.x ||
      oldNode.position.y !== newNode.position.y
    ) {
      moved.push({
        id: newNode.id,
        type: newNode.type ?? "unknown",
        oldPosition: oldNode.position,
        newPosition: newNode.position,
      });
    }

    // Data changes (deep diff)
    const changes = deepDiff(oldNode.data, newNode.data);
    if (changes.length > 0) {
      modified.push({
        id: newNode.id,
        type: newNode.type ?? "unknown",
        label: (newNode.data?.name as string | undefined) ?? newNode.id,
        changes,
      });
    }
  }

  // Edge diffs
  const addedEdges = newFlow.edges
    .filter((e) => !oldEdgeMap.has(e.id))
    .map(summarizeEdge);
  const removedEdges = oldFlow.edges
    .filter((e) => !newEdgeMap.has(e.id))
    .map(summarizeEdge);

  return {
    nodes: { added, removed, modified, moved },
    edges: { added: addedEdges, removed: removedEdges },
    stats: {
      totalChanges:
        added.length +
        removed.length +
        modified.length +
        addedEdges.length +
        removedEdges.length,
      addedNodes: added.length,
      removedNodes: removed.length,
      modifiedNodes: modified.length,
      movedNodes: moved.length,
      addedEdges: addedEdges.length,
      removedEdges: removedEdges.length,
    },
  };
}
