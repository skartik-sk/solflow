import { describe, it, expect, vi } from "vitest";
import { WorkflowExecutor } from "../src/executor";
import { CloudNodeRegistry } from "@solflow/cloud-nodes";
import type { CloudNodeDefinition, NodeExecutionContext } from "@solflow/cloud-nodes";
import type { WorkflowDefinition } from "../src/types";

function createMockNode(
  type: string,
  executeFn: (ctx: NodeExecutionContext) => Promise<any>,
  outputs: CloudNodeDefinition["outputs"] = [{ type: "main", label: "out" }],
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
    outputs,
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

const defaultSettings = {
  timeout: 30,
  retryPolicy: { maxAttempts: 1, delayMs: 0 },
  onError: "stop" as const,
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
      settings: defaultSettings,
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
      settings: defaultSettings,
    };

    const executor = new WorkflowExecutor(registry, mockWallet as any);
    const result = await executor.execute(def, "exec-2");

    expect(result.status).toBe("success");
    const n4Output = result.nodeResults.get("n4")?.outputSnapshot as any[];
    expect(n4Output[0].json.values).toEqual([20, 30]);
  });

  it("routes multi-output nodes by source handle", async () => {
    const registry = new CloudNodeRegistry();
    registry.register(
      createMockNode("trigger:manual", async () => [{ json: { value: 10 } }])
    );
    registry.register(
      createMockNode(
        "logic:if-else",
        async (ctx) => {
          const value = ctx.inputs[0][0].json.value as number;
          return value > 5
            ? [[{ json: { branch: "true", value } }], []]
            : [[], [{ json: { branch: "false", value } }]];
        },
        [
          { type: "main", label: "true" },
          { type: "main", label: "false" },
        ],
      )
    );
    registry.register(
      createMockNode("action:true-path", async (ctx) => [
        { json: { seen: ctx.inputs[0][0]?.json.branch ?? "none" } },
      ])
    );
    registry.register(
      createMockNode("action:false-path", async (ctx) => [
        { json: { seen: ctx.inputs[0][0]?.json.branch ?? "none" } },
      ])
    );

    const def: WorkflowDefinition = {
      id: "wf-branch",
      version: 1,
      nodes: [
        { id: "n1", type: "trigger:manual", position: { x: 0, y: 0 }, data: {} },
        { id: "n2", type: "logic:if-else", position: { x: 200, y: 0 }, data: {} },
        { id: "n3", type: "action:true-path", position: { x: 400, y: -100 }, data: {} },
        { id: "n4", type: "action:false-path", position: { x: 400, y: 100 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3", sourceHandle: "true" },
        { id: "e3", source: "n2", target: "n4", sourceHandle: "false" },
      ],
      settings: defaultSettings,
    };

    const executor = new WorkflowExecutor(registry, mockWallet as any);
    const result = await executor.execute(def, "exec-branch");

    expect(result.status).toBe("success");
    expect(result.nodeResults.get("n2")?.outputSnapshot).toEqual({
      true: [{ json: { branch: "true", value: 10 } }],
      false: [],
    });
    expect((result.nodeResults.get("n3")?.outputSnapshot as any[])[0].json.seen).toBe("true");
    expect((result.nodeResults.get("n4")?.outputSnapshot as any[])[0].json.seen).toBe("none");
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
      settings: defaultSettings,
    };

    const executor = new WorkflowExecutor(registry, mockWallet as any);
    const result = await executor.execute(def, "exec-3");

    expect(result.status).toBe("error");
    expect(result.nodeResults.get("n2")?.error).toBe("Something broke");
  });

  it("retries a failed node according to retryPolicy", async () => {
    const registry = new CloudNodeRegistry();
    let attempts = 0;
    registry.register(
      createMockNode("action:flaky", async () => {
        attempts += 1;
        if (attempts < 3) throw new Error(`failed ${attempts}`);
        return [{ json: { ok: true } }];
      })
    );

    const def: WorkflowDefinition = {
      id: "wf-retry",
      version: 1,
      nodes: [{ id: "n1", type: "action:flaky", position: { x: 0, y: 0 }, data: {} }],
      edges: [],
      settings: { timeout: 30, retryPolicy: { maxAttempts: 3, delayMs: 0 }, onError: "stop" },
    };

    const executor = new WorkflowExecutor(registry, mockWallet as any);
    const result = await executor.execute(def, "exec-retry");

    expect(result.status).toBe("success");
    expect(attempts).toBe(3);
    expect(result.nodeResults.get("n1")?.attempts).toBe(3);
    expect(result.nodeResults.get("n1")?.logs).toHaveLength(2);
  });

  it("skips downstream nodes after an upstream error", async () => {
    const registry = new CloudNodeRegistry();
    registry.register(createMockNode("trigger:manual", async () => [{ json: {} }]));
    registry.register(createMockNode("action:fail", async () => {
      throw new Error("upstream failed");
    }));
    registry.register(createMockNode("action:downstream", async () => [{ json: { shouldNotRun: true } }]));

    const def: WorkflowDefinition = {
      id: "wf-skip",
      version: 1,
      nodes: [
        { id: "n1", type: "trigger:manual", position: { x: 0, y: 0 }, data: {} },
        { id: "n2", type: "action:fail", position: { x: 100, y: 0 }, data: {} },
        { id: "n3", type: "action:downstream", position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
      ],
      settings: defaultSettings,
    };

    const executor = new WorkflowExecutor(registry, mockWallet as any);
    const result = await executor.execute(def, "exec-skip");

    expect(result.status).toBe("error");
    expect(result.nodeResults.get("n2")?.status).toBe("error");
    expect(result.nodeResults.get("n3")?.status).toBe("skipped");
    expect(result.nodeResults.get("n3")?.error).toContain("workflow stopped");
  });

  it("continues independent branches when onError=continue", async () => {
    const registry = new CloudNodeRegistry();
    registry.register(createMockNode("trigger:manual", async () => [{ json: {} }]));
    registry.register(createMockNode("action:fail", async () => {
      throw new Error("branch failed");
    }));
    registry.register(createMockNode("action:ok", async () => [{ json: { ok: true } }]));
    registry.register(createMockNode("action:failed-child", async () => [{ json: { shouldNotRun: true } }]));

    const def: WorkflowDefinition = {
      id: "wf-continue",
      version: 1,
      nodes: [
        { id: "n1", type: "trigger:manual", position: { x: 0, y: 0 }, data: {} },
        { id: "n2", type: "action:fail", position: { x: 100, y: -50 }, data: {} },
        { id: "n3", type: "action:ok", position: { x: 100, y: 50 }, data: {} },
        { id: "n4", type: "action:failed-child", position: { x: 200, y: -50 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n1", target: "n3" },
        { id: "e3", source: "n2", target: "n4" },
      ],
      settings: { ...defaultSettings, onError: "continue" },
    };

    const executor = new WorkflowExecutor(registry, mockWallet as any);
    const result = await executor.execute(def, "exec-continue");

    expect(result.status).toBe("error");
    expect(result.nodeResults.get("n2")?.status).toBe("error");
    expect(result.nodeResults.get("n3")?.status).toBe("success");
    expect(result.nodeResults.get("n4")?.status).toBe("skipped");
    expect(result.nodeResults.get("n4")?.error).toContain("upstream node n2 error");
  });

  it("routes errors to explicit error branch when onError=branch", async () => {
    const registry = new CloudNodeRegistry();
    registry.register(createMockNode("action:fail", async () => {
      throw new Error("route me");
    }));
    registry.register(createMockNode("action:error-handler", async (ctx) => [
      { json: { handled: ctx.inputs[0][0].json.error } },
    ]));
    registry.register(createMockNode("action:normal-child", async () => [{ json: { shouldNotRun: true } }]));

    const def: WorkflowDefinition = {
      id: "wf-branch-error",
      version: 1,
      nodes: [
        { id: "n1", type: "action:fail", position: { x: 0, y: 0 }, data: {} },
        { id: "n2", type: "action:error-handler", position: { x: 200, y: -50 }, data: {} },
        { id: "n3", type: "action:normal-child", position: { x: 200, y: 50 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2", sourceHandle: "error" },
        { id: "e2", source: "n1", target: "n3" },
      ],
      settings: { ...defaultSettings, onError: "branch" },
    };

    const executor = new WorkflowExecutor(registry, mockWallet as any);
    const result = await executor.execute(def, "exec-branch-error");

    expect(result.status).toBe("error");
    expect(result.nodeResults.get("n2")?.status).toBe("success");
    expect((result.nodeResults.get("n2")?.outputSnapshot as any[])[0].json.handled.message).toBe("route me");
    expect(result.nodeResults.get("n3")?.status).toBe("skipped");
  });

  it("times out and aborts running nodes", async () => {
    const registry = new CloudNodeRegistry();
    registry.register(createMockNode("action:slow", async (ctx) => {
      await new Promise((_, reject) => {
        ctx.signal.addEventListener("abort", () => reject(new Error("node saw abort")), { once: true });
      });
      return [{ json: { done: true } }];
    }));
    registry.register(createMockNode("action:after", async () => [{ json: { shouldNotRun: true } }]));

    const def: WorkflowDefinition = {
      id: "wf-timeout",
      version: 1,
      nodes: [
        { id: "n1", type: "action:slow", position: { x: 0, y: 0 }, data: {} },
        { id: "n2", type: "action:after", position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2" }],
      settings: { timeout: 0.001, retryPolicy: { maxAttempts: 3, delayMs: 0 }, onError: "stop" },
    };

    const executor = new WorkflowExecutor(registry, mockWallet as any);
    const result = await executor.execute(def, "exec-timeout");

    expect(result.status).toBe("timeout");
    expect(result.error).toContain("timed out");
    expect(result.nodeResults.get("n1")?.status).toBe("error");
    expect(result.nodeResults.get("n1")?.attempts).toBe(1);
    expect(result.nodeResults.get("n2")?.status).toBe("skipped");
  });
});
