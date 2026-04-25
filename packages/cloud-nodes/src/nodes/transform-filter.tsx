// Filter Transform — filters items based on a condition.

import React, { memo } from "react";
import { Filter } from "lucide-react";
import type { CloudNodeDefinition, CloudFlowNodeData } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";

// ─── Visual Component ──────────────────────────────────────────────────────

export const FilterNode = memo(function FilterNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  const field = (data.data?.field as string) || "";
  const condition = (data.data?.condition as string) || "exists";
  return (
    <CloudBaseNode data={data} selected={selected}>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground/70">field</span>
          <span className="truncate max-w-[120px] text-right font-mono">
            {field || "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground/70">when</span>
          <span className="truncate max-w-[120px] text-right font-mono">
            {condition}
          </span>
        </div>
      </div>
    </CloudBaseNode>
  );
});

// ─── Node Definition ───────────────────────────────────────────────────────

export const filterDef: CloudNodeDefinition = {
  type: "transform:filter",
  label: "Filter",
  category: "transform",
  description: "Filter items that match a condition. Non-matching items are dropped.",
  icon: "Filter",
  color: CATEGORY_COLORS.transform,
  properties: [
    {
      key: "field",
      label: "Field",
      type: "expression",
      required: true,
      description: "JSON field path to evaluate (e.g. price, status)",
      placeholder: "price",
      supportsExpressions: true,
    },
    {
      key: "condition",
      label: "Condition",
      type: "select",
      required: true,
      default: "exists",
      options: [
        { label: "Exists", value: "exists" },
        { label: "Equals", value: "equals" },
        { label: "Not Equals", value: "not_equals" },
        { label: "Greater Than", value: "gt" },
        { label: "Less Than", value: "lt" },
        { label: "Contains", value: "contains" },
      ],
    },
    {
      key: "value",
      label: "Value",
      type: "text",
      required: false,
      description: "Value to compare against (for equals, gt, lt, contains)",
      supportsExpressions: true,
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "matched" }],
  defaultData: { field: "", condition: "exists", value: "" },
  component: FilterNode,
  async execute(ctx) {
    const field = ctx.params.field as string;
    const condition = (ctx.params.condition as string) || "exists";
    const value = ctx.params.value as string;

    const inputItems = ctx.inputs?.[0] ?? [];
    const matched = inputItems.filter((item) => {
      const fieldValue = field.split(".").reduce((obj: any, key: string) => obj?.[key], item.json);
      switch (condition) {
        case "exists":
          return fieldValue !== undefined && fieldValue !== null;
        case "equals":
          return String(fieldValue) === value;
        case "not_equals":
          return String(fieldValue) !== value;
        case "gt":
          return Number(fieldValue) > Number(value);
        case "lt":
          return Number(fieldValue) < Number(value);
        case "contains":
          return String(fieldValue).includes(value);
        default:
          return true;
      }
    });

    return matched;
  },
};
