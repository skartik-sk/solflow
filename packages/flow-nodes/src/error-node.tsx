// Error Definition Node
// Defines a custom program error variant.
// Connects from Instruction (left input via error-out handle).

import React, { memo } from "react";
import { Row } from "./shared-row";
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
      label={d.name || "Error"}
      icon={<AlertTriangle size={10} />}
      accentColor="#dc2626"
      selected={selected}
      handles={[
        // ← left: receives from Instruction
        {
          id: "error-in",
          kind: "error-in",
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


