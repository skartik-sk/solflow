// apps/web/src/server/trpc/routers/marketplace.ts
// Marketplace router — browse, publish, fork, and review program templates.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { sanitizeFlowForMarketplace } from "@/lib/marketplace/sanitize";
import {
  applyCertificationTag,
  evaluateMarketplaceCertification,
  hasDeployInstructionsText,
} from "@/lib/marketplace/certification";
import type { ProgramIR } from "@solflow/ir";
import { runInstantAudit } from "@solflow/audit";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  assertCanAccessTemplate,
  canAccessTemplate,
  redactLockedTemplate,
} from "@/lib/marketplace/access";
import {
  checkPaymentTransaction,
  getPaymentConfig,
  requiredLamports,
} from "@/lib/marketplace/payment";
import { buildProjectFromTemplate } from "@/lib/marketplace/template-project";

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
      // Paid templates: the flow/IR is the product, so only the author and
      // buyers get it. Everyone else sees the listing without its contents.
      const canAccess = await canAccessTemplate(
        ctx.prisma,
        listing,
        ctx.session?.user?.id,
      );
      return redactLockedTemplate(listing, canAccess);
    }),

  // ── paymentConfig: what the client needs to build a payment tx ──
  // Treasury + cluster come from the server env so client and server can't drift.
  paymentConfig: publicProcedure.query(() => {
    const config = getPaymentConfig();
    return {
      enabled: config.treasury !== null,
      treasury: config.treasury,
      cluster: config.cluster,
    };
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
      const certificationWithListingChecks = evaluateMarketplaceCertification({
        compileStatus: certification.compileStatus,
        testStatus: certification.testStatus,
        auditScore: certification.auditScore,
        auditSummary: certification.auditSummary,
        hasDeployInstructions: hasDeployInstructionsText(input.longDescription),
        hasCodePackage: true,
      });
      const listingTags = applyCertificationTag(
        normalizedTags,
        certificationWithListingChecks.certified,
      );
      const { status, reviewNote } = decideListingStatus(
        certificationWithListingChecks.checks,
      );
      const publishedAt = status === "PUBLISHED" ? new Date() : null;

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
            status,
            reviewNote,
            publishedAt,
          },
          select: { id: true },
        });
        return {
          id: updated.id,
          status,
          reviewNote,
          certification: certificationWithListingChecks,
        };
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
          status,
          reviewNote,
          publishedAt,
        },
        select: { id: true },
      });
      return {
        id: listing.id,
        status,
        reviewNote,
        certification: certificationWithListingChecks,
      };
    }),

  // ── approve: admin publishes or rejects a listing held for review ─
  approve: protectedProcedure
    .input(
      z.object({
        listingId: z.string(),
        decision: z.enum(["PUBLISHED", "REJECTED"]),
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isAdminEmail(ctx.session.user.email)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const listing = await ctx.prisma.marketplaceListing.findUnique({
        where: { id: input.listingId },
        select: { id: true },
      });
      if (!listing) throw new TRPCError({ code: "NOT_FOUND" });
      const updated = await ctx.prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: {
          status: input.decision,
          reviewNote: input.decision === "PUBLISHED" ? null : (input.note ?? null),
          ...(input.decision === "PUBLISHED" && { publishedAt: new Date() }),
        },
        select: { id: true, status: true },
      });
      return updated;
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
          authorId: true,
          pricingModel: true,
          templateFlowData: true,
          templateIR: true,
          project: { select: { framework: true } },
        },
      });
      if (!listing) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanAccessTemplate(ctx.prisma, listing, ctx.session.user.id);

      // New project: source framework + its own program keypair.
      const data = buildProjectFromTemplate(listing, listing.project?.framework);
      const newProject = await ctx.prisma.project.create({
        data: {
          name: `${listing.title} (fork)`.slice(0, 200),
          userId: ctx.session.user.id!,
          framework: data.framework,
          flowData: data.flowData as object,
          irData: data.irData as object | undefined,
          programKeypair: data.programKeypair,
          forkedFrom: listing.id,
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
        txSignature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/, "Invalid transaction signature"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const buyerId = ctx.session.user.id!;

      // 1. Listing + expected price
      const listing = await ctx.prisma.marketplaceListing.findFirst({
        where: { id: input.listingId, status: "PUBLISHED" },
        select: { id: true, pricingModel: true, priceSOL: true },
      });
      if (!listing) throw new TRPCError({ code: "NOT_FOUND" });

      if (listing.pricingModel === "FREE") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This template is free — no payment needed",
        });
      }
      const minLamports = requiredLamports(listing);
      if (minLamports == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This listing has no valid price and can't be bought right now.",
        });
      }

      // 2. Fail closed when payments aren't configured
      const config = getPaymentConfig();
      if (!config.treasury) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Payments are not configured on this instance.",
        });
      }

      // 3. Already bought: nothing to verify, don't touch the stored signature
      const existing = await ctx.prisma.marketplacePurchase.findUnique({
        where: { listingId_buyerId: { listingId: listing.id, buyerId } },
        select: { id: true },
      });
      if (existing) return { success: true };

      // 4. The payment must come from the buyer's linked wallet
      const buyer = await ctx.prisma.user.findUnique({
        where: { id: buyerId },
        select: { walletAddress: true },
      });
      if (!buyer?.walletAddress) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Link your Solana wallet to your account (Settings) before buying, then pay from that wallet.",
        });
      }

      // 5. One payment, one purchase
      const reused = await ctx.prisma.marketplacePurchase.findUnique({
        where: { txSignature: input.txSignature },
        select: { id: true },
      });
      if (reused) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This transaction has already been used for a purchase",
        });
      }

      // 6. Verify on-chain
      let check: ReturnType<typeof checkPaymentTransaction>;
      try {
        const connection = new Connection(config.rpcUrl, "confirmed");
        const tx = await connection.getParsedTransaction(input.txSignature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });
        check = checkPaymentTransaction(tx, {
          buyerWallet: buyer.walletAddress,
          treasury: config.treasury,
          minLamports,
        });
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to verify transaction on-chain",
        });
      }
      if (!check.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: check.reason });
      }

      // 7. Record purchase (txSignature is @unique: a concurrent replay loses here)
      try {
        await ctx.prisma.marketplacePurchase.create({
          data: {
            listingId: listing.id,
            buyerId,
            txSignature: input.txSignature,
            amount: check.lamports / LAMPORTS_PER_SOL,
            currency: "SOL",
          },
        });
      } catch (err) {
        if ((err as { code?: string })?.code === "P2002") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This transaction has already been used for a purchase",
          });
        }
        throw err;
      }

      // 8. Increment download counter
      await ctx.prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: { downloads: { increment: 1 } },
      });

      return { success: true };
    }),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** ADMIN_EMAILS: comma-separated allowlist for marketplace moderation. */
export function isAdminEmail(
  email: string | null | undefined,
  raw: string | undefined = process.env.ADMIN_EMAILS,
): boolean {
  if (!email || !raw) return false;
  const admins = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}

/**
 * Listings go live on their own when the build and audit checks pass.
 * Otherwise they wait in PENDING_REVIEW and the author sees why.
 */
export function decideListingStatus(
  checks: Array<{ id: string; label: string; ok: boolean; value: string }>,
): { status: "PUBLISHED" | "PENDING_REVIEW"; reviewNote: string | null } {
  const gate = checks.filter((c) => c.id === "compile" || c.id === "audit");
  const failing = gate.filter((c) => !c.ok);
  if (gate.length === 2 && failing.length === 0) {
    return { status: "PUBLISHED", reviewNote: null };
  }
  const reasons = failing.length
    ? failing.map((c) => `${c.label}: ${c.value}`)
    : ["certification checks unavailable"];
  return {
    status: "PENDING_REVIEW",
    reviewNote: `Held for review until it passes: ${reasons.join("; ")}. Compile the project and get an audit score of 80+ with no critical or high findings, then publish again (or wait for an admin).`,
  };
}

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
  auditSummary: { critical: number; high: number };
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
    auditSummary: {
      critical: freshAudit.summary.critical,
      high: freshAudit.summary.high,
    },
    compileStatus,
    testStatus,
  };
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
