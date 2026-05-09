// Wait Logic Node — pauses execution for a specified duration.

import React, { memo } from "react";
import { Timer } from "lucide-react";
import type { CloudNodeDefinition, CloudFlowNodeData } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";

const MAX_WAIT_MS = 5 * 60 * 1000;

function abortMessage(signal: AbortSignal): string {
  if (signal.reason instanceof Error) return signal.reason.message;
  if (typeof signal.reason === "string") return signal.reason;
  return "Wait aborted";
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error(abortMessage(signal)));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new Error(abortMessage(signal)));
      },
      { once: true },
    );
  });
}

// ─── Visual Component ──────────────────────────────────────────────────────

export const WaitNode = memo(function WaitNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  const duration = (data.data?.duration as number) || 1;
  const unit = (data.data?.unit as string) || "seconds";

  return (
    <CloudBaseNode data={data} selected={selected}>
      <div className="flex items-center gap-1.5 text-muted-foreground/70">
        <Timer size={9} />
        <span className="font-mono text-[10px]">
          {duration} {unit}
        </span>
      </div>
    </CloudBaseNode>
  );
});

// ─── Node Definition ───────────────────────────────────────────────────────

export const waitDef: CloudNodeDefinition = {
  type: "logic:wait",
  label: "Wait",
  category: "logic",
  description: "Pause workflow execution for a specified duration.",
  icon: "Timer",
  color: CATEGORY_COLORS.logic,
  properties: [
    {
      key: "duration",
      label: "Duration",
      type: "number",
      required: true,
      default: 1,
      description: "How long to wait",
    },
    {
      key: "unit",
      label: "Unit",
      type: "select",
      required: true,
      default: "seconds",
      options: [
        { label: "Seconds", value: "seconds" },
        { label: "Minutes", value: "minutes" },
        { label: "Hours", value: "hours" },
      ],
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "output" }],
  defaultData: { duration: 1, unit: "seconds" },
  component: WaitNode,
  async execute(ctx) {
    const duration = Number(ctx.params.duration) || 1;
    const unit = (ctx.params.unit as string) || "seconds";

    let ms = duration * 1000;
    if (unit === "minutes") ms = duration * 60 * 1000;
    if (unit === "hours") ms = duration * 3600 * 1000;

    // Cap waits so one node cannot hold a production worker forever.
    const requestedMs = ms;
    ms = Math.min(ms, MAX_WAIT_MS);
    if (requestedMs !== ms) {
      ctx.logger.warn("Wait duration capped for worker safety", {
        requestedMs,
        cappedMs: ms,
      });
    }

    await sleep(ms, ctx.signal);

    const inputItems = ctx.inputs?.[0] ?? [];
    return inputItems.length > 0
      ? inputItems
      : [{ json: { waited: true, duration, unit, timestamp: Date.now() } }];
  },
};
