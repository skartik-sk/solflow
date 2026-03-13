// apps/web/src/__tests__/integration/full-pipeline.test.ts
// Per docs/architecture/19-testing-strategy.md — Full Pipeline Integration Tests
//
// Tests the complete flow → IR → code pipeline end-to-end using the three
// workspace packages (@solflow/ir, @solflow/codegen, @solflow/audit).

import { describe, it, expect } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import { flowToIR } from "@solflow/ir";
import { ProgramIRSchema } from "@solflow/ir";
import { generateCode } from "@solflow/codegen";
import { runInstantAudit } from "@solflow/audit";

// ─── Node / Edge Fixture Helpers ──────────────────────────────────────────────

let _idSeq = 0;
function uid(): string {
  const n = ++_idSeq;
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function programNode(overrides: Record<string, unknown> = {}): Node {
  return {
    id: uid(),
    type: "program",
    position: { x: 0, y: 0 },
    data: {
      name: "vault_program",
      version: "0.1.0",
      license: "MIT",
      ...overrides,
    },
  };
}

function instructionNode(overrides: Record<string, unknown> = {}): Node {
  return {
    id: uid(),
    type: "instruction",
    position: { x: 0, y: 100 },
    data: { name: "initialize", args: [], ...overrides },
  };
}

function accountNode(overrides: Record<string, unknown> = {}): Node {
  return {
    id: uid(),
    type: "account",
    position: { x: 0, y: 200 },
    data: {
      name: "authority",
      accountType: "signer",
      constraints: [{ type: "signer" }],
      ...overrides,
    },
  };
}

function stateNode(overrides: Record<string, unknown> = {}): Node {
  return {
    id: uid(),
    type: "state",
    position: { x: 300, y: 100 },
    data: {
      name: "VaultState",
      fields: [
        { name: "balance", type: "u64" },
        { name: "owner", type: "Pubkey" },
      ],
      isZeroCopy: false,
      ...overrides,
    },
  };
}

function edge(source: string, target: string): Edge {
  return { id: `e-${source}-${target}`, source, target };
}

// ─── Shared vault flow factory ────────────────────────────────────────────────

/**
 * Builds a minimal but realistic vault flow:
 *   Program → initialize instruction → authority (signer) account
 *           + VaultState state node
 */
function createVaultFlow(): { nodes: Node[]; edges: Edge[] } {
  const prog = programNode({ name: "vault_program" });
  const ix = instructionNode({ name: "initialize" });
  const authority = accountNode({
    name: "authority",
    accountType: "signer",
    constraints: [{ type: "signer" }],
  });
  const vault = accountNode({
    name: "vault",
    accountType: "account",
    stateType: "VaultState",
    constraints: [{ type: "init", payer: "authority", space: "auto" }],
  });
  const sysProgram = accountNode({
    name: "system_program",
    accountType: "system-program",
    constraints: [],
  });
  const state = stateNode();

  const nodes = [prog, ix, authority, vault, sysProgram, state];
  const edges = [
    edge(prog.id, ix.id),
    edge(ix.id, authority.id),
    edge(ix.id, vault.id),
    edge(ix.id, sysProgram.id),
  ];

  return { nodes, edges };
}

// ─── Integration Tests ────────────────────────────────────────────────────────

describe("Full Pipeline Integration", () => {
  it("flow → IR produces schema-valid IR", () => {
    const { nodes, edges } = createVaultFlow();
    const ir = flowToIR(nodes, edges);

    expect(() => ProgramIRSchema.parse(ir)).not.toThrow();
  });

  it("flow → IR → Anchor code produces no errors", () => {
    const { nodes, edges } = createVaultFlow();
    const ir = flowToIR(nodes, edges);
    const result = generateCode(ir, "anchor");

    expect(result.errors).toHaveLength(0);
    expect(result.files.length).toBeGreaterThan(0);
  });

  it("flow → IR → Pinocchio code produces no errors", () => {
    const { nodes, edges } = createVaultFlow();
    const ir = flowToIR(nodes, edges);
    const result = generateCode(ir, "pinocchio");

    expect(result.errors).toHaveLength(0);
    expect(result.files.length).toBeGreaterThan(0);
  });

  it("flow → IR → Anchor code contains expected program structure", () => {
    const { nodes, edges } = createVaultFlow();
    const ir = flowToIR(nodes, edges);
    const result = generateCode(ir, "anchor");

    const libRs = result.files.find(
      (f) => f.path === "programs/vault_program/src/lib.rs",
    );
    expect(libRs).toBeDefined();
    expect(libRs!.content).toContain("declare_id!");
    expect(libRs!.content).toContain("#[program]");
    expect(libRs!.content).toContain("pub fn initialize");
  });

  it("flow → IR → audit passes with no critical/high findings", () => {
    const { nodes, edges } = createVaultFlow();
    const ir = flowToIR(nodes, edges);
    const report = runInstantAudit(ir);

    const criticalOrHigh = report.findings.filter(
      (f) => f.severity === "critical" || f.severity === "high",
    );
    expect(criticalOrHigh).toHaveLength(0);
  });

  it("IR metadata contains a non-empty flowHash", () => {
    const { nodes, edges } = createVaultFlow();
    const ir = flowToIR(nodes, edges);

    expect(ir.metadata.flowHash).toBeTruthy();
    expect(typeof ir.metadata.flowHash).toBe("string");
  });

  it("IR program name matches the program node", () => {
    const { nodes, edges } = createVaultFlow();
    const ir = flowToIR(nodes, edges);

    expect(ir.program.name).toBe("vault_program");
  });

  it("IR has the expected instruction names", () => {
    const { nodes, edges } = createVaultFlow();
    const ir = flowToIR(nodes, edges);

    const names = ir.instructions.map((ix) => ix.name);
    expect(names).toContain("initialize");
  });
});

// ─── Determinism Tests ────────────────────────────────────────────────────────

describe("Pipeline determinism", () => {
  it("same flow always produces same IR (flowHash is stable)", () => {
    const { nodes, edges } = createVaultFlow();

    const ir1 = flowToIR(nodes, edges);
    const ir2 = flowToIR(nodes, edges);

    expect(ir1.metadata.flowHash).toBe(ir2.metadata.flowHash);
  });

  it("same flow always produces identical Anchor code output", () => {
    const { nodes, edges } = createVaultFlow();

    const r1 = generateCode(flowToIR(nodes, edges), "anchor");
    const r2 = generateCode(flowToIR(nodes, edges), "anchor");

    expect(r1.files.length).toBe(r2.files.length);
    for (const f1 of r1.files) {
      const f2 = r2.files.find((f) => f.path === f1.path);
      expect(f2).toBeDefined();
      expect(f1.content).toBe(f2!.content);
    }
  });

  it("different flows produce different IR flowHash", () => {
    const flow1 = createVaultFlow();
    // Mutate: rename the program node
    const flow2nodes = flow1.nodes.map((n) =>
      n.type === "program"
        ? { ...n, data: { ...n.data, name: "different_program" } }
        : n,
    );

    const ir1 = flowToIR(flow1.nodes, flow1.edges);
    const ir2 = flowToIR(flow2nodes, flow1.edges);

    expect(ir1.metadata.flowHash).not.toBe(ir2.metadata.flowHash);
  });
});

// ─── Multi-instruction flow ───────────────────────────────────────────────────

describe("Multi-instruction pipeline", () => {
  it("two-instruction flow produces valid IR and error-free code", () => {
    const prog = programNode({ name: "counter_program" });
    const initIx = instructionNode({ name: "initialize" });
    const incrIx = instructionNode({ name: "increment" });

    const counter = accountNode({
      name: "counter",
      accountType: "account",
      stateType: "CounterState",
      constraints: [{ type: "init", payer: "authority", space: "auto" }],
    });
    const authority = accountNode({
      name: "authority",
      accountType: "signer",
      constraints: [{ type: "signer" }],
    });
    const sysProgram = accountNode({
      name: "system_program",
      accountType: "system-program",
      constraints: [],
    });

    const counterMut = accountNode({
      name: "counter",
      accountType: "account",
      stateType: "CounterState",
      constraints: [{ type: "mut" }],
    });
    const authSigner = accountNode({
      name: "authority",
      accountType: "signer",
      constraints: [{ type: "signer" }],
    });

    const state = stateNode({
      name: "CounterState",
      fields: [
        { name: "count", type: "u64" },
        { name: "authority", type: "Pubkey" },
      ],
    });

    const nodes = [
      prog,
      initIx,
      incrIx,
      counter,
      authority,
      sysProgram,
      counterMut,
      authSigner,
      state,
    ];
    const edges = [
      edge(prog.id, initIx.id),
      edge(prog.id, incrIx.id),
      edge(initIx.id, counter.id),
      edge(initIx.id, authority.id),
      edge(initIx.id, sysProgram.id),
      edge(incrIx.id, counterMut.id),
      edge(incrIx.id, authSigner.id),
    ];

    const ir = flowToIR(nodes, edges);
    expect(() => ProgramIRSchema.parse(ir)).not.toThrow();
    expect(ir.instructions).toHaveLength(2);

    const code = generateCode(ir, "anchor");
    expect(code.errors).toHaveLength(0);

    const libRs = code.files.find(
      (f) => f.path === "programs/counter_program/src/lib.rs",
    );
    expect(libRs!.content).toContain("pub fn initialize");
    expect(libRs!.content).toContain("pub fn increment");
  });
});
