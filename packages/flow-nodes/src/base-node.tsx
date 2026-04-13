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
  | "constraint-out"
  | "logic-in"
  | "logic-out"
  | "event-in"
  | "event-out"
  | "error-in"
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
  "constraint-out":  "#ea580c",
  "logic-in":        "#0d9488",
  "logic-out":       "#0d9488",
  "event-in":        "#eab308",
  "event-out":       "#eab308",
  "error-in":        "#dc2626",
  "error-out":       "#dc2626",
};

// Tooltip labels for each handle kind
const HANDLE_LABELS: Record<HandleKind, string> = {
  "instruction-in":  "Instruction input — connect from Program",
  "instruction-out": "Instruction output — drag to an Instruction",
  "account-in":      "Account input — connect from Instruction or Logic",
  "account-out":     "Account output — drag to Account",
  "data-in":         "Data input — connect from State",
  "data-out":        "Data output — drag to Account",
  "constraint-in":   "Constraint input — connect from Account",
  "constraint-out":  "Constraint output — drag to Constraint",
  "logic-in":        "Logic input — connect from Instruction or Logic",
  "logic-out":       "Logic output — drag to Logic, Custom Code, or Account",
  "event-in":        "Event input — connect from Instruction",
  "event-out":       "Event output — drag to Event",
  "error-in":        "Error input — connect from Instruction",
  "error-out":       "Error output — drag to Error",
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

      {/* Handles with hover tooltips */}
      {handles.map((h) => {
        const color = HANDLE_COLORS[h.kind];
        const label = h.kind.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        // Tooltip position: away from the node center
        const labelStyle: React.CSSProperties =
          h.position === Position.Left
            ? { left: "100%", marginLeft: 8, top: "50%", transform: "translateY(-50%)" }
            : h.position === Position.Right
              ? { right: "100%", marginRight: 8, top: "50%", transform: "translateY(-50%)" }
              : h.position === Position.Top
                ? { top: "auto", bottom: "100%", marginBottom: 6, left: "50%", transform: "translateX(-50%)" }
                : { bottom: "auto", top: "100%", marginTop: 6, left: "50%", transform: "translateX(-50%)" };

        return (
          <Handle
            key={h.id}
            id={h.id}
            type={h.isTarget ? "target" : "source"}
            position={h.position}
            title={HANDLE_LABELS[h.kind]}
            style={{
              background: color,
              border: "2px solid oklch(0.12 0.012 240)",
              width: 12,
              height: 12,
              cursor: "crosshair",
              ...h.style,
            }}
          >
            <span
              className="react-flow__handle-tooltip"
              style={{
                position: "absolute",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 500,
                background: "oklch(0.15 0.015 240)",
                color,
                boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                opacity: 0,
                transition: "opacity 0.15s",
                zIndex: 10,
                ...labelStyle,
              }}
            >
              {label}
            </span>
          </Handle>
        );
      })}

      {/* Handle hover styles — injected once per node */}
      <style>{`
        .react-flow__handle:hover {
          width: 16px !important;
          height: 16px !important;
          box-shadow: 0 0 10px currentColor;
        }
        .react-flow__handle:hover .react-flow__handle-tooltip {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
});
