// Shared input limits for workflows, used by tRPC and the CLI API so both
// enforce the same caps. Pure — safe to unit test.

import { z } from "zod";

export const MAX_WORKFLOW_DEFINITION_BYTES = 512 * 1024;
export const MAX_WORKFLOW_NODES = 300;
export const MAX_WORKFLOW_EDGES = 1_000;
export const MAX_WORKFLOW_SETTINGS_BYTES = 64 * 1024;
export const MAX_TEST_DATA_BYTES = 64 * 1024;

function jsonBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function maxJsonBytes(limit: number, label: string) {
  return (value: unknown, ctx: z.RefinementCtx) => {
    if (jsonBytes(value) > limit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} is too large (max ${Math.round(limit / 1024)} KB)`,
      });
    }
  };
}

export const workflowNameSchema = z.string().trim().min(1).max(100);
export const workflowDescriptionSchema = z.string().max(2_000);
export const workflowTagsSchema = z.array(z.string().trim().min(1).max(40)).max(20);

export const workflowDefinitionSchema = z
  .object({
    nodes: z.array(z.any()).max(MAX_WORKFLOW_NODES),
    edges: z.array(z.any()).max(MAX_WORKFLOW_EDGES),
  })
  .superRefine(maxJsonBytes(MAX_WORKFLOW_DEFINITION_BYTES, "Workflow definition"));

export const workflowSettingsSchema = z
  .any()
  .superRefine(maxJsonBytes(MAX_WORKFLOW_SETTINGS_BYTES, "Workflow settings"));

export const testDataSchema = z
  .any()
  .superRefine(maxJsonBytes(MAX_TEST_DATA_BYTES, "Test data"));

/** Parse with a schema and throw a plain Error with a readable message (CLI API). */
export function parseInput<T>(schema: z.ZodType<T>, value: unknown, field: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.length ? `${field}.${issue.path.join(".")}` : field;
    throw new Error(`${path}: ${issue?.message ?? "invalid value"}`);
  }
  return result.data;
}
