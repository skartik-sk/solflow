// apps/web/src/app/dashboard/loading.tsx
// Shown by Next.js while DashboardPage (async server component) is streaming.

import { Workflow } from "lucide-react";
import Link from "next/link";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* ─── Topbar skeleton ───────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <Workflow className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold tracking-tight">SolFlow</span>
          </Link>
          {/* Avatar placeholder */}
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        {/* Page header skeleton */}
        <div className="mb-8 flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-7 w-48 animate-pulse rounded-lg bg-muted" />
            <div className="h-4 w-36 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="h-9 w-32 animate-pulse rounded-lg bg-muted" />
        </div>

        {/* Stats row skeleton */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card p-4 space-y-3"
            >
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-8 w-12 animate-pulse rounded-lg bg-muted" />
            </div>
          ))}
        </div>

        {/* Project card grid skeleton */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      </main>
    </div>
  );
}

function ProjectCardSkeleton() {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-5 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-1.5">
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-5 w-14 animate-pulse rounded-md bg-muted" />
      </div>
      {/* Spacer */}
      <div className="flex-1" />
      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-3 w-12 animate-pulse rounded bg-muted" />
          <div className="h-3 w-8 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-3 w-16 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
