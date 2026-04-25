import type {
  CloudNodeDefinition,
  NodeExecutionContext,
  WorkflowItem,
  WalletOperations,
  NodeLogger,
  CloudNodeRegistry,
} from "@solflow/cloud-nodes";
import { buildDAG, topologicalSort, getParallelBatches } from "./dag";
import { resolveExpressions } from "./expression";
import type {
  WorkflowDefinition,
  ExecutionResult,
  NodeExecutionResult,
} from "./types";

export class WorkflowExecutor {
  private registry: CloudNodeRegistry;
  private walletOps: WalletOperations;
  private aborted = false;

  constructor(registry: CloudNodeRegistry, walletOps: WalletOperations) {
    this.registry = registry;
    this.walletOps = walletOps;
  }

  async execute(
    def: WorkflowDefinition,
    executionId: string,
  ): Promise<ExecutionResult> {
    this.aborted = false;
    const nodeResults: Map<string, NodeExecutionResult> = new Map();
    const outputData: Map<string, WorkflowItem[]> = new Map();
    const startedAt = Date.now();

    try {
      const dag = buildDAG(def.nodes, def.edges);
      const nodeIds = def.nodes.map((n) => n.id);
      const sorted = topologicalSort(dag, nodeIds);
      const batches = getParallelBatches(sorted, dag);

      for (const batch of batches) {
        if (this.aborted) break;

        await Promise.all(
          batch.map((nodeId) =>
            this.executeNode(nodeId, def, executionId, dag, nodeResults, outputData)
          )
        );
      }

      const hasError = Array.from(nodeResults.values()).some(
        (r) => r.status === "error"
      );

      return {
        executionId,
        workflowId: def.id,
        status: hasError ? "error" : "success",
        nodeResults,
        startedAt,
        completedAt: Date.now(),
        duration: Date.now() - startedAt,
      };
    } catch (err) {
      return {
        executionId,
        workflowId: def.id,
        status: "error",
        nodeResults,
        startedAt,
        completedAt: Date.now(),
        duration: Date.now() - startedAt,
        error: (err as Error).message,
      };
    }
  }

  private async executeNode(
    nodeId: string,
    def: WorkflowDefinition,
    executionId: string,
    dag: ReturnType<typeof buildDAG>,
    nodeResults: Map<string, NodeExecutionResult>,
    outputData: Map<string, WorkflowItem[]>,
  ): Promise<void> {
    const wfNode = def.nodes.find((n) => n.id === nodeId)!;
    const nodeDef = this.registry.get(wfNode.type);
    if (!nodeDef?.execute) {
      nodeResults.set(nodeId, {
        nodeId,
        nodeType: wfNode.type,
        status: "skipped",
        inputSnapshot: null,
        outputSnapshot: null,
        duration: 0,
        logs: [],
      });
      return;
    }

    const inputs: WorkflowItem[][] = [];
    const upstreamEdges = Array.from(dag.entries())
      .filter(([, edges]) => edges.some((e) => e.target === nodeId))
      .map(([source]) => ({ source }));

    for (const { source } of upstreamEdges) {
      const upstreamOutput = outputData.get(source) ?? [];
      inputs.push(upstreamOutput);
    }

    const params = resolveExpressions(wfNode.data, inputs) as Record<string, unknown>;

    const nodeLogs: { timestamp: number; level: string; message: string; data?: unknown }[] = [];
    const logger: NodeLogger = {
      info: (msg, data) => nodeLogs.push({ timestamp: Date.now(), level: "info", message: msg, data }),
      warn: (msg, data) => nodeLogs.push({ timestamp: Date.now(), level: "warn", message: msg, data }),
      error: (msg, data) => nodeLogs.push({ timestamp: Date.now(), level: "error", message: msg, data }),
    };

    const ctx: NodeExecutionContext = {
      inputs,
      params,
      executionId,
      nodeId,
      wallet: this.walletOps,
      logger,
      signal: new AbortController().signal,
    };

    const startTime = Date.now();
    try {
      const output = await nodeDef.execute(ctx);
      outputData.set(nodeId, output);
      nodeResults.set(nodeId, {
        nodeId,
        nodeType: wfNode.type,
        status: "success",
        inputSnapshot: this.safeSnapshot(inputs),
        outputSnapshot: this.safeSnapshot(output),
        duration: Date.now() - startTime,
        logs: nodeLogs,
      });
    } catch (err) {
      nodeResults.set(nodeId, {
        nodeId,
        nodeType: wfNode.type,
        status: "error",
        inputSnapshot: this.safeSnapshot(inputs),
        outputSnapshot: null,
        duration: Date.now() - startTime,
        error: (err as Error).message,
        logs: nodeLogs,
      });
    }
  }

  private safeSnapshot(data: unknown): unknown {
    try {
      return JSON.parse(JSON.stringify(data));
    } catch {
      return null;
    }
  }

  abort(): void {
    this.aborted = true;
  }
}
