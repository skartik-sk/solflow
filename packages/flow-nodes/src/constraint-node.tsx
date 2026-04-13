// Constraint Node
// Adds #[account(...)] constraints / validations to an account.
// Connects from Account (left input).

import React, { memo } from "react";
import { Row } from "./shared-row";
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
  name?: string;
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
      label={d.name || d.constraintType || "Constraint"}
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
        {(d.constraintType === "init" || d.constraintType === "init-if-needed") && (
          <>
            {d.payer && <Row label="payer" value={d.payer} mono />}
            <Row label="space" value={d.space !== undefined ? String(d.space) : "auto"} />
          </>
        )}
        {d.constraintType === "close" && d.closeTarget && (
          <Row label="target" value={d.closeTarget} mono />
        )}
        {d.constraintType === "has-one" && (
          <>
            {d.hasOneField && <Row label="field" value={d.hasOneField} mono />}
            {d.hasOneTarget && <Row label="has" value={d.hasOneTarget} mono />}
          </>
        )}
        {d.constraintType === "seeds" && d.seeds && (
          <Row label="seeds" value={d.seeds} mono />
        )}
        {d.constraintType === "owner" && d.owner && (
          <Row label="owner" value={d.owner} mono />
        )}
        {d.constraintType === "address" && d.address && (
          <Row label="addr" value={d.address} mono />
        )}
        {d.constraintType === "token-authority" && d.tokenAuthority && (
          <Row label="auth" value={d.tokenAuthority} mono />
        )}
        {d.constraintType === "token-mint" && d.tokenMint && (
          <Row label="mint" value={d.tokenMint} mono />
        )}
        {d.constraintType === "realloc" && (
          <>
            <Row label="space" value={String(d.reallocSpace ?? 0)} mono />
            {d.reallocPayer && <Row label="payer" value={d.reallocPayer} mono />}
            <Row label="zero" value={d.reallocZeroInit ? "yes" : "no"} />
          </>
        )}
        {d.constraintType === "custom" && d.expression && (
          <Row label="expr" value={d.expression} mono />
        )}
      </div>
    </BaseNodeShell>
  );
});


