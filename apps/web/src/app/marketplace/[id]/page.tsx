// apps/web/src/app/marketplace/[id]/page.tsx
// Marketplace template detail — shows listing info, reviews, flow preview, and fork button.

import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@solflow/db";
import { auth } from "@solflow/auth";
import {
  Layers,
  Star,
  GitFork,
  ArrowLeft,
  Tag,
  User,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { ForkButton } from "./fork-button";
import { DownloadButtons } from "./download-buttons";
import { FlowPreview } from "./flow-preview";
import type { Node, Edge } from "@xyflow/react";
import {
  DEFAULT_OG_IMAGE_TYPE,
  DEFAULT_OG_IMAGE_URL,
  SITE_NAME,
  absoluteUrl,
} from "@/lib/social-metadata";
import {
  evaluateMarketplaceCertification,
  hasDeployInstructionsText,
  isCertifiedTag,
} from "@/lib/marketplace/certification";

export const dynamic = "force-dynamic";

// ─── Local types (Prisma stub returns `any`) ─────────────────────────────────

interface ListingDetail {
  id: string;
  title: string;
  description: string;
  longDescription: string | null;
  category: string;
  tags: string[];
  thumbnailUrl: string | null;
  pricingModel: string;
  priceSOL: number | null;
  downloads: number;
  forks: number;
  rating: number | null;
  featured: boolean;
  publishedAt: Date | null;
  templateFlowData: unknown;
  project: {
    framework: string;
    generatedCode: unknown;
    auditReports: Array<{ score: number | null; createdAt: Date }>;
    compilations: Array<{ status: string; duration: number | null; completedAt: Date | null }>;
    testRuns: Array<{ status: string; duration: number | null; completedAt: Date | null }>;
  };
  author: { id: string; name: string | null; image: string | null };
  reviews: Array<{
    id: string;
    rating: number;
    comment: string | null;
    createdAt: Date;
    reviewerId: string;
  }>;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const listing = await prisma.marketplaceListing.findFirst({
    where: { id, status: "PUBLISHED" },
    select: {
      title: true,
      description: true,
      thumbnailUrl: true,
      category: true,
      tags: true,
    },
  });

  if (!listing) {
    return { title: "Not Found | SolStudio Marketplace" };
  }

  const title = `${listing.title} | SolStudio Marketplace`;
  const description = listing.description;
  const url = absoluteUrl(`/marketplace/${id}`);
  const image = listing.thumbnailUrl
    ? absoluteUrl(listing.thumbnailUrl)
    : DEFAULT_OG_IMAGE_URL;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "website",
      url,
      siteName: SITE_NAME,
      images: [
        {
          url: image,
          secureUrl: image,
          width: 1200,
          height: 630,
          alt: title,
          ...(image === DEFAULT_OG_IMAGE_URL && {
            type: DEFAULT_OG_IMAGE_TYPE,
          }),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: image, alt: title }],
    },
    keywords: [
      listing.category,
      ...listing.tags,
      "Solana",
      "smart contract",
      "Anchor",
      "Pinocchio",
    ].join(", "),
  };
}

export default async function MarketplaceDetailPage({ params }: PageProps) {
  const { id } = await params;

  const listing = (await prisma.marketplaceListing.findFirst({
    where: { id, status: "PUBLISHED" },
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
      project: {
        select: {
          framework: true,
          generatedCode: true,
          auditReports: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { score: true, createdAt: true },
          },
          compilations: {
            orderBy: { startedAt: "desc" },
            take: 1,
            select: { status: true, duration: true, completedAt: true },
          },
          testRuns: {
            orderBy: { startedAt: "desc" },
            take: 1,
            select: { status: true, duration: true, completedAt: true },
          },
        },
      },
    },
  })) as ListingDetail | null;
  if (!listing) notFound();

  // Check if current user has already purchased this template
  const session = await auth();
  let alreadyPurchased = false;
  if (session?.user?.id && listing.pricingModel !== "FREE") {
    const purchase = await prisma.marketplacePurchase.findUnique({
      where: {
        listingId_buyerId: {
          listingId: listing.id,
          buyerId: session.user.id,
        },
      },
      select: { id: true },
    });
    alreadyPurchased = !!purchase;
  }

  const price =
    listing.pricingModel === "FREE"
      ? "Free"
      : listing.pricingModel === "PAY_WHAT_YOU_WANT"
        ? "Pay what you want"
        : listing.priceSOL != null
          ? `${listing.priceSOL} SOL`
          : "Paid";

  // ─── Flow preview data ─────────────────────────────────────────────────────
  const fd = listing.templateFlowData as {
    nodes?: Node[];
    edges?: Edge[];
  } | null;
  const previewNodes: Node[] = fd?.nodes ?? [];
  const previewEdges: Edge[] = fd?.edges ?? [];
  const hasFlowPreview = previewNodes.length > 0;
  const latestAudit = listing.project.auditReports[0];
  const latestCompile = listing.project.compilations[0];
  const latestTest = listing.project.testRuns[0];
  const certification = evaluateMarketplaceCertification({
    compileStatus: latestCompile?.status ?? null,
    testStatus: latestTest?.status ?? null,
    auditScore: latestAudit?.score ?? null,
    hasDeployInstructions: hasDeployInstructionsText(listing.longDescription),
    hasCodePackage: Boolean(listing.project.generatedCode || listing.project.framework),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <span className="font-semibold">SolStudio</span>
          </Link>
          <Link
            href="/marketplace"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Marketplace
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
          {/* ── Left column ──────────────────────────────────── */}
          <div className="space-y-8">
            {/* Title section */}
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                  {listing.category}
                </span>
                {listing.featured && (
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    Featured
                  </span>
                )}
                {certification.certified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                    <ShieldCheck className="h-3 w-3" />
                    SolStudio certified
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold tracking-tight">
                {listing.title}
              </h1>
              <p className="mt-2 text-muted-foreground">
                {listing.description}
              </p>

              {/* Tags */}
              {listing.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {listing.tags.filter((tag) => !isCertifiedTag(tag)).map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                    >
                      <Tag className="h-3 w-3" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Long description */}
            {listing.longDescription && (
              <div className="prose prose-sm prose-invert max-w-none">
                <h2 className="text-base font-semibold text-foreground mb-2">
                  About this template
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {listing.longDescription}
                </p>
              </div>
            )}

            {/* Flow preview */}
            {hasFlowPreview && (
              <div>
                <h2 className="mb-3 text-base font-semibold">Flow Preview</h2>
                <div className="h-64 overflow-hidden rounded-xl border border-border bg-card">
                  <FlowPreview nodes={previewNodes} edges={previewEdges} />
                </div>
              </div>
            )}

            <div>
              <h2 className="mb-3 text-base font-semibold">Working Status</h2>
              <div className="grid gap-3 md:grid-cols-3">
                <TemplateStatusCard
                  label="Compile"
                  value={latestCompile?.status ?? "Not run"}
                  ok={latestCompile?.status === "SUCCESS"}
                  detail={formatDuration(latestCompile?.duration)}
                />
                <TemplateStatusCard
                  label="Audit"
                  value={
                    typeof latestAudit?.score === "number"
                      ? `${latestAudit.score}/100`
                      : "Not run"
                  }
                  ok={typeof latestAudit?.score === "number" && latestAudit.score >= 80}
                  detail={latestAudit ? "Latest report" : "Run after fork"}
                />
                <TemplateStatusCard
                  label="Test"
                  value={latestTest?.status ?? "Not run"}
                  ok={latestTest?.status === "PASSED"}
                  detail={formatDuration(latestTest?.duration)}
                />
              </div>
              <div className="mt-3 rounded-lg border border-border bg-card p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold">Certification checklist</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      certification.certified
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-amber-500/10 text-amber-300"
                    }`}
                  >
                    {certification.certified ? "Badge eligible" : "Needs work"}
                  </span>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {certification.checks.map((check) => (
                    <div key={check.id} className="flex items-center justify-between gap-3 rounded-md bg-background/60 px-2 py-1.5">
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {check.ok ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="h-3 w-3 text-amber-400" />
                        )}
                        {check.label}
                      </span>
                      <span className="truncate text-right text-[10px] font-medium text-foreground">
                        {check.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Reviews */}
            <div>
              <h2 className="mb-4 text-base font-semibold">
                Reviews{" "}
                <span className="text-muted-foreground font-normal">
                  ({listing.reviews.length})
                </span>
              </h2>
              {listing.reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No reviews yet. Be the first to review!
                </p>
              ) : (
                <div className="space-y-3">
                  {listing.reviews.map((review) => (
                    <div
                      key={review.id}
                      className="rounded-lg border border-border bg-card p-4"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-3.5 w-3.5 ${
                                i < review.rating
                                  ? "fill-yellow-400 text-yellow-400"
                                  : "text-muted-foreground/30"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(review.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {review.comment && (
                        <p className="text-sm text-foreground/80">
                          {review.comment}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Right column ─────────────────────────────────── */}
          <aside className="space-y-4">
            {/* Action card */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4 text-center">
                <div
                  className={`text-xl font-bold ${
                    listing.pricingModel === "FREE"
                      ? "text-green-400"
                      : "text-primary"
                  }`}
                >
                  {price}
                </div>
              </div>

              {/* Fork button — free: direct fork. Paid: PaymentButton */}
              <ForkButton
                listingId={listing.id}
                pricingModel={listing.pricingModel}
                priceSOL={listing.priceSOL}
                alreadyPurchased={alreadyPurchased}
                isAuthenticated={!!session?.user?.id}
              />

              {/* Stats */}
              <div className="mt-4 grid grid-cols-2 divide-x divide-border text-center">
                <div className="px-2">
                  <div className="flex justify-center">
                    <GitFork className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="mt-1 text-sm font-semibold">
                    {listing.forks}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Forks</div>
                </div>
                <div className="px-2">
                  <div className="flex justify-center">
                    <Star className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="mt-1 text-sm font-semibold">
                    {listing.rating != null ? listing.rating.toFixed(1) : "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Rating
                  </div>
                </div>
              </div>

              {/* Download section */}
              <div className="mt-5 pt-4 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground mb-3">Download source code</p>
                <DownloadButtons listingId={listing.id} />
              </div>
            </div>

            {/* Author */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Author
              </h3>
              <div className="flex items-center gap-3">
                {listing.author.image ? (
                  <img
                    src={listing.author.image}
                    alt={listing.author.name ?? "Author"}
                    className="h-8 w-8 rounded-full"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <span className="text-sm font-medium">
                  {listing.author.name ?? "Anonymous"}
                </span>
              </div>
            </div>

            {/* Metadata */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Details
              </h3>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Framework</span>
                <span>{listing.project.framework}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Category</span>
                <span>{listing.category}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Pricing</span>
                <span>{listing.pricingModel.replace(/_/g, " ")}</span>
              </div>
              {listing.publishedAt && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Published</span>
                  <span>
                    {new Date(listing.publishedAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">
                Deploy path
              </h3>
              Fork the template, compile it in the editor, run Audit and Test,
              then deploy with your selected Solana network and wallet.
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function TemplateStatusCard({
  label,
  value,
  ok,
  detail,
}: {
  label: string;
  value: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-green-400" aria-hidden="true" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-yellow-400" aria-hidden="true" />
        )}
      </div>
      <div className="mt-2 text-sm font-semibold">{value}</div>
      {detail && <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>}
    </div>
  );
}

function formatDuration(duration: number | null | undefined): string {
  if (!duration) return "Run after fork";
  if (duration < 1000) return `${duration}ms`;
  return `${(duration / 1000).toFixed(1)}s`;
}
