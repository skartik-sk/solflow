// Integration Node
// Represents a plugin integration point attached to instructions or accounts.
// Connects from Instruction (top) and out to Account (bottom).

import React, { memo } from "react";
import { Row } from "./shared-row";
import { Position, type NodeProps } from "@xyflow/react";
import { Puzzle } from "lucide-react";
import { BaseNodeShell } from "./base-node";

export interface IntegrationNodeData {
  name: string;
  pluginId: string;
  integrationId: string;
  config: Record<string, unknown>;
  description?: string;
  [key: string]: unknown;
}

export const IntegrationNode = memo(function IntegrationNode({
  data,
  selected,
}: NodeProps) {
  const d = data as IntegrationNodeData;
  const configKeys = Object.keys(d.config ?? {});

  return (
    <BaseNodeShell
      label={d.name || "Integration"}
      icon={<Puzzle size={10} />}
      accentColor="#6b7280"
      selected={selected}
      handles={[
        // ← top: receives from Instruction
        {
          id: "logic-in",
          kind: "logic-in",
          position: Position.Top,
          isTarget: true,
        },
        // → bottom: connects to Account
        {
          id: "account-out",
          kind: "account-out",
          position: Position.Bottom,
          isTarget: false,
        },
      ]}
    >
      <div className="space-y-1">
        <Row label="plugin" value={d.pluginId || "(none)"} />
        {configKeys.length > 0 && (
          <Row label="config" value={`${configKeys.length} key(s)`} />
        )}
        {d.description && (
          <span className="text-muted-foreground/50 text-[10px] line-clamp-2">
            {d.description}
          </span>
        )}
      </div>
    </BaseNodeShell>
  );
});


