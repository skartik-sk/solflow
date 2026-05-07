// CloudBaseNode — visual shell for all cloud workflow nodes.
// Provides header with icon + label, typed connection handles, status indicator.

import React, { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodePort, NodeCategory, ConnectionType, CloudFlowNodeData } from "../types";
import { CATEGORY_COLORS, CONNECTION_COLORS } from "../types";
import { getIconByName } from "../icons";

// ─── Status badge ─────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { dot: string; bg: string }> = {
  idle:    { dot: "bg-zinc-500", bg: "" },
  running: { dot: "bg-blue-400 animate-pulse", bg: "border-blue-500/40" },
  success: { dot: "bg-emerald-400", bg: "border-emerald-500/30" },
  error:   { dot: "bg-red-400", bg: "border-red-500/30" },
  skipped: { dot: "bg-zinc-400", bg: "border-zinc-500/30" },
};

// ─── Handle position calculator ───────────────────────────────────────────

function getHandlePosition(port: NodePort, index: number, total: number, side: "left" | "right") {
  if (total <= 1) {
    return side === "left" ? Position.Left : Position.Right;
  }
  // Evenly space handles along the node side
  const spacing = 100 / (total + 1);
  return side === "left" ? Position.Left : Position.Right;
}

// ─── Props ─────────────────────────────────────────────────────────────────

export interface CloudBaseNodeProps {
  data: CloudFlowNodeData;
  selected?: boolean;
  children?: React.ReactNode;
}

// ─── CloudBaseNode ─────────────────────────────────────────────────────────

export const CloudBaseNode = memo(function CloudBaseNode({
  data,
  selected,
  children,
}: CloudBaseNodeProps) {
  const { label, icon, color, category, inputs, outputs, status } = data;
  const accentColor = color || CATEGORY_COLORS[category];
  const statusStyle = status ? STATUS_STYLES[status] : null;
  const iconEl = typeof icon === "string" ? getIconByName(icon) : icon;

  return (
    <div
      className={`
        relative min-w-[180px] max-w-[240px] rounded-xl border bg-card text-card-foreground
        shadow-lg shadow-black/30 transition-all duration-150
        ${selected ? "border-primary shadow-primary/20 shadow-xl scale-[1.02]" : "border-border hover:border-border/80"}
        ${statusStyle?.bg || ""}
      `}
      style={{ borderLeft: `3px solid ${accentColor}` } as React.CSSProperties}
    >
      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-xl border-b border-border px-3 py-2">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs"
          style={{ background: `${accentColor}22`, color: accentColor }}
        >
          {iconEl}
        </span>
        <span className="truncate text-xs font-semibold leading-none tracking-wide flex-1">
          {label}
        </span>
        {status && (
          <span className={`h-2 w-2 rounded-full shrink-0 ${statusStyle?.dot}`} />
        )}
      </div>

      {/* Body — preview of node data */}
      {children && (
        <div className="px-3 py-2 text-[11px] text-muted-foreground space-y-0.5">
          {children}
        </div>
      )}

      {/* Input Handles (left side) */}
      {inputs.map((port, i) => (
        <Handle
          key={port.label}
          id={port.label}
          type="target"
          position={Position.Left}
          style={{
            background: CONNECTION_COLORS[port.type] || CONNECTION_COLORS.main,
            border: "2px solid oklch(0.12 0.012 240)",
            width: 11,
            height: 11,
            top: `${((i + 1) / (inputs.length + 1)) * 100}%`,
            cursor: "crosshair",
          }}
          title={port.label}
        >
          <HandleLabel side="left" color={CONNECTION_COLORS[port.type]} text={port.label} />
        </Handle>
      ))}

      {/* Output Handles (right side) */}
      {outputs.map((port, i) => (
        <Handle
          key={port.label}
          id={port.label}
          type="source"
          position={Position.Right}
          style={{
            background: CONNECTION_COLORS[port.type] || CONNECTION_COLORS.main,
            border: "2px solid oklch(0.12 0.012 240)",
            width: 11,
            height: 11,
            top: `${((i + 1) / (outputs.length + 1)) * 100}%`,
            cursor: "crosshair",
          }}
          title={port.label}
        >
          <HandleLabel side="right" color={CONNECTION_COLORS[port.type]} text={port.label} />
        </Handle>
      ))}

      {/* Handle hover styles */}
      <style>{`
        .react-flow__handle:hover {
          width: 14px !important;
          height: 14px !important;
          box-shadow: 0 0 10px currentColor;
        }
        .react-flow__handle:hover .react-flow__handle-tooltip {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
});

// ─── Handle Label (tooltip on hover) ──────────────────────────────────────

function HandleLabel({ side, color, text }: { side: "left" | "right"; color: string; text: string }) {
  const posStyle: React.CSSProperties = side === "left"
    ? { left: "100%", marginLeft: 6, top: "50%", transform: "translateY(-50%)" }
    : { right: "100%", marginRight: 6, top: "50%", transform: "translateY(-50%)" };

  return (
    <span
      className="react-flow__handle-tooltip"
      style={{
        position: "absolute",
        pointerEvents: "none",
        whiteSpace: "nowrap",
        padding: "2px 6px",
        borderRadius: 4,
        fontSize: 9,
        fontWeight: 500,
        background: "oklch(0.15 0.015 240)",
        color,
        boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
        opacity: 0,
        transition: "opacity 0.15s",
        zIndex: 10,
        ...posStyle,
      }}
    >
      {text}
    </span>
  );
}
