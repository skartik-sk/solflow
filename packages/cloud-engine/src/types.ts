import type { CloudSafetyControls } from "@solflow/cloud-nodes";

export interface WorkflowDefinition {
  id: string;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowSettings {
  timeout: number;
  retryPolicy: { maxAttempts: number; delayMs: number };
  defaultWalletId?: string;
  onError: "stop" | "continue" | "branch";
  safety?: CloudSafetyControls;
}

export type ExecutionStatus =
  | "queued"
  | "running"
  | "waiting"
  | "success"
  | "error"
  | "cancelled"
  | "timeout";

export type NodeExecStatus =
  | "queued"
  | "running"
  | "success"
  | "error"
  | "skipped"
  | "waiting";

export interface NodeExecutionResult {
  nodeId: string;
  nodeType: string;
  status: NodeExecStatus;
  inputSnapshot: unknown;
  outputSnapshot: unknown;
  duration: number;
  error?: string;
  attempts?: number;
  logs: { timestamp: number; level: string; message: string; data?: unknown }[];
}

export interface ExecutionResult {
  executionId: string;
  workflowId: string;
  status: ExecutionStatus;
  nodeResults: Map<string, NodeExecutionResult>;
  startedAt: number;
  completedAt?: number;
  duration?: number;
  error?: string;
}
