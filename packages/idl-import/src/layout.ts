// Auto-layout — positions flow nodes in a clean layered dagre-style layout.
//
// Layers:
//   0. Program node (top center)
//   1. Instructions (spread horizontally)
//   2. Logic nodes (below their parent instruction, vertically chained)
//   3. Account nodes (below logic, or below instruction if no logic)
//   4. State nodes (to the left of their linked account)
//   5. Error/Event nodes (to the left of their parent instruction)

import type { Node, Edge } from "@xyflow/react";

const VERTICAL_GAP = 160;
const HORIZONTAL_GAP = 300;
const NODE_WIDTH = 240;
const SIDE_GAP = 260;
const LOGIC_GAP = 100;

export function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  // Find the program node
  const programNode = nodes.find((n) => n.type === "program");
  if (!programNode) return nodes;

  // ─── Layer 0: Program node ─────────────────────────────────────────────

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

    // ─── Layer 2: Logic nodes below instruction (vertically chained) ────────

    // Also find logic nodes chained from other logic nodes
    const allLogicNodes = resolveLogicChain(ix.id, nodes, edges);

    const logicStartY = ix.position.y + VERTICAL_GAP;
    for (let l = 0; l < allLogicNodes.length; l++) {
      allLogicNodes[l].position = {
        x: ix.position.x + 100, // offset right from instruction
        y: logicStartY + l * LOGIC_GAP,
      };
    }

    // ─── Layer 3: Accounts below instruction (or below last logic) ───────

    const accounts = getChildren(ix.id, nodes, edges, "account");
    const accStartX = ix.position.x - ((accounts.length - 1) * (NODE_WIDTH + 20)) / 2;
    const accBaseY = allLogicNodes.length > 0
      ? allLogicNodes[allLogicNodes.length - 1].position.y + LOGIC_GAP + 40
      : VERTICAL_GAP * 2 + i * 40;

    for (let a = 0; a < accounts.length; a++) {
      const acc = accounts[a];
      acc.position = {
        x: accStartX + a * (NODE_WIDTH + 20),
        y: accBaseY,
      };

      // ─── Layer 4: State nodes to the left of account ──────────────────

      const stateNodes = getParents(acc.id, nodes, edges, "state");
      for (let s = 0; s < stateNodes.length; s++) {
        stateNodes[s].position = {
          x: acc.position.x - SIDE_GAP - s * (NODE_WIDTH + 20),
          y: acc.position.y,
        };
      }
    }

    // ─── Layer 5: Error/Event nodes to the left of instruction ──────────

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

/**
 * Resolve the full chain of logic nodes starting from an instruction.
 * Follows logic-out → logic-in edges through the chain.
 */
function resolveLogicChain(ixId: string, nodes: Node[], edges: Edge[]): Node[] {
  const chain: Node[] = [];
  const visited = new Set<string>();

  // Find direct logic children of instruction
  let currentIds = edges
    .filter((e) => e.source === ixId && e.sourceHandle === "logic-out")
    .map((e) => e.target);

  while (currentIds.length > 0) {
    const nextIds: string[] = [];
    for (const id of currentIds) {
      if (visited.has(id)) continue;
      visited.add(id);
      const node = nodes.find((n) => n.id === id && n.type === "logic");
      if (node) {
        chain.push(node);
        // Find next logic in chain
        const childIds = edges
          .filter((e) => e.source === id && e.sourceHandle === "logic-out")
          .map((e) => e.target);
        nextIds.push(...childIds);
      }
    }
    currentIds = nextIds;
  }

  return chain;
}

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
