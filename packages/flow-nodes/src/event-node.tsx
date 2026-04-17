// Event Node
// Defines an event that can be emitted by instructions.
// Connects from Instruction (left input via event-out handle).

import React, { memo } from "react";
import { Row } from "./shared-row";
import { Position, type NodeProps } from "@xyflow/react";
import { Radio } from "lucide-react";
import { BaseNodeShell } from "./base-node";
import type { SolanaType } from "./state-node";

export interface EventField {
  name: string;
  type: SolanaType;
  description?: string;
}

export interface EventNodeData {
  name: string;          // PascalCase struct name
  fields: EventField[];
  description?: string;
  [key: string]: unknown;
}

export const EventNode = memo(function EventNode({
  data,
  selected,
}: NodeProps) {
  const d = data as EventNodeData;
  const fieldCount = d.fields?.length ?? 0;

  return (
    <BaseNodeShell
      label={d.name || "Event"}
      icon={<Radio size={10} />}
      accentColor="#eab308"
      selected={selected}
      handles={[
        // ← left: receives from Instruction
        {
          id: "event-in",
          kind: "event-in",
          position: Position.Left,
          isTarget: true,
        },
      ]}
    >
      <div className="space-y-1">
        <Row label="name" value={d.name || "MyEvent"} mono />
        <Row label="fields" value={String(fieldCount)} />
      </div>
    </BaseNodeShell>
  );
});


