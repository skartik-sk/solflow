import type { WorkflowItem } from "@solflow/cloud-nodes";

type ExpressionContext = WorkflowItem[][];

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function resolveExpressions(
  value: unknown,
  inputs: ExpressionContext,
): unknown {
  if (typeof value === "string") {
    return resolveString(value, inputs);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveExpressions(item, inputs));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = resolveExpressions(v, inputs);
    }
    return result;
  }
  return value;
}

function resolveString(template: string, inputs: ExpressionContext): string {
  return template.replace(/\{\{\s*(.+?)\s*\}\}/g, (_, expr: string) => {
    const trimmed = expr.trim();
    if (trimmed.startsWith("$json.")) {
      const path = trimmed.slice(6);
      const firstItem = inputs[0]?.[0]?.json;
      if (!firstItem) return "";
      const val = getNestedValue(firstItem, path);
      return val !== undefined ? String(val) : "";
    }
    return "";
  });
}
