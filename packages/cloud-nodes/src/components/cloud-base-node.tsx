// CloudBaseNode — visual shell for all cloud workflow nodes.
// Provides header with icon + label, typed connection handles, status indicator.

import React, { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodePort, NodeCategory, ConnectionType, CloudFlowNodeData } from "../types";
import { CATEGORY_COLORS, CONNECTION_COLORS } from "../types";
import { getIconByName } from "../icons";

// ─── Status badge ─────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { dot: string; bg: string }> = {
  idle:    { dot: "bg-white/25", bg: "" },
  running: { dot: "bg-primary animate-pulse motion-reduce:animate-none", bg: "border-primary/50" },
  success: { dot: "bg-green-400", bg: "border-green-500/30" },
  error:   { dot: "bg-red-400", bg: "border-red-500/35" },
  skipped: { dot: "bg-white/30", bg: "border-white/[0.06] opacity-70" },
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
        relative min-w-[180px] max-w-[240px] rounded-xl border bg-popover text-card-foreground
        shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_24px_-12px_rgba(0,0,0,0.7)]
        transition-[border-color,box-shadow,opacity] duration-150 ease-out
        ${selected ? "border-primary/70 ring-1 ring-primary/40" : "border-white/[0.1] hover:border-white/[0.18]"}
        ${statusStyle?.bg || ""}
      `}
      style={{ borderLeft: `3px solid ${accentColor}` } as React.CSSProperties}
    >
      {/* Header */}
      <div className="flex h-10 items-center gap-2.5 rounded-t-xl border-b border-white/[0.07] px-3">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-xs"
          style={{ background: `${accentColor}24`, color: accentColor }}
        >
          {iconEl}
        </span>
        <span className="flex-1 truncate text-[13px] font-medium leading-none tracking-[-0.005em]">
          {label}
        </span>
        {status && (
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusStyle?.dot}`} />
        )}
      </div>

      {/* Body — preview of node data */}
      {children && (
        <div className="space-y-0.5 overflow-hidden px-3 py-2 font-mono text-[11.5px] text-muted-foreground [&>*]:truncate">
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
