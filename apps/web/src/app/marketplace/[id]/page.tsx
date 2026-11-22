// apps/web/src/app/marketplace/[id]/page.tsx
// Marketplace template detail: fetches the listing and purchase state; ListingDetailView renders it.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@solflow/db";
import { auth } from "@solflow/auth";
import { canAccessTemplate, redactLockedTemplate } from "@/lib/marketplace/access";
import {
  ListingDetailView,
  type ListingDetail,
} from "@/components/marketplace/ListingDetail";
import {
  DEFAULT_OG_IMAGE_TYPE,
  DEFAULT_OG_IMAGE_URL,
  SITE_NAME,
  absoluteUrl,
} from "@/lib/social-metadata";
export const dynamic = "force-dynamic";

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

  // Paid templates: only the author and buyers get the flow (FlowPreview is a
  // client component, so anything passed here reaches the browser).
  const session = await auth();
  const canAccess = await canAccessTemplate(
    prisma,
    { id: listing.id, authorId: listing.author.id, pricingModel: listing.pricingModel },
    session?.user?.id,
  );
  const { locked: _locked, ...visibleListing } = redactLockedTemplate(listing, canAccess);

  return (
    <ListingDetailView
      listing={visibleListing}
      alreadyPurchased={listing.pricingModel !== "FREE" && canAccess}
      isAuthenticated={!!session?.user?.id}
    />
  );
}
