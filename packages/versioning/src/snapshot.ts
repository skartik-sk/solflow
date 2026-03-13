// packages/versioning/src/snapshot.ts
// Server-side snapshot creation logic.
// Called from the tRPC snapshot.create procedure.
// NOTE: This file uses Prisma — only run server-side.

import type { PrismaClient } from "@solflow/db";
import { computeFlowHash, type FlowData } from "./hash";
import { computeFlowDiff } from "./diff";

const MAX_SNAPSHOTS = 100;

/**
 * Create a new snapshot for a project.
 *
 * - Skips creation if the flow hash matches the latest snapshot (nothing changed).
 * - Computes a FlowDiff against the previous snapshot.
 * - Enforces a 100-snapshot retention limit (prunes oldest).
 * - Updates the project's flowData/irData as well.
 *
 * Returns the new snapshot, or the existing one if nothing changed.
 */
export async function createSnapshot(
  prisma: PrismaClient,
  projectId: string,
  flowData: FlowData,
  label?: string,
) {
  // Load project + latest snapshot in one query
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      snapshots: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });

  if (!project) throw new Error(`Project ${projectId} not found`);

  const previousSnapshot = project.snapshots[0] ?? null;
  const nextVersion = previousSnapshot ? previousSnapshot.version + 1 : 1;

  // Compute hash and skip if unchanged
  const flowHash = computeFlowHash(flowData);
  if (previousSnapshot && previousSnapshot.flowHash === flowHash) {
    return previousSnapshot;
  }

  // Compute diff from previous version (null for first snapshot)
  const diffData =
    previousSnapshot && previousSnapshot.flowData
      ? computeFlowDiff(
          previousSnapshot.flowData as unknown as FlowData,
          flowData,
        )
      : null;

  // Generate IR from current flow.
  // We import lazily so the module is never loaded client-side.
  const { flowToIR } = await import("@solflow/ir");

  // flowData nodes/edges are stored as plain JSON; cast to xyflow Node/Edge
  type AnyNode = Parameters<typeof flowToIR>[0][number];
  type AnyEdge = Parameters<typeof flowToIR>[1][number];

  const irData = flowToIR(
    (flowData.nodes as AnyNode[]) ?? [],
    (flowData.edges as AnyEdge[]) ?? [],
  );

  // Create snapshot record — Prisma Json fields accept any serializable value.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapshot = await prisma.projectSnapshot.create({
    data: {
      projectId,
      version: nextVersion,
      label: label ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      flowData: flowData as unknown as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      irData: irData as unknown as any,
      flowHash,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      diffData: diffData as unknown as any,
    },
  });

  // Keep project's current state in sync
  await prisma.project.update({
    where: { id: projectId },
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      flowData: flowData as unknown as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      irData: irData as unknown as any,
      updatedAt: new Date(),
    },
  });

  // Enforce retention limit asynchronously (best-effort)
  pruneOldSnapshots(prisma, projectId, MAX_SNAPSHOTS).catch(() => {
    // Non-fatal
  });

  return snapshot;
}

/**
 * Delete the oldest snapshots beyond the retention limit.
 */
async function pruneOldSnapshots(
  prisma: PrismaClient,
  projectId: string,
  keep: number,
): Promise<void> {
  const all = await prisma.projectSnapshot.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { id: true },
  });

  if (all.length <= keep) return;

  const toDelete = all.slice(keep).map((s: { id: string }) => s.id);
  await prisma.projectSnapshot.deleteMany({
    where: { id: { in: toDelete } },
  });
}
