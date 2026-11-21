"use client";

import { SiteHeader } from "./site-header";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Info, Menu, TriangleAlert, X } from "lucide-react";

/** SolStudio's logo, copied from the landing Nav (white linked blocks on the brand cyan). */
export function DocsMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="var(--primary)" />
      <rect x="15" y="15" width="17" height="17" rx="4.5" stroke="#fff" strokeWidth="5" />
      <path d="M23.5 32v9a5 5 0 0 0 5 5H33" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <rect x="33" y="33" width="17" height="17" rx="4.5" stroke="#fff" strokeWidth="5" />
    </svg>
  );
}

export const DOCS_NAV: { group: string; items: { title: string; href: string }[] }[] = [
  {
    group: "Get started",
    items: [
      { title: "Overview", href: "/docs" },
      { title: "Getting Started", href: "/docs/getting-started" },
    ],
  },
  {
    group: "Learn by doing",
    items: [
      { title: "All paths", href: "/docs/learn" },
      { title: "Visual Builder path", href: "/docs/learn/visual-builder" },
      { title: "CLI path", href: "/docs/learn/cli" },
      { title: "Cloud path", href: "/docs/learn/cloud" },
    ],
  },
  {
    group: "Visual Builder",
    items: [
      { title: "Visual Builder Reference", href: "/docs/visual-editor" },
      { title: "Node Reference", href: "/docs/node-reference" },
      { title: "Connection Rules", href: "/docs/connection-rules" },
      { title: "Code Generation Guide", href: "/docs/codegen-guide" },
      { title: "Flags & Constraints", href: "/docs/flags-and-constraints" },
    ],
  },
  {
    group: "CLI",
    items: [{ title: "CLI Reference", href: "/docs/cli" }],
  },
  {
    group: "Cloud",
    items: [{ title: "Cloud Platform Reference", href: "/docs/cloud" }],
  },
];

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Docs" className="space-y-6">
      {DOCS_NAV.map((g) => (
        <div key={g.group}>
          <p className="mb-1.5 px-2.5 text-[12px] font-medium text-muted-foreground/70">{g.group}</p>
          <ul className="space-y-px">
            {g.items.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`relative block rounded-lg px-2.5 py-[7px] text-[13.5px] leading-5 transition-colors duration-150 ${FOCUS} ${
                      active
                        ? "bg-white/[0.05] font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                        : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground active:bg-white/[0.06]"
                    }`}
                  >
                    {active && (
                      <span aria-hidden className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-primary" />
                    )}
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export type TocItem = { id: string; text: string; level?: 2 | 3 };

function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    const els = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-72px 0px -70% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [items]);

  return (
    <nav aria-label="On this page">
      <p className="mb-3 text-[12px] font-medium text-foreground">On this page</p>
      <ul className="space-y-px border-l border-white/[0.07]">
        {items.map((h) => {
          const on = active === h.id;
          return (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                className={`-ml-px block border-l py-1 text-[12.5px] leading-[18px] transition-colors duration-150 ${FOCUS} ${
                  h.level === 3 ? "pl-6" : "pl-3"
                } ${
                  on
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {h.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function DocsShell({
  children,
  toc,
  width = "article",
}: {
  children: ReactNode;
  toc?: TocItem[];
  /** article: a ~680px reading column. wide: room for interactive lessons. full: index pages. */
  width?: "article" | "wide" | "full";
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const col =
    width === "article" ? "max-w-[680px]" : width === "wide" ? "max-w-[780px]" : "max-w-[960px]";
  const showToc = !!toc && toc.length > 1;

  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased">
      <SiteHeader
        active="docs"
        max="max-w-[1440px]"
        leading={
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open docs menu"
            aria-expanded={open}
            aria-controls="docs-drawer"
            className={`-ml-1.5 mr-0.5 grid h-9 w-9 place-items-center rounded-[10px] text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-white/[0.05] hover:text-foreground active:scale-[0.97] lg:hidden ${FOCUS}`}
          >
            <Menu size={18} />
          </button>
        }
      />

      <div className="mx-auto flex max-w-[1440px] px-4 md:px-6">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[232px] shrink-0 overflow-y-auto border-r border-white/[0.06] py-8 pr-4 lg:block">
          <SideNav />
        </aside>

        <main className="min-w-0 flex-1 py-8 pb-24 md:py-10 lg:pl-12 xl:pr-8">
          <div className={`mx-auto break-words lg:mx-0 ${col}`}>{children}</div>
        </main>

        {showToc && (
          <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[208px] shrink-0 overflow-y-auto py-10 xl:block">
            <Toc items={toc!} />
          </aside>
        )}
      </div>

      {/* Mobile drawer */}
      <div
        id="docs-drawer"
        className={`fixed inset-0 z-[60] lg:hidden ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Docs navigation"
          className={`absolute inset-y-0 left-0 w-[288px] max-w-[85vw] overflow-y-auto border-r border-white/[0.07] bg-card px-3 pb-10 shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-14 items-center justify-between px-1.5">
            <span className="flex items-center gap-2 text-[14px] font-semibold">
              <DocsMark /> Docs
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close docs menu"
              tabIndex={open ? 0 : -1}
              className={`grid h-9 w-9 place-items-center rounded-[10px] text-muted-foreground transition-colors duration-150 hover:bg-white/[0.05] hover:text-foreground ${FOCUS}`}
            >
              <X size={18} />
            </button>
          </div>
          {open && <SideNav onNavigate={() => setOpen(false)} />}
        </div>
      </div>
    </div>
  );
}

/** Page title block for docs pages. */
export function DocsPageHead({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="mb-8">
      {eyebrow && <p className="mb-2 text-[13px] font-medium text-primary">{eyebrow}</p>}
      <h1 className="text-[30px] leading-[1.15] font-semibold tracking-[-0.03em] text-foreground md:text-[34px]">
        {title}
      </h1>
      {description && (
        <p className="mt-3 text-[15.5px] leading-[1.65] text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export function DocsCallout({
  tone = "note",
  children,
}: {
  tone?: "note" | "warn";
  children: ReactNode;
}) {
  const Icon = tone === "warn" ? TriangleAlert : Info;
  return (
    <div
      className={`my-5 flex gap-3 rounded-xl border px-4 py-3.5 text-[14.5px] leading-[1.65] ${
        tone === "warn"
          ? "border-amber-400/20 bg-amber-400/[0.05]"
          : "border-primary/20 bg-primary/[0.05]"
      }`}
    >
      <Icon
        size={16}
        aria-hidden
        className={`mt-[3px] shrink-0 ${tone === "warn" ? "text-amber-400" : "text-primary"}`}
      />
      <div className="min-w-0 text-muted-foreground [&_strong]:text-foreground">{children}</div>
    </div>
  );
}

type PagerLink = { href: string; title: string };

export function DocsPager({ prev, next }: { prev?: PagerLink; next?: PagerLink }) {
  if (!prev && !next) return null;
  const card = `group flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-white/[0.07] bg-card px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[border-color,background-color,transform] duration-150 hover:border-white/[0.14] hover:bg-popover active:scale-[0.99] ${FOCUS}`;
  return (
    <nav aria-label="Pagination" className="mt-14 flex flex-col gap-3 border-t border-white/[0.07] pt-8 sm:flex-row">
      {prev ? (
        <Link href={prev.href} className={card}>
          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <ArrowLeft size={13} className="transition-transform duration-150 group-hover:-translate-x-0.5" />
            Previous
          </span>
          <span className="truncate text-[14px] font-medium text-foreground">{prev.title}</span>
        </Link>
      ) : (
        <div className="hidden flex-1 sm:block" />
      )}
      {next ? (
        <Link href={next.href} className={`${card} items-end text-right`}>
          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            Next
            <ArrowRight size={13} className="transition-transform duration-150 group-hover:translate-x-0.5" />
          </span>
          <span className="truncate text-[14px] font-medium text-foreground">{next.title}</span>
        </Link>
      ) : (
        <div className="hidden flex-1 sm:block" />
      )}
    </nav>
  );
}

/** Prev/next across the whole sidebar order, for pages that don't define their own. */
export function pagerFor(href: string): { prev?: PagerLink; next?: PagerLink } {
  const flat = DOCS_NAV.flatMap((g) => g.items);
  const i = flat.findIndex((x) => x.href === href);
  if (i < 0) return {};
  return {
    prev: i > 0 ? { href: flat[i - 1].href, title: flat[i - 1].title } : undefined,
    next: i < flat.length - 1 ? { href: flat[i + 1].href, title: flat[i + 1].title } : undefined,
  };
}
