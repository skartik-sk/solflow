import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseString, parseFile, parseProgram } from "../index";

const FIXTURES_DIR = join(__dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf-8");
}

// ─── Counter program tests ───────────────────────────────────────────

describe("parseString — anchor-counter.rs", () => {
  const src = readFixture("anchor-counter.rs");
  const result = parseString(src);

  it("detects program name", () => {
    expect(result.programName).toBe("counter");
  });

  it("parses instructions", () => {
    expect(result.instructions).toHaveLength(2);
    expect(result.instructions[0].name).toBe("create");
    expect(result.instructions[1].name).toBe("increment");
  });

  it("parses instruction args from Context generic", () => {
    // create has no extra args
    expect(result.instructions[0].args).toHaveLength(0);
  });

  it("parses account structs", () => {
    expect(result.accountStructs).toHaveProperty("Create");
    expect(result.accountStructs).toHaveProperty("Increment");
  });

  it("parses account fields", () => {
    const createAccounts = result.accountStructs["Create"];
    expect(createAccounts).toHaveLength(3);

    const counter = createAccounts.find((a) => a.name === "counter");
    expect(counter).toBeDefined();
    expect(counter!.isInit).toBe(true);
    expect(counter!.constraints.some((c) => c.type === "init")).toBe(true);

    const user = createAccounts.find((a) => a.name === "user");
    expect(user).toBeDefined();
    expect(user!.isSigner).toBe(true);
    expect(user!.isMut).toBe(true);
  });

  it("parses state structs", () => {
    expect(result.states).toHaveLength(1);
    expect(result.states[0].name).toBe("Counter");
    expect(result.states[0].fields).toHaveLength(1);
    expect(result.states[0].fields[0].name).toBe("count");
  });

  it("parses errors", () => {
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].name).toBe("Overflow");
    expect(result.errors[0].message).toBe("The counter has overflowed");
    expect(result.errors[1].name).toBe("Underflow");
  });

  it("parses events", () => {
    expect(result.events).toHaveLength(1);
    expect(result.events[0].name).toBe("CounterIncremented");
    expect(result.events[0].fields).toHaveLength(1);
    expect(result.events[0].fields[0].name).toBe("new_count");
  });
});

// ─── Marketplace program tests ───────────────────────────────────────

describe("parseString — anchor-marketplace.rs", () => {
  const src = readFixture("anchor-marketplace.rs");
  const result = parseString(src);

  it("detects program name", () => {
    expect(result.programName).toBe("marketplace");
  });

  it("parses 4 instructions", () => {
    expect(result.instructions).toHaveLength(4);
    const names = result.instructions.map((ix) => ix.name);
    expect(names).toContain("initialize");
    expect(names).toContain("list");
    expect(names).toContain("purchase");
    expect(names).toContain("delist");
  });

  it("parses instruction args", () => {
    const init = result.instructions.find((ix) => ix.name === "initialize");
    expect(init).toBeDefined();
    // initialize has fee: u64 extra arg
    expect(init!.args).toHaveLength(1);
    expect(init!.args[0].name).toBe("fee");

    const listIx = result.instructions.find((ix) => ix.name === "list");
    expect(listIx).toBeDefined();
    expect(listIx!.args).toHaveLength(1);
    expect(listIx!.args[0].name).toBe("price");
  });

  it("parses state structs", () => {
    expect(result.states).toHaveLength(2);
    const names = result.states.map((s) => s.name);
    expect(names).toContain("Marketplace");
    expect(names).toContain("Listing");
  });

  it("parses Marketplace state fields", () => {
    const marketplace = result.states.find((s) => s.name === "Marketplace");
    expect(marketplace).toBeDefined();
    expect(marketplace!.fields).toHaveLength(3);
    expect(marketplace!.fields.map((f) => f.name)).toEqual(["admin", "fee", "bump"]);
  });

  it("parses errors", () => {
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].name).toBe("InvalidPrice");
    expect(result.errors[1].name).toBe("Unauthorized");
  });

  it("parses events", () => {
    expect(result.events).toHaveLength(2);
    const names = result.events.map((e) => e.name);
    expect(names).toContain("ItemListed");
    expect(names).toContain("ItemSold");
  });

  it("parses logic operations for initialize", () => {
    const init = result.instructions.find((ix) => ix.name === "initialize");
    expect(init).toBeDefined();
    expect(init!.logicOps.length).toBeGreaterThan(0);

    // Should contain set-field operations
    const setFields = init!.logicOps.filter((op) => op.type === "set-field");
    expect(setFields.length).toBeGreaterThanOrEqual(2);
  });

  it("parses require! in list instruction", () => {
    const listIx = result.instructions.find((ix) => ix.name === "list");
    expect(listIx).toBeDefined();

    const requires = listIx!.logicOps.filter((op) => op.type === "require");
    expect(requires.length).toBeGreaterThanOrEqual(1);
  });

  it("parses emit! in list instruction", () => {
    const listIx = result.instructions.find((ix) => ix.name === "list");
    expect(listIx).toBeDefined();

    const emits = listIx!.logicOps.filter((op) => op.type === "emit-event");
    expect(emits.length).toBeGreaterThanOrEqual(1);
  });

  it("parses math operations in purchase", () => {
    const purchase = result.instructions.find((ix) => ix.name === "purchase");
    expect(purchase).toBeDefined();

    const mathOps = purchase!.logicOps.filter((op) => op.type === "math");
    expect(mathOps.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── To-flow conversion tests ────────────────────────────────────────

describe("parseFile — to-flow conversion", () => {
  it("produces valid ReactFlow nodes and edges for counter", () => {
    const result = parseFile(join(FIXTURES_DIR, "anchor-counter.rs"));

    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.edges.length).toBeGreaterThan(0);

    // Should have a program node
    const programNodes = result.nodes.filter((n) => n.type === "program");
    expect(programNodes).toHaveLength(1);
    expect(programNodes[0].data.name).toBe("counter");

    // Should have instruction nodes
    const ixNodes = result.nodes.filter((n) => n.type === "instruction");
    expect(ixNodes).toHaveLength(2);

    // Should have account nodes
    const accNodes = result.nodes.filter((n) => n.type === "account");
    expect(accNodes.length).toBeGreaterThanOrEqual(3);

    // Should have state nodes
    const stateNodes = result.nodes.filter((n) => n.type === "state");
    expect(stateNodes).toHaveLength(1);

    // Should have error nodes
    const errorNodes = result.nodes.filter((n) => n.type === "error");
    expect(errorNodes).toHaveLength(2);

    // Should have event nodes
    const eventNodes = result.nodes.filter((n) => n.type === "event");
    expect(eventNodes).toHaveLength(1);

    // Stats
    expect(result.stats.instructions).toBe(2);
    expect(result.stats.states).toBe(1);
    expect(result.stats.errors).toBe(2);
    expect(result.stats.events).toBe(1);
  });

  it("produces logic nodes for marketplace", () => {
    const result = parseFile(join(FIXTURES_DIR, "anchor-marketplace.rs"));

    const logicNodes = result.nodes.filter((n) => n.type === "logic");
    expect(logicNodes.length).toBeGreaterThan(0);

    expect(result.stats.logicOps).toBeGreaterThan(0);
  });

  it("has valid edges connecting nodes", () => {
    const result = parseFile(join(FIXTURES_DIR, "anchor-counter.rs"));

    // All edge source/target IDs should reference existing nodes
    const nodeIds = new Set(result.nodes.map((n) => n.id));
    for (const edge of result.edges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
  });
});
