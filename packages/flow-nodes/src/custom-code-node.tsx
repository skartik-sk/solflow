// Custom Code Block Node
// Allows users to inject arbitrary Rust logic into an instruction body.
// The full Monaco editor is shown in the Properties Panel when selected.

import React, { memo } from "react";
import { Row } from "./shared-row";
import { Position, type NodeProps } from "@xyflow/react";
import { Terminal } from "lucide-react";
import { BaseNodeShell } from "./base-node";

export interface CustomCodeNodeData {
  name?: string;
  code: string;
  inputs: string[];   // account/variable names this code reads
  outputs: string[];  // variable names this code produces
  description?: string;
  [key: string]: unknown;
}

export const CustomCodeNode = memo(function CustomCodeNode({
  data,
  selected,
}: NodeProps) {
  const d = data as CustomCodeNodeData;
  const lineCount = (d.code ?? "").split("\n").filter(Boolean).length;

  return (
    <BaseNodeShell
      label={d.name || "Rust Block"}
      icon={<Terminal size={10} />}
      accentColor="#374151"
      selected={selected}
      handles={[
        // ↑ top: receives from logic / instruction
        {
          id: "logic-in",
          kind: "logic-in",
          position: Position.Top,
          isTarget: true,
        },
        // ↓ bottom: connects to next logic
        {
          id: "logic-out",
          kind: "logic-out",
          position: Position.Bottom,
          isTarget: false,
        },
        // ← left: receives variable/account bindings
        {
          id: "data-in",
          kind: "data-in",
          position: Position.Left,
          isTarget: true,
        },
        // → right: produces variable bindings
        {
          id: "data-out",
          kind: "data-out",
          position: Position.Right,
          isTarget: false,
        },
      ]}
    >
      <div className="space-y-1">
        {lineCount > 0 ? (
          <Row label="lines" value={String(lineCount)} />
        ) : (
          <span className="text-muted-foreground/50 italic text-[10px]">
            click to edit code
          </span>
        )}
        {d.inputs.length > 0 && (
          <Row label="inputs" value={d.inputs.join(", ")} />
        )}
        {d.outputs.length > 0 && (
          <Row label="outputs" value={d.outputs.join(", ")} />
        )}
      </div>
    </BaseNodeShell>
  );
});


