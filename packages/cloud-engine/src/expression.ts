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

function stringifyExpressionValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
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

function resolveString(template: string, inputs: ExpressionContext): unknown {
  const expressionMatches = Array.from(template.matchAll(/\{\{\s*(.+?)\s*\}\}/g));
  const wholeExpression = expressionMatches.length === 1 && expressionMatches[0][0] === template
    ? expressionMatches[0]
    : null;
  if (wholeExpression) {
    const value = evaluateExpression(wholeExpression[1].trim(), inputs);
    return value === undefined ? "" : value;
  }

  return template.replace(/\{\{\s*(.+?)\s*\}\}/g, (_, expr: string) =>
    stringifyExpressionValue(evaluateExpression(expr.trim(), inputs))
  );
}

function evaluateExpression(expr: string, inputs: ExpressionContext): unknown {
  if (expr === "$now") return new Date().toISOString();

  if (expr === "$json") {
    return inputs[0]?.[0]?.json;
  }

  if (expr.startsWith("$json.")) {
    const firstItem = inputs[0]?.[0]?.json;
    if (!firstItem) return "";
    return getNestedValue(firstItem, expr.slice(6));
  }

  const inputMatch = expr.match(/^\$input\[(\d+)\]\.json(?:\.(.+))?$/);
  if (inputMatch) {
    const inputIndex = Number(inputMatch[1]);
    const item = inputs[inputIndex]?.[0]?.json;
    if (!item) return "";
    const path = inputMatch[2];
    return path ? getNestedValue(item, path) : item;
  }

  return "";
}
