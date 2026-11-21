// Shared, presentational parts for the marketplace and share pages.
// No data fetching or handlers here: header, logo, graph thumbnail, badges.

import React from "react";
import Link from "next/link";
import { SiteHeader, type SiteSection } from "@/components/ui-kit/site-header";
import { User } from "lucide-react";

/** The real SolStudio logo (same drawing as the landing Nav's Mark). */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="var(--primary)" />
      <rect x="15" y="15" width="17" height="17" rx="4.5" stroke="#fff" strokeWidth="5" />
      <path d="M23.5 32v9a5 5 0 0 0 5 5H33" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <rect x="33" y="33" width="17" height="17" rx="4.5" stroke="#fff" strokeWidth="5" />
    </svg>
  );
}

export const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export const btnGhost = `inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-white/[0.05] hover:text-foreground active:scale-[0.97] ${focusRing}`;

export const btnOutline = `inline-flex h-8 items-center justify-center gap-1.5 rounded-[10px] border border-white/[0.08] bg-card px-3 text-[13px] font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[background-color,border-color,transform] duration-150 ease-out hover:border-white/[0.14] hover:bg-secondary active:scale-[0.97] ${focusRing}`;

export const btnPrimary = `inline-flex h-8 items-center justify-center gap-1.5 rounded-[10px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-[filter,transform] duration-150 ease-out hover:brightness-110 active:scale-[0.97] ${focusRing}`;

export const panel =
  "rounded-[16px] border border-white/[0.07] bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]";

type Crumb = { label: string; href?: string };

/** The site header (components/ui-kit/site-header) plus a slim breadcrumb row for nested pages. */
export function MarketHeader({
  crumbs = [],
  children,
  max = "max-w-[1200px]",
  active = "templates",
}: {
  crumbs?: Crumb[];
  children?: React.ReactNode;
  max?: string;
  active?: SiteSection | null;
}) {
  return (
    <>
      <SiteHeader active={active ?? undefined} inApp max={max} actions={children} />
      {crumbs.length > 1 && (
        <nav aria-label="Breadcrumb" className="border-b border-white/[0.05]">
          <ol className={`mx-auto flex h-10 ${max} min-w-0 items-center gap-2 px-4 text-[12.5px] sm:px-6`}>
            {crumbs.map((c, i) => (
              <li key={i} className="flex min-w-0 items-center gap-2">
                {i > 0 && <span aria-hidden className="text-white/20">/</span>}
                {c.href ? (
                  <Link href={c.href} className={`truncate rounded-md text-muted-foreground transition-colors duration-150 hover:text-foreground ${focusRing}`}>
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="truncate font-medium text-foreground">{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
    </>
  );
}

const FRAMEWORK_LABEL: Record<string, string> = {
  ANCHOR: "Anchor",
  PINOCCHIO: "Pinocchio",
  QUASAR: "Quasar",
};

export function frameworkLabel(fw: string | null | undefined) {
  if (!fw) return "Anchor";
  return FRAMEWORK_LABEL[fw.toUpperCase()] ?? fw;
}

export function FrameworkBadge({ framework, className = "" }: { framework: string; className?: string }) {
  return (
    <span
      className={`inline-flex h-5 items-center rounded-md border border-white/[0.08] bg-background/85 px-1.5 font-mono text-[10.5px] font-medium text-foreground/90 backdrop-blur-sm ${className}`}
    >
      {frameworkLabel(framework)}
    </span>
  );
}

export function Chip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "ok" | "warn" | "bad";
  className?: string;
}) {
  const tones = {
    neutral: "border-white/[0.08] bg-white/[0.03] text-muted-foreground",
    brand: "border-primary/25 bg-primary/10 text-primary",
    ok: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    warn: "border-amber-400/20 bg-amber-400/10 text-amber-300",
    bad: "border-red-400/20 bg-red-400/10 text-red-300",
  } as const;
  return (
    <span
      className={`inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-[11px] font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function AuthorAvatar({
  name,
  image,
  size = 18,
}: {
  name: string | null;
  image: string | null;
  size?: number;
}) {
  if (image) {
    return (
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full ring-1 ring-white/10"
        style={{ width: size, height: size }}
      />
    );
  }
  const initial = name?.trim()?.[0]?.toUpperCase();
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground ring-1 ring-white/10"
      style={{ width: size, height: size }}
    >
      {initial ?? <User className="h-3 w-3" />}
    </span>
  );
}

/* ── Graph thumbnail ─────────────────────────────────────────────────────── */

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A wordless node-graph drawing in the style of the landing's template cards:
 * program, instructions, their accounts, state and errors. The shape is
 * derived from `seed` so each listing keeps the same drawing; it is
 * illustrative, not the listing's exact graph.
 */
export function GraphThumb({ seed, className = "" }: { seed: string; className?: string }) {
  const h = hash(seed);
  const ix = 2 + (h % 4); // 2..5 instructions
  const acc = Array.from({ length: ix }, (_, i) => 1 + ((h >> (i * 3 + 4)) % 2)); // 1..2 accounts drawn
  const state = 1 + ((h >> 20) % 2);
  const err = 1 + ((h >> 22) % 3);

  const W = 240;
  const H = 128;
  const top = 16;
  const ixGap = (H - top * 2) / ix;
  const ixY = Array.from({ length: ix }, (_, i) => top + ixGap * i + ixGap / 2);
  const prog = { x: 28, y: H / 2 - 10, w: 40, h: 20 };
  const ixX = 100;
  const ixW = 50;
  const accX = 178;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      className={`mk-graph block h-full w-full ${className}`}
    >
      <g fill="none" className="mk-edge">
        {ixY.map((y, i) => (
          <path
            key={`p${i}`}
            d={`M${prog.x + prog.w} ${H / 2}C${(prog.x + prog.w + ixX) / 2} ${H / 2} ${(prog.x + prog.w + ixX) / 2} ${y} ${ixX} ${y}`}
          />
        ))}
        {ixY.map((y, i) =>
          Array.from({ length: acc[i] }, (_, k) => {
            const ay = y + (k - (acc[i] - 1) / 2) * 9;
            return (
              <path key={`a${i}${k}`} d={`M${ixX + ixW} ${y}C${ixX + ixW + 12} ${y} ${accX - 12} ${ay} ${accX} ${ay}`} />
            );
          }),
        )}
      </g>
      <rect className="mk-n mk-program" x={prog.x} y={prog.y} width={prog.w} height={prog.h} rx={5} />
      {ixY.map((y, i) => (
        <rect key={i} className="mk-n mk-ix" x={ixX} y={y - 5.5} width={ixW} height={11} rx={3.5} />
      ))}
      {ixY.map((y, i) =>
        Array.from({ length: acc[i] }, (_, k) => {
          const ay = y + (k - (acc[i] - 1) / 2) * 9;
          return <rect key={`${i}${k}`} className="mk-n mk-acc" x={accX} y={ay - 3} width={16} height={6} rx={2.5} />;
        }),
      )}
      {Array.from({ length: state }, (_, i) => (
        <rect key={`s${i}`} className="mk-n mk-state" x={208} y={top + 2 + i * 11} width={14} height={7} rx={2.5} />
      ))}
      {Array.from({ length: err }, (_, i) => (
        <circle key={`e${i}`} className="mk-n mk-err" cx={215} cy={H - top - 2 - i * 10} r={2.8} />
      ))}
    </svg>
  );
}

/**
 * Styles for GraphThumb: grey at rest, the editor's node colours when the
 * nearest `.group` is hovered or focused (or when `data-lit` is set).
 */
export function GraphThumbStyles() {
  return (
    <style>{`
.mk-graph .mk-edge path{stroke:rgba(255,255,255,.12);stroke-width:1;transition:stroke .2s ease-out}
.mk-graph .mk-n{fill:rgba(255,255,255,.15);transition:fill .2s ease-out}
.mk-graph .mk-program{fill:rgba(255,255,255,.24)}
.group:hover .mk-graph .mk-edge path,.group:focus-visible .mk-graph .mk-edge path,[data-lit] .mk-graph .mk-edge path{stroke:rgba(255,255,255,.22)}
.group:hover .mk-graph .mk-program,.group:focus-visible .mk-graph .mk-program,[data-lit] .mk-graph .mk-program{fill:#8b8cf8}
.group:hover .mk-graph .mk-ix,.group:focus-visible .mk-graph .mk-ix,[data-lit] .mk-graph .mk-ix{fill:#38bdf8}
.group:hover .mk-graph .mk-acc,.group:focus-visible .mk-graph .mk-acc,[data-lit] .mk-graph .mk-acc{fill:#4ade80}
.group:hover .mk-graph .mk-state,.group:focus-visible .mk-graph .mk-state,[data-lit] .mk-graph .mk-state{fill:#f5a524}
.group:hover .mk-graph .mk-err,.group:focus-visible .mk-graph .mk-err,[data-lit] .mk-graph .mk-err{fill:#f05252}
.mk-dots{background-color:var(--background);background-image:radial-gradient(rgba(255,255,255,.06) 1px,transparent 1.2px);background-size:12px 12px}
@media (prefers-reduced-motion: reduce){.mk-graph *{transition:none!important}}
`}</style>
  );
}
