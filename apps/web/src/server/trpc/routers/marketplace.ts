// apps/web/src/server/trpc/routers/marketplace.ts
// Marketplace router — browse, publish, fork, and review program templates.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { sanitizeFlowForMarketplace } from "@/lib/marketplace/sanitize";
import type { ProgramIR } from "@solflow/ir";
import { runInstantAudit } from "@solflow/audit";
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
        description: z.string().min(20).max(1000),
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
        select: {
          id: true,
          flowData: true,
          irData: true,
          compilations: {
            orderBy: { startedAt: "desc" },
            take: 1,
            select: { status: true },
          },
          testRuns: {
            orderBy: { startedAt: "desc" },
            take: 1,
            select: { status: true },
          },
          auditReports: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { score: true },
          },
        },
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
      const existing = await ctx.prisma.marketplaceListing.findUnique({
        where: { projectId: input.projectId },
        select: { id: true },
      });
      const recentListingCount = existing
        ? 0
        : await ctx.prisma.marketplaceListing.count({
            where: {
              authorId: ctx.session.user.id!,
              createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
            },
          });
      const normalizedTags = normalizeMarketplaceTags(input.tags);
      const prepublish = runMarketplacePrepublishChecks({
        title: input.title,
        description: input.description,
        longDescription: input.longDescription,
        pricingModel: input.pricingModel,
        priceSOL: input.priceSOL,
        tags: normalizedTags,
        sanitizedFlow,
        sanitizedIR,
        recentListingCount,
      });
      if (prepublish.issues.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Pre-publish checks failed: ${prepublish.issues.join("; ")}`,
        });
      }

      const certification = evaluateTemplateCertification(project, sanitizedIR);
      const listingTags = applyCertificationTag(
        normalizedTags,
        certification.certified,
      );

      // Upsert listing (allows re-publishing an existing listing)
      if (existing) {
        const updated = await ctx.prisma.marketplaceListing.update({
          where: { id: existing.id },
          data: {
            title: input.title,
            description: input.description,
            longDescription: input.longDescription,
            category: input.category,
            tags: listingTags,
            pricingModel: input.pricingModel,
            priceSOL: input.priceSOL,
            templateFlowData: sanitizedFlow as object,
            templateIR: sanitizedIR as object,
            status: "PENDING_REVIEW",
          },
          select: { id: true },
        });
        return { id: updated.id, certification };
      }

      const listing = await ctx.prisma.marketplaceListing.create({
        data: {
          projectId: input.projectId,
          authorId: ctx.session.user.id!,
          title: input.title,
          description: input.description,
          longDescription: input.longDescription,
          category: input.category,
          tags: listingTags,
          pricingModel: input.pricingModel,
          priceSOL: input.priceSOL,
          templateFlowData: sanitizedFlow as object,
          templateIR: sanitizedIR as object,
          status: "PENDING_REVIEW",
        },
        select: { id: true },
      });
      return { id: listing.id, certification };
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

interface MarketplacePrepublishInput {
  title: string;
  description: string;
  longDescription?: string;
  pricingModel: "FREE" | "PAID" | "PAY_WHAT_YOU_WANT";
  priceSOL?: number;
  tags: string[];
  sanitizedFlow: unknown;
  sanitizedIR: ProgramIR;
  recentListingCount: number;
}

function normalizeMarketplaceTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .filter((tag) => tag !== "solstudio-certified"),
    ),
  ).slice(0, 10);
}

function runMarketplacePrepublishChecks(input: MarketplacePrepublishInput): {
  issues: string[];
} {
  const issues: string[] = [];
  if (input.title.trim().length < 4) {
    issues.push("title is too short");
  }
  if (input.description.trim().length < 20) {
    issues.push("description is too short");
  }
  if (input.pricingModel === "PAID" && !input.priceSOL) {
    issues.push("paid templates need a SOL price");
  }
  if (input.recentListingCount >= 3) {
    issues.push("too many templates submitted in the last 10 minutes");
  }
  const secretHit = findSecretLikeValue({
    title: input.title,
    description: input.description,
    longDescription: input.longDescription,
    flow: input.sanitizedFlow,
    ir: input.sanitizedIR,
  });
  if (secretHit) {
    issues.push(`possible secret found (${secretHit})`);
  }
  return { issues };
}

function evaluateTemplateCertification(
  project: {
    compilations: Array<{ status: string }>;
    testRuns: Array<{ status: string }>;
    auditReports: Array<{ score: number | null }>;
  },
  sanitizedIR: ProgramIR,
): {
  certified: boolean;
  auditScore: number;
  compileStatus: string;
  testStatus: string;
} {
  const freshAudit = runInstantAudit(sanitizedIR);
  const auditScore = project.auditReports[0]?.score ?? freshAudit.score;
  const compileStatus = project.compilations[0]?.status ?? "MISSING";
  const testStatus = project.testRuns[0]?.status ?? "MISSING";
  return {
    certified:
      compileStatus === "SUCCESS" &&
      testStatus === "PASSED" &&
      auditScore >= 80 &&
      freshAudit.summary.critical === 0 &&
      freshAudit.summary.high === 0,
    auditScore,
    compileStatus,
    testStatus,
  };
}

function applyCertificationTag(tags: string[], certified: boolean): string[] {
  const base = tags.filter((tag) => tag !== "solstudio-certified");
  if (!certified) return base;
  return [...base.slice(0, 9), "solstudio-certified"];
}

function findSecretLikeValue(value: unknown): string | null {
  const text = JSON.stringify(value) ?? "";
  const patterns: Array<[string, RegExp]> = [
    ["private key", /\b(private[_-]?key|secret[_-]?key|mnemonic|seed phrase)\b\s*[:=]/i],
    ["solana keypair", /\[[\s\d,]{80,}\]/],
    ["api token", /\b(sk|pk|api)[_-]?(live|test)?[_-]?[a-z0-9]{24,}\b/i],
    ["jwt", /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/],
  ];
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}
