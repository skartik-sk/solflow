// Shared styling for the visual editor chrome (top bar, panels, dialogs).
// Class strings only: no logic, so components keep their own handlers.

import React from "react";
import { twMerge } from "tailwind-merge";

/** Merge an editor class preset with overrides; later classes win on conflicts. */
export function edx(...classes: Array<string | false | null | undefined>) {
  return twMerge(classes.filter(Boolean).join(" "));
}

/** The SolStudio mark (same drawing as the landing's Nav `Mark`). */
export function EditorMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="var(--primary)" />
      <rect x="15" y="15" width="17" height="17" rx="4.5" stroke="#fff" strokeWidth="5" />
      <path d="M23.5 32v9a5 5 0 0 0 5 5H33" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <rect x="33" y="33" width="17" height="17" rx="4.5" stroke="#fff" strokeWidth="5" />
    </svg>
  );
}

const focus =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";
const motion =
  "transition-[color,background-color,box-shadow,transform,opacity] duration-150 ease-out motion-reduce:transition-none";
const press = "active:scale-[0.97] disabled:active:scale-100";

const iconBase = `inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-foreground disabled:pointer-events-none disabled:opacity-35 ${focus} ${motion} ${press}`;

/** Square icon button, 28px. */
export const edIconBtn = `${iconBase} h-7 w-7`;

/** Square icon button, 24px (inside dense rows). */
export const edIconBtnSm = `${iconBase} h-6 w-6`;

/** Quiet text button: no frame until hover. */
export const edGhostBtn = `inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-muted-foreground hover:bg-white/[0.06] hover:text-foreground disabled:pointer-events-none disabled:opacity-40 ${focus} ${motion} ${press}`;

/** Framed secondary button with the landing's hairline + top highlight. */
export const edBtn = `inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-white/[0.03] px-2.5 text-[12px] font-medium text-foreground/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_0_1px_rgba(255,255,255,0.08)] hover:bg-white/[0.07] hover:text-foreground disabled:pointer-events-none disabled:opacity-40 ${focus} ${motion} ${press}`;

/** Brand-cyan primary button. */
export const edPrimaryBtn = `inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-[#7fe0e6] disabled:pointer-events-none disabled:opacity-40 ${focus} ${motion} ${press}`;

/** Small framed chip-button used inside panels (Go to node, Copy, ...). */
export const edChipBtn = `inline-flex h-6 shrink-0 items-center gap-1 rounded-[5px] bg-white/[0.03] px-2 text-[11px] font-medium text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.08)] hover:bg-white/[0.07] hover:text-foreground disabled:pointer-events-none disabled:opacity-40 ${focus} ${motion} ${press}`;

/** Text input / select, 28px. */
export const edInput = `h-7 w-full rounded-md border border-white/[0.08] bg-background/60 px-2 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none hover:border-white/[0.14] focus:border-primary/70 focus:ring-2 focus:ring-primary/20 disabled:opacity-50 transition-[border-color,box-shadow] duration-150 ease-out`;

/** Panel section header row (36px). */
export const edPanelHeader =
  "flex h-9 shrink-0 items-center gap-2 border-b border-border px-3";

/** Small panel heading text. */
export const edPanelTitle = "text-[12px] font-semibold tracking-[-0.005em] text-foreground";

/** Field label. */
export const edLabel = "text-[11px] font-medium text-muted-foreground";

/** Keyboard hint. */
export const edKbd =
  "inline-flex h-[18px] items-center rounded-[4px] border border-white/[0.08] bg-white/[0.03] px-1 font-mono text-[10px] text-muted-foreground";

/** Dialog surface + scrim. */
export const edScrim =
  "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]";
export const edDialog =
  "w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-popover text-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_32px_80px_-24px_rgba(0,0,0,0.85)]";

/** Thin vertical divider for toolbars. */
export function EdDivider() {
  return <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-white/[0.08]" />;
}

/** Compact empty / idle state for bottom-panel tabs. */
export function EdEmptyState({
  icon,
  tone = "default",
  children,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  tone?: "default" | "success" | "error";
  children: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const toneCls =
    tone === "success"
      ? "border-green-500/20 bg-green-500/10 text-green-400"
      : tone === "error"
        ? "border-red-500/20 bg-red-500/10 text-red-400"
        : "border-white/[0.08] bg-white/[0.03] text-muted-foreground";
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
      {icon && (
        <span
          className={`mb-0.5 flex h-8 w-8 items-center justify-center rounded-[9px] border shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${toneCls}`}
        >
          {icon}
        </span>
      )}
      <p
        className={`text-[13px] ${
          tone === "success" ? "font-medium text-green-400" : tone === "error" ? "text-red-400" : "text-muted-foreground"
        }`}
      >
        {children}
      </p>
      {hint && <p className="text-[12px] text-muted-foreground/70">{hint}</p>}
      {action && <div className="mt-1 flex gap-2">{action}</div>}
    </div>
  );
}
