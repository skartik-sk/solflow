// apps/web/src/app/marketplace/[id]/page.tsx
// Marketplace template detail — shows listing info, reviews, flow preview, and fork button.

import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@solflow/db";
import { auth } from "@solflow/auth";
import {
  Layers,
  Star,
  Download,
  GitFork,
  ArrowLeft,
  Tag,
  User,
} from "lucide-react";
import { ForkButton } from "./fork-button";
import { FlowPreview } from "./flow-preview";
import type { Node, Edge } from "@xyflow/react";

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

export async function generateMetadata({ params }: PageProps) {
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
    return { title: "Not Found | SolFlow Marketplace" };
  }

  const title = `${listing.title} | SolFlow Marketplace`;
  const description = listing.description;
  const image = listing.thumbnailUrl ?? null;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      ...(image && { images: [{ url: image, width: 1200, height: 630 }] }),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image && { images: [image] }),
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <span className="font-semibold">SolFlow</span>
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
                  {listing.tags.map((tag) => (
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
              />

              {/* Stats */}
              <div className="mt-4 grid grid-cols-3 divide-x divide-border text-center">
                <div className="px-2">
                  <div className="flex justify-center">
                    <Download className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="mt-1 text-sm font-semibold">
                    {listing.downloads}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Downloads
                  </div>
                </div>
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
            </div>

            {/* Author */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Author
              </h3>
              <div className="flex items-center gap-3">
                {listing.author.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
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
          </aside>
        </div>
      </main>
    </div>
  );
}
