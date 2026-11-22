import { describe, it, expect } from "bun:test";
import { createNodeFromType, newNodeId } from "../index";

describe("node ids", () => {
  it("are unique across many creations and keep a readable type prefix", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(createNodeFromType("logic", { x: 0, y: 0 }).id);
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id.startsWith("logic-")).toBe(true);
  });

  it("don't collide with ids a saved flow already uses (the old counter restarted at 1 per page load)", () => {
    const saved = ["logic-1", "logic-2", "account-1", "instruction-1"];
    const fresh = [createNodeFromType("logic", { x: 0, y: 0 }).id, createNodeFromType("account", { x: 0, y: 0 }).id, createNodeFromType("instruction", { x: 0, y: 0 }).id];
    for (const id of fresh) expect(saved).not.toContain(id);
  });

  it("newNodeId works for plugin prefixes too", () => {
    expect(newNodeId("jupiter:swap")).toMatch(/^jupiter:swap-[0-9a-f-]{36}$/);
  });
});
