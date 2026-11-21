"use client";

/**
 * Small shared parts for Cloud's app screens, matching the web app's finish
 * (apps/web dashboard-view.tsx): hairline borders, an inset top highlight,
 * 10px controls, 14px cards, 13px UI text and a 2px cyan focus outline.
 */

import React, { useEffect, useId } from "react";
import { X } from "lucide-react";

export const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const press = "transition-[background-color,color,transform,opacity] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

export const btnPrimary = `inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-primary px-3.5 text-[13px] font-medium text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_20px_-10px_rgba(88,211,219,0.5)] hover:bg-primary/90 ${press} ${focusRing}`;

export const btnQuiet = `inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-white/[0.08] bg-card px-3.5 text-[13px] font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:bg-accent ${press} ${focusRing}`;

export const btnGhost = `inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground ${press} ${focusRing}`;

export const iconBtn = `inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground ${press} ${focusRing}`;

export const iconBtnDanger = `inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400 ${press} ${focusRing}`;

/** Inputs are 16px on phones so iOS doesn't zoom, 13px from sm up. */
export const inputClass =
  "h-9 w-full rounded-[10px] border border-white/[0.08] bg-background px-3 text-base text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/25 disabled:opacity-60 sm:text-[13px]";

export const panel =
  "rounded-[14px] border border-white/[0.07] bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]";

/** A row inside a panel list: hairline between rows, a quiet hover. */
export const rowClass = "border-b border-white/[0.06] last:border-b-0";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHead({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex h-7 items-center justify-between gap-3">
      <h2 className="text-[13px] font-medium text-foreground">{title}</h2>
      {action}
    </div>
  );
}

type Tone = "success" | "danger" | "running" | "warning" | "neutral";

const TONE: Record<Tone, string> = {
  success: "text-emerald-400",
  danger: "text-red-400",
  running: "text-primary",
  warning: "text-amber-400",
  neutral: "text-muted-foreground",
};

export function statusTone(status: string): Tone {
  if (status === "ACTIVE" || status === "COMPLETED" || status === "SUCCESS") return "success";
  if (status === "FAILED" || status === "TIMED_OUT") return "danger";
  if (status === "RUNNING") return "running";
  if (status === "QUEUED" || status === "PAUSED") return "warning";
  return "neutral";
}

/** A status as a dot and a word, like the web dashboard's project status. */
export function StatusPill({ status, label }: { status: string; label?: string }) {
  const tone = statusTone(status);
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-white/[0.07] bg-background/60 px-2 text-[11.5px] font-medium capitalize ${TONE[tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${tone === "running" ? "animate-pulse motion-reduce:animate-none" : ""}`} aria-hidden />
      {label ?? status.toLowerCase().replace(/_/g, " ")}
    </span>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11.5px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

/** A modal shell: backdrop, Escape to close, title and footer. Content and handlers come from the page. */
export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  width = "max-w-md",
}: {
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" aria-hidden />
      <div className={`relative w-full ${width} max-h-[90vh] overflow-y-auto rounded-[16px] border border-white/[0.09] bg-popover shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_30px_80px_-20px_rgba(0,0,0,0.8)]`}>
        <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-semibold tracking-[-0.015em]">{title}</h2>
            {description && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className={`${iconBtn} -mr-1.5 -mt-0.5`} aria-label="Close">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="px-5 pb-5 pt-3">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-white/[0.07] px-5 py-3 sm:flex-row sm:justify-end">{footer}</div>
        )}
      </div>
    </div>
  );
}

/** An empty state with a product miniature on the right (or on top on phones). */
export function EmptyPanel({
  title,
  body,
  actions,
  art,
}: {
  title: string;
  body: React.ReactNode;
  actions?: React.ReactNode;
  art: React.ReactNode;
}) {
  return (
    <div className={`${panel} grid overflow-hidden md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]`}>
      <div className="flex flex-col justify-center gap-4 p-6 md:p-8">
        <div>
          <h2 className="text-[16px] font-semibold tracking-[-0.02em]">{title}</h2>
          <p className="mt-1 max-w-[34ch] text-[13px] leading-relaxed text-muted-foreground">{body}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="relative min-h-[180px] min-w-0 overflow-hidden border-t border-white/[0.07] bg-background md:border-l md:border-t-0" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1.2px)] bg-[length:18px_18px] bg-[position:9px_9px]" />
        <div className="relative flex h-full items-center p-5 sm:p-8">{art}</div>
      </div>
    </div>
  );
}

/** Skeleton rows at a list row's geometry. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  const widths = [60, 45, 70, 52, 64, 40];
  return (
    <div className={panel} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`flex h-14 items-center gap-3 px-4 ${rowClass}`}>
          <div className="h-7 w-7 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 animate-pulse rounded bg-muted motion-reduce:animate-none" style={{ width: `${widths[i % widths.length]}%` }} />
            <div className="h-2 w-24 animate-pulse rounded bg-muted/60 motion-reduce:animate-none" />
          </div>
          <div className="h-5 w-16 animate-pulse rounded-md bg-muted/60 motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

/** A mini node, drawn like the editor's: category edge, icon chip, label, mono value. For miniatures only. */
export function MiniNode({
  icon,
  label,
  value,
  color,
  state,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  color: string;
  state?: "ok" | "idle";
}) {
  return (
    <div
      className="relative w-[156px] shrink-0 rounded-[10px] bg-popover text-left shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_12px_24px_-12px_rgba(0,0,0,0.8)]"
      style={{ boxShadow: `inset 3px 0 0 ${color}, 0 0 0 1px ${state === "ok" ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.1)"}, 0 12px 24px -12px rgba(0,0,0,0.8)` }}
    >
      <div className="flex h-9 items-center gap-2 border-b border-white/[0.06] pl-3 pr-2.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-md" style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}>
          {icon}
        </span>
        <span className="truncate text-[12px] font-medium text-foreground">{label}</span>
        {state === "ok" && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />}
      </div>
      {value !== undefined && <div className="truncate px-3 py-2 font-mono text-[11px] text-muted-foreground">{value}</div>}
    </div>
  );
}

/** Node category colours (the editor's, content only). */
export const NODE_HUE = {
  trigger: "#4ade80",
  action: "#38bdf8",
  logic: "#c084fc",
  output: "#f5a524",
  transform: "#58d3db",
} as const;
