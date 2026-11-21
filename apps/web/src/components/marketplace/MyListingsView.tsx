// Presentational view for /marketplace/my-listings. The page checks auth and fetches.

import React from "react";
import Link from "next/link";
import { Plus, ExternalLink, AlertCircle, Pencil, RefreshCw } from "lucide-react";
import {
  Chip,
  GraphThumb,
  GraphThumbStyles,
  MarketHeader,
  btnGhost,
  btnPrimary,
  panel,
} from "./parts";
import { categoryLabel } from "./MarketplaceIndex";

export type MyListing = {
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

const STATUS: Record<string, { label: string; tone: "neutral" | "warn" | "ok" | "bad" }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING_REVIEW: { label: "Pending review", tone: "warn" },
  PUBLISHED: { label: "Published", tone: "ok" },
  REJECTED: { label: "Rejected", tone: "bad" },
  SUSPENDED: { label: "Suspended", tone: "warn" },
};

function priceOf(l: MyListing) {
  return l.pricingModel === "FREE"
    ? "Free"
    : l.pricingModel === "PAY_WHAT_YOU_WANT"
      ? "Pay what you want"
      : l.priceSOL != null
        ? `${l.priceSOL} SOL`
        : "Paid";
}

const iconBtn = `${btnGhost} h-7 px-2 text-[12px]`;

function Actions({ listing }: { listing: MyListing }) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      {listing.status === "PUBLISHED" && (
        <Link href={`/marketplace/${listing.id}`} target="_blank" className={iconBtn}>
          <ExternalLink className="h-3.5 w-3.5" />
          View
        </Link>
      )}
      <Link href={`/marketplace/publish?projectId=${listing.project.id}`} className={iconBtn}>
        <RefreshCw className="h-3.5 w-3.5" />
        {listing.status === "REJECTED" ? "Re-publish" : "Update"}
      </Link>
      <Link href={`/editor/${listing.project.id}`} className={iconBtn}>
        <Pencil className="h-3.5 w-3.5" />
        Edit project
      </Link>
    </div>
  );
}

function StatusChip({ status, featured }: { status: string; featured: boolean }) {
  const cfg = STATUS[status] ?? STATUS.DRAFT;
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Chip tone={cfg.tone}>
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${
            cfg.tone === "ok"
              ? "bg-emerald-400"
              : cfg.tone === "warn"
                ? "bg-amber-400"
                : cfg.tone === "bad"
                  ? "bg-red-400"
                  : "bg-white/30"
          }`}
        />
        {cfg.label}
      </Chip>
      {featured && <Chip tone="brand">Featured</Chip>}
    </span>
  );
}

function RejectedNote() {
  return (
    <p className="flex items-center gap-1.5 text-[12px] text-red-300">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      Your submission was rejected. Re-publish after making improvements.
    </p>
  );
}

export function MyListingsView({ listings }: { listings: MyListing[] }) {
  const published = listings.filter((l) => l.status === "PUBLISHED").length;
  const forks = listings.reduce((n, l) => n + l.forks, 0);
  const downloads = listings.reduce((n, l) => n + l.downloads, 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <GraphThumbStyles />
      <MarketHeader crumbs={[{ label: "Marketplace", href: "/marketplace" }, { label: "My listings" }]}>
        <Link href="/dashboard" className={btnGhost}>
          Dashboard
        </Link>
      </MarketHeader>

      <main className="mx-auto max-w-[1200px] px-4 pb-20 pt-8 sm:px-6 sm:pt-10">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.03em]">My listings</h1>
            <p className="mt-1 text-[13.5px] text-muted-foreground">
              {listings.length === 0
                ? "You haven't published any templates yet."
                : `${listings.length} template${listings.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <Link href="/marketplace/publish" className={`${btnPrimary} h-9`}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
            Publish template
          </Link>
        </div>

        {listings.length === 0 ? (
          <div className={`${panel} grid overflow-hidden sm:grid-cols-[1fr_1.1fr]`}>
            <div className="flex flex-col justify-center gap-2 p-6">
              <p className="text-[15px] font-medium">No templates yet</p>
              <p className="max-w-xs text-[13px] text-muted-foreground">
                Share a program you built. Others fork it as a graph and pick their framework.
              </p>
              <Link href="/marketplace/publish" className={`${btnPrimary} mt-2 self-start`}>
                <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
                Publish your first template
              </Link>
            </div>
            <div aria-hidden data-lit className="mk-dots h-48 border-white/[0.07] max-sm:border-t sm:h-auto sm:min-h-56 sm:border-l">
              <GraphThumb seed="my-first-template" />
            </div>
          </div>
        ) : (
          <>
            {/* Summary */}
            <dl className={`${panel} mb-4 grid grid-cols-2 divide-white/[0.06] sm:grid-cols-4 sm:divide-x`}>
              {[
                ["Templates", listings.length],
                ["Published", published],
                ["Forks", forks],
                ["Downloads", downloads],
              ].map(([k, v]) => (
                <div key={k} className="px-4 py-3">
                  <dt className="text-[11.5px] text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 font-mono text-[18px] tabular-nums tracking-[-0.02em]">{v}</dd>
                </div>
              ))}
            </dl>

            {/* Table, md and up */}
            <div className={`${panel} hidden overflow-hidden md:block`}>
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-white/[0.07] text-[11.5px] text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Template</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 text-right font-medium">Price</th>
                    <th className="px-3 py-2.5 text-right font-medium">Forks</th>
                    <th className="px-3 py-2.5 text-right font-medium">Downloads</th>
                    <th className="px-3 py-2.5 text-right font-medium">Rating</th>
                    <th className="px-3 py-2.5 text-right font-medium">Updated</th>
                    <th className="px-3 py-2.5">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {listings.map((listing) => (
                    <React.Fragment key={listing.id}>
                      <tr className="transition-colors duration-150 hover:bg-white/[0.02]">
                        <td className="max-w-0 px-4 py-3">
                          <p className="truncate font-medium text-foreground">{listing.title}</p>
                          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                            <span className="font-mono">{listing.project.name}</span> · {categoryLabel(listing.category)} ·{" "}
                            {listing.description}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <StatusChip status={listing.status} featured={listing.featured} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-[12px] tabular-nums">
                          {priceOf(listing)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-[12px] tabular-nums">{listing.forks}</td>
                        <td className="px-3 py-3 text-right font-mono text-[12px] tabular-nums">{listing.downloads}</td>
                        <td className="px-3 py-3 text-right font-mono text-[12px] tabular-nums">
                          {listing.rating != null ? listing.rating.toFixed(1) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right text-[12px] tabular-nums text-muted-foreground">
                          {new Date(listing.updatedAt).toLocaleDateString()}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <Actions listing={listing} />
                        </td>
                      </tr>
                      {listing.status === "REJECTED" && (
                        <tr className="!border-t-0">
                          <td colSpan={8} className="px-4 pb-3 pt-0">
                            <RejectedNote />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Stacked rows, phones */}
            <ul className={`${panel} divide-y divide-white/[0.06] md:hidden`}>
              {listings.map((listing) => (
                <li key={listing.id} className="space-y-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium">{listing.title}</p>
                      <p className="truncate font-mono text-[11.5px] text-muted-foreground">{listing.project.name}</p>
                    </div>
                    <StatusChip status={listing.status} featured={listing.featured} />
                  </div>
                  <p className="flex flex-wrap gap-x-3 font-mono text-[11.5px] tabular-nums text-muted-foreground">
                    <span className="text-foreground/90">{priceOf(listing)}</span>
                    <span>{listing.forks} forks</span>
                    <span>{listing.downloads} dl</span>
                    {listing.rating != null && <span>{listing.rating.toFixed(1)} ★</span>}
                    <span>{new Date(listing.updatedAt).toLocaleDateString()}</span>
                  </p>
                  {listing.status === "REJECTED" && <RejectedNote />}
                  <div className="-mx-2 flex flex-wrap">
                    <Actions listing={listing} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

