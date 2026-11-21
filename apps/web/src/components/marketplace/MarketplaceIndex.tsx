// Presentational view for /marketplace. The page fetches; this renders.

import React from "react";
import Link from "next/link";
import { Search, Star, GitFork, ShieldCheck, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  evaluateMarketplaceCertification,
  hasDeployInstructionsText,
  isCertifiedTag,
} from "@/lib/marketplace/certification";
import {
  AuthorAvatar,
  Chip,
  FrameworkBadge,
  GraphThumb,
  GraphThumbStyles,
  MarketHeader,
  btnGhost,
  btnOutline,
  btnPrimary,
  focusRing,
} from "./parts";

export type ListingSummary = {
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
  author: { id: string; name: string | null; image: string | null };
  project: {
    framework: string;
    generatedCode: unknown;
    compilations: Array<{ status: string }>;
    auditReports: Array<{ score: number | null }>;
    testRuns: Array<{ status: string }>;
  };
};

export const CATEGORIES = [
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

export type CategoryFilter = (typeof CATEGORIES)[number];

const CATEGORY_LABEL: Record<string, string> = {
  All: "All",
  TOKEN: "Token",
  NFT: "NFT",
  DEFI: "DeFi",
  DAO: "DAO",
  GAMING: "Gaming",
  SOCIAL: "Social",
  UTILITY: "Utility",
  OTHER: "Other",
};

export function categoryLabel(c: string) {
  return CATEGORY_LABEL[c] ?? c;
}

/** Shared page chrome for the marketplace index and its loading state. */
export function MarketplaceHeader() {
  return (
    <MarketHeader crumbs={[{ label: "Marketplace" }]}>
      <Link href="/dashboard" className={btnGhost}>
        Dashboard
      </Link>
      <Link href="/marketplace/my-listings" className={`${btnGhost} hidden sm:inline-flex`}>
        My listings
      </Link>
      <Link href="/marketplace/publish" className={`${btnPrimary} ml-1`} aria-label="Publish a template">
        <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
        <span className="hidden sm:inline">Publish</span>
      </Link>
    </MarketHeader>
  );
}

export function MarketplaceIndexView({
  listings,
  totalCount,
  page,
  pageSize,
  category,
  q,
}: {
  listings: ListingSummary[];
  totalCount: number;
  page: number;
  pageSize: number;
  category: CategoryFilter;
  q: string;
}) {
  const skip = (page - 1) * pageSize;
  const totalPages = Math.ceil(totalCount / pageSize);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;
  const qs = q ? `&q=${encodeURIComponent(q)}` : "";

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/25 selection:text-foreground">
      <GraphThumbStyles />
      <MarketplaceHeader />

      <main className="mx-auto max-w-[1200px] px-4 pb-20 pt-8 sm:px-6 sm:pt-10">
        {/* Title */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.03em]">Templates</h1>
            <p className="mt-1 text-[13.5px] text-muted-foreground">
              Fork a working Solana program, open it as a graph, change what you need.
            </p>
          </div>
          {totalCount > 0 && (
            <p className="font-mono text-[12px] tabular-nums text-muted-foreground">
              {totalCount} {totalCount === 1 ? "template" : "templates"}
            </p>
          )}
        </div>

        {/* Search + filters */}
        <form
          method="GET"
          className="mb-5 flex flex-col gap-3 border-b border-white/[0.07] pb-4 md:flex-row md:items-center"
        >
          {category !== "All" && <input type="hidden" name="category" value={category} />}

          <label className="group relative flex h-9 w-full items-center rounded-[10px] border border-white/[0.08] bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors duration-150 focus-within:border-primary/60 md:w-[300px] md:shrink-0">
            <span className="sr-only">Search templates</span>
            <Search className="ml-3 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Search vaults, escrows, staking…"
              className="h-full w-full bg-transparent pl-2.5 pr-3 text-[16px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none sm:text-[13px]"
            />
          </label>

          <div className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
            {CATEGORIES.map((cat) => {
              const active = category === cat;
              return (
                <Link
                  key={cat}
                  href={`/marketplace?category=${cat}${qs}`}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex h-8 shrink-0 items-center rounded-[9px] px-3 text-[12.5px] font-medium transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97] ${focusRing} ${
                    active
                      ? "bg-white/[0.08] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(255,255,255,0.08)]"
                      : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                  }`}
                >
                  {categoryLabel(cat)}
                </Link>
              );
            })}
          </div>
        </form>

        {q && (
          <p className="mb-4 text-[12.5px] text-muted-foreground">
            Results for <span className="text-foreground">“{q}”</span>
            <Link
              href={category !== "All" ? `/marketplace?category=${category}` : "/marketplace"}
              className={`ml-2 rounded text-primary hover:underline ${focusRing}`}
            >
              Clear
            </Link>
          </p>
        )}

        {/* Grid */}
        {listings.length === 0 ? (
          <EmptyState q={q} category={category} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalCount > 0 && (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
            <p className="font-mono text-[12px] tabular-nums text-muted-foreground">
              {skip + 1}–{Math.min(skip + pageSize, totalCount)} of {totalCount}
            </p>
            <div className="flex items-center gap-1">
              {hasPrevPage ? (
                <Link
                  href={`/marketplace?category=${category}${qs}&page=${page - 1}`}
                  className={`${btnOutline} w-8 px-0`}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              ) : (
                <span className={`${btnOutline} pointer-events-none w-8 px-0 opacity-40`} aria-hidden>
                  <ChevronLeft className="h-4 w-4" />
                </span>
              )}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) pageNum = i + 1;
                else if (page <= 3) pageNum = i + 1;
                else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = page - 2 + i;
                const isActive = pageNum === page;
                return (
                  <Link
                    key={pageNum}
                    href={`/marketplace?category=${category}${qs}&page=${pageNum}`}
                    aria-current={isActive ? "page" : undefined}
                    className={`inline-flex h-8 min-w-8 items-center justify-center rounded-[10px] px-2 font-mono text-[12px] tabular-nums transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97] ${focusRing} ${
                      isActive
                        ? "bg-white/[0.08] text-foreground"
                        : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                    }`}
                  >
                    {pageNum}
                  </Link>
                );
              })}
              {hasNextPage ? (
                <Link
                  href={`/marketplace?category=${category}${qs}&page=${page + 1}`}
                  className={`${btnOutline} w-8 px-0`}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <span className={`${btnOutline} pointer-events-none w-8 px-0 opacity-40`} aria-hidden>
                  <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Listing card ───────────────────────────────────────────────────────────

function ListingCard({ listing }: { listing: ListingSummary }) {
  const price =
    listing.pricingModel === "FREE"
      ? "Free"
      : listing.pricingModel === "PAY_WHAT_YOU_WANT"
        ? "PWYW"
        : listing.priceSOL != null
          ? `${listing.priceSOL} SOL`
          : "Paid";

  const certification = getListingCertification(listing);
  const tags = listing.tags.filter((tag) => !isCertifiedTag(tag)).slice(0, 3);

  return (
    <Link
      href={`/marketplace/${listing.id}`}
      className={`group flex flex-col overflow-hidden rounded-[16px] border border-white/[0.07] bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[transform,border-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-white/[0.13] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_24px_48px_-24px_rgba(0,0,0,0.9)] active:translate-y-0 motion-reduce:transform-none ${focusRing}`}
    >
      {/* Thumbnail */}
      <div className="mk-dots relative h-[132px] overflow-hidden border-b border-white/[0.07]">
        {listing.thumbnailUrl ? (
          <img src={listing.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <GraphThumb seed={listing.id} className="px-2 py-1" />
        )}
        <div className="absolute left-2.5 top-2.5">
          <FrameworkBadge framework={listing.project.framework} />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col px-3.5 pb-3 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="truncate text-[14px] font-medium tracking-[-0.01em] text-foreground">{listing.title}</h3>
          <span
            className={`shrink-0 font-mono text-[12px] tabular-nums ${
              listing.pricingModel === "FREE" ? "text-muted-foreground" : "text-foreground"
            }`}
          >
            {price}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 min-h-[2lh] text-[12.5px] leading-[1.45] text-muted-foreground">
          {listing.description}
        </p>

        <div className="mt-2.5 flex items-center gap-3 text-[11px] text-muted-foreground">
          {certification.checks.slice(0, 3).map((check) => (
            <StatusDot
              key={check.id}
              label={check.label === "Compile" ? "Build" : check.label}
              value={check.value}
              ok={check.ok}
            />
          ))}
          {listing.featured || certification.certified ? (
            <span className="ml-auto flex shrink-0 gap-1">
              {/* One badge fits beside the checks: Certified wins over Featured */}
              {listing.featured && !certification.certified && <Chip tone="brand">Featured</Chip>}
              {certification.certified && (
                <Chip tone="ok">
                  <ShieldCheck className="h-3 w-3" />
                  Certified
                </Chip>
              )}
            </span>
          ) : (
            tags.length > 0 && (
              <span className="ml-auto truncate font-mono text-[10.5px] text-muted-foreground/80">
                {tags.join(" · ")}
              </span>
            )
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-2.5">
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
            <AuthorAvatar name={listing.author.name} image={listing.author.image} />
            <span className="truncate">{listing.author.name ?? "Anonymous"}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2.5 font-mono text-[11px] tabular-nums text-muted-foreground">
            <span className="flex items-center gap-1" title={`${listing.forks} forks`}>
              <GitFork className="h-3 w-3" />
              {listing.forks}
            </span>
            {listing.rating != null && (
              <span className="flex items-center gap-1" title="Rating">
                <Star className="h-3 w-3 fill-current" />
                {listing.rating.toFixed(1)}
              </span>
            )}
          </span>
        </div>
      </div>
    </Link>
  );
}

function getListingCertification(listing: ListingSummary) {
  return evaluateMarketplaceCertification({
    compileStatus: listing.project.compilations[0]?.status ?? null,
    testStatus: listing.project.testRuns[0]?.status ?? null,
    auditScore: listing.project.auditReports[0]?.score ?? null,
    hasDeployInstructions: hasDeployInstructionsText(listing.longDescription),
    hasCodePackage: Boolean(listing.project.generatedCode || listing.project.framework),
  });
}

function StatusDot({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  const failed = /FAILED|ERROR/i.test(value);
  return (
    <span className="inline-flex shrink-0 items-center gap-1" title={`${label}: ${value}`}>
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : failed ? "bg-red-400" : "bg-white/20"}`}
      />
      <span className={ok ? "text-foreground/80" : ""}>{label}</span>
      <span className="sr-only">: {value}</span>
    </span>
  );
}

// ─── Empty state: the grid it would be, wordless, with the next step ───────

function EmptyState({ q, category }: { q: string; category: CategoryFilter }) {
  const filtered = Boolean(q) || category !== "All";
  return (
    <div className="relative overflow-hidden rounded-[20px] border border-white/[0.07] bg-background">
      <div
        aria-hidden
        className="grid grid-cols-2 gap-3 p-3 opacity-60 [mask-image:radial-gradient(ellipse_at_center,transparent_18%,#000_75%)] sm:grid-cols-3 lg:grid-cols-4"
      >
        {["a1", "b7", "c3", "d9", "e2", "f5", "g8", "h4"].map((s, i) => (
          <div
            key={s}
            className={`overflow-hidden rounded-[14px] border border-white/[0.06] bg-card/70 ${i >= 4 ? "hidden sm:block" : ""}`}
          >
            <div className="mk-dots h-[104px] border-b border-white/[0.05]">
              <GraphThumb seed={s} />
            </div>
            <div className="space-y-2 p-3">
              <div className="h-2 w-2/3 rounded bg-white/[0.07]" />
              <div className="h-1.5 w-5/6 rounded bg-white/[0.05]" />
            </div>
          </div>
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="max-w-[320px] rounded-[14px] border border-white/[0.08] bg-popover/95 px-5 py-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_24px_64px_-16px_rgba(0,0,0,0.9)] backdrop-blur">
          <p className="text-[14px] font-medium text-foreground">
            {filtered ? "No templates match" : "No templates yet"}
          </p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {filtered ? "Try another search or category, or publish one yourself." : "Publish one of your projects from the dashboard."}
          </p>
          <div className="mt-3 flex justify-center gap-2">
            {filtered && (
              <Link href="/marketplace" className={btnOutline}>
                Clear filters
              </Link>
            )}
            <Link href="/dashboard" className={btnPrimary}>
              Publish one
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
