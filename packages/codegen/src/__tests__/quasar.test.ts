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
      accessControl: "none",
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
          value: "ctx.accounts.authority.address()",
        },
      ],
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      name: "increment",
      description: "Increment the counter by one",
      accessControl: "none",
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
  errors: [
    {
      id: "00000000-0000-0000-0000-000000000300",
      name: "Unauthorized",
      code: 100,
      message: "You are not authorized to perform this action",
    },
  ],
  events: [
    {
      id: "00000000-0000-0000-0000-000000000400",
      name: "CounterIncremented",
      fields: [
        { name: "new_count", type: "u64" },
        { name: "by", type: "Pubkey" },
      ],
    },
  ],
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

describe("generateCode (quasar)", () => {
  it("produces no errors for a valid counter IR", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    expect(result.errors).toHaveLength(0);
  });

  it("produces at least one file", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    expect(result.files.length).toBeGreaterThan(0);
  });

  it("sets framework to quasar", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    expect(result.framework).toBe("quasar");
  });

  // ─── Quasar-specific imports ────────────────────────────────────────

  it("uses quasar_lang imports instead of anchor_lang", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const lib = result.files.find(
      (f) => f.path === "programs/counter/src/lib.rs",
    );
    expect(lib).toBeDefined();
    expect(lib!.content).toContain("quasar_lang::prelude");
    expect(lib!.content).not.toContain("anchor_lang");
  });

  it("generates Cargo.toml with quasar-lang dependency", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const cargo = result.files.find(
      (f) => f.path === "programs/counter/Cargo.toml",
    );
    expect(cargo).toBeDefined();
    expect(cargo!.content).toContain("quasar-lang");
    expect(cargo!.content).not.toContain("anchor-lang");
  });

  // ─── lib.rs Quasar specifics ────────────────────────────────────────

  it("generates lib.rs with no_std attribute", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const lib = result.files.find(
      (f) => f.path === "programs/counter/src/lib.rs",
    );
    expect(lib).toBeDefined();
    expect(lib!.content).toContain("#![cfg_attr(not(test), no_std)]");
  });

  it("generates #[program] block with instruction discriminators", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const lib = result.files.find(
      (f) => f.path === "programs/counter/src/lib.rs",
    );
    expect(lib).toBeDefined();
    expect(lib!.content).toContain("#[program]");
    expect(lib!.content).toContain("#[instruction(discriminator = 0)]");
    expect(lib!.content).toContain("#[instruction(discriminator = 1)]");
  });

  it("uses Ctx instead of Context", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const lib = result.files.find(
      (f) => f.path === "programs/counter/src/lib.rs",
    );
    expect(lib).toBeDefined();
    expect(lib!.content).toContain("Ctx<");
    expect(lib!.content).not.toContain("Context<");
  });

  it("uses declare_id!", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const lib = result.files.find(
      (f) => f.path === "programs/counter/src/lib.rs",
    );
    expect(lib).toBeDefined();
    expect(lib!.content).toContain("declare_id!");
  });

  // ─── Instruction files ──────────────────────────────────────────────

  it("generates initialize instruction with Quasar imports", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const ix = result.files.find(
      (f) => f.path === "programs/counter/src/instructions/initialize.rs",
    );
    expect(ix).toBeDefined();
    expect(ix!.content).toContain("use quasar_lang::prelude::*;");
    // Quasar puts ONLY the Accounts struct in instruction files
    expect(ix!.content).toContain("Initialize<'info>");
  });

  it("generates increment instruction file", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const ix = result.files.find(
      (f) => f.path === "programs/counter/src/instructions/increment.rs",
    );
    expect(ix).toBeDefined();
    expect(ix!.content).toContain("#[derive(Accounts)]");
    expect(ix!.content).toContain("pub struct Increment");
  });

  it("uses Account derives with #[derive(Accounts)]", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const ix = result.files.find(
      (f) => f.path === "programs/counter/src/instructions/initialize.rs",
    );
    expect(ix).toBeDefined();
    expect(ix!.content).toContain("#[derive(Accounts)]");
    expect(ix!.content).toContain("pub struct Initialize<'info>");
  });

  it("expresses mutability in type, not attribute", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    // increment has counter with mut constraint
    const ix = result.files.find(
      (f) => f.path === "programs/counter/src/instructions/increment.rs",
    );
    expect(ix).toBeDefined();
    // Quasar: &'info mut Account<CounterState> — mut in type, not #[account(mut)]
    expect(ix!.content).toContain("&'info mut Account<CounterState>");
    expect(ix!.content).not.toContain("#[account(mut)]");
  });

  // ─── State files ────────────────────────────────────────────────────

  it("generates CounterState with explicit discriminator", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const state = result.files.find(
      (f) => f.path === "programs/counter/src/state/counter_state.rs",
    );
    expect(state).toBeDefined();
    expect(state!.content).toContain("#[account(discriminator =");
    expect(state!.content).toContain("pub struct CounterState");
  });

  it("uses Pod types in account structs (PodU64, PodBool)", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const state = result.files.find(
      (f) => f.path === "programs/counter/src/state/counter_state.rs",
    );
    expect(state).toBeDefined();
    expect(state!.content).toContain("pub count: PodU64");
    expect(state!.content).not.toContain("pub count: u64");
  });

  it("uses Address instead of Pubkey in state", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const state = result.files.find(
      (f) => f.path === "programs/counter/src/state/counter_state.rs",
    );
    expect(state).toBeDefined();
    expect(state!.content).toContain("pub authority: Address");
    expect(state!.content).not.toContain("pub authority: Pubkey");
  });

  // ─── Error files ────────────────────────────────────────────────────

  it("generates errors with code from IR", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const errors = result.files.find(
      (f) => f.path === "programs/counter/src/errors.rs",
    );
    expect(errors).toBeDefined();
    expect(errors!.content).toContain("use quasar_lang::prelude::*;");
    // IR code is 100, Quasar uses it directly
    expect(errors!.content).toContain("100");
  });

  // ─── Event files ────────────────────────────────────────────────────

  it("generates events with explicit discriminator", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const events = result.files.find(
      (f) => f.path === "programs/counter/src/events.rs",
    );
    expect(events).toBeDefined();
    expect(events!.content).toContain("#[event(discriminator = 0)]");
    expect(events!.content).toContain("pub struct CounterIncremented");
    // Events use standard primitives (not Pod types)
    expect(events!.content).toContain("pub new_count: u64");
    // Uses Address instead of Pubkey
    expect(events!.content).toContain("Address");
    // Events should NOT contain String or Vec
    expect(events!.content).not.toContain("String<");
    expect(events!.content).not.toContain("Vec<");
  });

  // ─── Module structure ───────────────────────────────────────────────

  it("generates instructions/mod.rs", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const mod_ = result.files.find(
      (f) => f.path === "programs/counter/src/instructions/mod.rs",
    );
    expect(mod_).toBeDefined();
    expect(mod_!.content).toContain("pub mod initialize;");
    expect(mod_!.content).toContain("pub mod increment;");
  });

  it("generates state/mod.rs", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    const mod_ = result.files.find(
      (f) => f.path === "programs/counter/src/state/mod.rs",
    );
    expect(mod_).toBeDefined();
    expect(mod_!.content).toContain("pub mod counter_state;");
  });

  // ─── Metadata ───────────────────────────────────────────────────────

  it("includes a non-empty irHash in metadata", () => {
    const result = generateCode(COUNTER_IR, "quasar");
    expect(result.metadata.irHash).toBeTruthy();
    expect(typeof result.metadata.irHash).toBe("string");
  });

  // ─── Determinism ────────────────────────────────────────────────────

  it("is deterministic (identical output on two calls)", () => {
    const r1 = generateCode(COUNTER_IR, "quasar");
    const r2 = generateCode(COUNTER_IR, "quasar");
    expect(r1.files.length).toBe(r2.files.length);
    for (const f1 of r1.files) {
      const f2 = r2.files.find((f) => f.path === f1.path);
      expect(f2).toBeDefined();
      expect(f1.content).toBe(f2!.content);
    }
  });

  it("produces identical irHash as anchor for same IR", () => {
    const r1 = generateCode(COUNTER_IR, "anchor");
    const r2 = generateCode(COUNTER_IR, "quasar");
    expect(r1.metadata.irHash).toBe(r2.metadata.irHash);
  });
});
