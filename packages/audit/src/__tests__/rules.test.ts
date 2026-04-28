// packages/audit/src/__tests__/rules.test.ts
// Per docs/architecture/19-testing-strategy.md — Audit Rule Tests

import { describe, it, expect } from "vitest";
import type { ProgramIR } from "@solflow/ir";
import {
  getStandardIdsForAuditRule,
  runInstantAudit,
  SOLANA_SECURITY_STANDARD_RULES,
} from "../index";

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
          accessControl: "none",
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

  it("returns React Flow source node IDs for canvas navigation and fixes", () => {
    const accountIrId = uuid();
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          sourceNodeId: "flow-withdraw",
          name: "withdraw",
          accessControl: "none",
          args: [],
          accounts: [
            {
              id: accountIrId,
              sourceNodeId: "flow-authority",
              name: "authority",
              accountType: "system-account",
              constraints: [{ type: "mut" }],
            },
          ],
          body: [
            {
              type: "transfer-sol",
              sourceNodeId: "flow-transfer",
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

    expect(finding?.location.nodeId).toBe("flow-authority");
  });

  it("does NOT flag a signer account on SOL transfer", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "withdraw",
          accessControl: "none",
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
          accessControl: "none",
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
          accessControl: "none",
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
          sourceNodeId: "flow-deposit",
          name: "deposit",
          accessControl: "none",
          args: [],
          accounts: [],
          body: [
            {
              type: "math",
              sourceNodeId: "flow-math",
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
    expect(finding!.location.nodeId).toBe("flow-math");
  });

  it("does NOT flag checked arithmetic", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "deposit",
          accessControl: "none",
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

// ─── Tests: Deterministic Stress Plan ───────────────────────────────────────

describe("Deterministic stress plan", () => {
  it("generates boundary cases for numeric args, requires, arithmetic, and account constraints", () => {
    const vaultId = uuid();
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          sourceNodeId: "flow-deposit",
          name: "deposit",
          accessControl: "none",
          args: [{ name: "amount", type: "u64" }],
          accounts: [
            {
              id: uuid(),
              name: "authority",
              accountType: "signer",
              constraints: [{ type: "signer" }],
            },
            {
              id: vaultId,
              sourceNodeId: "flow-vault",
              name: "vault",
              accountType: "account",
              constraints: [
                {
                  type: "seeds",
                  seeds: [{ type: "literal", value: "vault" }],
                  bump: "vault_bump",
                },
              ],
            },
            {
              id: uuid(),
              name: "user_token",
              accountType: "token-account",
              constraints: [{ type: "token-mint", mint: "mint" }],
            },
            {
              id: uuid(),
              name: "token_program",
              accountType: "token-program",
              constraints: [
                {
                  type: "address",
                  address: "Token111111111111111111111111111111111111",
                },
              ],
            },
          ],
          body: [
            {
              type: "require",
              sourceNodeId: "flow-require",
              condition: "amount > 0",
              errorCode: "InvalidAmount",
            },
            {
              type: "math",
              sourceNodeId: "flow-math",
              operation: "add",
              left: "vault.total",
              right: "amount",
              result: "next_total",
              checked: false,
            },
            {
              type: "cpi",
              sourceNodeId: "flow-cpi",
              targetProgram: "token_program",
              instruction: "transfer",
              accounts: [{ from: "user_token", to: "source" }],
              data: [{ name: "amount", value: "amount" }],
            },
          ],
        },
      ],
    });

    const report = runInstantAudit(ir);
    const ids = report.stressTests.map((test) => test.id);

    expect(report.stressSummary.total).toBe(report.stressTests.length);
    expect(ids).toContain("dst-deposit-input-boundary-amount-above-max");
    expect(ids).toContain("dst-deposit-require-boundary-amount-above");
    expect(ids).toContain(
      "dst-deposit-arithmetic-boundary-next-total-add-overflow",
    );
    expect(ids).toContain(
      "dst-deposit-account-validation-authority-missing-signer",
    );
    expect(ids).toContain("dst-deposit-pda-validation-vault-wrong-pda-seed");
    expect(ids).toContain(
      "dst-deposit-token-validation-user-token-wrong-token-mint",
    );
    expect(ids).toContain(
      "dst-deposit-cpi-validation-token-program-transfer-wrong-program",
    );

    const overflow = report.stressTests.find(
      (test) =>
        test.id === "dst-deposit-arithmetic-boundary-next-total-add-overflow",
    );
    expect(overflow?.severity).toBe("high");
    expect(overflow?.expected).toBe("reject");
    expect(overflow?.nodeId).toBe("flow-math");
  });
});

// ─── Tests: SOL-041 Account Not Reloaded After CPI ──────────────────────────

describe("SOL-041: Account Not Reloaded After CPI", () => {
  it("checks later instructions even when an earlier instruction has no CPI", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "setup",
          accessControl: "none",
          args: [],
          accounts: [],
          body: [],
        },
        {
          id: uuid(),
          name: "settle",
          accessControl: "none",
          args: [],
          accounts: [
            {
              id: uuid(),
              name: "vault",
              accountType: "account",
              constraints: [{ type: "mut" }],
            },
            {
              id: uuid(),
              name: "external_program",
              accountType: "program",
              constraints: [
                {
                  type: "address",
                  address: "External111111111111111111111111111111111",
                },
              ],
            },
          ],
          body: [
            {
              type: "cpi",
              targetProgram: "external_program",
              instruction: "sync",
              accounts: [{ from: "vault", to: "vault" }],
              data: [],
            },
            {
              type: "set-field",
              account: "vault",
              field: "total",
              value: "next_total",
            },
          ],
        },
      ],
    });

    const report = runInstantAudit(ir);
    const finding = report.findings.find((f) => f.ruleId === "SOL-041");

    expect(finding).toBeDefined();
    expect(finding?.location.instructionName).toBe("settle");
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
          accessControl: "none",
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
          accessControl: "none",
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
          accessControl: "none",
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
          accessControl: "none",
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
          accessControl: "none",
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

// ─── Tests: SW011-SW020 Extended Rules ──────────────────────────────────────

describe("Extended Solana Warden rules", () => {
  it("detects unsafe narrowing casts in custom code", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "cast_amount",
          accessControl: "none",
          args: [{ name: "amount", type: "u64" }],
          accounts: [],
          body: [
            {
              type: "custom-code",
              sourceNodeId: "flow-cast",
              code: "let small = amount as u8;",
              inputs: ["amount"],
              outputs: ["small"],
            },
          ],
        },
      ],
    });

    const finding = runInstantAudit(ir).findings.find(
      (f) => f.ruleId === "SOL-011",
    );
    expect(finding?.standardIds).toContain("SW005");
    expect(finding?.location.nodeId).toBe("flow-cast");
  });

  it("detects CPI target programs modeled as unchecked accounts", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "swap",
          accessControl: "none",
          args: [],
          accounts: [
            {
              id: uuid(),
              name: "dex_program",
              accountType: "unchecked-account",
              constraints: [],
            },
          ],
          body: [
            {
              type: "cpi",
              targetProgram: "dex_program",
              instruction: "swap",
              accounts: [],
              data: [],
            },
          ],
        },
      ],
    });

    const finding = runInstantAudit(ir).findings.find(
      (f) => f.ruleId === "SOL-042",
    );
    expect(finding?.standardIds).toContain("SW020");
    expect(finding?.severity).toBe("critical");
  });

  it("detects untyped data accounts", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "load_vault",
          accessControl: "none",
          args: [],
          accounts: [
            {
              id: uuid(),
              name: "vault_state",
              accountType: "unchecked-account",
              stateType: "VaultState",
              constraints: [],
            },
          ],
          body: [],
        },
      ],
    });

    const finding = runInstantAudit(ir).findings.find(
      (f) => f.ruleId === "SOL-072",
    );
    expect(finding?.standardIds).toEqual(
      expect.arrayContaining(["SW007", "SW011"]),
    );
  });

  it("detects missing mut on modified accounts", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "write_state",
          accessControl: "none",
          args: [],
          accounts: [
            {
              id: uuid(),
              name: "state",
              accountType: "account",
              stateType: "State",
              constraints: [],
            },
          ],
          body: [
            {
              type: "set-field",
              account: "state",
              field: "value",
              value: "1",
            },
          ],
        },
      ],
    });

    const finding = runInstantAudit(ir).findings.find(
      (f) => f.ruleId === "SOL-070",
    );
    expect(finding?.standardIds).toContain("SW015");
    expect(finding?.severity).toBe("high");
  });

  it("detects init_if_needed and missing realloc zeroing", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "resize",
          accessControl: "none",
          args: [],
          accounts: [
            {
              id: uuid(),
              name: "session_state",
              accountType: "account",
              stateType: "SessionState",
              constraints: [
                { type: "init-if-needed", payer: "authority", space: "auto" },
                {
                  type: "realloc",
                  space: 256,
                  payer: "authority",
                  zeroInit: false,
                },
              ],
            },
          ],
          body: [],
        },
      ],
    });

    const report = runInstantAudit(ir);
    expect(
      report.findings.find((f) => f.ruleId === "SOL-071")?.standardIds,
    ).toContain("SW016");
    expect(
      report.findings.find((f) => f.ruleId === "SOL-062")?.standardIds,
    ).toContain("SW018");
  });

  it("detects PDA domain and lifecycle risks", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "open_offer",
          accessControl: "none",
          args: [{ name: "bump", type: "u8" }],
          accounts: [
            {
              id: uuid(),
              name: "authority",
              accountType: "signer",
              constraints: [{ type: "signer" }],
            },
            {
              id: uuid(),
              name: "offer",
              accountType: "account",
              stateType: "OfferState",
              constraints: [
                { type: "init", payer: "authority", space: "auto" },
                {
                  type: "seeds",
                  seeds: [{ type: "literal", value: "offer" }],
                  bump: "bump",
                },
              ],
            },
          ],
          body: [],
        },
      ],
    });

    const report = runInstantAudit(ir);
    expect(
      report.findings.find((f) => f.ruleId === "SOL-004")?.standardIds,
    ).toContain("SW004");
    expect(
      report.findings.find((f) => f.ruleId === "SOL-023")?.standardIds,
    ).toContain("SW013");
    expect(
      report.findings.find((f) => f.ruleId === "SOL-052")?.standardIds,
    ).toContain("SW017");
  });

  it("adds deterministic stress cases for lifecycle risks", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "resize",
          accessControl: "none",
          args: [],
          accounts: [
            {
              id: uuid(),
              sourceNodeId: "flow-state",
              name: "state",
              accountType: "account",
              stateType: "State",
              constraints: [],
            },
            {
              id: uuid(),
              sourceNodeId: "flow-buffer",
              name: "buffer",
              accountType: "account",
              stateType: "Buffer",
              constraints: [
                {
                  type: "realloc",
                  space: 128,
                  payer: "authority",
                  zeroInit: false,
                },
              ],
            },
          ],
          body: [
            {
              type: "set-field",
              account: "state",
              field: "value",
              value: "1",
            },
          ],
        },
      ],
    });

    const report = runInstantAudit(ir);
    expect(
      report.stressTests.find((test) =>
        test.id.includes("readonly-mutated-account"),
      )?.nodeId,
    ).toBe("flow-state");
    expect(
      report.stressTests.find((test) => test.id.includes("realloc-stale-bytes"))
        ?.nodeId,
    ).toBe("flow-buffer");
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
          accessControl: "none",
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
          accessControl: "none",
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
          accessControl: "none",
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
          accessControl: "none",
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

describe("SW001-SW020 security standard mapping", () => {
  it("covers every product-facing Solana security rule", () => {
    expect(SOLANA_SECURITY_STANDARD_RULES.map((rule) => rule.id)).toEqual([
      "SW001",
      "SW002",
      "SW003",
      "SW004",
      "SW005",
      "SW006",
      "SW007",
      "SW008",
      "SW009",
      "SW010",
      "SW011",
      "SW012",
      "SW013",
      "SW014",
      "SW015",
      "SW016",
      "SW017",
      "SW018",
      "SW019",
      "SW020",
    ]);

    for (const rule of SOLANA_SECURITY_STANDARD_RULES) {
      expect(rule.auditRuleIds.length).toBeGreaterThan(0);
    }
  });

  it("annotates findings with matching SW identifiers", () => {
    const ir = baseIR({
      instructions: [
        {
          id: uuid(),
          name: "withdraw",
          accessControl: "none",
          args: [],
          accounts: [
            {
              id: uuid(),
              name: "authority",
              accountType: "system-account",
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
    expect(finding?.standardIds).toContain("SW001");
    expect(getStandardIdsForAuditRule("SOL-040")).toEqual(["SW003", "SW020"]);
    expect(getStandardIdsForAuditRule("SOL-073")).toEqual(["SW019"]);
  });
});
