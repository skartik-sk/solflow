// apps/web/src/app/marketplace/publish/publish-form.tsx
// Client component — the actual publish listing form.
// Calls trpc.marketplace.publish.useMutation().

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Loader2, Send, Info, GitFork } from "lucide-react";
import {
  AuthorAvatar,
  Chip,
  FrameworkBadge,
  GraphThumb,
  GraphThumbStyles,
  btnPrimary,
  panel,
} from "@/components/marketplace/parts";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProjectSummary = {
  id: string;
  name: string;
  framework: string;
  updatedAt: Date;
  listing: { id: string; status: string } | null;
};

const CATEGORIES = [
  "TOKEN",
  "NFT",
  "DEFI",
  "DAO",
  "GAMING",
  "SOCIAL",
  "UTILITY",
  "OTHER",
] as const;

type Category = (typeof CATEGORIES)[number];

interface Props {
  projects: ProjectSummary[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PublishForm({ projects }: Props) {
  const router = useRouter();

  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [longDescription, setLongDescription] = useState("");
  const [category, setCategory] = useState<Category>("UTILITY");
  const [tagsInput, setTagsInput] = useState("");
  const [pricingModel, setPricingModel] = useState<
    "FREE" | "PAID" | "PAY_WHAT_YOU_WANT"
  >("FREE");
  const [priceSOL, setPriceSOL] = useState("");

  const publish = trpc.marketplace.publish.useMutation({
    onSuccess: (data) => {
      toast.success(
        data.certification?.certified
          ? "Submitted for review with SolStudio certification ready."
          : `Submitted for review. Certification missing: ${data.certification?.missing?.join(", ") || "checks"}.`,
      );
      router.push(`/marketplace/my-listings`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const tags = tagsInput
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) {
      toast.error("Select a project");
      return;
    }
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!description.trim()) {
      toast.error("Description is required");
      return;
    }
    publish.mutate({
      projectId,
      title: title.trim(),
      description: description.trim(),
      longDescription: longDescription.trim() || undefined,
      category,
      tags,
      pricingModel,
      priceSOL:
        pricingModel === "PAID" && priceSOL ? parseFloat(priceSOL) : undefined,
    });
  };


  const field =
    "w-full rounded-[10px] border border-white/[0.08] bg-background px-3 text-[16px] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] outline-none transition-colors duration-150 placeholder:text-muted-foreground/60 hover:border-white/[0.14] focus:border-primary/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary/40 sm:text-[13px]";
  const label = "text-[12.5px] font-medium text-foreground";
  const hint = "text-[11.5px] text-muted-foreground";
  const req = <span className="text-muted-foreground"> *</span>;

  if (projects.length === 0) {
    return (
      <div className={`${panel} relative overflow-hidden`}>
        <GraphThumbStyles />
        <div aria-hidden className="mk-dots h-40 border-b border-white/[0.07] opacity-60">
          <GraphThumb seed="empty-publish" />
        </div>
        <div className="px-5 py-4">
          <p className="text-[14px] font-medium">No saved projects yet</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Build a program in the editor and save it, then come back to publish it.
          </p>
          <a href="/dashboard" className={`${btnPrimary} mt-3`}>
            Create one first
          </a>
        </div>
      </div>
    );
  }

  const selected = projects.find((p) => p.id === projectId);
  const previewPrice =
    pricingModel === "FREE"
      ? "Free"
      : pricingModel === "PAY_WHAT_YOU_WANT"
        ? "PWYW"
        : priceSOL
          ? `${priceSOL} SOL`
          : "Paid";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <GraphThumbStyles />
      <form onSubmit={handleSubmit} className="min-w-0 space-y-4">
        {/* Project */}
        <fieldset className={`${panel} space-y-1.5 p-4`}>
          <label htmlFor="pub-project" className={label}>
            Project{req}
          </label>
          <select
            id="pub-project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={`${field} h-9`}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{" "}
                {p.listing
                  ? `(${p.listing.status.toLowerCase().replace(/_/g, " ")})`
                  : ""}
              </option>
            ))}
          </select>
          <p className={`${hint} flex items-center gap-1`}>
            <Info className="h-3 w-3" />
            Only projects with saved flow data can be published.
          </p>
        </fieldset>

        {/* Listing copy */}
        <fieldset className={`${panel} space-y-4 p-4`}>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <label htmlFor="pub-title" className={label}>
                Title{req}
              </label>
              <span className={`${hint} font-mono tabular-nums`}>{title.length}/100</span>
            </div>
            <input
              id="pub-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="e.g. Simple Vault with PDA"
              className={`${field} h-9`}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <label htmlFor="pub-desc" className={label}>
                Short description{req}
              </label>
              <span className={`${hint} font-mono tabular-nums`}>{description.length}/1000</span>
            </div>
            <textarea
              id="pub-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="One or two sentences that appear in search results and listing cards."
              className={`${field} resize-none py-2`}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <label htmlFor="pub-long" className={label}>
                Full description <span className="font-normal text-muted-foreground">optional</span>
              </label>
              <span className={`${hint} font-mono tabular-nums`}>{longDescription.length}/5000</span>
            </div>
            <textarea
              id="pub-long"
              value={longDescription}
              onChange={(e) => setLongDescription(e.target.value)}
              maxLength={5000}
              rows={6}
              placeholder="Use-cases, architecture notes and deploy instructions. Certified templates need compile, audit, tests, an export package and deploy notes."
              className={`${field} resize-y py-2`}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="pub-category" className={label}>
                Category{req}
              </label>
              <select
                id="pub-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className={`${field} h-9`}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pub-tags" className={label}>
                Tags <span className="font-normal text-muted-foreground">comma-separated, max 10</span>
              </label>
              <input
                id="pub-tags"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="vault, pda, defi, escrow"
                className={`${field} h-9`}
              />
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {tags.map((tag) => (
                    <Chip key={tag} className="font-mono">
                      {tag}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          </div>
        </fieldset>

        {/* Pricing */}
        <fieldset className={`${panel} space-y-3 p-4`}>
          <legend className="sr-only">Pricing</legend>
          <p className={label} aria-hidden>
            Pricing
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {(
              [
                { value: "FREE", label: "Free", desc: "Anyone can fork it" },
                { value: "PAID", label: "Paid", desc: "Set a price in SOL" },
                { value: "PAY_WHAT_YOU_WANT", label: "Pay what you want", desc: "Buyer chooses amount" },
              ] as const
            ).map((opt) => {
              const on = pricingModel === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPricingModel(opt.value)}
                  className={`flex items-start gap-2.5 rounded-[12px] border p-3 text-left transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.98] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    on
                      ? "border-primary/60 bg-primary/[0.07]"
                      : "border-white/[0.08] bg-background/40 hover:border-white/[0.16]"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                      on ? "border-primary" : "border-white/25"
                    }`}
                  >
                    {on && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </span>
                  <span>
                    <span className="block text-[13px] font-medium">{opt.label}</span>
                    <span className="block text-[11.5px] text-muted-foreground">{opt.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {pricingModel === "PAID" && (
            <div className="flex items-center gap-2">
              <label htmlFor="pub-price" className="sr-only">
                Price in SOL
              </label>
              <input
                id="pub-price"
                type="number"
                value={priceSOL}
                onChange={(e) => setPriceSOL(e.target.value)}
                min="0.01"
                step="0.01"
                placeholder="0.50"
                className={`${field} h-9 w-32 font-mono`}
              />
              <span className="text-[13px] text-muted-foreground">SOL</span>
            </div>
          )}
        </fieldset>

        {/* Submit */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={`${hint} max-w-sm`}>
            Submissions are reviewed before they go public, usually within 1–2 business days. Track status in{" "}
            <a
              href="/marketplace/my-listings"
              className="rounded text-primary hover:underline outline-none focus-visible:outline-2 focus-visible:outline-primary"
            >
              My listings
            </a>
            .
          </p>
          <button type="submit" disabled={publish.isPending} className={`${btnPrimary} h-9 shrink-0 px-4 disabled:opacity-50`}>
            {publish.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {publish.isPending ? "Submitting…" : "Submit for review"}
          </button>
        </div>
      </form>

      {/* Live card preview: how the listing will look in the marketplace */}
      <aside className="hidden lg:block">
        <div className="sticky top-20">
          <p className="mb-2 text-[11.5px] text-muted-foreground">Card preview</p>
          <div
            data-lit
            className="flex flex-col overflow-hidden rounded-[16px] border border-white/[0.07] bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_24px_48px_-24px_rgba(0,0,0,0.9)]"
          >
            <div className="mk-dots relative h-[132px] overflow-hidden border-b border-white/[0.07]">
              <GraphThumb seed={projectId || "preview"} className="px-2 py-1" />
              <div className="absolute left-2.5 top-2.5">
                <FrameworkBadge framework={selected?.framework ?? "ANCHOR"} />
              </div>
            </div>
            <div className="px-3.5 pb-3 pt-3">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="truncate text-[14px] font-medium">{title.trim() || selected?.name || "Untitled"}</h3>
                <span className="shrink-0 font-mono text-[12px] text-muted-foreground">{previewPrice}</span>
              </div>
              <p className="mt-1 line-clamp-2 min-h-[2lh] text-[12.5px] leading-[1.45] text-muted-foreground">
                {description.trim() || "Your short description shows here."}
              </p>
              {tags.length > 0 && (
                <p className="mt-2 truncate font-mono text-[10.5px] text-muted-foreground/80">
                  {tags.slice(0, 3).join(" · ")}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2.5 text-[12px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <AuthorAvatar name="You" image={null} />
                  You
                </span>
                <span className="flex items-center gap-1 font-mono text-[11px]">
                  <GitFork className="h-3 w-3" />0
                </span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
