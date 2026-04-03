// tRPC deploy router — start, status, history
// Phase 3: real network config, explorer URL construction, deployment tracking.
// Full on-chain tx submission deferred to wallet-signing flow (post-Phase 3).
// Per docs/architecture/09-compilation-deployment.md → Deployment Service.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createHash } from "crypto";
import { router, protectedProcedure } from "../trpc";
import { deployRateLimit } from "@/lib/rate-limit";

// ─── Network config ───────────────────────────────────────────────────────────
// Per docs/architecture/09-compilation-deployment.md → Network Configuration.

const NETWORK_CONFIG = {
  DEVNET: {
    rpcUrl: "https://api.devnet.solana.com",
    wsUrl: "wss://api.devnet.solana.com",
    explorerBase: "https://explorer.solana.com/?cluster=devnet",
  },
  MAINNET: {
    rpcUrl:
      process.env.MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com",
    wsUrl: process.env.MAINNET_WS_URL ?? "wss://api.mainnet-beta.solana.com",
    explorerBase: "https://explorer.solana.com",
  },
  LOCALNET: {
    rpcUrl: "http://localhost:8899",
    wsUrl: "ws://localhost:8900",
    explorerBase: null,
  },
} as const;

function buildExplorerUrl(
  network: keyof typeof NETWORK_CONFIG,
  programId: string,
): string | null {
  const base = NETWORK_CONFIG[network].explorerBase;
  if (!base) return null;
  const suffix =
    network === "MAINNET" ? "" : `?cluster=${network.toLowerCase()}`;
  return `${base}/address/${programId}${suffix}`;
}

function buildTxExplorerUrl(
  network: keyof typeof NETWORK_CONFIG,
  txSig: string,
): string | null {
  const base = NETWORK_CONFIG[network].explorerBase;
  if (!base) return null;
  const suffix =
    network === "MAINNET" ? "" : `?cluster=${network.toLowerCase()}`;
  return `${base}/tx/${txSig}${suffix}`;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const deployRouter = router({
  // ── Start deployment ─────────────────────────────────────────────────────
  start: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        network: z.enum(["DEVNET", "MAINNET", "LOCALNET"]).default("DEVNET"),
        programKeypair: z.string().optional(),
        /** Base64-encoded .so binary from a completed compilation */
        programBinary: z.string().optional(),
        /** Payer wallet public key (client provides; backend uses for tx construction) */
        payerWallet: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.session.user.id! },
        select: { id: true, irData: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      if (!project.irData) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Project has no compiled data. Compile first.",
        });
      }

      // Rate limit: 3 deploy jobs per user per 10 minutes
      const rl = deployRateLimit(ctx.session.user.id! ?? "anonymous");
      if (!rl.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Deploy rate limit exceeded. Try again in ${Math.ceil((rl.resetAt - Date.now()) / 1000)}s.`,
        });
      }

      const irHash = createHash("sha256")
        .update(JSON.stringify(project.irData))
        .digest("hex")
        .slice(0, 16);

      const binaryHash = input.programBinary
        ? createHash("sha256")
            .update(input.programBinary)
            .digest("hex")
            .slice(0, 16)
        : "pending";

      // Per spec: deployment flow requires wallet signing — backend creates the
      // DB record as PENDING and returns the deployment ID for client polling.
      // Real on-chain submission happens in a follow-up mutation (submitDeployTx).
      const deployment = await ctx.prisma.deployment.create({
        data: {
          projectId: input.projectId,
          userId: ctx.session.user.id!,
          network: input.network,
          programId: "11111111111111111111111111111111", // placeholder until confirmed
          txSignature: "pending",
          irHash,
          binaryHash,
          status: "PENDING",
          ...(input.programKeypair && { programKeypair: input.programKeypair }),
        },
      });

      // Broadcast deploy-status update via WebSocket
      try {
        const { broadcastToJob } = await import("@/lib/ws-broadcaster");
        broadcastToJob(deployment.id, {
          type: "deploy-status",
          jobId: deployment.id,
          data: { phase: "preparing" },
        });
      } catch {
        // Non-fatal if WS not connected
      }

      return { deploymentId: deployment.id };
    }),

  // ── Submit signed deploy transaction ─────────────────────────────────────
  // Called client-side after wallet signs the transaction.
  submitTx: protectedProcedure
    .input(
      z.object({
        deploymentId: z.string(),
        signedTx: z.string(), // base64 serialised signed transaction
        programId: z.string(),
        network: z.enum(["DEVNET", "MAINNET", "LOCALNET"]).default("DEVNET"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const deployment = await ctx.prisma.deployment.findFirst({
        where: { id: input.deploymentId, userId: ctx.session.user.id! },
      });
      if (!deployment) throw new TRPCError({ code: "NOT_FOUND" });

      // TODO: submit signedTx via @solana/web3.js Connection.sendRawTransaction
      // For now, accept the programId and mark as CONFIRMED.
      const explorerUrl = buildExplorerUrl(input.network, input.programId);

      await ctx.prisma.deployment.update({
        where: { id: input.deploymentId },
        data: {
          status: "CONFIRMED",
          programId: input.programId,
          txSignature: input.signedTx.slice(0, 88), // placeholder until real submit
          explorerUrl: explorerUrl ?? undefined,
        },
      });

      // Broadcast completion
      try {
        const { broadcastToJob } = await import("@/lib/ws-broadcaster");
        broadcastToJob(input.deploymentId, {
          type: "deploy-status",
          jobId: input.deploymentId,
          data: {
            phase: "complete",
            programId: input.programId,
            explorerUrl: explorerUrl ?? undefined,
          },
        });
      } catch {
        // Non-fatal
      }

      return { programId: input.programId, explorerUrl };
    }),

  // ── Get deployment status ────────────────────────────────────────────────
  status: protectedProcedure
    .input(z.object({ deploymentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const deployment = await ctx.prisma.deployment.findFirst({
        where: {
          id: input.deploymentId,
          userId: ctx.session.user.id!,
        },
      });
      if (!deployment) throw new TRPCError({ code: "NOT_FOUND" });
      return deployment;
    }),

  // ── List deployment history for a project ───────────────────────────────
  history: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.session.user.id! },
        select: { id: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.deployment.findMany({
        where: { projectId: input.projectId },
        orderBy: { deployedAt: "desc" },
        take: 20,
      });
    }),
});
