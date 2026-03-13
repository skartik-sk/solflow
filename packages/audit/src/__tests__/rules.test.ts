// packages/audit/src/__tests__/rules.test.ts
// Per docs/architecture/19-testing-strategy.md — Audit Rule Tests

import { describe, it, expect } from "vitest";
import type { ProgramIR } from "@solflow/ir";
import { runInstantAudit } from "../index";

// ─── IR Fixture Helpers ───────────────────────────────────────────────────────

let _seq = 0;
function uuid(): string {
  const n = ++_seq;
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function baseIR(overrides: Partial<ProgramIR> = {}): ProgramIR {
  return {
    version: "1.0.0",
    program: {
      name: "test_program",
      version: "0.1.0",
      license: "MIT",
    },
    instructions: [],
    states: [],
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
    ...overrides,
  };
}

// ─── Tests: SOL-001 Missing Signer Check ─────────────────────────────────────

describe("SOL-001: Missing Signer Check", () => {
  it("detects missing signer on SOL transfer source", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "withdraw",
          args: [],
          accounts: [
            {
              id: uuid(),
              name: "authority",
              accountType: "system-account",
              constraints: [{ type: "mut" }], // No signer!
            },
            {
              id: uuid(),
              name: "vault",
              accountType: "account",
              constraints: [{ type: "mut" }],
            },
          ],
          body: [
            {
              type: "transfer-sol",
              from: "authority",
              to: "vault",
              amount: "1000",
            },
          ],
        },
      ],
    });

    const report = runInstantAudit(ir);
    const finding = report.findings.find((f) => f.ruleId === "SOL-001");

    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("critical");
    expect(finding!.location.accountName).toBe("authority");
  });

  it("does NOT flag a signer account on SOL transfer", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "withdraw",
          args: [],
          accounts: [
            {
              id: uuid(),
              name: "authority",
              accountType: "signer", // Correct
              constraints: [{ type: "signer" }],
            },
          ],
          body: [
            {
              type: "transfer-sol",
              from: "authority",
              to: "vault",
              amount: "1000",
            },
          ],
        },
      ],
    });

    const report = runInstantAudit(ir);
    const findings = report.findings.filter((f) => f.ruleId === "SOL-001");
    expect(findings).toHaveLength(0);
  });
});

// ─── Tests: SOL-002 Missing Owner Check ──────────────────────────────────────

describe("SOL-002: Missing Owner Check", () => {
  it("detects unchecked account without owner constraint", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "process",
          args: [],
          accounts: [
            {
              id: uuid(),
              name: "data_account",
              accountType: "unchecked-account",
              constraints: [], // No owner, no signer
            },
          ],
          body: [],
        },
      ],
    });

    const report = runInstantAudit(ir);
    const finding = report.findings.find((f) => f.ruleId === "SOL-002");

    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("high");
    expect(finding!.location.accountName).toBe("data_account");
  });

  it("does NOT flag unchecked account that has an owner constraint", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "process",
          args: [],
          accounts: [
            {
              id: uuid(),
              name: "data_account",
              accountType: "unchecked-account",
              constraints: [{ type: "owner", owner: "self" }],
            },
          ],
          body: [],
        },
      ],
    });

    const report = runInstantAudit(ir);
    const findings = report.findings.filter((f) => f.ruleId === "SOL-002");
    expect(findings).toHaveLength(0);
  });
});

// ─── Tests: SOL-010 Unchecked Arithmetic ────────────────────────────────────

describe("SOL-010: Unchecked Arithmetic", () => {
  it("detects unchecked math operation", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "deposit",
          args: [],
          accounts: [],
          body: [
            {
              type: "math",
              operation: "add",
              left: "vault.total",
              right: "amount",
              result: "new_total",
              checked: false, // Unchecked!
            },
          ],
        },
      ],
    });

    const report = runInstantAudit(ir);
    const finding = report.findings.find((f) => f.ruleId === "SOL-010");

    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("high");
    expect(finding!.location.instructionName).toBe("deposit");
  });

  it("does NOT flag checked arithmetic", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "deposit",
          args: [],
          accounts: [],
          body: [
            {
              type: "math",
              operation: "add",
              left: "vault.total",
              right: "amount",
              result: "new_total",
              checked: true, // Safe
            },
          ],
        },
      ],
    });

    const report = runInstantAudit(ir);
    const findings = report.findings.filter((f) => f.ruleId === "SOL-010");
    expect(findings).toHaveLength(0);
  });
});

// ─── Tests: SOL-020 PDA Seed Collision ──────────────────────────────────────

describe("SOL-020: PDA Seed Collision Risk", () => {
  it("detects two PDAs with identical literal seeds", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "initialize",
          args: [],
          accounts: [
            {
              id: uuid(),
              name: "pda_a",
              accountType: "account",
              constraints: [
                {
                  type: "seeds",
                  seeds: [{ type: "literal", value: "vault" }],
                },
              ],
            },
          ],
          body: [],
        },
        {
          id: uuid(),
          name: "other_ix",
          args: [],
          accounts: [
            {
              id: uuid(),
              name: "pda_b",
              accountType: "account",
              constraints: [
                {
                  type: "seeds",
                  seeds: [{ type: "literal", value: "vault" }], // Same literal seeds!
                },
              ],
            },
          ],
          body: [],
        },
      ],
    });

    const report = runInstantAudit(ir);
    const finding = report.findings.find((f) => f.ruleId === "SOL-020");
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("medium");
  });

  it("does NOT flag PDAs with unique user-pubkey seeds", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "initialize",
          args: [],
          accounts: [
            {
              id: uuid(),
              name: "user_vault",
              accountType: "account",
              constraints: [
                {
                  type: "seeds",
                  seeds: [
                    { type: "literal", value: "vault" },
                    { type: "account-field", value: "user.key()" }, // User-specific
                  ],
                },
              ],
            },
          ],
          body: [],
        },
      ],
    });

    const report = runInstantAudit(ir);
    const findings = report.findings.filter((f) => f.ruleId === "SOL-020");
    expect(findings).toHaveLength(0);
  });
});

// ─── Tests: SOL-030 Missing Mint Check ──────────────────────────────────────

describe("SOL-030: Missing Mint Check", () => {
  it("detects token account without mint constraint", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "transfer",
          args: [],
          accounts: [
            {
              id: uuid(),
              name: "user_token",
              accountType: "token-account",
              constraints: [{ type: "mut" }], // No token-mint!
            },
          ],
          body: [],
        },
      ],
    });

    const report = runInstantAudit(ir);
    const finding = report.findings.find((f) => f.ruleId === "SOL-030");
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("high");
  });

  it("does NOT flag token account with mint constraint", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "transfer",
          args: [],
          accounts: [
            {
              id: uuid(),
              name: "user_token",
              accountType: "token-account",
              constraints: [
                { type: "mut" },
                { type: "token-mint", mint: "mint" },
              ],
            },
          ],
          body: [],
        },
      ],
    });

    const report = runInstantAudit(ir);
    const findings = report.findings.filter((f) => f.ruleId === "SOL-030");
    expect(findings).toHaveLength(0);
  });
});

// ─── Tests: Clean Program (no findings) ──────────────────────────────────────

describe("Clean program", () => {
  it("passes a well-formed counter program with no critical/high findings", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "initialize",
          args: [],
          accounts: [
            {
              id: uuid(),
              name: "counter",
              accountType: "account",
              stateType: "CounterState",
              constraints: [
                { type: "init", payer: "authority", space: "auto" },
              ],
            },
            {
              id: uuid(),
              name: "authority",
              accountType: "signer",
              constraints: [{ type: "signer" }],
            },
          ],
          body: [
            {
              type: "set-field",
              account: "counter",
              field: "count",
              value: "0",
            },
          ],
        },
        {
          id: uuid(),
          name: "increment",
          args: [],
          accounts: [
            {
              id: uuid(),
              name: "counter",
              accountType: "account",
              stateType: "CounterState",
              constraints: [{ type: "mut" }],
            },
            {
              id: uuid(),
              name: "authority",
              accountType: "signer",
              constraints: [{ type: "signer" }],
            },
          ],
          body: [
            {
              type: "math",
              operation: "add",
              left: "counter.count",
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
          id: uuid(),
          name: "CounterState",
          isZeroCopy: false,
          fields: [
            { name: "count", type: "u64" },
            { name: "authority", type: "Pubkey" },
          ],
        },
      ],
    });

    const report = runInstantAudit(ir);
    const criticalOrHigh = report.findings.filter(
      (f) => f.severity === "critical" || f.severity === "high",
    );
    expect(criticalOrHigh).toHaveLength(0);
    expect(report.score).toBeGreaterThan(80);
  });
});

// ─── Tests: Score Calculation ────────────────────────────────────────────────

describe("Score calculation", () => {
  it("returns score 100 for a program with no findings", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "noop",
          args: [],
          accounts: [
            {
              id: uuid(),
              name: "payer",
              accountType: "signer",
              constraints: [{ type: "signer" }],
            },
          ],
          body: [],
        },
      ],
    });

    const report = runInstantAudit(ir);
    expect(report.score).toBe(100);
    expect(report.findings).toHaveLength(0);
  });

  it("reduces score proportionally to finding severity", () => {
    // One critical finding = -25 points
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "drain",
          args: [],
          accounts: [
            {
              id: uuid(),
              name: "wallet",
              accountType: "system-account",
              constraints: [{ type: "mut" }], // No signer → SOL-001 critical
            },
          ],
          body: [
            {
              type: "transfer-sol",
              from: "wallet",
              to: "attacker",
              amount: "1000",
            },
          ],
        },
      ],
    });

    const report = runInstantAudit(ir);
    expect(report.score).toBeLessThan(100);
    expect(report.summary.critical).toBeGreaterThan(0);
  });
});
