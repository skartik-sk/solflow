// apps/web/src/app/marketplace/my-listings/page.tsx
// User's own marketplace listings — shows status, stats, edit/unpublish actions.
// Server Component: auth check + DB fetch.

import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@solflow/auth";
import { prisma } from "@solflow/db";
import {
  Layers,
  ArrowLeft,
  Plus,
  Download,
  GitFork,
  Star,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  PauseCircle,
} from "lucide-react";

export const metadata = { title: "My Listings | SolStudio Marketplace" };
export const dynamic = "force-dynamic";

// ─── Local types ──────────────────────────────────────────────────────────────
type MyListing = {
  id: string;
  title: string;
  description: string;
  category: string;
  pricingModel: string;
  priceSOL: number | null;
  downloads: number;
  forks: number;
  rating: number | null;
  status: string;
  featured: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  project: { id: string; name: string };
};

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; className: string }
> = {
  DRAFT: {
    label: "Draft",
    icon: <Clock className="h-3 w-3" />,
    className: "text-muted-foreground bg-muted/50 border-border",
  },
  PENDING_REVIEW: {
    label: "Pending Review",
    icon: <Clock className="h-3 w-3 text-amber-400" />,
    className: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  },
  PUBLISHED: {
    label: "Published",
    icon: <CheckCircle2 className="h-3 w-3 text-green-400" />,
    className: "text-green-400 bg-green-400/10 border-green-400/20",
  },
  REJECTED: {
    label: "Rejected",
    icon: <XCircle className="h-3 w-3 text-red-400" />,
    className: "text-red-400 bg-red-400/10 border-red-400/20",
  },
  SUSPENDED: {
    label: "Suspended",
    icon: <PauseCircle className="h-3 w-3 text-orange-400" />,
    className: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  },
};

export default async function MyListingsPage() {
  const session = await auth();
  if (!session?.user?.id)
    redirect("/auth/signin?callbackUrl=/marketplace/my-listings");

  const listings = (await prisma.marketplaceListing.findMany({
    where: { authorId: session.user.id },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      pricingModel: true,
      priceSOL: true,
      downloads: true,
      forks: true,
      rating: true,
      status: true,
      featured: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      project: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
  })) as MyListing[];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <span className="font-semibold">SolStudio</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link
              href="/marketplace"
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Marketplace
            </Link>
            <Link
              href="/dashboard"
              className="hover:text-foreground transition-colors"
            >
              Dashboard
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {/* Page header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">My Listings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {listings.length === 0
                ? "You haven't published any templates yet."
                : `${listings.length} template${listings.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <Link
            href="/marketplace/publish"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Publish Template
          </Link>
        </div>

        {listings.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-20 text-center text-muted-foreground">
            <Layers className="h-12 w-12 opacity-20" />
            <p className="text-lg font-medium">No templates yet</p>
            <p className="text-sm max-w-sm">
              Share your Solana program flows with the community. Start by
              publishing one of your projects.
            </p>
            <Link
              href="/marketplace/publish"
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Publish Your First Template
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {listings.map((listing) => {
              const statusCfg =
                STATUS_CONFIG[listing.status] ?? STATUS_CONFIG["DRAFT"];
              const price =
                listing.pricingModel === "FREE"
                  ? "Free"
                  : listing.pricingModel === "PAY_WHAT_YOU_WANT"
                    ? "Pay what you want"
                    : listing.priceSOL != null
                      ? `${listing.priceSOL} SOL`
                      : "Paid";

              return (
                <div
                  key={listing.id}
                  className="flex items-start gap-4 rounded-xl border border-border bg-card p-5"
                >
                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">
                        {listing.title}
                      </h3>

                      {/* Status badge */}
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusCfg.className}`}
                      >
                        {statusCfg.icon}
                        {statusCfg.label}
                      </span>

                      {listing.featured && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary border border-primary/20">
                          Featured
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                      {listing.description}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="rounded-full border border-border px-2 py-0.5">
                        {listing.category}
                      </span>
                      <span>{price}</span>
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
                      <span className="text-[10px]">
                        Updated{" "}
                        {new Date(listing.updatedAt).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Rejected notice */}
                    {listing.status === "REJECTED" && (
                      <div className="mt-2 flex items-center gap-1.5 rounded-md bg-red-400/10 border border-red-400/20 px-3 py-2 text-xs text-red-400">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        Your submission was rejected. Re-publish after making
                        improvements.
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 flex-col gap-2 items-end">
                    {listing.status === "PUBLISHED" && (
                      <Link
                        href={`/marketplace/${listing.id}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View
                      </Link>
                    )}
                    <Link
                      href={`/marketplace/publish?projectId=${listing.project.id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      {listing.status === "REJECTED" ? "Re-publish" : "Update"}
                    </Link>
                    <Link
                      href={`/editor/${listing.project.id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      Edit project
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
