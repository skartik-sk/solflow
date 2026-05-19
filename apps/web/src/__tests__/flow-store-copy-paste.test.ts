import type { Edge, Node } from "@xyflow/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useFlowStore } from "../store/flow-store";

describe("flow store clipboard actions", () => {
  beforeEach(() => {
    useFlowStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      selectedNodeIds: [],
      nodeClipboard: null,
    });
  });

  it("copies selected nodes and pastes cloned nodes with their internal edges", () => {
    const nodes: Node[] = [
      {
        id: "source",
        type: "instruction",
        position: { x: 100, y: 150 },
        data: { label: "Source" },
        selected: true,
      },
      {
        id: "target",
        type: "account",
        position: { x: 320, y: 150 },
        data: { label: "Target" },
        selected: true,
      },
      {
        id: "outside",
        type: "state",
        position: { x: 600, y: 150 },
        data: { label: "Outside" },
      },
    ];
    const edges: Edge[] = [
      { id: "selected-edge", source: "source", target: "target" },
      { id: "external-edge", source: "target", target: "outside" },
    ];

    useFlowStore.setState({
      nodes,
      edges,
      selectedNodeId: "target",
      selectedNodeIds: ["source", "target"],
    });

    expect(useFlowStore.getState().copySelectedNodes()).toBe(true);
    expect(useFlowStore.getState().nodes).toHaveLength(3);

    expect(useFlowStore.getState().pasteCopiedNodes()).toBe(true);

    const state = useFlowStore.getState();
    const pastedNodes = state.nodes.filter(
      (node) => !["source", "target", "outside"].includes(node.id),
    );

    expect(pastedNodes).toHaveLength(2);
    expect(new Set(pastedNodes.map((node) => node.id)).size).toBe(2);
    expect(pastedNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "instruction",
          position: { x: 150, y: 200 },
          data: { label: "Source" },
          selected: true,
        }),
        expect.objectContaining({
          type: "account",
          position: { x: 370, y: 200 },
          data: { label: "Target" },
          selected: true,
        }),
      ]),
    );
    expect(state.nodes.find((node) => node.id === "source")?.selected).toBe(false);
    expect(state.nodes.find((node) => node.id === "target")?.selected).toBe(false);
    expect(state.selectedNodeIds).toEqual(pastedNodes.map((node) => node.id));
    expect(state.selectedNodeId).toBe(pastedNodes.at(-1)?.id);

    const pastedEdges = state.edges.filter(
      (edge) => !["selected-edge", "external-edge"].includes(edge.id),
    );
    expect(pastedEdges).toHaveLength(1);
    expect(pastedEdges[0]).toMatchObject({
      source: pastedNodes.find((node) => node.data.label === "Source")?.id,
      target: pastedNodes.find((node) => node.data.label === "Target")?.id,
    });
  });
});
