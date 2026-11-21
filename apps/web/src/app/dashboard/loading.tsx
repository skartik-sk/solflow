// apps/web/src/app/dashboard/loading.tsx
// Shown by Next.js while DashboardPage (async server component) is streaming.
// Mirrors dashboard-view.tsx's geometry so nothing jumps when it resolves.

import Link from "next/link";
import { SolMark } from "@/components/ui-kit/dashboard-mark";

const pulse = "animate-pulse rounded bg-white/[0.06] motion-reduce:animate-none";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-[14px] font-semibold tracking-[-0.01em]">
            <SolMark size={22} />
            SolStudio
          </Link>
          <div className={`ml-auto h-7 w-7 rounded-full ${pulse}`} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-12 pt-6 sm:px-6" aria-busy="true">
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-1.5">
            <div className={`h-5 w-24 ${pulse}`} />
            <div className={`h-3.5 w-40 ${pulse}`} />
          </div>
          <div className={`h-9 w-32 rounded-[10px] ${pulse}`} />
        </div>

        <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-[14px] border border-white/[0.07] bg-card sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="-mb-px -mr-px space-y-2 border-b border-r border-white/[0.07] px-4 py-3">
              <div className={`h-3 w-16 ${pulse}`} />
              <div className={`h-5 w-8 ${pulse}`} />
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-[14px] border border-white/[0.07] bg-card">
              <div className="h-24 border-b border-white/[0.07] bg-[#0b0c0f]" />
              <div className="space-y-2 px-3.5 py-3">
                <div className={`h-3.5 w-2/3 ${pulse}`} />
                <div className={`h-3 w-1/2 ${pulse}`} />
                <div className="flex justify-between pt-2">
                  <div className={`h-3 w-20 ${pulse}`} />
                  <div className={`h-3 w-12 ${pulse}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
