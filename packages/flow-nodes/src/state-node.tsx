// State Definition Node
// Defines the data struct stored in a program-owned account.
// Connects rightward to Account nodes via a data-out handle.

import React, { memo } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import { Database } from "lucide-react";
import { BaseNodeShell } from "./base-node";

export type SolanaTypePrimitive =
  | "bool"
  | "u8" | "u16" | "u32" | "u64" | "u128"
  | "i8" | "i16" | "i32" | "i64" | "i128"
  | "f32" | "f64"
  | "String"
  | "Pubkey";

export type SolanaType =
  | SolanaTypePrimitive
  | { array: [SolanaType, number] }
  | { vec: SolanaType }
  | { option: SolanaType }
  | { defined: string }
  | { hashMap: [SolanaType, SolanaType] };

export interface StateField {
  name: string;
  type: SolanaType;
  description?: string;
  defaultValue?: string;
}

export interface StateNodeData {
  name: string;
  fields: StateField[];
  isZeroCopy?: boolean;
  customDiscriminator?: number[];
  [key: string]: unknown;
}

/** Render a SolanaType as a short readable string */
function typeLabel(t: SolanaType): string {
  if (typeof t === "string") return t;
  if ("array" in t) return `[${typeLabel(t.array[0])}; ${t.array[1]}]`;
  if ("vec" in t) return `Vec<${typeLabel(t.vec)}>`;
  if ("option" in t) return `Option<${typeLabel(t.option)}>`;
  if ("defined" in t) return t.defined;
  if ("hashMap" in t)
    return `HashMap<${typeLabel(t.hashMap[0])},${typeLabel(t.hashMap[1])}>`;
  return "?";
}

export const StateNode = memo(function StateNode({
  data,
  selected,
}: NodeProps) {
  const d = data as StateNodeData;
  const fields = d.fields ?? [];
  // Show up to 4 fields inline; rest is hidden
  const visible = fields.slice(0, 4);
  const hidden = fields.length - visible.length;

  return (
    <BaseNodeShell
      label="State"
      icon={<Database size={10} />}
      accentColor="#7c3aed"
      selected={selected}
      handles={[
        // → right: connects to Account node (data-in)
        {
          id: "data-out",
          kind: "data-out",
          position: Position.Right,
          isTarget: false,
        },
      ]}
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground/70">struct</span>
          <span className="truncate max-w-[110px] text-right font-mono">
            {d.name || "State"}
          </span>
        </div>

        {visible.length > 0 && (
          <div className="mt-1.5 space-y-0.5 border-t border-border pt-1.5">
            {visible.map((f) => (
              <div
                key={f.name}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate max-w-[80px] font-mono text-[10px]">
                  {f.name}
                </span>
                <span className="shrink-0 text-[9px] text-violet-400 font-mono">
                  {typeLabel(f.type)}
                </span>
              </div>
            ))}
            {hidden > 0 && (
              <div className="text-[9px] text-muted-foreground/60">
                +{hidden} more field{hidden === 1 ? "" : "s"}
              </div>
            )}
          </div>
        )}

        {d.isZeroCopy && (
          <div className="pt-0.5">
            <span className="rounded px-1 py-0.5 text-[9px] font-medium bg-violet-500/15 text-violet-400">
              zero_copy
            </span>
          </div>
        )}
      </div>
    </BaseNodeShell>
  );
});
