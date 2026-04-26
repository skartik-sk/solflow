import { describe, expect, it } from "vitest";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { parseProgram } from "../index";
import { detectProjectType } from "../scanner";

const FIXTURE_ROOT = join(__dirname, "framework-fixtures");
const REPO_ROOT = resolve(__dirname, "../../../../");

interface FixtureExpectation {
  name: string;
  path: string;
  framework: "anchor" | "pinocchio" | "quasar";
  programName: string;
  version?: string;
  instructions: string[];
  minAccounts?: number;
  states?: string[];
  errors?: string[];
  events?: string[];
}

function parsedSummary(path: string) {
  const result = parseProgram(path);
  const programNode = result.nodes.find((node) => node.type === "program");
  return {
    result,
    programName: programNode?.data.name,
    version: programNode?.data.version,
    instructions: result.nodes
      .filter((node) => node.type === "instruction")
      .map((node) => String(node.data.name)),
    states: result.nodes
      .filter((node) => node.type === "state")
      .map((node) => String(node.data.name)),
    errors: result.nodes
      .filter((node) => node.type === "error")
      .map((node) => String(node.data.name)),
    events: result.nodes
      .filter((node) => node.type === "event")
      .map((node) => String(node.data.name)),
  };
}

function assertFixture(expectation: FixtureExpectation): void {
  expect(detectProjectType(expectation.path)).toBe(expectation.framework);

  const summary = parsedSummary(expectation.path);
  expect(summary.programName).toBe(expectation.programName);
  if (expectation.version) {
    expect(summary.version).toBe(expectation.version);
  }

  expect(summary.instructions).toEqual(expect.arrayContaining(expectation.instructions));
  expect(summary.result.stats.instructions).toBeGreaterThanOrEqual(expectation.instructions.length);
  expect(summary.result.report.framework).toBe(expectation.framework);
  expect(summary.result.report.filesParsed).toBeGreaterThan(0);
  if (expectation.instructions.length > 0) {
    expect(summary.result.report.confidence).not.toBe("low");
  }

  if (expectation.minAccounts !== undefined) {
    expect(summary.result.stats.accounts).toBeGreaterThanOrEqual(expectation.minAccounts);
  }
  if (expectation.states) {
    expect(summary.states).toEqual(expect.arrayContaining(expectation.states));
  }
  if (expectation.errors) {
    expect(summary.errors).toEqual(expect.arrayContaining(expectation.errors));
  }
  if (expectation.events) {
    expect(summary.events).toEqual(expect.arrayContaining(expectation.events));
  }

  const nodeIds = new Set(summary.result.nodes.map((node) => node.id));
  for (const edge of summary.result.edges) {
    expect(nodeIds.has(edge.source)).toBe(true);
    expect(nodeIds.has(edge.target)).toBe(true);
  }
}

describe("framework fixture matrix", () => {
  const localFixtures: FixtureExpectation[] = [
    {
      name: "Anchor workspace with PDA constraints, events, and errors",
      path: join(FIXTURE_ROOT, "anchor-workspace"),
      framework: "anchor",
      programName: "anchor_vault",
      version: "0.2.0",
      instructions: ["initialize", "deposit"],
      minAccounts: 5,
      states: ["Vault"],
      errors: ["InvalidAmount", "Overflow"],
      events: ["VaultInitialized", "Deposited"],
    },
    {
      name: "Pinocchio entrypoint with numeric discriminators",
      path: join(FIXTURE_ROOT, "pinocchio-dispatch"),
      framework: "pinocchio",
      programName: "pinocchio_program",
      version: "0.1.0",
      instructions: ["initialize", "transfer"],
      states: ["InitializeInstructionData", "TransferInstructionData"],
    },
    {
      name: "Quasar program with Ctx handlers and module accounts",
      path: join(FIXTURE_ROOT, "quasar-events"),
      framework: "quasar",
      programName: "quasar_events",
      version: "0.3.0",
      instructions: ["emit_counter", "reset_counter"],
      minAccounts: 4,
      states: ["Counter"],
      errors: ["Overflow"],
      events: ["CounterEvent"],
    },
  ];

  it.each(localFixtures)("$name", (fixture) => {
    assertFixture(fixture);
  });
});

describe("external framework repo smoke matrix", () => {
  const externalFixtures: FixtureExpectation[] = [
    {
      name: "Anchor repo events fixture",
      path: resolve(REPO_ROOT, "../anchor/tests/events"),
      framework: "anchor",
      programName: "events",
      instructions: ["initialize", "test_event", "test_event_cpi"],
      events: ["MyEvent", "MyOtherEvent"],
    },
    {
      name: "Quasar repo sysvar fixture",
      path: resolve(REPO_ROOT, "../quasar/tests/programs/test-sysvar"),
      framework: "quasar",
      programName: "quasar_test_sysvar",
      instructions: ["read_clock", "read_rent", "read_clock_full"],
      minAccounts: 6,
      states: ["ClockSnapshot", "RentSnapshot"],
    },
    {
      name: "Pinocchio repo token crate detection",
      path: resolve(REPO_ROOT, "../pinocchio/programs/token"),
      framework: "pinocchio",
      programName: "unknown_program",
      instructions: [],
      states: ["Account", "Mint", "Multisig"],
    },
  ];

  for (const fixture of externalFixtures) {
    const testFn = existsSync(fixture.path) ? it : it.skip;
    testFn(fixture.name, () => {
      assertFixture(fixture);
    });
  }
});
