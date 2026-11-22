// Ownership and quota checks shared by tRPC and the CLI API.
// SERVER ONLY.

import { TRPCError } from "@trpc/server";
import type { prisma as prismaClient } from "@solflow/db";

type Db = typeof prismaClient;

function getPositiveIntEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export async function assertWorkflowActivationQuota(
  db: Db,
  userId: string | undefined,
  workflowId: string,
): Promise<void> {
  if (process.env.CLOUD_QUOTA_ENFORCEMENT !== "true") return;

  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Sign in before activating Cloud workflows.",
    });
  }
  const [user, activeCount] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    }),
    db.workflow.count({
      where: {
        userId,
        status: "ACTIVE",
        NOT: { id: workflowId },
      },
    }),
  ]);

  const trialDays = getPositiveIntEnv("CLOUD_TRIAL_DAYS", 7);
  const maxActiveWorkflows = getPositiveIntEnv("CLOUD_FREE_ACTIVE_WORKFLOWS", 1);
  const trialStartedAt = user?.createdAt?.getTime?.() ?? Date.now();
  const trialEndsAt = trialStartedAt + trialDays * 24 * 60 * 60 * 1000;

  if (Date.now() > trialEndsAt) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cloud trial quota expired. Upgrade is required to activate workflows.",
    });
  }

  if (activeCount >= maxActiveWorkflows) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Free Cloud quota allows ${maxActiveWorkflows} active workflow${maxActiveWorkflows === 1 ? "" : "s"}.`,
    });
  }
}

/** A workflow may only point at one of its owner's wallets. */
export async function assertWalletOwnedBy(
  db: Pick<Db, "cloudWallet">,
  userId: string,
  walletId: string | null | undefined,
): Promise<void> {
  if (!walletId) return;
  const wallet = await db.cloudWallet.findFirst({
    where: { id: walletId, userId },
    select: { id: true },
  });
  if (!wallet) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Wallet not found" });
  }
}
