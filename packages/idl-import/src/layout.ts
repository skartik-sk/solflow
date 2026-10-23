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
const NODE_WIDTH = 240;
const ACCOUNT_GAP = 20;
const COLUMN_GAP = 80;
const LOGIC_OFFSET = 100;
const ACCOUNTS_PER_ROW = 2;
const ACCOUNT_ROW_GAP = 150;
const SIDE_GAP = 260;
const LOGIC_GAP = 140;

export function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  // Find the program node
  const programNode = nodes.find((n) => n.type === "program");
  if (!programNode) return nodes;

  const instructions = getChildren(programNode.id, nodes, edges, "instruction");

  // Plan each instruction's column first. Accounts shared by several instructions
  // (system_program, signer, …) are placed once, under the first instruction that uses them.
  const claimed = new Set<string>();
  const columns = instructions.map((ix) => {
    const logic = resolveLogicChain(ix.id, nodes, edges);
    const accounts = getChildren(ix.id, nodes, edges, "account").filter((a) => {
      if (claimed.has(a.id)) return false;
      claimed.add(a.id);
      return true;
    });
    const slots = accounts.map((acc) => {
      const states = getParents(acc.id, nodes, edges, "state");
      return { acc, states, width: NODE_WIDTH + states.length * (NODE_WIDTH + ACCOUNT_GAP) };
    });
    // Accounts wrap into rows of ACCOUNTS_PER_ROW so wide programs stay readable at fit-view zoom.
    const rows: typeof slots[] = [];
    for (let i = 0; i < slots.length; i += ACCOUNTS_PER_ROW) rows.push(slots.slice(i, i + ACCOUNTS_PER_ROW));
    const rowWidth = (row: typeof slots) => row.reduce((w, s) => w + s.width, 0) + Math.max(0, row.length - 1) * ACCOUNT_GAP;
    const accountsWidth = Math.max(0, ...rows.map(rowWidth));
    const width = Math.max(NODE_WIDTH + LOGIC_OFFSET, accountsWidth);
    return { ix, logic, rows, rowWidth, width };
  });

  // All account rows share one baseline under the deepest logic chain.
  const maxLogic = Math.max(0, ...columns.map((c) => c.logic.length));
  const accBaseY = maxLogic > 0 ? VERTICAL_GAP * 2 + maxLogic * LOGIC_GAP + 40 : VERTICAL_GAP * 2;

  const totalWidth = columns.reduce((w, c) => w + c.width, 0) + Math.max(0, columns.length - 1) * COLUMN_GAP;
  let x = -totalWidth / 2;

  // ─── Layer 0: Program node ─────────────────────────────────────────────
  programNode.position = { x: -NODE_WIDTH / 2, y: 0 };

  for (const col of columns) {
    const centerX = x + col.width / 2;

    // ─── Layer 1: Instruction ────────────────────────────────────────────
    col.ix.position = { x: centerX - NODE_WIDTH / 2, y: VERTICAL_GAP };

    // ─── Layer 2: Logic nodes below instruction (vertically chained) ─────
    for (let l = 0; l < col.logic.length; l++) {
      col.logic[l].position = {
        x: col.ix.position.x + LOGIC_OFFSET,
        y: VERTICAL_GAP * 2 + l * LOGIC_GAP,
      };
    }

    // ─── Layer 3/4: Accounts, with their state nodes to the left ─────────
    col.rows.forEach((row, r) => {
      const y = accBaseY + r * ACCOUNT_ROW_GAP;
      let ax = centerX - col.rowWidth(row) / 2;
      for (const slot of row) {
        slot.acc.position = { x: ax + slot.states.length * (NODE_WIDTH + ACCOUNT_GAP), y };
        slot.states.forEach((st, s) => {
          st.position = { x: slot.acc.position.x - (s + 1) * (NODE_WIDTH + ACCOUNT_GAP), y };
        });
        ax += slot.width + ACCOUNT_GAP;
      }
    });

    // ─── Layer 5: Error/Event nodes to the left of instruction ───────────
    const sideNodes = [
      ...getChildren(col.ix.id, nodes, edges, "error"),
      ...getChildren(col.ix.id, nodes, edges, "event"),
    ];
    for (let s = 0; s < sideNodes.length; s++) {
      sideNodes[s].position = {
        x: col.ix.position.x - SIDE_GAP - s * 20,
        y: VERTICAL_GAP + s * 100,
      };
    }

    x += col.width + COLUMN_GAP;
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
