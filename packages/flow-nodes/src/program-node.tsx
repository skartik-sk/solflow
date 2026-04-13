// Program Root Node
// The top-level node — exactly one per flow.
// Connects downward to Instruction nodes.

import React, { memo } from "react";
import { Row } from "./shared-row";
import { Position, type NodeProps } from "@xyflow/react";
import { Code2 } from "lucide-react";
import { BaseNodeShell } from "./base-node";

export interface ProgramNodeData {
  name: string;
  description?: string;
  version: string;
  programId?: string;
  license?: string;
  [key: string]: unknown;
}

export const ProgramNode = memo(function ProgramNode({
  data,
  selected,
}: NodeProps) {
  const d = data as ProgramNodeData;

  return (
    <BaseNodeShell
      label={d.name || "Program Root"}
      icon={<Code2 size={10} />}
      accentColor="#4a47a3"
      selected={selected}
      handles={[
        {
          id: "instruction-out",
          kind: "instruction-out",
          position: Position.Bottom,
          isTarget: false,
        },
      ]}
    >
      <div className="space-y-1">
        <Row label="name" value={d.name || "my_program"} mono />
        {d.version && <Row label="version" value={d.version} />}
        {d.programId && (
          <Row
            label="id"
            value={`${d.programId.slice(0, 8)}…`}
            mono
          />
        )}
      </div>
    </BaseNodeShell>
  );
});
