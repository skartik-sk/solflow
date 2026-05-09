// Display Output Nodes — capture run-visible output without sending HTTP.

import React, { memo } from "react";
import type {
  CloudFlowNodeData,
  CloudNodeDefinition,
  NodeExecutionContext,
  WorkflowItem,
} from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";

type LogLevel = "info" | "warn" | "error";

function inputItems(ctx: NodeExecutionContext): WorkflowItem[] {
  return ctx.inputs?.[0]?.length ? ctx.inputs[0] : [{ json: {} }];
}

function fallbackValue(ctx: NodeExecutionContext): unknown {
  const items = ctx.inputs?.[0] ?? [];
  if (items.length === 0) return {};
  if (items.length === 1) return items[0].json;
  return items.map((item) => item.json);
}

function configuredValue(ctx: NodeExecutionContext, key = "value"): unknown {
  const value = ctx.params[key];
  if (value === undefined || value === null || value === "") {
    return fallbackValue(ctx);
  }
  return value;
}

function logLevel(value: unknown): LogLevel {
  return value === "warn" || value === "error" ? value : "info";
}

function stringifyForLog(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function visualValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "input";
  if (typeof value === "string") return value.slice(0, 24);
  return "JSON";
}

function DisplayOutputNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  const title = String(data.data?.title || data.data?.name || data.label);
  const value = data.data?.value ?? data.data?.message;

  return (
    <CloudBaseNode data={data} selected={selected}>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-muted-foreground/70">{title}</span>
          <span className="max-w-[90px] truncate text-right font-mono text-[10px]">
            {visualValue(value)}
          </span>
        </div>
      </div>
    </CloudBaseNode>
  );
}

export const OutputDisplayNode = memo(DisplayOutputNode);

export const outputDisplayDef: CloudNodeDefinition = {
  type: "output:display",
  label: "Display Output",
  category: "output",
  description:
    "Show a value in the run output without calling an external service.",
  icon: "FileJson",
  color: CATEGORY_COLORS.output,
  properties: [
    {
      key: "title",
      label: "Title",
      type: "text",
      required: false,
      default: "Display",
      description: "Label shown with this output in run results.",
    },
    {
      key: "value",
      label: "Value",
      type: "expression",
      required: false,
      placeholder: "{{ $json }}",
      supportsExpressions: true,
      description: "Value to display. Empty uses the incoming item JSON.",
    },
    {
      key: "format",
      label: "Format",
      type: "select",
      required: false,
      default: "auto",
      options: [
        { label: "Auto", value: "auto" },
        { label: "JSON", value: "json" },
        { label: "Text", value: "text" },
        { label: "Markdown", value: "markdown" },
      ],
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "display" }],
  defaultData: {
    title: "Display",
    value: "{{ $json }}",
    format: "auto",
  },
  component: OutputDisplayNode,
  async execute(ctx) {
    const title = String(ctx.params.title || "Display");
    const format = String(ctx.params.format || "auto");
    const value = configuredValue(ctx);
    const display = {
      title,
      format,
      value,
      timestamp: new Date().toISOString(),
    };

    ctx.logger.info(`Display output captured: ${title}`, display);

    return inputItems(ctx).map((item) => ({
      ...item,
      json: {
        ...item.json,
        display,
      },
    }));
  },
};

export const outputLogDef: CloudNodeDefinition = {
  type: "output:log",
  label: "Run Log",
  category: "output",
  description: "Write a workflow value into the run logs and node result.",
  icon: "Activity",
  color: CATEGORY_COLORS.output,
  properties: [
    {
      key: "level",
      label: "Level",
      type: "select",
      required: false,
      default: "info",
      options: [
        { label: "Info", value: "info" },
        { label: "Warning", value: "warn" },
        { label: "Error", value: "error" },
      ],
    },
    {
      key: "message",
      label: "Message",
      type: "expression",
      required: false,
      placeholder: "Price is {{ $json.price }}",
      supportsExpressions: true,
      description: "Message or value to record in the run logs.",
    },
    {
      key: "includeInput",
      label: "Include input JSON",
      type: "boolean",
      required: false,
      default: true,
      description: "Keep incoming data in the node output snapshot.",
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "log" }],
  defaultData: {
    level: "info",
    message: "{{ $json }}",
    includeInput: true,
  },
  component: memo(function OutputLogNode(props: {
    data: CloudFlowNodeData;
    selected?: boolean;
  }) {
    return <DisplayOutputNode {...props} />;
  }),
  async execute(ctx) {
    const level = logLevel(ctx.params.level);
    const messageValue = configuredValue(ctx, "message");
    const message = stringifyForLog(messageValue);
    const log = {
      level,
      message: messageValue,
      timestamp: new Date().toISOString(),
    };

    ctx.logger[level](`Run log: ${message}`, log);

    const includeInput = ctx.params.includeInput !== false;
    return inputItems(ctx).map((item) => ({
      ...item,
      json: includeInput ? { ...item.json, log } : { log },
    }));
  },
};

export const outputResultDef: CloudNodeDefinition = {
  type: "output:result",
  label: "Workflow Result",
  category: "output",
  description:
    "Mark a final run result that is easy to inspect in the output panel.",
  icon: "FileJson",
  color: CATEGORY_COLORS.output,
  properties: [
    {
      key: "name",
      label: "Name",
      type: "text",
      required: false,
      default: "Result",
      description: "Result label shown in node output.",
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      required: false,
      default: "success",
      options: [
        { label: "Success", value: "success" },
        { label: "Info", value: "info" },
        { label: "Warning", value: "warning" },
        { label: "Error", value: "error" },
      ],
    },
    {
      key: "value",
      label: "Value",
      type: "expression",
      required: false,
      placeholder: "{{ $json }}",
      supportsExpressions: true,
      description: "Final result payload. Empty uses the incoming item JSON.",
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "result" }],
  defaultData: {
    name: "Result",
    status: "success",
    value: "{{ $json }}",
  },
  component: memo(function OutputResultNode(props: {
    data: CloudFlowNodeData;
    selected?: boolean;
  }) {
    return <DisplayOutputNode {...props} />;
  }),
  async execute(ctx) {
    const result = {
      name: String(ctx.params.name || "Result"),
      status: String(ctx.params.status || "success"),
      value: configuredValue(ctx),
      timestamp: new Date().toISOString(),
    };

    ctx.logger.info(`Workflow result captured: ${result.name}`, result);

    return inputItems(ctx).map((item) => ({
      ...item,
      json: {
        ...item.json,
        result,
      },
    }));
  },
};
