// Account Node
// Represents an account passed to an instruction.
// Color varies by account subtype; handles connect from Instruction (top)
// and out to Constraint (right) / State (left).

import React, { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { Wallet } from "lucide-react";
import { BaseNodeShell } from "./base-node";

export type AccountType =
  | "account"
  | "system-account"
  | "signer"
  | "program"
  | "token-account"
  | "mint"
  | "associated-token"
  | "unchecked-account"
  | "system-program"
  | "token-program"
  | "rent"
  | "clock"
  | "custom";

export interface SeedDefinition {
  type: "literal" | "account-field" | "instruction-arg" | "pubkey";
  value: string;
}

export interface HasOneConstraint {
  field: string;
  target: string;
}

export interface AccountNodeData {
  name: string;
  accountType: AccountType;
  isMut?: boolean;
  isSigner?: boolean;
  isInit?: boolean;
  isClose?: boolean;
  closeTarget?: string;
  payer?: string;
  space?: number | "auto";
  seeds?: SeedDefinition[];
  description?: string;
  [key: string]: unknown;
}

// Accent colors per account subtype
const ACCOUNT_ACCENT: Partial<Record<AccountType, string>> = {
  signer: "#16a34a",
  "system-account": "#059669",
  "token-account": "#0891b2",
  mint: "#0e7490",
  "associated-token": "#0369a1",
  "system-program": "#374151",
  "token-program": "#374151",
  rent: "#374151",
  clock: "#374151",
  "unchecked-account": "#9ca3af",
  custom: "#7c3aed",
};

function accentFor(type: AccountType): string {
  return ACCOUNT_ACCENT[type] ?? "#16a34a";
}

export const AccountNode = memo(function AccountNode({
  data,
  selected,
}: NodeProps) {
  const d = data as AccountNodeData;
  const accent = accentFor(d.accountType ?? "account");

  const badges: string[] = [];
  if (d.isMut) badges.push("mut");
  if (d.isSigner) badges.push("signer");
  if (d.isInit) badges.push("init");
  if (d.isClose) badges.push("close");

  return (
    <BaseNodeShell
      label="Account"
      icon={<Wallet size={10} />}
      accentColor={accent}
      selected={selected}
      handles={[
        // ← top: receives from Instruction
        {
          id: "account-in",
          kind: "account-in",
          position: Position.Top,
          isTarget: true,
        },
        // → right: connects to Constraint nodes
        {
          id: "constraint-in",
          kind: "constraint-in",
          position: Position.Right,
          isTarget: false,
        },
        // ← left: receives from State Definition
        {
          id: "data-in",
          kind: "data-in",
          position: Position.Left,
          isTarget: true,
        },
      ]}
    >
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground/70">name</span>
          <span className="truncate max-w-[110px] text-right font-mono">
            {d.name || "account"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground/70">type</span>
          <span className="truncate max-w-[110px] text-right text-[10px]">
            {d.accountType ?? "account"}
          </span>
        </div>

        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {badges.map((b) => (
              <span
                key={b}
                className="rounded px-1 py-0.5 text-[9px] font-medium"
                style={{
                  background: `${accent}22`,
                  color: accent,
                }}
              >
                {b}
              </span>
            ))}
          </div>
        )}
      </div>
    </BaseNodeShell>
  );
});
