// Singleton holder for the React Flow instance in the cloud app.

import type { ReactFlowInstance } from "@xyflow/react";

let _instance: ReactFlowInstance | null = null;

export function setRFInstance(instance: ReactFlowInstance | null) {
  _instance = instance;
}

export function getRFInstance(): ReactFlowInstance | null {
  return _instance;
}

export function focusNode(nodeId: string) {
  const rf = _instance;
  if (!rf) return;
  rf.fitView({ nodes: [{ id: nodeId }], duration: 600, padding: 0.3 });
}
