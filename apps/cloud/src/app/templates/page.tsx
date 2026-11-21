"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Loader2, Minus, Plus, Search, Star } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { evaluateCloudTemplateCertification } from "@/lib/cloud-workflow-features";
import { SolMark } from "@/components/ui-kit/cloud-mark";
import { btnPrimary, btnQuiet, focusRing, inputClass, panel } from "@/components/ui-kit/cloud-ui";

type CloudTemplate = {
  id: string;
  title: string;
  description: string;
  longDescription?: string | null;
  category: string;
  tags: string[];
  nodeTypes: string[];
  settings?: Record<string, unknown>;
  downloads: number;
  featured: boolean;
};

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "https://solstudio.fun";
const WEB_EDITOR_URL = `${WEB_URL}/dashboard`;
const CLOUD_DOCS_URL = `${WEB_URL}/docs/cloud`;

function nodeLabel(type: string): string {
  const [, name = type] = type.split(":");
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Category as a coloured dot; colour is content here, not chrome. */
function categoryDot(category: string): string {
  switch (category) {
    case "DEFI":
      return "bg-sky-400";
    case "UTILITY":
      return "bg-amber-400";
    case "AI":
      return "bg-violet-400";
    case "RISK":
      return "bg-rose-400";
    default:
      return "bg-emerald-400";
  }
}

function nodeHue(type: string): string {
  const cat = type.split(":")[0];
  if (cat === "trigger") return "#4ade80";
  if (cat === "logic") return "#c084fc";
  if (cat === "output") return "#f5a524";
  if (cat === "transform") return "#58d3db";
  return "#38bdf8";
}

function TemplateSkeleton() {
  return (
    <div className={`${panel} p-4`}>
      <div className="mb-3 h-2.5 w-16 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mb-2 h-3.5 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mb-1.5 h-2.5 w-full animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
      <div className="mb-5 h-2.5 w-5/6 animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
      <div className="flex gap-1.5">
        <div className="h-6 w-20 animate-pulse rounded-md bg-muted/70 motion-reduce:animate-none" />
        <div className="h-6 w-24 animate-pulse rounded-md bg-muted/70 motion-reduce:animate-none" />
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
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-background/85 backdrop-blur-md">
        <nav className="mx-auto flex h-12 max-w-6xl items-center gap-5 px-4 sm:px-6" aria-label="Main">
          <Link href="/" className={`flex shrink-0 items-center gap-2 rounded-md text-[14px] font-semibold tracking-[-0.01em] ${focusRing}`}>
            <SolMark size={22} />
            <span>
              SolStudio <span className="font-normal text-muted-foreground">Cloud</span>
            </span>
          </Link>
          <div className="hidden items-center gap-0.5 text-[13px] md:flex">
            <Link href="/dashboard" className={`inline-flex h-8 items-center rounded-md px-2.5 text-muted-foreground transition-colors duration-150 hover:text-foreground ${focusRing}`}>Dashboard</Link>
            <a href={CLOUD_DOCS_URL} className={`inline-flex h-8 items-center rounded-md px-2.5 text-muted-foreground transition-colors duration-150 hover:text-foreground ${focusRing}`}>Docs</a>
            <a href={WEB_EDITOR_URL} className={`inline-flex h-8 items-center rounded-md px-2.5 text-muted-foreground transition-colors duration-150 hover:text-foreground ${focusRing}`}>Web Editor</a>
          </div>
          <Link href="/dashboard" className={`${btnPrimary} ml-auto h-8 px-3`}>
            Dashboard <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-14 pt-6 sm:px-6">
        <Link
          href="/"
          className={`mb-3 inline-flex h-8 items-center gap-1.5 rounded-md text-[12.5px] text-muted-foreground transition-colors hover:text-foreground ${focusRing}`}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to Cloud
        </Link>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em]">Workflow templates</h1>
            <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
              Editable templates for price alerts, DCA, portfolio reports, webhook processing, and wallet-backed token actions.
            </p>
          </div>
          <Link href="/editor/new" className={btnQuiet}>
            <Plus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            Blank workflow
          </Link>
        </div>

        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center">
          <label className="relative block md:w-[340px]">
            <span className="sr-only">Search templates</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by workflow, provider, or node"
              className={`${inputClass} pl-8`}
              type="search"
              autoComplete="off"
            />
          </label>
          <div className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0" role="group" aria-label="Category">
            {categories.map((category) => {
              const on = activeCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  aria-pressed={on}
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border px-3 text-[12.5px] font-medium capitalize transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${focusRing} ${
                    on
                      ? "border-white/[0.12] bg-white/[0.07] text-foreground"
                      : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {category !== "ALL" && <span className={`h-1.5 w-1.5 rounded-full ${categoryDot(category)}`} aria-hidden="true" />}
                  {category === "ALL" ? "All" : category.toLowerCase()}
                </button>
              );
            })}
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
          <div className={`${panel} flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between`} role="alert">
            <div>
              <p className="text-[14px] font-medium text-foreground">Templates could not be loaded.</p>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">{error.message}</p>
            </div>
            <button type="button" onClick={() => void refetch()} className={btnPrimary}>
              Retry
            </button>
          </div>
        )}

        {!isLoading && !error && filteredTemplates.length === 0 && (
          <div className={`${panel} p-8 text-center`}>
            <p className="text-[14px] font-medium">No matching templates</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Clear the search or check again after starter templates are seeded.
            </p>
          </div>
        )}

        {!isLoading && !error && filteredTemplates.length > 0 && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map((template) => {
              const isUsing = forkTemplate.isPending && forkTemplate.variables?.templateId === template.id;
              const certification = evaluateCloudTemplateCertification(template);
              const nodes = template.nodeTypes.slice(0, 4);
              return (
                <article
                  key={template.id}
                  className={`${panel} group flex flex-col p-4 transition-[border-color] duration-150 hover:border-white/[0.13]`}
                >
                  <div className="mb-2 flex items-center justify-between gap-3 text-[11.5px]">
                    <span className="inline-flex items-center gap-1.5 font-medium capitalize text-muted-foreground">
                      <span className={`h-1.5 w-1.5 rounded-full ${categoryDot(template.category)}`} aria-hidden="true" />
                      {template.category.toLowerCase()}
                    </span>
                    {template.featured && (
                      <span className="inline-flex items-center gap-1 font-medium text-primary">
                        <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                        Featured
                      </span>
                    )}
                  </div>

                  <h2 className="text-[14.5px] font-semibold tracking-[-0.01em]">{template.title}</h2>
                  <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
                    {template.longDescription || template.description}
                  </p>

                  {/* The graph's first nodes, in order, drawn as the editor's node chips */}
                  <div className="mt-3 flex flex-wrap items-center gap-y-1.5 rounded-[10px] border border-white/[0.06] bg-background px-2 py-2 bg-[radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1.2px)] bg-[length:14px_14px]">
                    {nodes.map((node, i) => (
                      <React.Fragment key={node}>
                        {i > 0 && <ChevronRight className="mx-0.5 h-3 w-3 shrink-0 text-muted-foreground/50" aria-hidden="true" />}
                        <span
                          className="inline-flex h-6 items-center rounded-md bg-popover pl-2 pr-1.5 text-[11px] text-foreground/90"
                          style={{ boxShadow: `inset 2px 0 0 ${nodeHue(node)}, 0 0 0 1px rgba(255,255,255,0.08)` }}
                        >
                          {nodeLabel(node)}
                        </span>
                      </React.Fragment>
                    ))}
                    {template.nodeTypes.length > nodes.length && (
                      <span className="ml-1.5 text-[11px] text-muted-foreground">+{template.nodeTypes.length - nodes.length}</span>
                    )}
                  </div>

                  {template.tags.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-x-2 gap-y-1">
                      {template.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="text-[11px] text-muted-foreground/80">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <ul className="mb-4 mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
                    {certification.badges.map((badge) => (
                      <li
                        key={badge.label}
                        className={`flex min-w-0 items-center gap-1.5 text-[11.5px] ${badge.passed ? "text-foreground/85" : "text-muted-foreground"}`}
                        title={badge.detail}
                      >
                        {badge.passed ? (
                          <Check className="h-3 w-3 shrink-0 text-emerald-400" aria-hidden="true" />
                        ) : (
                          <Minus className="h-3 w-3 shrink-0 text-amber-400" aria-hidden="true" />
                        )}
                        <span className="truncate">{badge.label}</span>
                        <span className="sr-only">{badge.passed ? "(passed)" : "(not yet)"}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                    <span className="text-[12px] tabular-nums text-muted-foreground">
                      {template.downloads} use{template.downloads === 1 ? "" : "s"}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleUseTemplate(template)}
                      disabled={isUsing}
                      className={`${btnPrimary} h-8 px-3`}
                    >
                      {isUsing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Use template
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
