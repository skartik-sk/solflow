// apps/web/src/app/marketplace/publish/publish-form.tsx
// Client component — the actual publish listing form.
// Calls trpc.marketplace.publish.useMutation().

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Loader2, Send, Info } from "lucide-react";

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

  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
        <p className="text-sm">
          You don&apos;t have any saved projects yet.{" "}
          <a href="/dashboard" className="text-primary hover:underline">
            Create one first
          </a>{" "}
          and save it before publishing.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Project selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          Project <span className="text-red-400">*</span>
        </label>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
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
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Info className="h-3 w-3" />
          Only projects with saved flow data can be published.
        </p>
      </div>

      {/* Title */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          Title <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder="e.g. Simple Vault with PDA"
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50"
        />
        <p className="text-right text-xs text-muted-foreground">
          {title.length}/100
        </p>
      </div>

      {/* Short description */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          Short Description <span className="text-red-400">*</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="One or two sentences that appear in search results and listing cards."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 resize-none"
        />
        <p className="text-right text-xs text-muted-foreground">
          {description.length}/1000
        </p>
      </div>

      {/* Long description */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">
          Full Description{" "}
          <span className="text-xs text-muted-foreground font-normal">
            (optional)
          </span>
        </label>
        <textarea
          value={longDescription}
          onChange={(e) => setLongDescription(e.target.value)}
          maxLength={5000}
          rows={6}
          placeholder="Detailed description, use-cases, architecture notes, and deploy instructions. Certified templates need compile, audit, tests, export package, and deploy notes."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 resize-none"
        />
        <p className="text-right text-xs text-muted-foreground">
          {longDescription.length}/5000
        </p>
      </div>

      {/* Category + Tags row */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Category */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Category <span className="text-red-400">*</span>
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Tags */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Tags{" "}
            <span className="text-xs text-muted-foreground font-normal">
              (comma-separated, max 10)
            </span>
          </label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="vault, pda, defi, escrow"
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50"
          />
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pricing */}
      <div className="space-y-3">
        <label className="text-sm font-medium">Pricing</label>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              { value: "FREE", label: "Free", desc: "Anyone can fork it" },
              {
                value: "PAID",
                label: "Paid",
                desc: "Set a price in SOL",
              },
              {
                value: "PAY_WHAT_YOU_WANT",
                label: "Pay what you want",
                desc: "Buyer chooses amount",
              },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPricingModel(opt.value)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                pricingModel === opt.value
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="text-xs text-muted-foreground">{opt.desc}</div>
            </button>
          ))}
        </div>

        {/* Price SOL field — only shown for PAID */}
        {pricingModel === "PAID" && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={priceSOL}
              onChange={(e) => setPriceSOL(e.target.value)}
              min="0.01"
              step="0.01"
              placeholder="0.50"
              className="h-9 w-32 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
            <span className="text-sm text-muted-foreground">SOL</span>
          </div>
        )}
      </div>

      {/* Review notice */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        <strong className="text-foreground">Review process:</strong> Your
        submission will be reviewed before it appears publicly in the
        marketplace. Typically takes 1–2 business days. You&apos;ll be able to
        track the status in{" "}
        <a
          href="/marketplace/my-listings"
          className="text-primary hover:underline"
        >
          My Listings
        </a>
        .
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={publish.isPending}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {publish.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {publish.isPending ? "Submitting…" : "Submit for Review"}
      </button>
    </form>
  );
}
