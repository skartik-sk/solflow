import { describe, it, expect, beforeEach } from "vitest";
import { CloudNodeRegistry } from "../src/registry";
import type { CloudNodeDefinition } from "../src/types";

const mockNode: CloudNodeDefinition = {
  type: "test:mock",
  label: "Mock Node",
  category: "action",
  description: "A mock node for testing",
  icon: "Zap",
  color: "#3b82f6",
  properties: [],
  inputs: [],
  outputs: [],
  defaultData: {},
  component: (() => null) as any,
};

describe("CloudNodeRegistry", () => {
  let registry: CloudNodeRegistry;

  beforeEach(() => {
    registry = new CloudNodeRegistry();
  });

  it("registers and retrieves a node", () => {
    registry.register(mockNode);
    expect(registry.get("test:mock")).toEqual(mockNode);
  });

  it("returns undefined for unregistered node", () => {
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("silently skips duplicate registration", () => {
    registry.register(mockNode);
    expect(() => registry.register(mockNode)).not.toThrow();
    expect(registry.getAll()).toHaveLength(1);
  });

  it("getAll returns all registered nodes", () => {
    registry.register(mockNode);
    registry.register({ ...mockNode, type: "test:mock2" });
    expect(registry.getAll()).toHaveLength(2);
  });

  it("getByCategory filters correctly", () => {
    registry.register(mockNode);
    registry.register({ ...mockNode, type: "test:trigger1", category: "trigger" });
    expect(registry.getByCategory("action")).toHaveLength(1);
    expect(registry.getByCategory("trigger")).toHaveLength(1);
    expect(registry.getByCategory("logic")).toHaveLength(0);
  });

  it("getNodeTypes returns component map", () => {
    registry.register(mockNode);
    const types = registry.getNodeTypes();
    expect(types["test:mock"]).toBeDefined();
  });

  it("has checks existence", () => {
    registry.register(mockNode);
    expect(registry.has("test:mock")).toBe(true);
    expect(registry.has("nonexistent")).toBe(false);
  });

  it("clear removes all nodes", () => {
    registry.register(mockNode);
    registry.clear();
    expect(registry.getAll()).toHaveLength(0);
  });
});
