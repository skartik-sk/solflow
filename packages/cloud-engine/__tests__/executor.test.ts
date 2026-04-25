import { describe, it, expect, vi } from "vitest";
import { WorkflowExecutor } from "../src/executor";
import { CloudNodeRegistry } from "@solflow/cloud-nodes";
import type { CloudNodeDefinition, NodeExecutionContext } from "@solflow/cloud-nodes";
import type { WorkflowDefinition } from "../src/types";

function createMockNode(
  type: string,
  executeFn: (ctx: NodeExecutionContext) => Promise<any>,
): CloudNodeDefinition {
  return {
    type,
    label: type,
    category: "action",
    description: "mock",
    icon: "Zap",
    color: "#3b82f6",
    properties: [],
    inputs: [{ type: "main", label: "in" }],
    outputs: [{ type: "main", label: "out" }],
    defaultData: {},
    component: (() => null) as any,
    execute: executeFn,
  };
}

const mockWallet = {
  signAndSend: vi.fn(),
  getPublicKey: vi.fn(),
  getBalance: vi.fn(),
};

describe("WorkflowExecutor", () => {
  it("executes a linear chain of nodes", async () => {
    const registry = new CloudNodeRegistry();
    registry.register(
      createMockNode("trigger:manual", async () => [{ json: { count: 1 } }])
    );
    registry.register(
      createMockNode("action:doubler", async (ctx) => {
        const input = ctx.inputs[0][0].json;
        return [{ json: { count: (input.count as number) * 2 } }];
      })
    );
    registry.register(
      createMockNode("action:trippler", async (ctx) => {
        const input = ctx.inputs[0][0].json;
        return [{ json: { count: (input.count as number) * 3 } }];
      })
    );

    const def: WorkflowDefinition = {
      id: "wf-1",
      version: 1,
      nodes: [
        { id: "n1", type: "trigger:manual", position: { x: 0, y: 0 }, data: {} },
        { id: "n2", type: "action:doubler", position: { x: 200, y: 0 }, data: {} },
        { id: "n3", type: "action:trippler", position: { x: 400, y: 0 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ],
      settings: { timeout: 30, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
    };

    const executor = new WorkflowExecutor(registry, mockWallet as any);
    const result = await executor.execute(def, "exec-1");

    expect(result.status).toBe("success");
    expect(result.nodeResults.get("n1")?.status).toBe("success");
    expect(result.nodeResults.get("n2")?.status).toBe("success");
    expect(result.nodeResults.get("n3")?.status).toBe("success");

    const n3Output = result.nodeResults.get("n3")?.outputSnapshot as any[];
    expect(n3Output[0].json.count).toBe(6);
  });

  it("handles parallel branches", async () => {
    const registry = new CloudNodeRegistry();
    registry.register(
      createMockNode("trigger:manual", async () => [{ json: { value: 10 } }])
    );
    registry.register(
      createMockNode("action:double", async (ctx) => {
        const v = ctx.inputs[0][0].json.value as number;
        return [{ json: { value: v * 2 } }];
      })
    );
    registry.register(
      createMockNode("action:triple", async (ctx) => {
        const v = ctx.inputs[0][0].json.value as number;
        return [{ json: { value: v * 3 } }];
      })
    );
    registry.register(
      createMockNode("action:merge", async (ctx) => {
        const values = ctx.inputs.flat().map((i) => i.json.value);
        return [{ json: { values } }];
      })
    );

    const def: WorkflowDefinition = {
      id: "wf-2",
      version: 1,
      nodes: [
        { id: "n1", type: "trigger:manual", position: { x: 0, y: 0 }, data: {} },
        { id: "n2", type: "action:double", position: { x: 200, y: -100 }, data: {} },
        { id: "n3", type: "action:triple", position: { x: 200, y: 100 }, data: {} },
        { id: "n4", type: "action:merge", position: { x: 400, y: 0 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n1", target: "n3" },
        { id: "e3", source: "n2", target: "n4" },
        { id: "e4", source: "n3", target: "n4" },
      ],
      settings: { timeout: 30, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
    };

    const executor = new WorkflowExecutor(registry, mockWallet as any);
    const result = await executor.execute(def, "exec-2");

    expect(result.status).toBe("success");
    const n4Output = result.nodeResults.get("n4")?.outputSnapshot as any[];
    expect(n4Output[0].json.values).toEqual([20, 30]);
  });

  it("captures errors per node with onError=stop", async () => {
    const registry = new CloudNodeRegistry();
    registry.register(
      createMockNode("trigger:manual", async () => [{ json: {} }])
    );
    registry.register(
      createMockNode("action:fail", async () => {
        throw new Error("Something broke");
      })
    );

    const def: WorkflowDefinition = {
      id: "wf-3",
      version: 1,
      nodes: [
        { id: "n1", type: "trigger:manual", position: { x: 0, y: 0 }, data: {} },
        { id: "n2", type: "action:fail", position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2" }],
      settings: { timeout: 30, retryPolicy: { maxAttempts: 1, delayMs: 0 }, onError: "stop" },
    };

    const executor = new WorkflowExecutor(registry, mockWallet as any);
    const result = await executor.execute(def, "exec-3");

    expect(result.status).toBe("error");
    expect(result.nodeResults.get("n2")?.error).toBe("Something broke");
  });
});
