// Cron Trigger Node — fires the workflow on a cron schedule.

import React, { memo } from "react";
import { Clock } from "lucide-react";
import type { CloudNodeDefinition, CloudFlowNodeData } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";

// ─── Visual Component ──────────────────────────────────────────────────────

export const CronTriggerNode = memo(function CronTriggerNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  const cron = (data.data?.cronExpression as string) || "* * * * *";
  const tz = (data.data?.timezone as string) || "UTC";

  return (
    <CloudBaseNode data={data} selected={selected}>
      <div className="flex flex-col gap-0.5 text-muted-foreground/70">
        <div className="flex items-center gap-1.5">
          <Clock size={9} />
          <code className="text-[10px] font-mono">{cron}</code>
        </div>
        <span className="text-[10px]">({tz})</span>
      </div>
    </CloudBaseNode>
  );
});

// ─── Node Definition ───────────────────────────────────────────────────────

export const cronTriggerDef: CloudNodeDefinition = {
  type: "trigger:cron",
  label: "Cron Trigger",
  category: "trigger",
  description: "Start the workflow on a recurring schedule using a cron expression.",
  icon: "Clock",
  color: CATEGORY_COLORS.trigger,
  properties: [
    {
      key: "cronExpression",
      label: "Cron Expression",
      type: "text",
      required: true,
      description: "Standard 5-field cron expression (e.g. */5 * * * *)",
      placeholder: "*/5 * * * *",
      default: "*/5 * * * *",
    },
    {
      key: "timezone",
      label: "Timezone",
      type: "select",
      required: false,
      description: "Timezone for the cron schedule",
      default: "UTC",
      options: [
        { label: "UTC", value: "UTC" },
        { label: "US/Eastern", value: "America/New_York" },
        { label: "US/Pacific", value: "America/Los_Angeles" },
        { label: "Europe/London", value: "Europe/London" },
        { label: "Asia/Tokyo", value: "Asia/Tokyo" },
        { label: "Asia/Kolkata", value: "Asia/Kolkata" },
      ],
    },
  ],
  inputs: [],
  outputs: [{ type: "main", label: "output", max: 1 }],
  defaultData: {
    cronExpression: "*/5 * * * *",
    timezone: "UTC",
  },
  component: CronTriggerNode,
  async execute(ctx) {
    return [
      {
        json: {
          triggered: true,
          triggerType: "cron",
          cronExpression: ctx.params.cronExpression,
          timestamp: Date.now(),
        },
      },
    ];
  },
};
