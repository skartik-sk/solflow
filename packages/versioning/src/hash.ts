// packages/versioning/src/hash.ts
// Browser-safe flow hash using djb2 — no Node.js crypto required.

export interface FlowData {
  nodes: Array<{
    id: string;
    type?: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }>;
}

/**
 * Deterministic djb2 hash of a string.
 * Returns a 32-bit unsigned integer as a hex string.
 */
function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 ^ charCode  (bitwise kept within 32-bit range)
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // coerce to unsigned 32-bit
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Compute a stable hash for a flow snapshot.
 *
 * Strategy:
 * - Sort nodes by id, take id + type + position + JSON of data.
 * - Sort edges by id, take source + target + handles.
 * - Concatenate and djb2 hash.
 *
 * Ignores transient UI state (e.g. selected, dragging flags) so that
 * merely selecting a node does not produce a new version.
 */
export function computeFlowHash(flowData: FlowData): string {
  const nodeStr = [...flowData.nodes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (n) =>
        `${n.id}|${n.type ?? ""}|${n.position.x.toFixed(2)},${n.position.y.toFixed(2)}|${JSON.stringify(n.data)}`,
    )
    .join(";");

  const edgeStr = [...flowData.edges]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (e) =>
        `${e.id}|${e.source}->${e.target}|${e.sourceHandle ?? ""}|${e.targetHandle ?? ""}`,
    )
    .join(";");

  return djb2(`nodes:${nodeStr}::edges:${edgeStr}`);
}
