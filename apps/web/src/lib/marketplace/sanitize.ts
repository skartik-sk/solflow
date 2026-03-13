// apps/web/src/lib/marketplace/sanitize.ts
// Sanitize a flow + IR before publishing to the marketplace.
// Strips programId, personal wallet addresses, and timestamps per 13-marketplace.md.

import type { ProgramIR } from "@solflow/ir";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FlowData {
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

interface FlowNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
}

// Base58 pubkey pattern — 32–44 alphanumeric chars (no 0/O/I/l)
const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Well-known program IDs that are safe to keep (system programs etc.)
const KNOWN_PROGRAMS = new Set([
  "11111111111111111111111111111111", // System Program
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // Token Program
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bNz", // ATA Program
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s", // Metaplex Metadata
  "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY", // Bubblegum
  "J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix", // Pyth SOL/USD
  "GVXRSBjFk6e6J3NbVPXohDJwcHlsDWkVBj7XTxKHrh5K", // Pyth BTC/USD
  "JBu1AL4obBcCMqKBBxhpWCNUt136ijcuMZLFvTP7iWdB", // Pyth ETH/USD
  "SysvarC1ock11111111111111111111111111111111", // Clock sysvar
  "SysvarRent111111111111111111111111111111111", // Rent sysvar
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isCustomPubkey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    PUBKEY_RE.test(value) &&
    !KNOWN_PROGRAMS.has(value)
  );
}

/** Recursively strip custom pubkeys from a node data object */
function stripCustomPubkeys(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (isCustomPubkey(val)) {
      obj[key] = undefined;
    } else if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      stripCustomPubkeys(val as Record<string, unknown>);
    } else if (Array.isArray(val)) {
      obj[key] = val.map((item) => {
        if (isCustomPubkey(item)) return undefined;
        if (item !== null && typeof item === "object")
          stripCustomPubkeys(item as Record<string, unknown>);
        return item;
      });
    }
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Sanitize flow + IR before publishing to the marketplace.
 *
 * Removes:
 * - `programId` from IR (user will get their own on deploy)
 * - `createdAt` / `updatedAt` timestamps from IR metadata
 * - All non-well-known wallet pubkeys from node data
 */
export function sanitizeFlowForMarketplace(
  flowData: FlowData,
  irData: ProgramIR,
): { sanitizedFlow: FlowData; sanitizedIR: ProgramIR } {
  // ── Sanitize IR ───────────────────────────────────────────────────────────
  const sanitizedIR: ProgramIR = {
    ...irData,
    program: {
      ...irData.program,
      programId: undefined as unknown as string, // remove deployed address
    },
    metadata: {
      ...irData.metadata,
      // Keep generatorVersion; strip timestamps
      createdAt: undefined as unknown as string,
      updatedAt: undefined as unknown as string,
    },
  };

  // ── Deep-clone flow nodes and strip pubkeys ────────────────────────────────
  const sanitizedNodes: FlowNode[] = irData
    ? flowData.nodes.map((node) => {
        const clonedData: Record<string, unknown> = JSON.parse(
          JSON.stringify(node.data ?? {}),
        );
        // Remove explicit programId field
        if ("programId" in clonedData) {
          clonedData.programId = undefined;
        }
        // Strip remaining custom pubkeys recursively
        stripCustomPubkeys(clonedData);
        return { ...node, data: clonedData };
      })
    : flowData.nodes;

  const sanitizedFlow: FlowData = {
    ...flowData,
    nodes: sanitizedNodes,
  };

  return { sanitizedFlow, sanitizedIR };
}
