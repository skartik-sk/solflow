// Manual Trigger Node — user clicks "Run" to start the workflow.

import React, { memo } from "react";
import { Play } from "lucide-react";
import type { CloudNodeDefinition, CloudFlowNodeData } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";

// ─── Visual Component ──────────────────────────────────────────────────────

export const ManualTriggerNode = memo(function ManualTriggerNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  return (
    <CloudBaseNode data={data} selected={selected}>
      <div className="flex items-center gap-1.5 text-muted-foreground/70">
        <Play size={9} />
        <span>Click to trigger</span>
      </div>
    </CloudBaseNode>
  );
});

// ─── Node Definition ───────────────────────────────────────────────────────

export const manualTriggerDef: CloudNodeDefinition = {
  type: "trigger:manual",
  label: "Manual Trigger",
  category: "trigger",
  description: "Manually start the workflow by clicking the Run button.",
  icon: "Play",
  color: CATEGORY_COLORS.trigger,
  properties: [],
  inputs: [],
  outputs: [{ type: "main", label: "output", max: 1 }],
  defaultData: {},
  component: ManualTriggerNode,
  async execute(ctx) {
    return [{ json: { triggered: true, timestamp: Date.now() } }];
  },
};
