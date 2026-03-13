import { describe, it, expect } from "vitest";
import { generateCode } from "../index";
import type { ProgramIR } from "@solflow/ir";

// ─── Fixture: minimal counter program IR ─────────────────────────────────────

const COUNTER_IR: ProgramIR = {
  version: "1.0.0",
  program: {
    name: "counter",
    description: "A simple counter program",
    version: "0.1.0",
    programId: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS",
  },
  instructions: [
    {
      id: "00000000-0000-0000-0000-000000000001",
      name: "initialize",
      description: "Initialize the counter",
      args: [],
      accounts: [
        {
          id: "00000000-0000-0000-0000-000000000010",
          name: "counter",
          accountType: "account",
          stateType: "CounterState",
          constraints: [
            {
              type: "init",
              payer: "authority",
              space: "auto",
            },
          ],
        },
        {
          id: "00000000-0000-0000-0000-000000000011",
          name: "authority",
          accountType: "signer",
          constraints: [{ type: "signer" }],
        },
        {
          id: "00000000-0000-0000-0000-000000000012",
          name: "system_program",
          accountType: "system-program",
          constraints: [],
        },
      ],
      body: [
        {
          type: "set-field",
          account: "counter",
          field: "count",
          value: "0",
        },
        {
          type: "set-field",
          account: "counter",
          field: "authority",
          value: "ctx.accounts.authority.key()",
        },
      ],
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      name: "increment",
      description: "Increment the counter by one",
      args: [],
      accounts: [
        {
          id: "00000000-0000-0000-0000-000000000020",
          name: "counter",
          accountType: "account",
          stateType: "CounterState",
          constraints: [{ type: "mut" }],
        },
        {
          id: "00000000-0000-0000-0000-000000000021",
          name: "authority",
          accountType: "signer",
          constraints: [{ type: "signer" }],
        },
      ],
      body: [
        {
          type: "math",
          operation: "add",
          left: "ctx.accounts.counter.count",
          right: "1",
          result: "new_count",
          checked: true,
        },
        {
          type: "set-field",
          account: "counter",
          field: "count",
          value: "new_count",
        },
      ],
    },
  ],
  states: [
    {
      id: "00000000-0000-0000-0000-000000000100",
      name: "CounterState",
      isZeroCopy: false,
      fields: [
        { name: "count", type: "u64" },
        { name: "authority", type: "Pubkey" },
      ],
    },
  ],
  errors: [],
  events: [],
  integrations: [],
  constants: [],
  metadata: {
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    flowHash: "abc123",
    generatorVersion: "0.1.0",
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("generateCode (anchor)", () => {
  it("produces no errors for a valid counter IR", () => {
    const result = generateCode(COUNTER_IR, "anchor");
    expect(result.errors).toHaveLength(0);
  });

  it("produces at least one file", () => {
    const result = generateCode(COUNTER_IR, "anchor");
    expect(result.files.length).toBeGreaterThan(0);
  });

  it("generates lib.rs", () => {
    const result = generateCode(COUNTER_IR, "anchor");
    const lib = result.files.find(
      (f) => f.path === "programs/counter/src/lib.rs",
    );
    expect(lib).toBeDefined();
    expect(lib!.content).toContain("declare_id!");
    expect(lib!.content).toContain("#[program]");
    expect(lib!.content).toContain("pub fn initialize");
    expect(lib!.content).toContain("pub fn increment");
  });

  it("generates Cargo.toml with anchor-lang", () => {
    const result = generateCode(COUNTER_IR, "anchor");
    const cargo = result.files.find(
      (f) => f.path === "programs/counter/Cargo.toml",
    );
    expect(cargo).toBeDefined();
    expect(cargo!.content).toContain("anchor-lang");
  });

  it("generates initialize instruction file", () => {
    const result = generateCode(COUNTER_IR, "anchor");
    const ix = result.files.find(
      (f) => f.path === "programs/counter/src/instructions/initialize.rs",
    );
    expect(ix).toBeDefined();
    expect(ix!.content).toContain("#[derive(Accounts)]");
    expect(ix!.content).toContain("pub fn handler");
    expect(ix!.content).toContain("pub struct Initialize");
  });

  it("generates increment instruction file", () => {
    const result = generateCode(COUNTER_IR, "anchor");
    const ix = result.files.find(
      (f) => f.path === "programs/counter/src/instructions/increment.rs",
    );
    expect(ix).toBeDefined();
    expect(ix!.content).toContain("#[derive(Accounts)]");
    expect(ix!.content).toContain("pub fn handler");
    expect(ix!.content).toContain("pub struct Increment");
  });

  it("generates CounterState struct", () => {
    const result = generateCode(COUNTER_IR, "anchor");
    const state = result.files.find(
      (f) => f.path === "programs/counter/src/state/counter_state.rs",
    );
    expect(state).toBeDefined();
    expect(state!.content).toContain("pub struct CounterState");
    expect(state!.content).toContain("pub count: u64");
    expect(state!.content).toContain("pub authority: Pubkey");
  });

  it("generates instructions/mod.rs", () => {
    const result = generateCode(COUNTER_IR, "anchor");
    const mod_ = result.files.find(
      (f) => f.path === "programs/counter/src/instructions/mod.rs",
    );
    expect(mod_).toBeDefined();
    expect(mod_!.content).toContain("pub mod initialize;");
    expect(mod_!.content).toContain("pub mod increment;");
  });

  it("init constraint generates correct account attribute", () => {
    const result = generateCode(COUNTER_IR, "anchor");
    const ix = result.files.find(
      (f) => f.path === "programs/counter/src/instructions/initialize.rs",
    );
    expect(ix!.content).toContain("init,");
    expect(ix!.content).toContain("payer = authority");
    expect(ix!.content).toContain("space =");
    expect(ix!.content).toContain("CounterState::INIT_SPACE");
  });

  it("checked math emits checked_add", () => {
    const result = generateCode(COUNTER_IR, "anchor");
    const ix = result.files.find(
      (f) => f.path === "programs/counter/src/instructions/increment.rs",
    );
    expect(ix!.content).toContain("checked_add");
  });

  it("sets framework to anchor", () => {
    const result = generateCode(COUNTER_IR, "anchor");
    expect(result.framework).toBe("anchor");
  });

  it("includes a non-empty irHash in metadata", () => {
    const result = generateCode(COUNTER_IR, "anchor");
    expect(result.metadata.irHash).toBeTruthy();
    expect(typeof result.metadata.irHash).toBe("string");
  });
});

// ─── Determinism tests ────────────────────────────────────────────────────────

describe("generateCode determinism", () => {
  it("produces identical file contents on repeated calls", () => {
    const r1 = generateCode(COUNTER_IR, "anchor");
    const r2 = generateCode(COUNTER_IR, "anchor");

    expect(r1.files.length).toBe(r2.files.length);

    for (const f1 of r1.files) {
      const f2 = r2.files.find((f) => f.path === f1.path);
      expect(f2).toBeDefined();
      expect(f1.content).toBe(f2!.content);
    }
  });

  it("produces identical irHash on repeated calls", () => {
    const r1 = generateCode(COUNTER_IR, "anchor");
    const r2 = generateCode(COUNTER_IR, "anchor");
    expect(r1.metadata.irHash).toBe(r2.metadata.irHash);
  });

  it("produces different irHash for different IR", () => {
    const ir2: ProgramIR = {
      ...COUNTER_IR,
      program: { ...COUNTER_IR.program, name: "different_program" },
      // instructions must have at least 1, keep them but reflect program rename
      instructions: COUNTER_IR.instructions,
    };
    const r1 = generateCode(COUNTER_IR, "anchor");
    const r2 = generateCode(ir2, "anchor");
    expect(r1.metadata.irHash).not.toBe(r2.metadata.irHash);
  });
});

// ─── Pinocchio generator ──────────────────────────────────────────────────────

describe("generateCode (pinocchio)", () => {
  it("produces no errors for a valid counter IR", () => {
    const result = generateCode(COUNTER_IR, "pinocchio");
    expect(result.errors).toHaveLength(0);
  });

  it("produces at least one file", () => {
    const result = generateCode(COUNTER_IR, "pinocchio");
    expect(result.files.length).toBeGreaterThan(0);
  });

  it("sets framework to pinocchio", () => {
    const result = generateCode(COUNTER_IR, "pinocchio");
    expect(result.framework).toBe("pinocchio");
  });

  it("generates Cargo.toml with pinocchio crate", () => {
    const result = generateCode(COUNTER_IR, "pinocchio");
    const cargo = result.files.find(
      (f) => f.path === "programs/counter/Cargo.toml",
    );
    expect(cargo).toBeDefined();
    expect(cargo!.content).toContain("pinocchio");
  });

  it("generates lib.rs with entrypoint! macro", () => {
    const result = generateCode(COUNTER_IR, "pinocchio");
    const lib = result.files.find(
      (f) => f.path === "programs/counter/src/lib.rs",
    );
    expect(lib).toBeDefined();
    expect(lib!.content).toContain("entrypoint!");
  });

  it("generates lib.rs with discriminator-based dispatch", () => {
    const result = generateCode(COUNTER_IR, "pinocchio");
    const lib = result.files.find(
      (f) => f.path === "programs/counter/src/lib.rs",
    );
    expect(lib!.content).toContain("discriminator");
  });

  it("generates instructions/mod.rs listing all instructions", () => {
    const result = generateCode(COUNTER_IR, "pinocchio");
    const mod_ = result.files.find(
      (f) => f.path === "programs/counter/src/instructions/mod.rs",
    );
    expect(mod_).toBeDefined();
    expect(mod_!.content).toContain("pub mod initialize;");
    expect(mod_!.content).toContain("pub mod increment;");
  });

  it("generates a per-instruction file for initialize", () => {
    const result = generateCode(COUNTER_IR, "pinocchio");
    const ix = result.files.find(
      (f) => f.path === "programs/counter/src/instructions/initialize.rs",
    );
    expect(ix).toBeDefined();
    expect(ix!.content).toContain("pub fn process");
  });

  it("generates a per-instruction file for increment", () => {
    const result = generateCode(COUNTER_IR, "pinocchio");
    const ix = result.files.find(
      (f) => f.path === "programs/counter/src/instructions/increment.rs",
    );
    expect(ix).toBeDefined();
    expect(ix!.content).toContain("pub fn process");
  });

  it("generates state file for CounterState", () => {
    const result = generateCode(COUNTER_IR, "pinocchio");
    const state = result.files.find(
      (f) => f.path === "programs/counter/src/state/counter_state.rs",
    );
    expect(state).toBeDefined();
    expect(state!.content).toContain("CounterState");
  });

  it("state file uses byte-offset accessors (zero-copy)", () => {
    const result = generateCode(COUNTER_IR, "pinocchio");
    const state = result.files.find(
      (f) => f.path === "programs/counter/src/state/counter_state.rs",
    );
    expect(state!.content).toContain("from_le_bytes");
  });

  it("is deterministic (identical output on two calls)", () => {
    const r1 = generateCode(COUNTER_IR, "pinocchio");
    const r2 = generateCode(COUNTER_IR, "pinocchio");
    expect(r1.files.length).toBe(r2.files.length);
    for (const f1 of r1.files) {
      const f2 = r2.files.find((f) => f.path === f1.path);
      expect(f2).toBeDefined();
      expect(f1.content).toBe(f2!.content);
    }
  });
});
