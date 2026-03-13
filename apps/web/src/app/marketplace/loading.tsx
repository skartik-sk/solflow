// apps/web/src/app/marketplace/loading.tsx
// Shown by Next.js while MarketplacePage (async server component) is streaming.

import { Layers } from "lucide-react";
import Link from "next/link";

export default function MarketplaceLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Header ────────────────────────────────────────────────── */}
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
            <span className="text-foreground font-medium">Marketplace</span>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        {/* ── Hero skeleton ─────────────────────────────────────── */}
        <div className="mb-10 flex flex-col items-center gap-3">
          <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
          <div className="h-4 w-80 animate-pulse rounded-md bg-muted" />
        </div>

        {/* ── Search + filter skeleton ──────────────────────────── */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="h-9 flex-1 animate-pulse rounded-md bg-muted" />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-6 w-14 animate-pulse rounded-full bg-muted"
              />
            ))}
          </div>
        </div>

        {/* ── Card grid skeleton ─────────────────────────────────── */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <ListingCardSkeleton key={i} />
          ))}
        </div>
      </main>
    </div>
  );
}

function ListingCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* Thumbnail */}
      <div className="h-36 animate-pulse bg-muted" />
      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="space-y-1.5">
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
        </div>
        {/* Tags */}
        <div className="flex gap-1.5">
          <div className="h-4 w-12 animate-pulse rounded-full bg-muted" />
          <div className="h-4 w-10 animate-pulse rounded-full bg-muted" />
        </div>
        {/* Footer */}
        <div className="mt-auto flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            <div className="h-3 w-8 animate-pulse rounded bg-muted" />
            <div className="h-3 w-6 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-3 w-8 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
