// If/Else Logic Node — routes items to true or false output based on condition.

import React, { memo } from "react";
import { GitBranch } from "lucide-react";
import type { CloudNodeDefinition, CloudFlowNodeData } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";

// ─── Visual Component ──────────────────────────────────────────────────────

export const IfElseNode = memo(function IfElseNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  const condition = (data.data?.condition as string) || "";
  return (
    <CloudBaseNode data={data} selected={selected}>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground/70">if</span>
          <span className="truncate max-w-[120px] text-right font-mono text-[10px]">
            {condition || "—"}
          </span>
        </div>
      </div>
    </CloudBaseNode>
  );
});

// ─── Node Definition ───────────────────────────────────────────────────────

export const ifElseDef: CloudNodeDefinition = {
  type: "logic:if-else",
  label: "If / Else",
  category: "logic",
  description: "Branch workflow based on a condition. True items go to 'true' output, others to 'false'.",
  icon: "GitBranch",
  color: CATEGORY_COLORS.logic,
  properties: [
    {
      key: "field",
      label: "Field",
      type: "expression",
      required: true,
      description: "JSON field path to evaluate",
      placeholder: "price",
      supportsExpressions: true,
    },
    {
      key: "operator",
      label: "Operator",
      type: "select",
      required: true,
      default: "gt",
      options: [
        { label: "Equals", value: "eq" },
        { label: "Not Equals", value: "neq" },
        { label: "Greater Than", value: "gt" },
        { label: "Less Than", value: "lt" },
        { label: "Greater or Equal", value: "gte" },
        { label: "Less or Equal", value: "lte" },
        { label: "Is Truthy", value: "truthy" },
        { label: "Is Falsy", value: "falsy" },
      ],
    },
    {
      key: "value",
      label: "Compare Value",
      type: "text",
      required: false,
      description: "Value to compare against",
      supportsExpressions: true,
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [
    { type: "main", label: "true" },
    { type: "main", label: "false" },
  ],
  defaultData: { field: "", operator: "gt", value: "" },
  component: IfElseNode,
  async execute(ctx) {
    const field = ctx.params.field as string;
    const operator = (ctx.params.operator as string) || "truthy";
    const value = ctx.params.value as string;

    const inputItems = ctx.inputs?.[0] ?? [];
    const trueItems: typeof inputItems = [];
    const falseItems: typeof inputItems = [];

    for (const item of inputItems) {
      const fieldValue = field.split(".").reduce((obj: any, key: string) => obj?.[key], item.json);
      let result = false;

      switch (operator) {
        case "eq":
          result = String(fieldValue) === value;
          break;
        case "neq":
          result = String(fieldValue) !== value;
          break;
        case "gt":
          result = Number(fieldValue) > Number(value);
          break;
        case "lt":
          result = Number(fieldValue) < Number(value);
          break;
        case "gte":
          result = Number(fieldValue) >= Number(value);
          break;
        case "lte":
          result = Number(fieldValue) <= Number(value);
          break;
        case "truthy":
          result = !!fieldValue;
          break;
        case "falsy":
          result = !fieldValue;
          break;
      }

      if (result) {
        trueItems.push(item);
      } else {
        falseItems.push(item);
      }
    }

    // Return as two output arrays: [true_output, false_output]
    // The executor maps outputs by index to the node's output ports
    return [trueItems, falseItems] as any;
  },
};
