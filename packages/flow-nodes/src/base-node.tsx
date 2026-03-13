// Base node component shared by all SolFlow node types.
// Provides the outer shell: header with icon + label, handles, selection ring.

import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@solflow/ui/lib/utils";

// ─── Handle type tokens ──────────────────────────────────────────────

export type HandleKind =
  | "instruction-in"
  | "instruction-out"
  | "account-in"
  | "account-out"
  | "data-in"
  | "data-out"
  | "constraint-in"
  | "logic-in"
  | "logic-out"
  | "event-out"
  | "error-out";

// Color per handle kind (matches the node accent colors)
const HANDLE_COLORS: Record<HandleKind, string> = {
  "instruction-in":  "#2563eb",
  "instruction-out": "#2563eb",
  "account-in":      "#16a34a",
  "account-out":     "#16a34a",
  "data-in":         "#7c3aed",
  "data-out":        "#7c3aed",
  "constraint-in":   "#ea580c",
  "logic-in":        "#0d9488",
  "logic-out":       "#0d9488",
  "event-out":       "#eab308",
  "error-out":       "#dc2626",
};

export interface HandleDef {
  id: string;
  kind: HandleKind;
  position: Position;
  /** If true this is a target handle (receives connections), else source */
  isTarget?: boolean;
  style?: React.CSSProperties;
}

// ─── BaseNodeShell props ─────────────────────────────────────────────

interface BaseNodeShellProps {
  /** Node label shown in the header */
  label: string;
  /** Icon rendered in the header badge */
  icon: React.ReactNode;
  /** Accent color for the left border + icon badge (hex) */
  accentColor: string;
  /** Handle definitions */
  handles: HandleDef[];
  /** Whether this node is currently selected */
  selected?: boolean;
  /** Optional extra className on the outer wrapper */
  className?: string;
  children?: React.ReactNode;
}

/**
 * BaseNodeShell — the chrome around every flow node.
 *
 * Layout:
 *   ┌──────────────────────────────────────┐
 *   │ [icon] label                         │  ← header
 *   ├──────────────────────────────────────┤
 *   │  {children}  (node-specific body)    │  ← body
 *   └──────────────────────────────────────┘
 *
 * Handles are rendered as React Flow <Handle> elements.
 */
export const BaseNodeShell = memo(function BaseNodeShell({
  label,
  icon,
  accentColor,
  handles,
  selected,
  className,
  children,
}: BaseNodeShellProps) {
  return (
    <div
      className={cn(
        "relative min-w-[200px] rounded-xl border bg-card text-card-foreground shadow-lg shadow-black/30 transition-shadow",
        selected
          ? "border-primary shadow-primary/20 shadow-xl"
          : "border-border hover:border-border/80",
        className
      )}
      style={
        {
          "--node-accent": accentColor,
          borderLeft: `3px solid ${accentColor}`,
        } as React.CSSProperties
      }
    >
      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-xl border-b border-border px-3 py-2">
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px]"
          style={{ background: `${accentColor}22`, color: accentColor }}
        >
          {icon}
        </span>
        <span className="truncate text-xs font-semibold leading-none tracking-wide">
          {label}
        </span>
      </div>

      {/* Body */}
      {children && (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          {children}
        </div>
      )}

      {/* Handles */}
      {handles.map((h) => (
        <Handle
          key={h.id}
          id={h.id}
          type={h.isTarget ? "target" : "source"}
          position={h.position}
          style={{
            background: HANDLE_COLORS[h.kind],
            border: "2px solid oklch(0.12 0.012 240)",
            width: 10,
            height: 10,
            ...h.style,
          }}
        />
      ))}
    </div>
  );
});
