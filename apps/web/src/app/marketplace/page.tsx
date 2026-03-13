// apps/web/src/app/marketplace/page.tsx
// Public marketplace — browse published Solana program templates.

import React from "react";
import Link from "next/link";
import { prisma } from "@solflow/db";
import { Layers, Search, Star, Download, GitFork } from "lucide-react";

export const metadata = { title: "Marketplace | SolFlow" };

// Re-run on every request so the listing counts stay fresh
export const dynamic = "force-dynamic";

// ─── Local types (Prisma stub returns `any`) ─────────────────────────────────

type ListingSummary = {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  thumbnailUrl: string | null;
  pricingModel: string;
  priceSOL: number | null;
  downloads: number;
  forks: number;
  rating: number | null;
  featured: boolean;
  author: { id: string; name: string | null; image: string | null };
};

const CATEGORIES = [
  "All",
  "TOKEN",
  "NFT",
  "DEFI",
  "DAO",
  "GAMING",
  "SOCIAL",
  "UTILITY",
  "OTHER",
] as const;

type CategoryFilter = (typeof CATEGORIES)[number];

interface PageProps {
  searchParams: Promise<{ category?: string; q?: string }>;
}

export default async function MarketplacePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const category = (params.category ?? "All") as CategoryFilter;
  const q = params.q ?? "";

  const listings = (await prisma.marketplaceListing.findMany({
    where: {
      status: "PUBLISHED",
      ...(category !== "All" && {
        category: category as Exclude<CategoryFilter, "All">,
      }),
      ...(q && {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
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
      author: { select: { id: true, name: true, image: true } },
    },
    orderBy: [{ featured: "desc" }, { downloads: "desc" }],
    take: 48,
  })) as ListingSummary[];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <span className="font-semibold text-foreground">SolFlow</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link
              href="/dashboard"
              className="hover:text-foreground transition-colors"
            >
              Dashboard
            </Link>
            <Link href="/marketplace" className="text-foreground font-medium">
              Marketplace
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            Template Marketplace
          </h1>
          <p className="mt-2 text-muted-foreground">
            Browse and fork community-built Solana program templates
          </p>
        </div>

        {/* ── Search + filter bar ───────────────────────────────── */}
        <form
          method="GET"
          className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center"
        >
          {/* Search input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Search templates…"
              className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Category filter */}
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <Link
                key={cat}
                href={`/marketplace?category=${cat}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={`rounded-full border px-3 py-0.5 text-xs transition-colors ${
                  category === cat
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {cat}
              </Link>
            ))}
          </div>
        </form>

        {/* ── Grid ─────────────────────────────────────────────── */}
        {listings.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-24 text-center text-muted-foreground">
            <Layers className="h-12 w-12 opacity-20" />
            <p className="text-lg font-medium">No templates found</p>
            <p className="text-sm">
              Be the first to publish a template from your{" "}
              <Link
                href="/dashboard"
                className="text-primary underline-offset-2 hover:underline"
              >
                dashboard
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Listing Card ─────────────────────────────────────────────────────────────

type ListingCardProps = {
  listing: ListingSummary;
};

function ListingCard({ listing }: ListingCardProps) {
  const price =
    listing.pricingModel === "FREE"
      ? "Free"
      : listing.pricingModel === "PAY_WHAT_YOU_WANT"
        ? "Pay what you want"
        : listing.priceSOL != null
          ? `${listing.priceSOL} SOL`
          : "Paid";

  return (
    <Link
      href={`/marketplace/${listing.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md hover:shadow-black/20"
    >
      {/* Thumbnail */}
      <div className="relative h-36 bg-gradient-to-br from-primary/10 to-primary/5">
        {listing.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.thumbnailUrl}
            alt={listing.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Layers className="h-10 w-10 text-primary/30" />
          </div>
        )}
        {listing.featured && (
          <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
            Featured
          </span>
        )}
        <span className="absolute left-2 top-2 rounded-full border border-border bg-card/80 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm">
          {listing.category}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-1 text-sm font-semibold leading-tight text-foreground group-hover:text-primary transition-colors">
          {listing.title}
        </h3>
        <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">
          {listing.description}
        </p>

        {/* Tags */}
        {listing.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {listing.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Download className="h-3 w-3" />
              {listing.downloads}
            </span>
            <span className="flex items-center gap-1">
              <GitFork className="h-3 w-3" />
              {listing.forks}
            </span>
            {listing.rating != null && (
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                {listing.rating.toFixed(1)}
              </span>
            )}
          </div>
          <span
            className={`text-[10px] font-semibold ${
              listing.pricingModel === "FREE"
                ? "text-green-400"
                : "text-primary"
            }`}
          >
            {price}
          </span>
        </div>
      </div>
    </Link>
  );
}
