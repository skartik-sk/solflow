import type { WorkflowNode, WorkflowEdge } from "./types";

export interface DAGEdge {
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export type DAG = Map<string, DAGEdge[]>;

export function buildDAG(nodes: WorkflowNode[], edges: WorkflowEdge[]): DAG {
  const dag: DAG = new Map();
  for (const node of nodes) {
    dag.set(node.id, []);
  }
  for (const edge of edges) {
    const existing = dag.get(edge.source) ?? [];
    existing.push({
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    });
    dag.set(edge.source, existing);
  }
  return dag;
}

export function topologicalSort(dag: DAG, nodeIds: string[]): string[] {
  const inDegree: Map<string, number> = new Map();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
  }
  for (const [, edges] of dag) {
    for (const edge of edges) {
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const edge of dag.get(id) ?? []) {
      const newDeg = (inDegree.get(edge.target) ?? 1) - 1;
      inDegree.set(edge.target, newDeg);
      if (newDeg === 0) queue.push(edge.target);
    }
  }

  if (sorted.length !== nodeIds.length) {
    throw new Error(
      `Circular dependency detected. Sorted ${sorted.length}/${nodeIds.length} nodes.`
    );
  }
  return sorted;
}

export function getParallelBatches(sorted: string[], dag: DAG): string[][] {
  const inDegree: Map<string, number> = new Map();
  for (const id of sorted) {
    inDegree.set(id, 0);
  }
  for (const [, edges] of dag) {
    for (const edge of edges) {
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
  }

  const batches: string[][] = [];
  const processed = new Set<string>();

  while (processed.size < sorted.length) {
    const batch: string[] = [];
    for (const id of sorted) {
      if (processed.has(id)) continue;
      if ((inDegree.get(id) ?? 0) === 0) {
        batch.push(id);
      }
    }
    if (batch.length === 0) break;
    batches.push(batch);
    for (const id of batch) {
      processed.add(id);
      for (const edge of dag.get(id) ?? []) {
        inDegree.set(edge.target, (inDegree.get(edge.target) ?? 1) - 1);
      }
    }
  }
  return batches;
}
