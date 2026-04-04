// tRPC deploy router — start, status, history
// Uses local solana CLI for deployment (no Docker/Redis needed).
// Per docs/architecture/09-compilation-deployment.md → Deployment Service.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createHash } from "crypto";
import { router, protectedProcedure } from "../trpc";
import { deployRateLimit } from "@/lib/rate-limit";
import { runLocalDeploy } from "@/server/compile-worker/local-compiler";
import { broadcastToJob } from "@/lib/ws-broadcaster";

// ─── Network config ───────────────────────────────────────────────────────────

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
  // ── Start deployment (local CLI) ──────────────────────────────────────────
  start: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        network: z.enum(["DEVNET", "MAINNET", "LOCALNET"]).default("DEVNET"),
        programKeypair: z.string().optional(),
        payerKeypair: z.string().optional(),
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

      // Find the latest successful compilation with a binary
      const compilation = await ctx.prisma.compilation.findFirst({
        where: {
          projectId: input.projectId,
          status: "SUCCESS",
          binaryUrl: { not: null },
        },
        orderBy: { completedAt: "desc" },
      });

      if (!compilation?.binaryUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "No compiled binary found. Run a successful compilation first.",
        });
      }

      const binaryPath = compilation.binaryUrl;
      const binaryHash = createHash("sha256")
        .update(binaryPath)
        .digest("hex")
        .slice(0, 16);

      // Create deployment record as PENDING
      const deployment = await ctx.prisma.deployment.create({
        data: {
          projectId: input.projectId,
          userId: ctx.session.user.id!,
          network: input.network,
          programId: "pending",
          txSignature: "pending",
          irHash,
          binaryHash,
          status: "PENDING",
          ...(input.programKeypair && { programKeypair: input.programKeypair }),
        },
      });

      // Broadcast: deployment started
      try {
        broadcastToJob(deployment.id, {
          type: "deploy-status",
          jobId: deployment.id,
          data: { phase: "preparing" },
        });
      } catch { /* WS not connected */ }

      // ── Run actual deployment via local solana CLI ──────────────────────
      try {
        broadcastToJob(deployment.id, {
          type: "deploy-status",
          jobId: deployment.id,
          data: { phase: "submitting" },
        });

        const deployResult = await runLocalDeploy(
          {
            binaryPath,
            network: input.network.toLowerCase() as "devnet" | "mainnet" | "localnet",
            programKeypairPath: input.programKeypair,
            payerKeypairPath: input.payerKeypair,
          },
          (line, level) => {
            try {
              broadcastToJob(deployment.id, {
                type: "deploy-status",
                jobId: deployment.id,
                data: { phase: "submitting", log: line, level },
              });
            } catch { /* WS not connected */ }
          },
        );

        if (deployResult.success) {
          const explorerUrl = buildExplorerUrl(input.network, deployResult.programId);
          const txExplorerUrl = buildTxExplorerUrl(input.network, deployResult.txSignature);

          await ctx.prisma.deployment.update({
            where: { id: deployment.id },
            data: {
              status: "CONFIRMED",
              programId: deployResult.programId,
              txSignature: deployResult.txSignature,
              explorerUrl: explorerUrl ?? undefined,
            },
          });

          // Broadcast completion
          try {
            broadcastToJob(deployment.id, {
              type: "deploy-status",
              jobId: deployment.id,
              data: {
                phase: "complete",
                programId: deployResult.programId,
                txSignature: deployResult.txSignature,
                explorerUrl: explorerUrl ?? undefined,
                txExplorerUrl: txExplorerUrl ?? undefined,
              },
            });
          } catch { /* WS not connected */ }

          return {
            deploymentId: deployment.id,
            programId: deployResult.programId,
            txSignature: deployResult.txSignature,
            explorerUrl,
            txExplorerUrl,
          };
        } else {
          // Deployment failed
          await ctx.prisma.deployment.update({
            where: { id: deployment.id },
            data: {
              status: "FAILED",
              programId: deployResult.programId || undefined,
              txSignature: deployResult.txSignature || undefined,
            },
          });

          broadcastToJob(deployment.id, {
            type: "deploy-status",
            jobId: deployment.id,
            data: {
              phase: "error",
              error: deployResult.logs.join("\n") || "Deployment failed",
            },
          });

          return {
            deploymentId: deployment.id,
            error: deployResult.logs.join("\n") || "Deployment failed",
          };
        }
      } catch (deployErr) {
        // CLI not available or unexpected error
        await ctx.prisma.deployment.update({
          where: { id: deployment.id },
          data: { status: "FAILED" },
        });

        broadcastToJob(deployment.id, {
          type: "deploy-status",
          jobId: deployment.id,
          data: {
            phase: "error",
            error: deployErr instanceof Error ? deployErr.message : String(deployErr),
          },
        });

        return {
          deploymentId: deployment.id,
          error: deployErr instanceof Error ? deployErr.message : String(deployErr),
        };
      }
    }),

  // ── Submit signed deploy transaction (wallet-signing flow) ────────────────
  // Kept for future use when browser wallet signing is implemented.
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
