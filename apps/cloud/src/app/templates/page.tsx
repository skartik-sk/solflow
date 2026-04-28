"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  Cloud,
  Loader2,
  Plus,
  Search,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";

type CloudTemplate = {
  id: string;
  title: string;
  description: string;
  longDescription?: string | null;
  category: string;
  tags: string[];
  nodeTypes: string[];
  downloads: number;
  featured: boolean;
};

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "https://solstudio.fun";

function nodeLabel(type: string): string {
  const [, name = type] = type.split(":");
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function categoryClass(category: string): string {
  switch (category) {
    case "DEFI":
      return "border-blue-500/20 bg-blue-500/10 text-blue-300";
    case "UTILITY":
      return "border-amber-500/20 bg-amber-500/10 text-amber-300";
    case "AI":
      return "border-violet-500/20 bg-violet-500/10 text-violet-300";
    case "RISK":
      return "border-rose-500/20 bg-rose-500/10 text-rose-300";
    default:
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  }
}

function TemplateSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 h-4 w-2/3 rounded bg-muted" />
      <div className="mb-2 h-3 w-full rounded bg-muted/70" />
      <div className="mb-5 h-3 w-5/6 rounded bg-muted/70" />
      <div className="flex gap-1.5">
        <div className="h-5 w-16 rounded bg-muted/70" />
        <div className="h-5 w-20 rounded bg-muted/70" />
      </div>
    </div>
  );
}

export default function CloudTemplatesPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const { data: templates, isLoading, error, refetch } = trpc.template.list.useQuery({ limit: 50 });
  const forkTemplate = trpc.template.fork.useMutation();

  useEffect(() => {
    const searchQuery = new URLSearchParams(window.location.search).get("q");
    if (searchQuery) setQuery(searchQuery);
  }, []);

  const categories = useMemo(() => {
    const values = new Set((templates ?? []).map((template) => template.category));
    return ["ALL", ...Array.from(values).sort()];
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ((templates ?? []) as CloudTemplate[]).filter((template) => {
      const categoryMatches = activeCategory === "ALL" || template.category === activeCategory;
      const textMatches = !needle ||
        template.title.toLowerCase().includes(needle) ||
        template.description.toLowerCase().includes(needle) ||
        template.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
        template.nodeTypes.some((node) => node.toLowerCase().includes(needle));
      return categoryMatches && textMatches;
    });
  }, [activeCategory, query, templates]);

  async function handleUseTemplate(template: CloudTemplate) {
    try {
      const workflow = await forkTemplate.mutateAsync({
        templateId: template.id,
        name: template.title,
      });
      toast.success("Template copied to your workflows");
      router.push(`/editor/${workflow.id}`);
    } catch (err) {
      const errorLike = err as { data?: { code?: string }; message?: string };
      if (errorLike.data?.code === "UNAUTHORIZED") {
        toast.message("Sign in to use this template");
        router.push(`/auth/signin?callbackUrl=${encodeURIComponent("/templates")}`);
        return;
      }
      toast.error(errorLike.message ?? "Failed to use template");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/70 backdrop-blur-2xl">
        <nav className="mx-auto flex h-12 max-w-6xl items-center justify-between px-5">
          <Link
            href="/"
            className="flex min-h-10 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
              <Cloud className="h-3.5 w-3.5 text-primary-foreground" aria-hidden="true" />
            </div>
            <span className="font-bold text-sm tracking-tight">SolStudio Cloud</span>
          </Link>
          <div className="hidden items-center gap-5 text-[13px] text-muted-foreground md:flex">
            <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
            <a href={WEB_URL} className="hover:text-foreground transition-colors">Editor</a>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center rounded-md bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Dashboard <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Link
              href="/"
              className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back to Cloud
            </Link>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground">
              <Boxes className="h-3 w-3 text-primary" aria-hidden="true" />
              Cloud workflow templates
            </div>
            <h1 className="max-w-2xl text-2xl font-bold tracking-tight md:text-3xl">
              Seeded workflows for real Solana operations.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Start with editable templates for price alerts, DCA, portfolio reports, webhook processing, and wallet-backed token actions.
            </p>
          </div>
          <Link
            href="/editor/new"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Blank Workflow
          </Link>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <label className="relative block">
            <span className="sr-only">Search templates</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by workflow, provider, or node"
              className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              type="search"
              autoComplete="off"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`min-h-10 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  activeCategory === category
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <TemplateSkeleton key={index} />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center">
            <p className="text-sm font-medium text-foreground">Templates could not be loaded.</p>
            <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !error && filteredTemplates.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-10 text-center">
            <Workflow className="mx-auto mb-3 h-9 w-9 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm font-medium">No matching templates</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Clear the search or check again after starter templates are seeded.
            </p>
          </div>
        )}

        {!isLoading && !error && filteredTemplates.length > 0 && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map((template) => {
              const isUsing = forkTemplate.isPending && forkTemplate.variables?.templateId === template.id;
              return (
                <article
                  key={template.id}
                  className="flex min-h-[260px] flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${categoryClass(template.category)}`}>
                      {template.category}
                    </span>
                    {template.featured && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        Featured
                      </span>
                    )}
                  </div>

                  <h2 className="text-sm font-semibold tracking-tight">{template.title}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {template.longDescription || template.description}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {template.nodeTypes.slice(0, 5).map((node) => (
                      <span key={node} className="rounded bg-muted px-1.5 py-1 text-[10px] text-muted-foreground">
                        {nodeLabel(node)}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {template.tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="text-[10px] text-muted-foreground/80">
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-1.5">
                    {["Editable", "Safety", "Replay"].map((label) => (
                      <span
                        key={label}
                        className="inline-flex min-w-0 items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-1 text-[9px] font-semibold text-emerald-300"
                        title={label}
                      >
                        <CheckCircle2 className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{label}</span>
                      </span>
                    ))}
                  </div>

                  <div className="mt-auto flex items-center justify-between pt-5">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {template.downloads} use{template.downloads === 1 ? "" : "s"}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleUseTemplate(template)}
                      disabled={isUsing}
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {isUsing ? (
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden="true" />
                      ) : (
                        <Plus className="mr-1.5 h-3 w-3" aria-hidden="true" />
                      )}
                      Use Template
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
