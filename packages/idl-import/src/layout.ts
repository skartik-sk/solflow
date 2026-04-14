// Auto-layout — positions flow nodes in a clean layered dagre-style layout.
//
// Layers:
//   0. Program node (top center)
//   1. Instructions (spread horizontally)
//   2. Account nodes (below their parent instruction)
//   3. State nodes (to the left of their linked account)
//   4. Error/Event nodes (to the left of their parent instruction)

import type { Node, Edge } from "@xyflow/react";

const VERTICAL_GAP = 160;
const HORIZONTAL_GAP = 300;
const NODE_WIDTH = 240;
const SIDE_GAP = 260;

export function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  // Find the program node
  const programNode = nodes.find((n) => n.type === "program");
  if (!programNode) return nodes;

  // ─── Layer 0: Program node ─────────────────────────────────────────────

  // Calculate total width needed for instructions
  const instructions = getChildren(programNode.id, nodes, edges, "instruction");
  const totalWidth = instructions.length * HORIZONTAL_GAP;
  const startX = -totalWidth / 2;

  programNode.position = { x: startX + totalWidth / 2 - NODE_WIDTH / 2, y: 0 };

  // ─── Layer 1: Instructions ─────────────────────────────────────────────

  for (let i = 0; i < instructions.length; i++) {
    const ix = instructions[i];
    ix.position = {
      x: startX + i * HORIZONTAL_GAP,
      y: VERTICAL_GAP,
    };

    // ─── Layer 2: Accounts below instruction ────────────────────────────

    const accounts = getChildren(ix.id, nodes, edges, "account");
    const accStartX = ix.position.x - ((accounts.length - 1) * (NODE_WIDTH + 20)) / 2;

    for (let a = 0; a < accounts.length; a++) {
      const acc = accounts[a];
      acc.position = {
        x: accStartX + a * (NODE_WIDTH + 20),
        y: VERTICAL_GAP * 2 + i * 40, // slight offset per instruction for visual separation
      };

      // ─── Layer 3: State nodes to the left of account ──────────────────

      const stateNodes = getParents(acc.id, nodes, edges, "state");
      for (let s = 0; s < stateNodes.length; s++) {
        stateNodes[s].position = {
          x: acc.position.x - SIDE_GAP - s * (NODE_WIDTH + 20),
          y: acc.position.y,
        };
      }
    }

    // ─── Layer 4: Error/Event nodes to the left of instruction ──────────

    const errorNodes = getChildren(ix.id, nodes, edges, "error");
    const eventNodes = getChildren(ix.id, nodes, edges, "event");
    const sideNodes = [...errorNodes, ...eventNodes];

    for (let s = 0; s < sideNodes.length; s++) {
      sideNodes[s].position = {
        x: ix.position.x - SIDE_GAP - s * 20,
        y: VERTICAL_GAP + s * 100,
      };
    }
  }

  return nodes;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getChildren(
  parentId: string,
  nodes: Node[],
  edges: Edge[],
  type: string,
): Node[] {
  const childIds = edges
    .filter((e) => e.source === parentId)
    .map((e) => e.target);
  return nodes.filter((n) => childIds.includes(n.id) && n.type === type);
}

function getParents(
  childId: string,
  nodes: Node[],
  edges: Edge[],
  type: string,
): Node[] {
  const parentIds = edges
    .filter((e) => e.target === childId)
    .map((e) => e.source);
  return nodes.filter((n) => parentIds.includes(n.id) && n.type === type);
}
