// Instruction Node
// Represents a single instruction handler in the program.
// Connects from Program (top) → Account (right), Logic (bottom), Error/Event (left).

import React, { memo } from "react";
import { Row } from "./shared-row";
import { Position, type NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";
import { BaseNodeShell } from "./base-node";
import type { SolanaType } from "./state-node";

export interface InstructionField {
  name: string;
  type: SolanaType;
  description?: string;
}

export interface InstructionNodeData {
  name: string;
  description?: string;
  instructionData?: InstructionField[];
  accessControl?: "none" | "admin_only" | "custom";
  [key: string]: unknown;
}

export const InstructionNode = memo(function InstructionNode({
  data,
  selected,
}: NodeProps) {
  const d = data as InstructionNodeData;
  const argCount = d.instructionData?.length ?? 0;

  return (
    <BaseNodeShell
      label={d.name || "Instruction"}
      icon={<Zap size={10} />}
      accentColor="#2563eb"
      selected={selected}
      handles={[
        // ← top: receives from Program
        {
          id: "instruction-in",
          kind: "instruction-in",
          position: Position.Top,
          isTarget: true,
        },
        // → right: connects to Account nodes
        {
          id: "account-out",
          kind: "account-out",
          position: Position.Right,
          isTarget: false,
          style: { top: "38%" },
        },
        // ↓ bottom: connects to Logic nodes
        {
          id: "logic-out",
          kind: "logic-out",
          position: Position.Bottom,
          isTarget: false,
        },
        // ← left top: connects to Error nodes
        {
          id: "error-out",
          kind: "error-out",
          position: Position.Left,
          isTarget: false,
          style: { top: "38%" },
        },
        // ← left bottom: connects to Event nodes
        {
          id: "event-out",
          kind: "event-out",
          position: Position.Left,
          isTarget: false,
          style: { top: "62%" },
        },
      ]}
    >
      <div className="space-y-1">
        <Row label="fn" value={d.name || "instruction"} mono />
        {argCount > 0 && (
          <Row label="args" value={String(argCount)} />
        )}
        {d.accessControl && d.accessControl !== "none" && (
          <Row label="access" value={d.accessControl} />
        )}
      </div>
    </BaseNodeShell>
  );
});
