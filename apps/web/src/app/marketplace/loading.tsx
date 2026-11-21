// apps/web/src/app/marketplace/loading.tsx
// Shown by Next.js while MarketplacePage (async server component) is streaming.
// Same geometry as MarketplaceIndexView: title, toolbar, 132px thumbs, card body.

import { MarketplaceHeader } from "@/components/marketplace/MarketplaceIndex";

const pulse = "animate-pulse motion-reduce:animate-none bg-white/[0.06]";

export default function MarketplaceLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground" aria-busy="true">
      <MarketplaceHeader />

      <main className="mx-auto max-w-[1200px] px-4 pb-20 pt-8 sm:px-6 sm:pt-10">
        <span className="sr-only">Loading templates</span>
        {/* Title */}
        <div className="mb-5">
          <div className={`h-[33px] w-36 rounded-md ${pulse}`} />
          <div className={`mt-1.5 h-4 w-80 max-w-full rounded ${pulse}`} />
        </div>

        {/* Toolbar */}
        <div className="mb-5 flex flex-col gap-3 border-b border-white/[0.07] pb-4 md:flex-row md:items-center">
          <div className={`h-9 w-full rounded-[10px] md:w-[300px] ${pulse}`} />
          <div className="flex gap-1 overflow-hidden">
            {[28, 46, 36, 42, 36, 54, 48, 50, 44].map((w, i) => (
              <div key={i} className={`h-8 shrink-0 rounded-[9px] ${pulse}`} style={{ width: w + 24 }} />
            ))}
          </div>
        </div>

        {/* Cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
    <div className="flex flex-col overflow-hidden rounded-[16px] border border-white/[0.07] bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="relative h-[132px] border-b border-white/[0.07] bg-background">
        <div className={`absolute left-2.5 top-2.5 h-5 w-14 rounded-md ${pulse}`} />
      </div>
      <div className="flex flex-1 flex-col px-3.5 pb-3 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className={`h-[14px] w-1/2 rounded ${pulse}`} />
          <div className={`h-3 w-8 rounded ${pulse}`} />
        </div>
        <div className="mt-2 space-y-1.5">
          <div className={`h-3 w-full rounded ${pulse}`} />
          <div className={`h-3 w-4/5 rounded ${pulse}`} />
        </div>
        <div className="mt-3 flex gap-3">
          {[32, 36, 34].map((w, i) => (
            <div key={i} className={`h-2.5 rounded ${pulse}`} style={{ width: w }} />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2.5">
          <div className="flex items-center gap-1.5">
            <div className={`h-[18px] w-[18px] rounded-full ${pulse}`} />
            <div className={`h-3 w-20 rounded ${pulse}`} />
          </div>
          <div className={`h-3 w-12 rounded ${pulse}`} />
        </div>
      </div>
    </div>
  );
}
