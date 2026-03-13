// Logic Block Node
// Represents a single instruction-body operation.
// Chains vertically: logic-in (top) → logic-out (bottom).
// Can also reference accounts: account-out (right).

import React, { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { BaseNodeShell } from "./base-node";

export type LogicType =
  | "set-field"
  | "transfer-sol"
  | "transfer-token"
  | "mint-to"
  | "burn"
  | "require"
  | "if-else"
  | "emit-event"
  | "return-error"
  | "math"
  | "cpi";

export interface LogicNodeData {
  logicType: LogicType;
  // set-field
  setAccount?: string;
  setField?: string;
  setValue?: string;
  // transfer-sol
  transferFrom?: string;
  transferTo?: string;
  transferAmount?: string;
  // require
  requireCondition?: string;
  requireErrorCode?: string;
  // if-else
  ifCondition?: string;
  // emit-event
  emitEvent?: string;
  // return-error
  returnErrorCode?: string;
  // math
  mathLeft?: string;
  mathRight?: string;
  mathResult?: string;
  mathOperation?: "add" | "sub" | "mul" | "div" | "mod";
  mathChecked?: boolean;
  // cpi
  cpiProgram?: string;
  cpiInstruction?: string;
  [key: string]: unknown;
}

const LOGIC_LABELS: Record<LogicType, string> = {
  "set-field":      "Set Field",
  "transfer-sol":   "Transfer SOL",
  "transfer-token": "Transfer Token",
  "mint-to":        "Mint To",
  "burn":           "Burn",
  "require":        "Require",
  "if-else":        "If / Else",
  "emit-event":     "Emit Event",
  "return-error":   "Return Error",
  "math":           "Math",
  "cpi":            "CPI",
};

export const LogicNode = memo(function LogicNode({
  data,
  selected,
}: NodeProps) {
  const d = data as LogicNodeData;
  const ltype = d.logicType ?? "set-field";
  const label = LOGIC_LABELS[ltype] ?? ltype;

  return (
    <BaseNodeShell
      label="Logic"
      icon={<GitBranch size={10} />}
      accentColor="#0d9488"
      selected={selected}
      handles={[
        // ↑ top: receives from previous logic / instruction
        {
          id: "logic-in",
          kind: "logic-in",
          position: Position.Top,
          isTarget: true,
        },
        // ↓ bottom: connects to next logic block
        {
          id: "logic-out",
          kind: "logic-out",
          position: Position.Bottom,
          isTarget: false,
        },
        // → right: reference accounts
        {
          id: "account-out",
          kind: "account-out",
          position: Position.Right,
          isTarget: false,
        },
      ]}
    >
      <div className="space-y-1">
        <Row label="op" value={label} mono />
        {ltype === "set-field" && (
          <>
            {d.setAccount && <Row label="acct" value={d.setAccount} mono />}
            {d.setField && <Row label="field" value={d.setField} mono />}
          </>
        )}
        {ltype === "require" && d.requireCondition && (
          <Row label="cond" value={d.requireCondition} mono />
        )}
        {ltype === "if-else" && d.ifCondition && (
          <Row label="if" value={d.ifCondition} mono />
        )}
        {ltype === "emit-event" && d.emitEvent && (
          <Row label="event" value={d.emitEvent} mono />
        )}
        {ltype === "math" && (
          <Row
            label="expr"
            value={`${d.mathLeft ?? "a"} ${d.mathOperation ?? "+"} ${d.mathRight ?? "b"}`}
            mono
          />
        )}
        {ltype === "cpi" && d.cpiProgram && (
          <Row label="prog" value={d.cpiProgram} mono />
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
