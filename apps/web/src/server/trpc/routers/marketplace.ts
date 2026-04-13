// apps/web/src/server/trpc/routers/marketplace.ts
// Marketplace router — browse, publish, fork, and review program templates.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { sanitizeFlowForMarketplace } from "@/lib/marketplace/sanitize";
import type { ProgramIR } from "@solflow/ir";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const CATEGORY_ENUM = z.enum([
  "TOKEN",
  "NFT",
  "DEFI",
  "DAO",
  "GAMING",
  "SOCIAL",
  "UTILITY",
  "OTHER",
]);

export const marketplaceRouter = router({
  // ── list: browse published templates with optional filters ──────
  list: publicProcedure
    .input(
      z.object({
        category: CATEGORY_ENUM.optional(),
        framework: z.enum(["ANCHOR", "PINOCCHIO", "QUASAR"]).optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const listings = await ctx.prisma.marketplaceListing.findMany({
        where: {
          status: "PUBLISHED",
          ...(input.category && { category: input.category }),
          ...(input.search && {
            OR: [
              { title: { contains: input.search, mode: "insensitive" } },
              { description: { contains: input.search, mode: "insensitive" } },
            ],
          }),
        },
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          tags: true,
          thumbnailUrl: true,
          pricingModel: true,
          priceSOL: true,
          downloads: true,
          forks: true,
          rating: true,
          featured: true,
          publishedAt: true,
          author: { select: { id: true, name: true, image: true } },
        },
        orderBy: [{ featured: "desc" }, { downloads: "desc" }],
        take: input.limit + 1,
        ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
      });

      let nextCursor: string | undefined;
      if (listings.length > input.limit) {
        nextCursor = listings.pop()?.id;
      }

      return { listings, nextCursor };
    }),

  // ── get: single listing detail ──────────────────────────────────
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const listing = await ctx.prisma.marketplaceListing.findFirst({
        where: { id: input.id, status: "PUBLISHED" },
        include: {
          author: { select: { id: true, name: true, image: true } },
          reviews: {
            select: {
              id: true,
              rating: true,
              comment: true,
              createdAt: true,
              reviewerId: true,
            },
            orderBy: { createdAt: "desc" },
            take: 20,
          },
        },
      });
      if (!listing) throw new TRPCError({ code: "NOT_FOUND" });
      return listing;
    }),

  // ── publish: submit a project as a marketplace template ─────────
  publish: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        title: z.string().min(1).max(100),
        description: z.string().max(1000),
        longDescription: z.string().max(5000).optional(),
        category: CATEGORY_ENUM,
        tags: z.array(z.string().max(30)).max(10).default([]),
        pricingModel: z
          .enum(["FREE", "PAID", "PAY_WHAT_YOU_WANT"])
          .default("FREE"),
        priceSOL: z.number().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch the project to get flow data + IR
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.session.user.id! },
        select: { id: true, flowData: true, irData: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      if (!project.flowData || !project.irData) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Project must have flow data and IR. Save the flow first.",
        });
      }

      // Sanitize — strip programId + personal pubkeys before publishing
      const { sanitizedFlow, sanitizedIR } = sanitizeFlowForMarketplace(
        project.flowData as any,
        project.irData as ProgramIR,
      );

      // Upsert listing (allows re-publishing an existing listing)
      const existing = await ctx.prisma.marketplaceListing.findUnique({
        where: { projectId: input.projectId },
        select: { id: true },
      });

      if (existing) {
        const updated = await ctx.prisma.marketplaceListing.update({
          where: { id: existing.id },
          data: {
            title: input.title,
            description: input.description,
            longDescription: input.longDescription,
            category: input.category,
            tags: input.tags,
            pricingModel: input.pricingModel,
            priceSOL: input.priceSOL,
            templateFlowData: sanitizedFlow as object,
            templateIR: sanitizedIR as object,
            status: "PENDING_REVIEW",
          },
          select: { id: true },
        });
        return { id: updated.id };
      }

      const listing = await ctx.prisma.marketplaceListing.create({
        data: {
          projectId: input.projectId,
          authorId: ctx.session.user.id!,
          title: input.title,
          description: input.description,
          longDescription: input.longDescription,
          category: input.category,
          tags: input.tags,
          pricingModel: input.pricingModel,
          priceSOL: input.priceSOL,
          templateFlowData: sanitizedFlow as object,
          templateIR: sanitizedIR as object,
          status: "PENDING_REVIEW",
        },
        select: { id: true },
      });
      return { id: listing.id };
    }),

  // ── fork: create a new project from a template ──────────────────
  fork: protectedProcedure
    .input(z.object({ listingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const listing = await ctx.prisma.marketplaceListing.findFirst({
        where: { id: input.listingId, status: "PUBLISHED" },
        select: {
          id: true,
          title: true,
          templateFlowData: true,
          templateIR: true,
        },
      });
      if (!listing) throw new TRPCError({ code: "NOT_FOUND" });

      // Create a new project for the current user with the template data
      const newProject = await ctx.prisma.project.create({
        data: {
          name: `${listing.title} (fork)`,
          userId: ctx.session.user.id!,
          framework: "ANCHOR",
          flowData: listing.templateFlowData ?? {},
          irData: listing.templateIR ?? undefined,
        },
        select: { id: true },
      });

      // Increment fork counter
      await ctx.prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: { forks: { increment: 1 } },
      });

      return { projectId: newProject.id };
    }),

  // ── review: leave a rating + comment ────────────────────────────
  review: protectedProcedure
    .input(
      z.object({
        listingId: z.string(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const listing = await ctx.prisma.marketplaceListing.findFirst({
        where: { id: input.listingId, status: "PUBLISHED" },
        select: { id: true },
      });
      if (!listing) throw new TRPCError({ code: "NOT_FOUND" });

      // Upsert review (one per user per listing)
      await ctx.prisma.marketplaceReview.upsert({
        where: {
          listingId_reviewerId: {
            listingId: input.listingId,
            reviewerId: ctx.session.user.id!,
          },
        },
        create: {
          listingId: input.listingId,
          reviewerId: ctx.session.user.id!,
          rating: input.rating,
          comment: input.comment,
        },
        update: {
          rating: input.rating,
          comment: input.comment,
        },
      });

      // Recompute average rating
      const agg = await ctx.prisma.marketplaceReview.aggregate({
        where: { listingId: input.listingId },
        _avg: { rating: true },
      });
      await ctx.prisma.marketplaceListing.update({
        where: { id: input.listingId },
        data: { rating: agg._avg.rating ?? undefined },
      });

      return { success: true };
    }),

  // ── checkPurchase: has the current user purchased this listing? ───
  checkPurchase: protectedProcedure
    .input(z.object({ listingId: z.string() }))
    .query(async ({ ctx, input }) => {
      const purchase = await ctx.prisma.marketplacePurchase.findUnique({
        where: {
          listingId_buyerId: {
            listingId: input.listingId,
            buyerId: ctx.session.user.id!,
          },
        },
        select: { id: true },
      });
      return { purchased: !!purchase };
    }),

  // ── verifyPayment: confirm SOL tx on-chain, then create purchase ──
  verifyPayment: protectedProcedure
    .input(
      z.object({
        listingId: z.string(),
        txSignature: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Fetch listing to get expected price
      const listing = await ctx.prisma.marketplaceListing.findFirst({
        where: { id: input.listingId, status: "PUBLISHED" },
        select: {
          id: true,
          pricingModel: true,
          priceSOL: true,
          title: true,
          templateFlowData: true,
          templateIR: true,
        },
      });
      if (!listing) throw new TRPCError({ code: "NOT_FOUND" });

      if (listing.pricingModel === "FREE") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This template is free — no payment needed",
        });
      }

      const expectedLamports =
        listing.priceSOL != null
          ? Math.round(listing.priceSOL * LAMPORTS_PER_SOL)
          : null;

      // 2. Verify the transaction on-chain
      try {
        // Check replay: has this txSignature already been used for a different listing?
        const existingPurchase = await ctx.prisma.marketplacePurchase.findFirst({
          where: { txSignature: input.txSignature },
          select: { listingId: true },
        });
        if (existingPurchase && existingPurchase.listingId !== input.listingId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This transaction has already been used for another purchase",
          });
        }

        const connection = new Connection(SOLANA_RPC, "confirmed");
        const tx = await connection.getTransaction(input.txSignature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });

        if (!tx) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Transaction not found or not confirmed",
          });
        }

        // Verify the transaction is not an error
        if (tx.meta?.err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Transaction failed on-chain",
          });
        }

        // Verify the SOL amount transferred to treasury
        if (TREASURY_WALLET && expectedLamports != null && tx.meta) {
          const treasuryIndex = tx.transaction.message
            .getAccountKeys()
            .staticAccountKeys.findIndex(
              (k) => k.toString() === new PublicKey(TREASURY_WALLET).toString(),
            );

          if (treasuryIndex === -1) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Treasury wallet not found in transaction",
            });
          }

          const preBalance = tx.meta.preBalances[treasuryIndex] ?? 0;
          const postBalance = tx.meta.postBalances[treasuryIndex] ?? 0;
          const received = postBalance - preBalance;

          if (received < expectedLamports) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Insufficient payment: expected ${listing.priceSOL} SOL`,
            });
          }
        }
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to verify transaction on-chain",
        });
      }

      // 3. Record purchase (idempotent)
      await ctx.prisma.marketplacePurchase.upsert({
        where: {
          listingId_buyerId: {
            listingId: input.listingId,
            buyerId: ctx.session.user.id!,
          },
        },
        create: {
          listingId: input.listingId,
          buyerId: ctx.session.user.id!,
          txSignature: input.txSignature,
          amount: listing.priceSOL,
          currency: "SOL",
        },
        update: {
          txSignature: input.txSignature,
        },
      });

      // 4. Increment download counter
      await ctx.prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: { downloads: { increment: 1 } },
      });

      return { success: true };
    }),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Solana RPC endpoint used for payment verification */
const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

/** Treasury wallet that receives SOL payments */
const TREASURY_WALLET = process.env.SOLFLOW_TREASURY_WALLET || undefined;
