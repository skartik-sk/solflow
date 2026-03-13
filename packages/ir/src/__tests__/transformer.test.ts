// packages/ir/src/__tests__/transformer.test.ts
// Per docs/architecture/19-testing-strategy.md — IR Transformer Tests

import { describe, it, expect } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import { flowToIR, computeFlowHash } from "../transformer";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// UUIDs required by ProgramIRSchema validation
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
      name: "test_program",
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
    data: { name: "authority", accountType: "signer", ...overrides },
  };
}

function stateNode(overrides: Record<string, unknown> = {}): Node {
  return {
    id: uid(),
    type: "state",
    position: { x: 200, y: 200 },
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("flowToIR", () => {
  it("produces valid IR from a minimal valid flow", () => {
    const prog = programNode({ name: "test_program" });
    const ix = instructionNode({ name: "initialize" });
    const acc = accountNode({ name: "authority", accountType: "signer" });

    const nodes = [prog, ix, acc];
    const edges = [edge(prog.id, ix.id), edge(ix.id, acc.id)];

    const ir = flowToIR(nodes, edges);

    expect(ir.program.name).toBe("test_program");
    expect(ir.instructions).toHaveLength(1);
    expect(ir.instructions[0].name).toBe("initialize");
    expect(ir.instructions[0].accounts).toHaveLength(1);
    expect(ir.instructions[0].accounts[0].name).toBe("authority");
  });

  it("throws when flow has no program node", () => {
    const ix = instructionNode({ name: "initialize" });
    expect(() => flowToIR([ix], [])).toThrow("Flow must have a Program node");
  });

  it("throws when program has no instruction node connected", () => {
    const prog = programNode();
    // No instruction connected
    expect(() => flowToIR([prog], [])).toThrow(
      "Program must have at least one Instruction node",
    );
  });

  it("collects state nodes from the flow", () => {
    const prog = programNode();
    const ix = instructionNode();
    const state = stateNode({ name: "VaultState" });

    const nodes = [prog, ix, state];
    const edges = [edge(prog.id, ix.id)];

    const ir = flowToIR(nodes, edges);

    expect(ir.states).toHaveLength(1);
    expect(ir.states[0].name).toBe("VaultState");
    expect(ir.states[0].fields).toHaveLength(2);
  });

  it("collects error nodes from the flow", () => {
    const prog = programNode();
    const ix = instructionNode();
    const errNode: Node = {
      id: uid(),
      type: "error",
      position: { x: 0, y: 0 },
      data: { name: "Unauthorized", code: 6000, message: "Not authorized" },
    };

    const nodes = [prog, ix, errNode];
    const edges = [edge(prog.id, ix.id)];

    const ir = flowToIR(nodes, edges);

    expect(ir.errors).toHaveLength(1);
    expect(ir.errors[0].name).toBe("Unauthorized");
    expect(ir.errors[0].code).toBe(6000);
  });

  it("collects event nodes from the flow", () => {
    const prog = programNode();
    const ix = instructionNode();
    const evtNode: Node = {
      id: uid(),
      type: "event",
      position: { x: 0, y: 0 },
      data: {
        name: "TransferEvent",
        fields: [{ name: "amount", type: "u64" }],
      },
    };

    const nodes = [prog, ix, evtNode];
    const edges = [edge(prog.id, ix.id)];

    const ir = flowToIR(nodes, edges);

    expect(ir.events).toHaveLength(1);
    expect(ir.events[0].name).toBe("TransferEvent");
  });

  it("resolves multiple instructions from program", () => {
    const prog = programNode();
    const ix1 = instructionNode({ name: "initialize" });
    const ix2 = instructionNode({ name: "deposit" });

    const nodes = [prog, ix1, ix2];
    const edges = [edge(prog.id, ix1.id), edge(prog.id, ix2.id)];

    const ir = flowToIR(nodes, edges);

    expect(ir.instructions).toHaveLength(2);
    const names = ir.instructions.map((i) => i.name);
    expect(names).toContain("initialize");
    expect(names).toContain("deposit");
  });

  it("resolves accounts connected to instructions", () => {
    const prog = programNode();
    const ix = instructionNode({ name: "deposit" });
    const acc1 = accountNode({ name: "authority", accountType: "signer" });
    const acc2 = accountNode({ name: "vault", accountType: "account" });

    const nodes = [prog, ix, acc1, acc2];
    const edges = [
      edge(prog.id, ix.id),
      edge(ix.id, acc1.id),
      edge(ix.id, acc2.id),
    ];

    const ir = flowToIR(nodes, edges);

    const ixIR = ir.instructions[0];
    expect(ixIR.accounts).toHaveLength(2);
    const accNames = ixIR.accounts.map((a) => a.name);
    expect(accNames).toContain("authority");
    expect(accNames).toContain("vault");
  });

  it("resolves constraint nodes reverse-connected to accounts", () => {
    const prog = programNode();
    const ix = instructionNode({ name: "initialize" });
    const acc = accountNode({ name: "vault", accountType: "account" });
    const constraintNode: Node = {
      id: uid(),
      type: "constraint",
      position: { x: 0, y: 0 },
      data: { type: "init", payer: "authority", space: "auto" },
    };

    const nodes = [prog, ix, acc, constraintNode];
    const edges = [
      edge(prog.id, ix.id),
      edge(ix.id, acc.id),
      // Constraint is source→account (reverse: account←constraint)
      edge(constraintNode.id, acc.id),
    ];

    const ir = flowToIR(nodes, edges);

    const vaultAcc = ir.instructions[0].accounts.find(
      (a) => a.name === "vault",
    );
    expect(vaultAcc).toBeDefined();
    expect(vaultAcc!.constraints).toHaveLength(1);
    expect(vaultAcc!.constraints[0].type).toBe("init");
  });

  it("includes metadata with flowHash, version and timestamps", () => {
    const prog = programNode();
    const ix = instructionNode();
    const nodes = [prog, ix];
    const edges = [edge(prog.id, ix.id)];

    const ir = flowToIR(nodes, edges);

    expect(ir.metadata.generatorVersion).toBe("0.1.0");
    expect(ir.metadata.flowHash).toBeTruthy();
    expect(ir.metadata.createdAt).toBeTruthy();
  });

  it("applies defaults for program fields not supplied", () => {
    const prog: Node = {
      id: uid(),
      type: "program",
      position: { x: 0, y: 0 },
      data: {}, // no name / version / license
    };
    const ix = instructionNode();
    const nodes = [prog, ix];
    const edges = [edge(prog.id, ix.id)];

    const ir = flowToIR(nodes, edges);

    expect(ir.program.name).toBe("my_program");
    expect(ir.program.version).toBe("0.1.0");
    expect(ir.program.license).toBe("MIT");
  });

  it("is deterministic — same flow always produces the same flowHash", () => {
    const prog = programNode({ name: "vault" });
    const ix = instructionNode({ name: "initialize" });
    const nodes = [prog, ix];
    const edges = [edge(prog.id, ix.id)];

    const hash1 = computeFlowHash(nodes, edges);
    const hash2 = computeFlowHash(nodes, edges);

    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different flows", () => {
    const prog1 = programNode({ name: "vault_a" });
    const prog2 = programNode({ name: "vault_b" });
    const ix = instructionNode();

    const hash1 = computeFlowHash([prog1, ix], [edge(prog1.id, ix.id)]);
    const hash2 = computeFlowHash([prog2, ix], [edge(prog2.id, ix.id)]);

    expect(hash1).not.toBe(hash2);
  });
});
