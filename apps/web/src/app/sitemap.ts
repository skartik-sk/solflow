// apps/web/src/app/sitemap.ts
// Generates a dynamic XML sitemap for Next.js 15 (App Router).
// Includes static pages + all published marketplace listings.

import type { MetadataRoute } from "next";
import { prisma } from "@solflow/db";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://solstudio.skartik.xyz";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // ── Static pages ─────────────────────────────────────────────────────────
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/marketplace`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/auth/signin`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  // ── Dynamic marketplace listings ────────────────────────────────────────
  let listingPages: MetadataRoute.Sitemap = [];
  try {
    const listings = await prisma.marketplaceListing.findMany({
      where: { status: "PUBLISHED" },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    });

    listingPages = listings.map((listing: { id: string; updatedAt: Date }) => ({
      url: `${BASE_URL}/marketplace/${listing.id}`,
      lastModified: listing.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch {
    // DB not available at build time (Prisma stub / ungenerated client) — skip listings
  }

  return [...staticPages, ...listingPages];
}
