import { describe, expect, it } from "vitest";
import {
  MAX_WORKFLOW_NODES,
  parseInput,
  testDataSchema,
  workflowDefinitionSchema,
  workflowDescriptionSchema,
  workflowTagsSchema,
} from "./workflow-input";

describe("workflow input caps", () => {
  it("accepts a normal definition", () => {
    expect(workflowDefinitionSchema.safeParse({ nodes: [{ id: "a" }], edges: [] }).success).toBe(true);
  });

  it("rejects too many nodes", () => {
    const nodes = Array.from({ length: MAX_WORKFLOW_NODES + 1 }, (_, i) => ({ id: String(i) }));
    expect(workflowDefinitionSchema.safeParse({ nodes, edges: [] }).success).toBe(false);
  });

  it("rejects an oversized definition", () => {
    const big = "x".repeat(600 * 1024);
    const result = workflowDefinitionSchema.safeParse({ nodes: [{ id: "a", data: { big } }], edges: [] });
    expect(result.success).toBe(false);
  });

  it("caps description, tags and test data", () => {
    expect(workflowDescriptionSchema.safeParse("d".repeat(2_001)).success).toBe(false);
    expect(workflowTagsSchema.safeParse(Array.from({ length: 21 }, () => "t")).success).toBe(false);
    expect(workflowTagsSchema.safeParse(["t".repeat(41)]).success).toBe(false);
    expect(testDataSchema.safeParse({ blob: "x".repeat(70 * 1024) }).success).toBe(false);
  });

  it("parseInput throws a readable message", () => {
    expect(() => parseInput(workflowTagsSchema, ["t".repeat(41)], "tags")).toThrow(/^tags\.0:/);
  });
});
