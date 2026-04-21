import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseStates } from "../parsers/state-parser";
import { parseAccounts } from "../parsers/account-parser";
import { parseProgram } from "../parsers/program-parser";
import { parseErrors } from "../parsers/error-parser";
import { parseEvents } from "../parsers/event-parser";

const FIXTURES_DIR = join(__dirname, "fixtures");
function readFixture(name: string) {
  return readFileSync(join(FIXTURES_DIR, name), "utf-8");
}

describe("Individual parsers — counter", () => {
  const src = readFixture("anchor-counter.rs");

  it("parses program", () => {
    const { programName, instructions } = parseProgram(src);
    expect(programName).toBe("counter");
    expect(instructions).toHaveLength(2);
    expect(instructions[0].name).toBe("create");
    expect(instructions[1].name).toBe("increment");
  });

  it("parses accounts", () => {
    const accounts = parseAccounts(src);
    expect(accounts).toHaveProperty("Create");
    expect(accounts).toHaveProperty("Increment");
    expect(accounts["Create"]).toHaveLength(3);
  });

  it("parses states", () => {
    const states = parseStates(src);
    expect(states).toHaveLength(1);
    expect(states[0].name).toBe("Counter");
  });

  it("parses errors", () => {
    const errors = parseErrors(src);
    expect(errors).toHaveLength(2);
  });

  it("parses events", () => {
    const events = parseEvents(src);
    expect(events).toHaveLength(1);
  });
});

describe("Individual parsers — marketplace", () => {
  const src = readFixture("anchor-marketplace.rs");

  it("parses program with 4 instructions", () => {
    const { programName, instructions } = parseProgram(src);
    expect(programName).toBe("marketplace");
    expect(instructions).toHaveLength(4);
  });

  it("parses accounts", () => {
    const accounts = parseAccounts(src);
    expect(Object.keys(accounts)).toContain("Initialize");
    expect(Object.keys(accounts)).toContain("List");
    expect(Object.keys(accounts)).toContain("Purchase");
    expect(Object.keys(accounts)).toContain("Delist");
  });

  it("parses states", () => {
    const states = parseStates(src);
    expect(states).toHaveLength(2);
  });

  it("parses errors", () => {
    const errors = parseErrors(src);
    expect(errors).toHaveLength(2);
  });

  it("parses events", () => {
    const events = parseEvents(src);
    expect(events).toHaveLength(2);
  });
});
