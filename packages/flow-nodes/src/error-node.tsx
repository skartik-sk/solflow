// Error Definition Node
// Defines a custom program error variant.
// Connects from Instruction (left input via error-out handle).

import React, { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle } from "lucide-react";
import { BaseNodeShell } from "./base-node";

export interface ErrorNodeData {
  name: string;    // PascalCase enum variant name
  code: number;    // Error code (6000+)
  message: string; // Human-readable message
  [key: string]: unknown;
}

export const ErrorNode = memo(function ErrorNode({
  data,
  selected,
}: NodeProps) {
  const d = data as ErrorNodeData;

  return (
    <BaseNodeShell
      label="Error"
      icon={<AlertTriangle size={10} />}
      accentColor="#dc2626"
      selected={selected}
      handles={[
        // ← left: receives from Instruction
        {
          id: "error-in",
          kind: "error-out",
          position: Position.Left,
          isTarget: true,
        },
      ]}
    >
      <div className="space-y-1">
        <Row label="name" value={d.name || "MyError"} mono />
        <Row label="code" value={String(d.code ?? 6000)} />
        {d.message && (
          <Row label="msg" value={d.message} />
        )}
      </div>
    </BaseNodeShell>
  );
});

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground/70">{label}</span>
      <span
        className={`truncate max-w-[120px] text-right ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
