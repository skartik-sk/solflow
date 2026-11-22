// Tests for rules that had none, and for the SOL-001 / SOL-051 / SOL-061 false positives.
import { describe, it, expect } from "vitest";
import type { Account, LogicOperation, ProgramIR, State } from "@solflow/ir";
import { runInstantAudit } from "../index";

let seq = 0;
const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const acc = (name: string, accountType: Account["accountType"], constraints: Account["constraints"] = [], stateType?: string): Account =>
  ({ id: id(), name, accountType, constraints, ...(stateType ? { stateType } : {}) });

function ir(accounts: Account[], body: LogicOperation[] = [], args: ProgramIR["instructions"][number]["args"] = [], states: State[] = []): ProgramIR {
  return {
    version: "1.0.0",
    program: { name: "p", version: "0.1.0", license: "MIT" },
    instructions: [{ id: id(), name: "ix", accessControl: "none", args, accounts, body }],
    states, errors: [], events: [], integrations: [], constants: [],
    metadata: { createdAt: "", updatedAt: "", flowHash: "x", generatorVersion: "0.1.0" },
  };
}
const ids = (p: ProgramIR, rule: string) => runInstantAudit(p).findings.filter((f) => f.ruleId === rule);

const vaultState: State = { id: id(), name: "Vault", isZeroCopy: false, fields: [{ name: "authority", type: "Pubkey" }, { name: "total", type: "u64" }] };

describe("SOL-001 false positives", () => {
  it("does not flag writes to a mint created in the instruction", () => {
    const p = ir([acc("mint", "mint", [{ type: "init", payer: "payer", space: "auto" }, { type: "mut" }]), acc("payer", "signer", [{ type: "signer" }, { type: "mut" }])],
      [{ type: "set-field", account: "mint", field: "decimals", value: "6" }]);
    expect(ids(p, "SOL-001")).toHaveLength(0);
  });

  it("reports an unsigned writer once, not once per set-field", () => {
    const p = ir([acc("user", "system-account", [{ type: "mut" }])],
      [{ type: "set-field", account: "user", field: "a", value: "1" }, { type: "set-field", account: "user", field: "b", value: "2" }]);
    expect(ids(p, "SOL-001")).toHaveLength(1);
  });
});

describe("SOL-003", () => {
  it("flags an unchecked account with a state type and no owner check", () => {
    expect(ids(ir([acc("data", "unchecked-account", [], "Vault")]), "SOL-003")).toHaveLength(1);
    expect(ids(ir([acc("data", "unchecked-account", [{ type: "owner", owner: "crate::ID" }], "Vault")]), "SOL-003")).toHaveLength(0);
  });
});

describe("SOL-021 / SOL-022", () => {
  it("flag seeds without a bump, and accept a bare bump", () => {
    const noBump = ir([acc("vault", "account", [{ type: "seeds", seeds: [{ type: "literal", value: "v" }] }], "Vault")]);
    expect(ids(noBump, "SOL-021")).toHaveLength(1);
    expect(ids(noBump, "SOL-022")).toHaveLength(1);
    const bare = ir([acc("vault", "account", [{ type: "seeds", seeds: [{ type: "literal", value: "v" }], bump: "" }], "Vault")]);
    expect(ids(bare, "SOL-021")).toHaveLength(0);
    expect(ids(bare, "SOL-022")).toHaveLength(0);
  });

  it("SOL-022 flags a PDA-like account with no seeds", () => {
    expect(ids(ir([acc("escrow", "account", [{ type: "mut" }], "Vault")]), "SOL-022")).toHaveLength(1);
  });
});

describe("SOL-031", () => {
  it("flags an unsigned, unconstrained token authority", () => {
    const body: LogicOperation[] = [{ type: "transfer-token", from: "src", to: "dst", authority: "auth", amount: "1" }];
    expect(ids(ir([acc("src", "token-account"), acc("dst", "token-account"), acc("auth", "system-account")], body), "SOL-031")).toHaveLength(1);
    expect(ids(ir([acc("src", "token-account"), acc("dst", "token-account"), acc("auth", "signer", [{ type: "signer" }])], body), "SOL-031")).toHaveLength(0);
  });
});

describe("SOL-050", () => {
  const args = [{ name: "amount", type: "u64" as const }];
  const transfer: LogicOperation = { type: "transfer-sol", from: "user", to: "vault", amount: "amount" };
  const accounts = [acc("user", "signer", [{ type: "signer" }, { type: "mut" }]), acc("vault", "system-account", [{ type: "mut" }])];
  it("flags numeric args used without a require", () => {
    expect(ids(ir(accounts, [transfer], args), "SOL-050")).toHaveLength(1);
    expect(ids(ir(accounts, [{ type: "require", condition: "amount > 0", errorCode: "E" }, transfer], args), "SOL-050")).toHaveLength(0);
  });
});

describe("SOL-051", () => {
  it("does not flag Anchor's close constraint (it zeroes the data)", () => {
    expect(ids(ir([acc("vault", "account", [{ type: "mut" }, { type: "close", target: "user" }], "Vault"), acc("user", "signer", [{ type: "signer" }])]), "SOL-051")).toHaveLength(0);
  });

  it("flags custom code that drains lamports without wiping the data", () => {
    const drain: LogicOperation = { type: "custom-code", code: "vault.set_lamports(0);", inputs: [], outputs: [] };
    const wiped: LogicOperation = { type: "custom-code", code: "vault.try_borrow_mut()?.fill(0);\nvault.set_lamports(0);", inputs: [], outputs: [] };
    expect(ids(ir([acc("vault", "account")], [drain]), "SOL-051")).toHaveLength(1);
    expect(ids(ir([acc("vault", "account")], [wiped]), "SOL-051")).toHaveLength(0);
  });
});

describe("SOL-060", () => {
  it("flags loops in custom code", () => {
    expect(ids(ir([], [{ type: "custom-code", code: "for x in items.iter() {}", inputs: [], outputs: [] }]), "SOL-060")).toHaveLength(1);
    expect(ids(ir([], [{ type: "custom-code", code: "let y = 1;", inputs: [], outputs: [] }]), "SOL-060")).toHaveLength(0);
  });
});

describe("SOL-061", () => {
  const realloc = (space: number) => ir([acc("vault", "account", [{ type: "mut" }, { type: "realloc", space, payer: "user", zeroInit: false }], "Vault")], [], [], [vaultState]);
  it("measures growth from the current size, not the new total", () => {
    // Vault is 8 + 32 + 8 = 48 bytes: growing to 10,280 adds 10,232 (allowed); 10,300 adds 10,252.
    expect(ids(realloc(10_280), "SOL-061")).toHaveLength(0);
    expect(ids(realloc(10_300), "SOL-061")).toHaveLength(1);
  });
  it("flags sizes over the 10 MiB account limit", () => {
    const p = ir([acc("blob", "unchecked-account", [{ type: "realloc", space: 11 * 1024 * 1024, payer: "user", zeroInit: false }])]);
    expect(ids(p, "SOL-061")).toHaveLength(1);
  });
});
