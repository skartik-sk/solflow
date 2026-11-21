// Presentational view for /marketplace/[id]. The page fetches and checks auth;
// this renders. Fork, payment and download keep their own components.

import React from "react";
import Link from "next/link";
import type { Node, Edge } from "@xyflow/react";
import { Star, GitFork, Download, ShieldCheck, CheckCircle2, AlertTriangle, Lock, FileCode2 } from "lucide-react";
import { ForkButton } from "@/app/marketplace/[id]/fork-button";
import { DownloadButtons } from "@/app/marketplace/[id]/download-buttons";
import { FlowPreview } from "@/app/marketplace/[id]/flow-preview";
import {
  evaluateMarketplaceCertification,
  hasDeployInstructionsText,
  isCertifiedTag,
} from "@/lib/marketplace/certification";
import {
  AuthorAvatar,
  Chip,
  GraphThumb,
  GraphThumbStyles,
  MarketHeader,
  btnGhost,
  frameworkLabel,
  panel,
} from "./parts";
import { categoryLabel } from "./MarketplaceIndex";

export interface ListingDetail {
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
  publishedAt: Date | null;
  templateFlowData: unknown;
  project: {
    framework: string;
    generatedCode: unknown;
    auditReports: Array<{ score: number | null; createdAt: Date }>;
    compilations: Array<{ status: string; duration: number | null; completedAt: Date | null }>;
    testRuns: Array<{ status: string; duration: number | null; completedAt: Date | null }>;
  };
  author: { id: string; name: string | null; image: string | null };
  reviews: Array<{
    id: string;
    rating: number;
    comment: string | null;
    createdAt: Date;
    reviewerId: string;
  }>;
}

const sectionTitle = "text-[13px] font-semibold tracking-[-0.01em] text-foreground";

export function ListingDetailView({
  listing,
  alreadyPurchased,
  isAuthenticated,
}: {
  listing: ListingDetail;
  alreadyPurchased: boolean;
  isAuthenticated: boolean;
}) {
  const price =
    listing.pricingModel === "FREE"
      ? "Free"
      : listing.pricingModel === "PAY_WHAT_YOU_WANT"
        ? "Pay what you want"
        : listing.priceSOL != null
          ? `${listing.priceSOL} SOL`
          : "Paid";

  const fd = listing.templateFlowData as { nodes?: Node[]; edges?: Edge[] } | null;
  const previewNodes: Node[] = fd?.nodes ?? [];
  const previewEdges: Edge[] = fd?.edges ?? [];
  const hasFlowPreview = previewNodes.length > 0;
  const latestAudit = listing.project.auditReports[0];
  const latestCompile = listing.project.compilations[0];
  const latestTest = listing.project.testRuns[0];
  const certification = evaluateMarketplaceCertification({
    compileStatus: latestCompile?.status ?? null,
    testStatus: latestTest?.status ?? null,
    auditScore: latestAudit?.score ?? null,
    hasDeployInstructions: hasDeployInstructionsText(listing.longDescription),
    hasCodePackage: Boolean(listing.project.generatedCode || listing.project.framework),
  });

  const instructions = readInstructions(previewNodes, previewEdges);
  const canSeeCode = listing.pricingModel === "FREE" || alreadyPurchased;
  const files = canSeeCode ? readCodeFiles(listing.project.generatedCode) : [];
  const tags = listing.tags.filter((tag) => !isCertifiedTag(tag));

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/25 selection:text-foreground">
      <GraphThumbStyles />
      <MarketHeader crumbs={[{ label: "Marketplace", href: "/marketplace" }, { label: listing.title }]}>
        <Link href="/dashboard" className={btnGhost}>
          Dashboard
        </Link>
      </MarketHeader>

      <main className="mx-auto max-w-[1200px] px-4 pb-20 pt-7 sm:px-6 sm:pt-9">
        {/* Title */}
        <div className="mb-6">
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
            <Chip>{categoryLabel(listing.category)}</Chip>
            <Chip className="font-mono">{frameworkLabel(listing.project.framework)}</Chip>
            {listing.featured && <Chip tone="brand">Featured</Chip>}
            {certification.certified && (
              <Chip tone="ok">
                <ShieldCheck className="h-3 w-3" />
                SolStudio certified
              </Chip>
            )}
          </div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.03em]">{listing.title}</h1>
          <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">{listing.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <AuthorAvatar name={listing.author.name} image={listing.author.image} size={20} />
              <span className="text-foreground/90">{listing.author.name ?? "Anonymous"}</span>
            </span>
            {listing.publishedAt && <span>Published {new Date(listing.publishedAt).toLocaleDateString()}</span>}
            {tags.length > 0 && <span className="font-mono text-[11.5px]">{tags.join(" · ")}</span>}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* ── Main column ───────────────────────────────── */}
          <div className="min-w-0 space-y-5">
            {/* Graph */}
            <section className={`${panel} overflow-hidden`} aria-label="Graph preview">
              <div className="flex h-10 items-center justify-between gap-3 border-b border-white/[0.07] px-3.5">
                <span className="flex items-center gap-2 text-[12.5px] font-medium">
                  <span className="flex gap-1" aria-hidden>
                    <span className="h-2 w-2 rounded-full bg-white/15" />
                    <span className="h-2 w-2 rounded-full bg-white/15" />
                    <span className="h-2 w-2 rounded-full bg-white/15" />
                  </span>
                  Graph
                </span>
                {hasFlowPreview && (
                  <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">
                    {previewNodes.length} nodes · {previewEdges.length} edges
                  </span>
                )}
              </div>
              {hasFlowPreview ? (
                <div className="mk-flow h-[340px] bg-background sm:h-[460px]">
                  <FlowPreview nodes={previewNodes} edges={previewEdges} />
                </div>
              ) : (
                <div className="mk-dots relative flex h-[260px] items-center justify-center" data-lit>
                  <div className="absolute inset-0 opacity-50">
                    <GraphThumb seed={listing.id} />
                  </div>
                  <span className="relative rounded-md border border-white/[0.08] bg-popover/90 px-2.5 py-1 text-[12px] text-muted-foreground">
                    No graph saved with this template
                  </span>
                </div>
              )}
            </section>

            {/* Instructions and accounts */}
            {instructions.length > 0 && (
              <section className={`${panel} overflow-hidden`}>
                <div className="flex h-10 items-center justify-between border-b border-white/[0.07] px-3.5">
                  <h2 className={sectionTitle}>Instructions</h2>
                  <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">
                    {instructions.length} ix · {instructions.reduce((n, ix) => n + ix.accounts.length, 0)} accounts
                  </span>
                </div>
                <ul className="divide-y divide-white/[0.06]">
                  {instructions.map((ix) => (
                    <li key={ix.id} className="grid gap-2 px-3.5 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate font-mono text-[12.5px] text-foreground">
                          <span aria-hidden className="h-2 w-2 shrink-0 rounded-[3px] bg-[#38bdf8]" />
                          {ix.name}
                        </p>
                        {ix.args.length > 0 && (
                          <p className="mt-1 truncate pl-4 font-mono text-[11px] text-muted-foreground">
                            {ix.args.map((a) => `${a.name}: ${a.type}`).join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 pl-4 sm:pl-0">
                        {ix.accounts.length === 0 ? (
                          <span className="text-[12px] text-muted-foreground">No accounts</span>
                        ) : (
                          ix.accounts.map((acc) => (
                            <span
                              key={acc.id}
                              className="inline-flex h-6 items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.02] px-1.5 font-mono text-[11.5px] text-foreground/90"
                            >
                              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
                              {acc.name}
                              {acc.flags.length > 0 && (
                                <span className="text-[10.5px] text-muted-foreground">{acc.flags.join(" ")}</span>
                              )}
                            </span>
                          ))
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* About */}
            {listing.longDescription && (
              <section className={`${panel} p-4`}>
                <h2 className={`${sectionTitle} mb-2`}>About this template</h2>
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-muted-foreground">
                  {listing.longDescription}
                </p>
              </section>
            )}

            {/* Code */}
            <CodePanel files={files} locked={!canSeeCode} framework={frameworkLabel(listing.project.framework)} />

            {/* Working status */}
            <section className={`${panel} overflow-hidden`}>
              <div className="flex h-10 items-center justify-between border-b border-white/[0.07] px-3.5">
                <h2 className={sectionTitle}>Working status</h2>
                <Chip tone={certification.certified ? "ok" : "warn"}>
                  {certification.certified ? "Badge eligible" : "Needs work"}
                </Chip>
              </div>
              <div className="grid divide-white/[0.06] max-sm:divide-y sm:grid-cols-3 sm:divide-x">
                <StatusCell
                  label="Compile"
                  value={latestCompile?.status ?? "Not run"}
                  ok={latestCompile?.status === "SUCCESS"}
                  detail={formatDuration(latestCompile?.duration)}
                />
                <StatusCell
                  label="Audit"
                  value={typeof latestAudit?.score === "number" ? `${latestAudit.score}/100` : "Not run"}
                  ok={typeof latestAudit?.score === "number" && latestAudit.score >= 80}
                  detail={latestAudit ? "Latest report" : "Run after fork"}
                />
                <StatusCell
                  label="Test"
                  value={latestTest?.status ?? "Not run"}
                  ok={latestTest?.status === "PASSED"}
                  detail={formatDuration(latestTest?.duration)}
                />
              </div>
              <ul className="grid gap-x-4 border-t border-white/[0.06] px-3.5 py-2.5 sm:grid-cols-2">
                {certification.checks.map((check) => (
                  <li key={check.id} className="flex items-center justify-between gap-3 py-1 text-[12px]">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {check.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-label="Passed" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" aria-label="Missing" />
                      )}
                      {check.label}
                    </span>
                    <span className="truncate text-right font-mono text-[11px] text-foreground/90">{check.value}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Reviews */}
            <section>
              <h2 className={`${sectionTitle} mb-2.5`}>
                Reviews <span className="font-normal text-muted-foreground">{listing.reviews.length}</span>
              </h2>
              {listing.reviews.length === 0 ? (
                <p className="rounded-[14px] border border-dashed border-white/[0.08] px-4 py-5 text-[13px] text-muted-foreground">
                  No reviews yet. Fork it and be the first.
                </p>
              ) : (
                <ul className="space-y-2">
                  {listing.reviews.map((review) => (
                    <li key={review.id} className={`${panel} rounded-[14px] px-4 py-3`}>
                      <div className="flex items-center gap-2">
                        <span className="flex" aria-label={`${review.rating} out of 5`}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              aria-hidden
                              className={`h-3 w-3 ${i < review.rating ? "fill-amber-400 text-amber-400" : "text-white/15"}`}
                            />
                          ))}
                        </span>
                        <span className="text-[11.5px] text-muted-foreground">
                          {new Date(review.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {review.comment && <p className="mt-1.5 text-[13px] text-foreground/85">{review.comment}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* ── Side column ───────────────────────────────── */}
          <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
            <div className={`${panel} p-4`}>
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={`font-mono text-[22px] font-medium tracking-[-0.02em] ${
                    listing.pricingModel === "FREE" ? "text-foreground" : "text-primary"
                  }`}
                >
                  {price}
                </span>
                <span className="text-[11.5px] text-muted-foreground">
                  {listing.pricingModel === "FREE" ? "Fork for free" : "One-time, in SOL"}
                </span>
              </div>

              <div className="mt-3">
                <ForkButton
                  listingId={listing.id}
                  pricingModel={listing.pricingModel}
                  priceSOL={listing.priceSOL}
                  alreadyPurchased={alreadyPurchased}
                  isAuthenticated={isAuthenticated}
                />
              </div>

              <dl className="mt-4 grid grid-cols-3 divide-x divide-white/[0.06] rounded-[10px] border border-white/[0.06] bg-background/50 py-2 text-center">
                <Stat icon={<GitFork className="h-3 w-3" />} label="Forks" value={String(listing.forks)} />
                <Stat
                  icon={<Star className="h-3 w-3" />}
                  label="Rating"
                  value={listing.rating != null ? listing.rating.toFixed(1) : "—"}
                />
                <Stat icon={<Download className="h-3 w-3" />} label="Downloads" value={String(listing.downloads)} />
              </dl>

              <div className="mt-4 border-t border-white/[0.06] pt-3.5">
                <p className="mb-2 text-[12px] font-medium text-muted-foreground">Download source</p>
                <DownloadButtons listingId={listing.id} />
              </div>
            </div>

            <div className={`${panel} p-4`}>
              <dl className="space-y-2 text-[12.5px]">
                <Detail label="Framework" value={frameworkLabel(listing.project.framework)} />
                <Detail label="Category" value={categoryLabel(listing.category)} />
                <Detail label="Pricing" value={listing.pricingModel.replace(/_/g, " ").toLowerCase()} />
                {listing.publishedAt && (
                  <Detail label="Published" value={new Date(listing.publishedAt).toLocaleDateString()} />
                )}
              </dl>
            </div>

            <ol className={`${panel} space-y-1.5 p-4 text-[12.5px] text-muted-foreground`}>
              <li className="mb-2 text-[12px] font-semibold text-foreground">Deploy path</li>
              {["Fork into the editor", "Compile", "Run Audit and Test", "Deploy with your network and wallet"].map(
                (step, i) => (
                  <li key={step} className="flex items-center gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/[0.06] font-mono text-[10px] text-foreground/80">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ),
              )}
            </ol>
          </aside>
        </div>
      </main>
    </div>
  );
}

// ─── Pieces ────────────────────────────────────────────────────────────────

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="px-1">
      <dt className="flex items-center justify-center gap-1 text-[10.5px] text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-[13px] tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground/90 first-letter:uppercase">{value}</dd>
    </div>
  );
}

function StatusCell({ label, value, ok, detail }: { label: string; value: string; ok: boolean; detail?: string }) {
  return (
    <div className="px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-muted-foreground">{label}</span>
        {ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
        )}
      </div>
      <div className="mt-1 font-mono text-[13px] text-foreground">{value}</div>
      {detail && <div className="mt-0.5 text-[11px] text-muted-foreground">{detail}</div>}
    </div>
  );
}

const MAX_LINES = 120;

function CodePanel({
  files,
  locked,
  framework,
}: {
  files: Array<{ path: string; content: string }>;
  locked: boolean;
  framework: string;
}) {
  if (locked) {
    return (
      <section className={`${panel} flex items-center gap-3 px-4 py-3.5`}>
        <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-[13px] text-muted-foreground">
          The {framework} source opens in the editor after purchase.
        </p>
      </section>
    );
  }
  if (files.length === 0) return null;
  const [first, ...rest] = files;
  const lines = first.content.split("\n");
  const shown = lines.slice(0, MAX_LINES);
  return (
    <section className={`${panel} overflow-hidden`}>
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-white/[0.07] px-3.5 py-2">
        <h2 className={`${sectionTitle} flex items-center gap-2`}>
          <FileCode2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono text-[12px] font-medium">{first.path}</span>
        </h2>
        {rest.length > 0 && (
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            +{rest.length} {rest.length === 1 ? "file" : "files"} in the download
          </span>
        )}
      </div>
      <div className="max-h-[420px] overflow-auto bg-background/60">
        <pre className="py-3 font-mono text-[12px] leading-[1.6]">
          <code>
            {shown.map((line, i) => (
              <span key={i} className="grid grid-cols-[3rem_minmax(0,1fr)]">
                <span aria-hidden className="select-none pr-3 text-right tabular-nums text-white/20">
                  {i + 1}
                </span>
                <span className="whitespace-pre pr-4 text-foreground/85">{line || " "}</span>
              </span>
            ))}
          </code>
        </pre>
      </div>
      {lines.length > MAX_LINES && (
        <p className="border-t border-white/[0.06] px-3.5 py-2 text-[11.5px] text-muted-foreground">
          {lines.length - MAX_LINES} more lines in the download
        </p>
      )}
    </section>
  );
}

// ─── Derivations (read-only views of data the page already has) ────────────

type IxView = {
  id: string;
  name: string;
  args: Array<{ name: string; type: string }>;
  accounts: Array<{ id: string; name: string; flags: string[] }>;
};

export function readInstructions(nodes: Node[], edges: Edge[]): IxView[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return nodes
    .filter((n) => n.type === "instruction")
    .map((n) => {
      const d = (n.data ?? {}) as Record<string, unknown>;
      const rawArgs = Array.isArray(d.instructionData) ? (d.instructionData as Array<Record<string, unknown>>) : [];
      const accounts = edges
        .filter((e) => e.source === n.id)
        .map((e) => byId.get(e.target))
        .filter((t): t is Node => Boolean(t) && t!.type === "account")
        .map((t) => {
          const a = (t.data ?? {}) as Record<string, unknown>;
          const flags = [
            a.isInit ? "init" : null,
            a.isMut ? "mut" : null,
            a.isSigner ? "signer" : null,
            a.isClose ? "close" : null,
          ].filter(Boolean) as string[];
          return { id: t.id, name: String(a.name ?? a.label ?? t.id), flags };
        });
      return {
        id: n.id,
        name: String(d.name ?? d.label ?? n.id),
        args: rawArgs.map((a) => ({ name: String(a.name ?? ""), type: String(a.type ?? "") })),
        accounts,
      };
    });
}

function readCodeFiles(generatedCode: unknown): Array<{ path: string; content: string }> {
  let text: string | null = null;
  if (typeof generatedCode === "string") text = generatedCode;
  else if (generatedCode && typeof generatedCode === "object") {
    const files = (generatedCode as { files?: unknown }).files;
    if (Array.isArray(files)) {
      const ok = files.filter(
        (f): f is { path: string; content: string } =>
          !!f && typeof f.path === "string" && typeof f.content === "string",
      );
      if (ok.length > 0) return ok;
    }
  }
  if (!text || !text.trim()) return [];
  // Saved as "// ─── <path> ───…" headers followed by each file's content.
  const parts = text.split(/^\/\/ ─── (.+?) ─+\s*$/m);
  if (parts.length < 3) return [{ path: "lib.rs", content: text.trim() }];
  const out: Array<{ path: string; content: string }> = [];
  for (let i = 1; i < parts.length; i += 2) {
    out.push({ path: parts[i].trim(), content: (parts[i + 1] ?? "").replace(/^\n+|\s+$/g, "") });
  }
  const lib = out.findIndex((f) => /lib\.rs$/.test(f.path));
  if (lib > 0) out.unshift(out.splice(lib, 1)[0]);
  return out;
}

function formatDuration(duration: number | null | undefined): string {
  if (!duration) return "Run after fork";
  if (duration < 1000) return `${duration}ms`;
  return `${(duration / 1000).toFixed(1)}s`;
}
