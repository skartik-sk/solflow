import type { ComponentType } from "react";
import type { NodeProps } from "@xyflow/react";

// ─── Data Model ──────────────────────────────────────────────────────────────

export interface WorkflowItem {
  json: Record<string, unknown>;
  binary?: Record<string, { data: Buffer; mimeType: string; fileName?: string }>;
  error?: { message: string; stack?: string };
  pairedItem?: { item: number; input?: number };
}

// ─── Node Classification ─────────────────────────────────────────────────────

export type NodeCategory =
  | "trigger"
  | "action"
  | "transform"
  | "logic"
  | "ai"
  | "output";

export const CATEGORY_COLORS: Record<NodeCategory, string> = {
  trigger: "#22c55e",
  action: "#3b82f6",
  transform: "#f59e0b",
  logic: "#a855f7",
  ai: "#ec4899",
  output: "#06b6d4",
};

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  trigger: "Triggers",
  action: "Actions",
  transform: "Transform",
  logic: "Logic",
  ai: "AI",
  output: "Output",
};

export type ConnectionType = "main" | "ai" | "trigger";

export const CONNECTION_COLORS: Record<ConnectionType, string> = {
  main: "#3b82f6",
  ai: "#a855f7",
  trigger: "#22c55e",
};

// ─── Property Schema ─────────────────────────────────────────────────────────

export type PropertyType =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "json"
  | "pubkey"
  | "address"
  | "expression"
  | "credential"
  | "wallet-select"
  | "code"
  | "date"
  | "duration";

export interface NodeProperty {
  key: string;
  label: string;
  type: PropertyType;
  required: boolean;
  description?: string;
  default?: unknown;
  options?: { label: string; value: string }[];
  placeholder?: string;
  credentialType?: string;
  supportsExpressions?: boolean;
}

// ─── Node I/O Definition ─────────────────────────────────────────────────────

export interface NodePort {
  type: ConnectionType;
  label: string;
  max?: number;
}

// ─── Wallet Operations (provided by engine at runtime) ───────────────────────

export interface WalletOperations {
  signAndSend(tx: unknown, walletId: string): Promise<string>;
  getPublicKey(walletId: string): Promise<string>;
  getBalance(walletId: string): Promise<number>;
}

// ─── Node Logger ─────────────────────────────────────────────────────────────

export interface NodeLogger {
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

// ─── Execution Contexts ──────────────────────────────────────────────────────

export interface NodeExecutionContext {
  inputs: WorkflowItem[][];
  params: Record<string, unknown>;
  executionId: string;
  nodeId: string;
  wallet: WalletOperations;
  logger: NodeLogger;
  signal: AbortSignal;
}

export interface NodeTriggerContext {
  params: Record<string, unknown>;
  emit: (items: WorkflowItem[]) => void;
  wallet: WalletOperations;
  logger: NodeLogger;
}

export interface NodeTriggerHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface NodeWebhookContext {
  request: {
    method: string;
    headers: Record<string, string>;
    body: unknown;
    query: Record<string, string>;
  };
  params: Record<string, unknown>;
  logger: NodeLogger;
}

// ─── Cloud Node Definition ───────────────────────────────────────────────────

export interface CloudNodeDefinition {
  type: string;
  label: string;
  category: NodeCategory;
  description: string;
  icon: string;
  color: string;
  properties: NodeProperty[];
  inputs: NodePort[];
  outputs: NodePort[];
  defaultData: Record<string, unknown>;
  component: ComponentType<NodeProps>;
  execute?: (ctx: NodeExecutionContext) => Promise<WorkflowItem[]>;
  trigger?: (ctx: NodeTriggerContext) => Promise<NodeTriggerHandle>;
  webhook?: (ctx: NodeWebhookContext) => Promise<WorkflowItem[]>;
}

// ─── React Flow Node Data ────────────────────────────────────────────────────

export interface CloudFlowNodeData {
  label: string;
  type: string;
  category: NodeCategory;
  icon: string;
  color: string;
  properties: NodeProperty[];
  inputs: NodePort[];
  outputs: NodePort[];
  data: Record<string, unknown>;
  status?: "idle" | "running" | "success" | "error";
  outputPreview?: unknown;
}
