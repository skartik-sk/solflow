import React from "react";
import Link from "next/link";
import { prisma } from "@solflow/db";
import {
  Layers,
  Search,
  Star,
  Download,
  GitFork,
  Workflow,
  Menu,
} from "lucide-react";

export const metadata = { title: "Marketplace | SolStudio" };

export const dynamic = "force-dynamic";

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

  let listings: ListingSummary[] = [];
  try {
    listings = (await prisma.marketplaceListing.findMany({
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
  } catch (error) {
    console.warn("Failed to fetch marketplace listings", error);
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-bricolage selection:bg-primary/30 selection:text-primary-foreground">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(120,120,120,0.03)_0%,transparent_50%)]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] mix-blend-overlay" />
      </div>

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <Workflow className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold tracking-tight text-sm text-foreground">
              SolStudio
            </span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Dashboard
            </Link>
            <Link href="/marketplace" className="text-foreground">
              Marketplace
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-6 py-12 md:py-20">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <div className="mb-12 md:mb-16 max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground mb-4">
            Discover Templates
          </h1>
          <p className="text-lg text-muted-foreground">
            Fork community-built Solana programs and customize them visually.
            Skip the boilerplate, build on proven logic.
          </p>
        </div>

        {/* ── Search + filter bar ───────────────────────────────── */}
        <form method="GET" className="mb-12 flex flex-col gap-6">
          {/* Search input */}
          <div className="relative flex-1 max-w-xl group">
            <div className="relative flex items-center bg-card rounded-lg border border-border px-3 py-1 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 transition-colors">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Search protocols, tokens, escrows..."
                className="h-10 w-full bg-transparent pl-3 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          </div>

          {/* Category filter */}
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <Link
                key={cat}
                href={`/marketplace?category=${cat}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
                  category === cat
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card text-foreground/70 hover:bg-accent hover:text-foreground border border-border"
                }`}
              >
                {cat}
              </Link>
            ))}
          </div>
        </form>

        {/* ── Grid ─────────────────────────────────────────────── */}
        {listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center border border-border border-dashed rounded-xl bg-card">
            <div className="p-3 rounded-lg bg-secondary">
              <Layers className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">
                No templates found
              </p>
              <p className="text-xs text-muted-foreground">
                Try adjusting your search or{" "}
                <Link
                  href="/dashboard"
                  className="text-foreground hover:underline transition-colors"
                >
                  publish one
                </Link>
                .
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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

function ListingCard({ listing }: { listing: ListingSummary }) {
  const price =
    listing.pricingModel === "FREE"
      ? "Free"
      : listing.pricingModel === "PAY_WHAT_YOU_WANT"
        ? "PWYW"
        : listing.priceSOL != null
          ? `${listing.priceSOL} SOL`
          : "Paid";

  return (
    <Link
      href={`/marketplace/${listing.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/20 hover:bg-secondary/30"
    >
      {/* Thumbnail */}
      <div className="relative h-40 bg-secondary overflow-hidden border-b border-border">
        {listing.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.thumbnailUrl}
            alt={listing.title}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Layers className="h-8 w-8 text-muted-foreground group-hover:text-foreground/30 transition-colors duration-500" />
          </div>
        )}

        {/* Overlay Badges */}
        <div className="absolute inset-0 p-3 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="rounded-md border border-border bg-background/80 px-2 py-0.5 text-[10px] font-semibold text-foreground backdrop-blur-sm">
              {listing.category}
            </span>
            {listing.featured && (
              <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary backdrop-blur-sm">
                Featured
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-1 text-sm font-bold text-foreground group-hover:text-primary transition-colors">
          {listing.title}
        </h3>

        <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">
          {listing.description}
        </p>

        {/* Tags */}
        {listing.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {listing.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer Stats */}
        <div className="mt-auto flex items-center justify-between pt-3 border-t border-border mt-3">
          <div className="flex items-center gap-3 text-[10px] font-medium text-muted-foreground">
            <span className="flex items-center gap-1 hover:text-foreground transition-colors">
              <GitFork className="h-3 w-3" />
              {listing.forks}
            </span>
            {listing.rating != null && (
              <span className="flex items-center gap-1 text-foreground/80">
                <Star className="h-3 w-3 fill-current" />
                {listing.rating.toFixed(1)}
              </span>
            )}
          </div>

          <div className="flex items-center">
            <span className="text-[10px] font-bold text-foreground">
              {price}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
