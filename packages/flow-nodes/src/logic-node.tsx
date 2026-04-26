// Logic Block Node
// Represents a single instruction-body operation.
// Chains vertically: logic-in (top) → logic-out (bottom).
// Can also reference accounts: account-out (right).

import React, { memo } from "react";
import { Row } from "./shared-row";
import { Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { BaseNodeShell } from "./base-node";

export type LogicType =
  | "set-field"
  | "transfer-sol"
  | "transfer-token"
  | "mint-to"
  | "burn"
  | "close-account"
  | "require"
  | "if-else"
  | "emit-event"
  | "return-error"
  | "math"
  | "cpi"
  | "custom-code";

export interface LogicNodeData {
  name?: string;
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
  emitFields?: Record<string, string>;
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
  // token operations
  transferAuthority?: string;
  mintTo?: string;
  mintAuthority?: string;
  burnMint?: string;
  burnAuthority?: string;
  // close-account
  closeAccount?: string;
  closeDestination?: string;
  closeAuthority?: string;
  // signer seeds (for PDA-signed token ops)
  useSignerSeeds?: boolean;
  signerSeeds?: Array<{ type: "literal" | "account-field" | "instruction-arg" | "pubkey"; value: string }>;
  // custom-code
  customCode?: string;
  customInputs?: string[];
  customOutputs?: string[];
  [key: string]: unknown;
}

const LOGIC_LABELS: Record<LogicType, string> = {
  "set-field":      "Set Field",
  "transfer-sol":   "Transfer SOL",
  "transfer-token": "Transfer Token",
  "mint-to":        "Mint To",
  "burn":           "Burn",
  "close-account":  "Close Account",
  "require":        "Require",
  "if-else":        "If / Else",
  "emit-event":     "Emit Event",
  "return-error":   "Return Error",
  "math":           "Math",
  "cpi":            "CPI",
  "custom-code":    "Custom Code",
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
      label={d.name || label}
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
        {ltype === "transfer-sol" && (
          <>
            {d.transferFrom && <Row label="from" value={d.transferFrom} mono />}
            {d.transferTo && <Row label="to" value={d.transferTo} mono />}
            {d.transferAmount && <Row label="amt" value={`${d.transferAmount} lamports`} mono />}
          </>
        )}
        {ltype === "transfer-token" && (
          <>
            {d.transferFrom && <Row label="from" value={d.transferFrom} mono />}
            {d.transferTo && <Row label="to" value={d.transferTo} mono />}
            {d.transferAmount && <Row label="amt" value={d.transferAmount} mono />}
          </>
        )}
        {ltype === "mint-to" && (
          <>
            {d.mintTo && <Row label="mint" value={d.mintTo} mono />}
            {d.transferTo && <Row label="to" value={d.transferTo} mono />}
            {d.transferAmount && <Row label="amt" value={d.transferAmount} mono />}
          </>
        )}
        {ltype === "burn" && (
          <>
            {d.burnMint && <Row label="mint" value={d.burnMint} mono />}
            {d.transferFrom && <Row label="from" value={d.transferFrom} mono />}
            {d.transferAmount && <Row label="amt" value={d.transferAmount} mono />}
          </>
        )}
        {ltype === "close-account" && (
          <>
            {d.closeAccount && <Row label="acct" value={d.closeAccount} mono />}
            {d.closeDestination && <Row label="dest" value={d.closeDestination} mono />}
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
        {ltype === "return-error" && d.returnErrorCode && (
          <Row label="err" value={d.returnErrorCode} mono />
        )}
        {ltype === "math" && (
          <Row
            label="expr"
            value={`${d.mathLeft ?? "a"} ${d.mathOperation ?? "+"} ${d.mathRight ?? "b"} → ${d.mathResult ?? "out"}`}
            mono
          />
        )}
        {ltype === "cpi" && (
          <>
            {d.cpiProgram && <Row label="prog" value={d.cpiProgram} mono />}
            {d.cpiInstruction && <Row label="ix" value={d.cpiInstruction} mono />}
          </>
        )}
      </div>
    </BaseNodeShell>
  );
});


