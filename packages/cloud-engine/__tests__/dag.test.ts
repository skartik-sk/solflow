import { describe, it, expect } from "vitest";
import { buildDAG, topologicalSort, getParallelBatches } from "../src/dag";
import type { WorkflowNode, WorkflowEdge } from "../src/types";

const nodes: WorkflowNode[] = [
  { id: "a", type: "trigger:manual", position: { x: 0, y: 0 }, data: {} },
  { id: "b", type: "action:price-fetch", position: { x: 200, y: 0 }, data: {} },
  { id: "c", type: "logic:if-else", position: { x: 400, y: 0 }, data: {} },
  { id: "d", type: "action:jupiter-swap", position: { x: 600, y: -100 }, data: {} },
  { id: "e", type: "output:webhook", position: { x: 600, y: 100 }, data: {} },
];

describe("buildDAG", () => {
  it("builds adjacency list from edges", () => {
    const edges: WorkflowEdge[] = [
      { id: "e1", source: "a", target: "b" },
      { id: "e2", source: "b", target: "c" },
      { id: "e3", source: "c", target: "d" },
      { id: "e4", source: "c", target: "e" },
    ];
    const dag = buildDAG(nodes, edges);
    expect(dag.get("a")).toEqual([{ target: "b" }]);
    expect(dag.get("b")).toEqual([{ target: "c" }]);
    expect(dag.get("c")!.map((e) => e.target).sort()).toEqual(["d", "e"]);
    expect(dag.get("d")).toEqual([]);
  });

  it("handles nodes with no edges", () => {
    const dag = buildDAG([nodes[0]], []);
    expect(dag.get("a")).toEqual([]);
  });
});

describe("topologicalSort", () => {
  it("sorts linear chain", () => {
    const edges: WorkflowEdge[] = [
      { id: "e1", source: "a", target: "b" },
      { id: "e2", source: "b", target: "c" },
    ];
    const dag = buildDAG(nodes.slice(0, 3), edges);
    const sorted = topologicalSort(dag, ["a", "b", "c"]);
    expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("b"));
    expect(sorted.indexOf("b")).toBeLessThan(sorted.indexOf("c"));
  });

  it("sorts diamond graph", () => {
    const edges: WorkflowEdge[] = [
      { id: "e1", source: "a", target: "b" },
      { id: "e2", source: "a", target: "c" },
      { id: "e3", source: "b", target: "d" },
      { id: "e4", source: "c", target: "d" },
    ];
    const dag = buildDAG(nodes.slice(0, 4), edges);
    const sorted = topologicalSort(dag, ["a", "b", "c", "d"]);
    expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("b"));
    expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("c"));
    expect(sorted.indexOf("b")).toBeLessThan(sorted.indexOf("d"));
    expect(sorted.indexOf("c")).toBeLessThan(sorted.indexOf("d"));
  });

  it("detects circular dependency", () => {
    const edges: WorkflowEdge[] = [
      { id: "e1", source: "a", target: "b" },
      { id: "e2", source: "b", target: "c" },
      { id: "e3", source: "c", target: "a" },
    ];
    const dag = buildDAG(nodes.slice(0, 3), edges);
    expect(() => topologicalSort(dag, ["a", "b", "c"])).toThrow("Circular");
  });
});

describe("getParallelBatches", () => {
  it("groups independent nodes in same batch", () => {
    const edges: WorkflowEdge[] = [
      { id: "e1", source: "a", target: "b" },
      { id: "e2", source: "a", target: "c" },
    ];
    const dag = buildDAG(nodes.slice(0, 3), edges);
    const sorted = topologicalSort(dag, ["a", "b", "c"]);
    const batches = getParallelBatches(sorted, dag);
    expect(batches[0]).toEqual(["a"]);
    expect(batches[1].sort()).toEqual(["b", "c"]);
  });
});
