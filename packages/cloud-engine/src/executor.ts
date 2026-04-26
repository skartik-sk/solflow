import type {
  CloudNodeDefinition,
  NodeExecutionContext,
  WorkflowItem,
  WalletOperations,
  CredentialOperations,
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

type OutputBuckets = Map<string, WorkflowItem[]>;
type DAG = ReturnType<typeof buildDAG>;

const DEFAULT_TIMEOUT_SECONDS = 300;

function timeoutMs(timeoutSeconds: unknown): number {
  const seconds = Number(timeoutSeconds);
  return Number.isFinite(seconds) && seconds > 0
    ? seconds * 1000
    : DEFAULT_TIMEOUT_SECONDS * 1000;
}

function maxAttempts(def: WorkflowDefinition): number {
  const attempts = Number(def.settings?.retryPolicy?.maxAttempts ?? 1);
  return Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 1;
}

function retryDelayMs(def: WorkflowDefinition): number {
  const delay = Number(def.settings?.retryPolicy?.delayMs ?? 0);
  return Number.isFinite(delay) && delay > 0 ? Math.floor(delay) : 0;
}

function abortMessage(signal: AbortSignal): string {
  if (signal.reason instanceof Error) return signal.reason.message;
  if (typeof signal.reason === "string") return signal.reason;
  return "Execution aborted";
}

export class WorkflowExecutor {
  private registry: CloudNodeRegistry;
  private walletOps: WalletOperations;
  private credentialOps?: CredentialOperations;
  private aborted = false;
  private abortController?: AbortController;

  constructor(
    registry: CloudNodeRegistry,
    walletOps: WalletOperations,
    credentialOps?: CredentialOperations,
  ) {
    this.registry = registry;
    this.walletOps = walletOps;
    this.credentialOps = credentialOps;
  }

  async execute(
    def: WorkflowDefinition,
    executionId: string,
  ): Promise<ExecutionResult> {
    this.aborted = false;
    this.abortController = new AbortController();
    const nodeResults: Map<string, NodeExecutionResult> = new Map();
    const outputData: Map<string, OutputBuckets> = new Map();
    const startedAt = Date.now();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      this.abortController?.abort(`Workflow timed out after ${def.settings.timeout} seconds`);
    }, timeoutMs(def.settings?.timeout));

    try {
      const dag = buildDAG(def.nodes, def.edges);
      const nodeIds = def.nodes.map((n) => n.id);
      const sorted = topologicalSort(dag, nodeIds);
      const batches = getParallelBatches(sorted, dag);

      for (const batch of batches) {
        if (this.aborted || this.abortController.signal.aborted) break;

        await Promise.all(
          batch.map((nodeId) =>
            this.executeNode(nodeId, def, executionId, dag, nodeResults, outputData, this.abortController!.signal)
          )
        );

        if (def.settings.onError === "stop" && this.hasNodeError(nodeResults)) {
          this.abortController.abort("Workflow stopped after node error");
          break;
        }
      }

      this.markUnexecutedNodesSkipped(def, sorted, nodeResults, timedOut
        ? "Execution timed out before node ran"
        : this.aborted
          ? "Execution was cancelled before node ran"
          : "Skipped because workflow stopped before node ran");

      const hasError = Array.from(nodeResults.values()).some(
        (r) => r.status === "error"
      );

      return {
        executionId,
        workflowId: def.id,
        status: timedOut ? "timeout" : this.aborted ? "cancelled" : hasError ? "error" : "success",
        nodeResults,
        startedAt,
        completedAt: Date.now(),
        duration: Date.now() - startedAt,
        error: timedOut ? `Workflow timed out after ${def.settings.timeout} seconds` : undefined,
      };
    } catch (err) {
      return {
        executionId,
        workflowId: def.id,
        status: timedOut ? "timeout" : this.aborted ? "cancelled" : "error",
        nodeResults,
        startedAt,
        completedAt: Date.now(),
        duration: Date.now() - startedAt,
        error: (err as Error).message,
      };
    } finally {
      clearTimeout(timer);
      this.abortController = undefined;
    }
  }

  private async executeNode(
    nodeId: string,
    def: WorkflowDefinition,
    executionId: string,
    dag: ReturnType<typeof buildDAG>,
    nodeResults: Map<string, NodeExecutionResult>,
    outputData: Map<string, OutputBuckets>,
    signal: AbortSignal,
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
        error: `No executable node registered for type ${wfNode.type}`,
        logs: [],
      });
      return;
    }

    const inputs: WorkflowItem[][] = [];
    const upstreamEdges = this.upstreamEdges(dag, nodeId);
    const skipReason = this.getDependencySkipReason(upstreamEdges, nodeResults, def.settings.onError);
    if (skipReason) {
      nodeResults.set(nodeId, {
        nodeId,
        nodeType: wfNode.type,
        status: "skipped",
        inputSnapshot: null,
        outputSnapshot: null,
        duration: 0,
        error: skipReason,
        logs: [],
      });
      return;
    }

    for (const { source, sourceHandle } of upstreamEdges) {
      const upstreamOutput = outputData.get(source);
      inputs.push(this.resolveOutputBucket(upstreamOutput, sourceHandle));
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
      credentials: this.credentialOps,
      logger,
      signal,
    };

    const startTime = Date.now();
    let attempts = 0;
    try {
      const output = await this.executeWithRetry(nodeDef, ctx, def, nodeLogs, () => {
        attempts += 1;
      });
      const normalizedOutput = this.normalizeOutput(output, nodeDef);
      outputData.set(nodeId, normalizedOutput);
      nodeResults.set(nodeId, {
        nodeId,
        nodeType: wfNode.type,
        status: "success",
        inputSnapshot: this.safeSnapshot(inputs),
        outputSnapshot: this.safeSnapshot(this.snapshotOutput(normalizedOutput, nodeDef)),
        duration: Date.now() - startTime,
        attempts,
        logs: nodeLogs,
      });
    } catch (err) {
      const message = signal.aborted ? abortMessage(signal) : (err as Error).message;
      nodeResults.set(nodeId, {
        nodeId,
        nodeType: wfNode.type,
        status: "error",
        inputSnapshot: this.safeSnapshot(inputs),
        outputSnapshot: null,
        duration: Date.now() - startTime,
        error: message,
        attempts,
        logs: nodeLogs,
      });

      if (def.settings.onError === "branch") {
        outputData.set(nodeId, this.errorOutputBuckets(nodeId, wfNode.type, message, inputs));
      }
    }
  }

  private async executeWithRetry(
    nodeDef: CloudNodeDefinition,
    ctx: NodeExecutionContext,
    def: WorkflowDefinition,
    logs: { timestamp: number; level: string; message: string; data?: unknown }[],
    onAttempt: () => void,
  ): Promise<WorkflowItem[] | WorkflowItem[][]> {
    const attempts = maxAttempts(def);
    const delayMs = retryDelayMs(def);
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (ctx.signal.aborted) {
        throw new Error(abortMessage(ctx.signal));
      }

      onAttempt();
      try {
        return await nodeDef.execute!(ctx);
      } catch (error) {
        lastError = error;
        if (ctx.signal.aborted || attempt >= attempts) break;

        logs.push({
          timestamp: Date.now(),
          level: "warn",
          message: `Attempt ${attempt} failed; retrying`,
          data: { error: error instanceof Error ? error.message : String(error), nextAttempt: attempt + 1 },
        });

        await this.sleep(delayMs, ctx.signal);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => {
        clearTimeout(timeout);
        reject(new Error(abortMessage(signal)));
      }, { once: true });
    });
  }

  private upstreamEdges(dag: DAG, nodeId: string): Array<{ source: string; sourceHandle?: string }> {
    return Array.from(dag.entries()).flatMap(([source, edges]) =>
      edges
        .filter((edge) => edge.target === nodeId)
        .map((edge) => ({ source, sourceHandle: edge.sourceHandle }))
    );
  }

  private getDependencySkipReason(
    upstreamEdges: Array<{ source: string; sourceHandle?: string }>,
    nodeResults: Map<string, NodeExecutionResult>,
    onError: WorkflowDefinition["settings"]["onError"],
  ): string | undefined {
    for (const edge of upstreamEdges) {
      const upstream = nodeResults.get(edge.source);
      if (!upstream) continue;
      if (upstream.status !== "error" && upstream.status !== "skipped") continue;
      if (onError === "branch" && upstream.status === "error" && edge.sourceHandle === "error") {
        continue;
      }
      return `Skipped because upstream node ${edge.source} ${upstream.status}`;
    }
    return undefined;
  }

  private errorOutputBuckets(
    nodeId: string,
    nodeType: string,
    message: string,
    inputs: WorkflowItem[][],
  ): OutputBuckets {
    const item: WorkflowItem = {
      json: {
        error: {
          nodeId,
          nodeType,
          message,
        },
      },
      error: { message },
      pairedItem: { item: 0 },
    };
    const buckets: OutputBuckets = new Map();
    buckets.set("error", [item]);
    buckets.set("0", [item]);
    buckets.set("output", [item]);
    buckets.set("input", inputs.flat());
    return buckets;
  }

  private hasNodeError(nodeResults: Map<string, NodeExecutionResult>): boolean {
    return Array.from(nodeResults.values()).some((result) => result.status === "error");
  }

  private markUnexecutedNodesSkipped(
    def: WorkflowDefinition,
    sorted: string[],
    nodeResults: Map<string, NodeExecutionResult>,
    reason: string,
  ): void {
    for (const nodeId of sorted) {
      if (nodeResults.has(nodeId)) continue;
      const wfNode = def.nodes.find((node) => node.id === nodeId);
      if (!wfNode) continue;
      nodeResults.set(nodeId, {
        nodeId,
        nodeType: wfNode.type,
        status: "skipped",
        inputSnapshot: null,
        outputSnapshot: null,
        duration: 0,
        error: reason,
        logs: [],
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

  private normalizeOutput(
    output: WorkflowItem[] | WorkflowItem[][],
    nodeDef: CloudNodeDefinition,
  ): OutputBuckets {
    const buckets: OutputBuckets = new Map();
    const isMultiOutput = Array.isArray(output[0]);

    if (isMultiOutput) {
      (output as WorkflowItem[][]).forEach((items, index) => {
        const label = nodeDef.outputs[index]?.label ?? String(index);
        buckets.set(label, items);
        buckets.set(String(index), items);
      });
      return buckets;
    }

    const items = output as WorkflowItem[];
    const defaultLabel = nodeDef.outputs[0]?.label ?? "output";
    buckets.set(defaultLabel, items);
    buckets.set("output", items);
    buckets.set("0", items);
    return buckets;
  }

  private resolveOutputBucket(
    buckets: OutputBuckets | undefined,
    sourceHandle?: string,
  ): WorkflowItem[] {
    if (!buckets) return [];
    if (sourceHandle && buckets.has(sourceHandle)) {
      return buckets.get(sourceHandle) ?? [];
    }
    return buckets.values().next().value ?? [];
  }

  private snapshotOutput(
    buckets: OutputBuckets,
    nodeDef: CloudNodeDefinition,
  ): WorkflowItem[] | Record<string, WorkflowItem[]> {
    if (nodeDef.outputs.length <= 1) {
      return this.resolveOutputBucket(buckets, nodeDef.outputs[0]?.label);
    }

    const snapshot: Record<string, WorkflowItem[]> = {};
    for (const output of nodeDef.outputs) {
      snapshot[output.label] = buckets.get(output.label) ?? [];
    }
    return snapshot;
  }

  abort(): void {
    this.aborted = true;
    this.abortController?.abort("Execution cancelled");
  }
}
