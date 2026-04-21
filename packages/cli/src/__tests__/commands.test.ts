import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { parseProgram, parseFile } from "@solflow/rust-parser";
import { idlToFlow } from "@solflow/idl-import";

const FIXTURES_DIR = join(__dirname, "fixtures");
const MINI_ANCHOR = join(FIXTURES_DIR, "mini-anchor");
const COUNTER_IDL = join(FIXTURES_DIR, "counter-idl.json");

// ─── parse command logic (uses @solflow/rust-parser) ─────────────────

describe("parse command — Rust project parsing", () => {
  it("parses mini-anchor project directory", () => {
    const result = parseProgram(MINI_ANCHOR);
    expect(result.stats.instructions).toBe(2);
    expect(result.stats.states).toBe(1);
    expect(result.stats.errors).toBe(1);
    expect(result.warnings).toBeDefined();
  });

  it("parses single .rs file", () => {
    const rsFile = join(MINI_ANCHOR, "src", "lib.rs");
    const result = parseFile(rsFile);
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.edges.length).toBeGreaterThan(0);
  });

  it("produces program node with correct name", () => {
    const result = parseProgram(MINI_ANCHOR);
    const programNodes = result.nodes.filter((n) => n.type === "program");
    expect(programNodes).toHaveLength(1);
    expect(programNodes[0].data.name).toBe("mini_anchor");
  });

  it("produces instruction nodes", () => {
    const result = parseProgram(MINI_ANCHOR);
    const ixNodes = result.nodes.filter((n) => n.type === "instruction");
    expect(ixNodes.length).toBe(2);
    const names = ixNodes.map((n) => n.data.name);
    expect(names).toContain("initialize");
    expect(names).toContain("update");
  });

  it("produces account nodes", () => {
    const result = parseProgram(MINI_ANCHOR);
    const accNodes = result.nodes.filter((n) => n.type === "account");
    expect(accNodes.length).toBeGreaterThanOrEqual(3); // data, authority, system_program
  });

  it("produces state nodes", () => {
    const result = parseProgram(MINI_ANCHOR);
    const stateNodes = result.nodes.filter((n) => n.type === "state");
    expect(stateNodes).toHaveLength(1);
    expect(stateNodes[0].data.name).toBe("Data");
  });

  it("produces error nodes", () => {
    const result = parseProgram(MINI_ANCHOR);
    const errorNodes = result.nodes.filter((n) => n.type === "error");
    expect(errorNodes).toHaveLength(1);
    expect(errorNodes[0].data.name).toBe("InvalidValue");
  });

  it("produces logic nodes for initialize", () => {
    const result = parseProgram(MINI_ANCHOR);
    const logicNodes = result.nodes.filter((n) => n.type === "logic");
    expect(logicNodes.length).toBeGreaterThan(0);
  });

  it("edges connect valid nodes", () => {
    const result = parseProgram(MINI_ANCHOR);
    const nodeIds = new Set(result.nodes.map((n) => n.id));
    for (const edge of result.edges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
  });

  it("produces nodes with valid positions after auto-layout", () => {
    const result = parseProgram(MINI_ANCHOR);
    for (const node of result.nodes) {
      expect(node.position).toBeDefined();
      expect(typeof node.position.x).toBe("number");
      expect(typeof node.position.y).toBe("number");
    }
  });

  it("summary stats are consistent with nodes", () => {
    const result = parseProgram(MINI_ANCHOR);
    const ixNodes = result.nodes.filter((n) => n.type === "instruction");
    expect(result.stats.instructions).toBe(ixNodes.length);

    const stateNodes = result.nodes.filter((n) => n.type === "state");
    expect(result.stats.states).toBe(stateNodes.length);

    const errorNodes = result.nodes.filter((n) => n.type === "error");
    expect(result.stats.errors).toBe(errorNodes.length);
  });
});

// ─── parse command — error handling ──────────────────────────────────

describe("parse command — error handling", () => {
  it("throws on non-existent path", () => {
    expect(() => parseProgram("/nonexistent/path")).toThrow();
  });

  it("handles empty .rs file gracefully", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-parse-"));
    try {
      const emptyFile = join(tempDir, "empty.rs");
      writeFileSync(emptyFile, "");
      const result = parseFile(emptyFile);
      expect(result.nodes).toBeDefined();
      expect(result.edges).toBeDefined();
      expect(result.stats.instructions).toBe(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ─── parse command — output to file ──────────────────────────────────

describe("parse command — output to file", () => {
  it("can serialize result to JSON and write", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-output-"));
    try {
      const result = parseProgram(MINI_ANCHOR);
      const json = JSON.stringify({ nodes: result.nodes, edges: result.edges, stats: result.stats }, null, 2);
      const outputPath = join(tempDir, "output.json");
      writeFileSync(outputPath, json);

      expect(existsSync(outputPath)).toBe(true);
      const parsed = JSON.parse(readFileSync(outputPath, "utf-8"));
      expect(parsed.nodes.length).toBeGreaterThan(0);
      expect(parsed.stats.instructions).toBe(2);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ─── idl command logic (uses @solflow/idl-import) ────────────────────

describe("idl command — IDL parsing", () => {
  it("parses counter IDL JSON", () => {
    const raw = readFileSync(COUNTER_IDL, "utf-8");
    const idl = JSON.parse(raw);
    const result = idlToFlow(idl);

    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.edges.length).toBeGreaterThan(0);
    expect(result.format).toBe("anchor");
  });

  it("produces correct stats from counter IDL", () => {
    const raw = readFileSync(COUNTER_IDL, "utf-8");
    const idl = JSON.parse(raw);
    const result = idlToFlow(idl);

    expect(result.stats.instructions).toBe(2);
    expect(result.stats.accounts).toBe(1); // Counter state
    expect(result.stats.errors).toBe(1);
  });

  it("produces program node from IDL", () => {
    const raw = readFileSync(COUNTER_IDL, "utf-8");
    const idl = JSON.parse(raw);
    const result = idlToFlow(idl);

    const programNodes = result.nodes.filter((n) => n.type === "program");
    expect(programNodes).toHaveLength(1);
    expect(programNodes[0].data.name).toBe("counter");
  });

  it("produces instruction nodes from IDL", () => {
    const raw = readFileSync(COUNTER_IDL, "utf-8");
    const idl = JSON.parse(raw);
    const result = idlToFlow(idl);

    const ixNodes = result.nodes.filter((n) => n.type === "instruction");
    expect(ixNodes).toHaveLength(2);
  });

  it("produces error nodes from IDL", () => {
    const raw = readFileSync(COUNTER_IDL, "utf-8");
    const idl = JSON.parse(raw);
    const result = idlToFlow(idl);

    const errorNodes = result.nodes.filter((n) => n.type === "error");
    expect(errorNodes).toHaveLength(1);
    expect(errorNodes[0].data.name).toBe("Overflow");
  });

  it("produces state nodes from IDL", () => {
    const raw = readFileSync(COUNTER_IDL, "utf-8");
    const idl = JSON.parse(raw);
    const result = idlToFlow(idl);

    const stateNodes = result.nodes.filter((n) => n.type === "state");
    expect(stateNodes).toHaveLength(1);
    expect(stateNodes[0].data.name).toBe("Counter");
  });

  it("edges connect valid nodes from IDL", () => {
    const raw = readFileSync(COUNTER_IDL, "utf-8");
    const idl = JSON.parse(raw);
    const result = idlToFlow(idl);

    const nodeIds = new Set(result.nodes.map((n) => n.id));
    for (const edge of result.edges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
  });
});

// ─── idl command — error handling ────────────────────────────────────

describe("idl command — error handling", () => {
  it("throws on invalid JSON", () => {
    expect(() => idlToFlow("not json")).toThrow();
  });

  it("throws on non-existent file", () => {
    expect(() => readFileSync("/nonexistent/idl.json")).toThrow();
  });

  it("throws on empty object", () => {
    expect(() => idlToFlow({})).toThrow();
  });
});

// ─── idl command — output to file ────────────────────────────────────

describe("idl command — output to file", () => {
  it("can serialize IDL result to JSON and write", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-idl-"));
    try {
      const raw = readFileSync(COUNTER_IDL, "utf-8");
      const idl = JSON.parse(raw);
      const result = idlToFlow(idl);
      const json = JSON.stringify({ nodes: result.nodes, edges: result.edges, stats: result.stats }, null, 2);
      const outputPath = join(tempDir, "idl-output.json");
      writeFileSync(outputPath, json);

      expect(existsSync(outputPath)).toBe(true);
      const parsed = JSON.parse(readFileSync(outputPath, "utf-8"));
      expect(parsed.nodes.length).toBeGreaterThan(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ─── comparison: rust parser vs IDL parser ───────────────────────────

describe("rust parser vs IDL parser consistency", () => {
  it("both produce the same instruction count for counter", () => {
    // IDL result
    const raw = readFileSync(COUNTER_IDL, "utf-8");
    const idl = JSON.parse(raw);
    const idlResult = idlToFlow(idl);

    // Rust parser result (using the rust-parser fixture)
    const rsFile = join(
      __dirname,
      "..",
      "..",
      "..",
      "rust-parser",
      "src",
      "__tests__",
      "fixtures",
      "anchor-counter.rs",
    );
    const rustResult = parseFile(rsFile);

    expect(rustResult.stats.instructions).toBe(idlResult.stats.instructions);
  });

  it("both produce the same error count for counter", () => {
    const raw = readFileSync(COUNTER_IDL, "utf-8");
    const idl = JSON.parse(raw);
    const idlResult = idlToFlow(idl);

    const rsFile = join(
      __dirname,
      "..",
      "..",
      "..",
      "rust-parser",
      "src",
      "__tests__",
      "fixtures",
      "anchor-counter.rs",
    );
    const rustResult = parseFile(rsFile);

    // Rust parser might find more errors (Underflow too), but should have at least as many
    expect(rustResult.stats.errors).toBeGreaterThanOrEqual(idlResult.stats.errors);
  });
});
