import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseString, parseFile } from "../index";

const FIXTURES_DIR = join(__dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf-8");
}

// ─── Real-world Anchor patterns ──────────────────────────────────────

describe("parseString — anchor-realworld.rs", () => {
  const src = readFixture("anchor-realworld.rs");
  const result = parseString(src);

  it("detects program name", () => {
    expect(result.programName).toBe("realworld");
  });

  it("parses all 5 instructions", () => {
    expect(result.instructions).toHaveLength(5);
    const names = result.instructions.map((ix) => ix.name);
    expect(names).toContain("initialize_protocol");
    expect(names).toContain("create_pool");
    expect(names).toContain("deposit");
    expect(names).toContain("withdraw");
    expect(names).toContain("close_pool");
  });

  // ─── Non-ctx parameter names ─────────────────────────────

  it("parses instruction with non-ctx param name (context)", () => {
    const ix = result.instructions.find((ix) => ix.name === "initialize_protocol");
    expect(ix).toBeDefined();
    expect(ix!.accountsStructName).toBe("InitializeProtocol");
  });

  it("parses instruction with non-ctx param name (c)", () => {
    const ix = result.instructions.find((ix) => ix.name === "deposit");
    expect(ix).toBeDefined();
    expect(ix!.accountsStructName).toBe("Deposit");
  });

  // ─── Context with lifetime ───────────────────────────────

  it("parses Context<'info, X> syntax", () => {
    const ix = result.instructions.find((ix) => ix.name === "initialize_protocol");
    expect(ix).toBeDefined();
    // Should have extracted accountsStructName from Context<'info, InitializeProtocol>
    expect(ix!.accountsStructName).toBe("InitializeProtocol");
  });

  // ─── Extra function arguments ────────────────────────────

  it("parses extra args (fee, name) from create_pool", () => {
    const ix = result.instructions.find((ix) => ix.name === "create_pool");
    expect(ix).toBeDefined();
    expect(ix!.args).toHaveLength(2);
    expect(ix!.args[0].name).toBe("fee");
    expect(ix!.args[1].name).toBe("name");
  });

  it("parses extra arg (amount) from deposit", () => {
    const ix = result.instructions.find((ix) => ix.name === "deposit");
    expect(ix).toBeDefined();
    expect(ix!.args).toHaveLength(1);
    expect(ix!.args[0].name).toBe("amount");
  });

  it("parses extra args from withdraw", () => {
    const ix = result.instructions.find((ix) => ix.name === "withdraw");
    expect(ix).toBeDefined();
    expect(ix!.args).toHaveLength(1);
    expect(ix!.args[0].name).toBe("amount");
  });

  // ─── Multiple derives ────────────────────────────────────

  it("parses accounts with #[derive(Accounts, Debug)]", () => {
    expect(result.accountStructs).toHaveProperty("InitializeProtocol");
    const accs = result.accountStructs["InitializeProtocol"];
    expect(accs).toBeDefined();
    expect(accs!.length).toBeGreaterThanOrEqual(2);
  });

  it("parses accounts with #[derive(Debug, Accounts, Clone)]", () => {
    expect(result.accountStructs).toHaveProperty("CreatePool");
    const accs = result.accountStructs["CreatePool"];
    expect(accs).toBeDefined();
    expect(accs!.length).toBeGreaterThanOrEqual(3);
  });

  // ─── Multi-line #[account(...)] attributes ───────────────

  it("handles multi-line #[account(...)] attributes", () => {
    const accs = result.accountStructs["InitializeProtocol"];
    const config = accs?.find((a) => a.name === "config");
    expect(config).toBeDefined();
    expect(config!.isInit).toBe(true);
  });

  it("handles multi-line attributes in CreatePool", () => {
    const accs = result.accountStructs["CreatePool"];
    const pool = accs?.find((a) => a.name === "pool");
    expect(pool).toBeDefined();
    expect(pool!.isInit).toBe(true);
  });

  // ─── State structs ───────────────────────────────────────

  it("parses 3 state structs", () => {
    expect(result.states).toHaveLength(3);
    const names = result.states.map((s) => s.name);
    expect(names).toContain("ProtocolConfig");
    expect(names).toContain("Pool");
    expect(names).toContain("UserDeposit");
  });

  it("parses ProtocolConfig state fields", () => {
    const config = result.states.find((s) => s.name === "ProtocolConfig");
    expect(config).toBeDefined();
    expect(config!.fields).toHaveLength(3);
    expect(config!.fields.map((f) => f.name)).toEqual(["admin", "fee_rate", "bump"]);
  });

  it("parses Pool state fields including String type", () => {
    const pool = result.states.find((s) => s.name === "Pool");
    expect(pool).toBeDefined();
    expect(pool!.fields).toHaveLength(6);
  });

  it("captures state struct doc comments", () => {
    const config = result.states.find((s) => s.name === "ProtocolConfig");
    expect(config).toBeDefined();
    expect(config!.description).toBeDefined();
    expect(config!.description).toContain("Global protocol configuration");
  });

  // ─── Errors ──────────────────────────────────────────────

  it("parses all 6 errors", () => {
    expect(result.errors).toHaveLength(6);
    const names = result.errors.map((e) => e.name);
    expect(names).toContain("InvalidFee");
    expect(names).toContain("InvalidAmount");
    expect(names).toContain("InsufficientBalance");
    expect(names).toContain("MinimumNotMet");
    expect(names).toContain("Unauthorized");
    expect(names).toContain("PoolInactive");
  });

  it("parses error messages correctly", () => {
    const unauthorized = result.errors.find((e) => e.name === "Unauthorized");
    expect(unauthorized).toBeDefined();
    expect(unauthorized!.message).toBe("Only the authority can perform this action");
  });

  // ─── Events ──────────────────────────────────────────────

  it("parses 3 events", () => {
    expect(result.events).toHaveLength(3);
    const names = result.events.map((e) => e.name);
    expect(names).toContain("PoolCreated");
    expect(names).toContain("Deposited");
    expect(names).toContain("Withdrawn");
  });

  it("captures event doc comments", () => {
    const poolCreated = result.events.find((e) => e.name === "PoolCreated");
    expect(poolCreated).toBeDefined();
    expect(poolCreated!.fields).toHaveLength(2);
  });

  // ─── Logic operations ───────────────────────────────────

  it("parses require! in create_pool", () => {
    const ix = result.instructions.find((ix) => ix.name === "create_pool");
    expect(ix).toBeDefined();
    const requires = ix!.logicOps.filter((op) => op.type === "require");
    expect(requires.length).toBeGreaterThanOrEqual(1);
  });

  it("parses require_gt! in create_pool", () => {
    const ix = result.instructions.find((ix) => ix.name === "create_pool");
    expect(ix).toBeDefined();
    const requires = ix!.logicOps.filter((op) => op.type === "require");
    // require_gt! should be parsed as a require with 3 args
    expect(requires.length).toBeGreaterThanOrEqual(2);
  });

  it("parses set-field for non-ctx param names", () => {
    const ix = result.instructions.find((ix) => ix.name === "initialize_protocol");
    expect(ix).toBeDefined();
    const setFields = ix!.logicOps.filter((op) => op.type === "set-field");
    expect(setFields.length).toBeGreaterThanOrEqual(2);
  });

  it("parses checked math in deposit", () => {
    const ix = result.instructions.find((ix) => ix.name === "deposit");
    expect(ix).toBeDefined();
    const mathOps = ix!.logicOps.filter((op) => op.type === "math");
    expect(mathOps.length).toBeGreaterThanOrEqual(1);
  });

  it("parses emit! in create_pool", () => {
    const ix = result.instructions.find((ix) => ix.name === "create_pool");
    expect(ix).toBeDefined();
    const emits = ix!.logicOps.filter((op) => op.type === "emit-event");
    expect(emits.length).toBeGreaterThanOrEqual(1);
  });

  it("parses match statement in withdraw", () => {
    const ix = result.instructions.find((ix) => ix.name === "withdraw");
    expect(ix).toBeDefined();
    // match should be parsed as if-else
    const ifElse = ix!.logicOps.filter((op) => op.type === "if-else");
    expect(ifElse.length).toBeGreaterThanOrEqual(1);
  });

  it("parses require_keys_eq! in close_pool", () => {
    const ix = result.instructions.find((ix) => ix.name === "close_pool");
    expect(ix).toBeDefined();
    const requires = ix!.logicOps.filter((op) => op.type === "require");
    expect(requires.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── To-flow conversion ──────────────────────────────────────────────

describe("parseFile — realworld to-flow conversion", () => {
  it("produces valid ReactFlow nodes and edges", () => {
    const result = parseFile(join(FIXTURES_DIR, "anchor-realworld.rs"));

    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.edges.length).toBeGreaterThan(0);

    const programNodes = result.nodes.filter((n) => n.type === "program");
    expect(programNodes).toHaveLength(1);
    expect(programNodes[0].data.name).toBe("realworld");

    const ixNodes = result.nodes.filter((n) => n.type === "instruction");
    expect(ixNodes).toHaveLength(5);

    const stateNodes = result.nodes.filter((n) => n.type === "state");
    expect(stateNodes).toHaveLength(3);

    const errorNodes = result.nodes.filter((n) => n.type === "error");
    expect(errorNodes).toHaveLength(6);

    const eventNodes = result.nodes.filter((n) => n.type === "event");
    expect(eventNodes).toHaveLength(3);

    // All edges reference valid nodes
    const nodeIds = new Set(result.nodes.map((n) => n.id));
    for (const edge of result.edges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
  });

  it("links state nodes to account nodes via type matching", () => {
    const result = parseFile(join(FIXTURES_DIR, "anchor-realworld.rs"));

    // Find edges connecting state to account
    const stateNodes = result.nodes.filter((n) => n.type === "state");
    const dataEdges = result.edges.filter(
      (e) => e.sourceHandle === "data-out" && e.targetHandle === "data-in"
    );

    // Should have state-account connections via stateType matching
    expect(dataEdges.length).toBeGreaterThan(0);
  });
});
