// Constraint Node
// Adds #[account(...)] constraints / validations to an account.
// Connects from Account (left input).

import React, { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { Shield } from "lucide-react";
import { BaseNodeShell } from "./base-node";

export type ConstraintType =
  | "signer"
  | "mut"
  | "init"
  | "init-if-needed"
  | "close"
  | "has-one"
  | "seeds"
  | "owner"
  | "address"
  | "token-authority"
  | "token-mint"
  | "realloc"
  | "custom";

export interface ConstraintNodeData {
  constraintType: ConstraintType;
  // init / init-if-needed
  payer?: string;
  space?: number | "auto";
  // close
  closeTarget?: string;
  // has-one
  hasOneField?: string;
  hasOneTarget?: string;
  hasOneErrorCode?: string;
  // seeds
  seeds?: string; // comma-separated seed expressions
  bump?: string;
  // owner
  owner?: string;
  // address
  address?: string;
  // token-authority
  tokenAuthority?: string;
  // token-mint
  tokenMint?: string;
  // realloc
  reallocSpace?: number;
  reallocPayer?: string;
  reallocZeroInit?: boolean;
  // custom
  expression?: string;
  errorCode?: string;
  [key: string]: unknown;
}

export const ConstraintNode = memo(function ConstraintNode({
  data,
  selected,
}: NodeProps) {
  const d = data as ConstraintNodeData;

  return (
    <BaseNodeShell
      label="Constraint"
      icon={<Shield size={10} />}
      accentColor="#ea580c"
      selected={selected}
      handles={[
        // ← left: receives from Account
        {
          id: "constraint-in",
          kind: "constraint-in",
          position: Position.Left,
          isTarget: true,
        },
      ]}
    >
      <div className="space-y-1">
        <Row label="type" value={d.constraintType || "mut"} mono />
        {d.constraintType === "init" || d.constraintType === "init-if-needed" ? (
          <>
            {d.payer && <Row label="payer" value={d.payer} mono />}
            <Row label="space" value={d.space !== undefined ? String(d.space) : "auto"} />
          </>
        ) : null}
        {d.constraintType === "close" && d.closeTarget && (
          <Row label="target" value={d.closeTarget} mono />
        )}
        {d.constraintType === "has-one" && d.hasOneField && (
          <Row label="field" value={d.hasOneField} mono />
        )}
        {d.constraintType === "custom" && d.expression && (
          <Row label="expr" value={d.expression} mono />
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
