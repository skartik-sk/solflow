import { flowToIR } from "@solflow/ir";
import { generateCode } from "../src/index";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { request } from "https";

const execFileAsync = promisify(execFile);

// Simple Vault flow data from seed.ts (simplified edge format)
const nodes = [
  { id: "prog", type: "program", position: { x: 40, y: 280 }, data: { name: "vault", version: "0.1.0", programId: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS" } },
  { id: "ix-init", type: "instruction", position: { x: 260, y: 40 }, data: { name: "initialize", args: [], accessControl: "none" } },
  { id: "ix-deposit", type: "instruction", position: { x: 260, y: 200 }, data: { name: "deposit", args: [{ name: "amount", type: "u64" }], accessControl: "none" } },
  { id: "ix-withdraw", type: "instruction", position: { x: 260, y: 400 }, data: { name: "withdraw", args: [{ name: "amount", type: "u64" }], accessControl: "none" } },
  { id: "ix-close", type: "instruction", position: { x: 260, y: 600 }, data: { name: "close_vault", args: [], accessControl: "none" } },
  { id: "acc-init-vault", type: "account", position: { x: 520, y: 40 }, data: { name: "vault", accountType: "account", isMut: true, isInit: true, isSigner: false, isClose: false, payer: "authority", space: "auto", stateType: "VaultState", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" } },
  { id: "acc-init-auth", type: "account", position: { x: 740, y: 40 }, data: { name: "authority", accountType: "signer", isMut: false, isSigner: true, isInit: false, isClose: false } },
  { id: "acc-init-sys", type: "account", position: { x: 740, y: 120 }, data: { name: "system_program", accountType: "system-program", isMut: false, isSigner: false, isInit: false, isClose: false } },
  { id: "acc-dep-vault", type: "account", position: { x: 520, y: 200 }, data: { name: "vault", accountType: "account", isMut: true, isSigner: false, isInit: false, isClose: false, stateType: "VaultState", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" } },
  { id: "acc-dep-auth", type: "account", position: { x: 740, y: 200 }, data: { name: "authority", accountType: "signer", isMut: false, isSigner: true, isInit: false, isClose: false } },
  { id: "acc-dep-sys", type: "account", position: { x: 740, y: 280 }, data: { name: "system_program", accountType: "system-program", isMut: false, isSigner: false, isInit: false, isClose: false } },
  { id: "acc-wd-vault", type: "account", position: { x: 520, y: 400 }, data: { name: "vault", accountType: "account", isMut: true, isSigner: false, isInit: false, isClose: false, stateType: "VaultState", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" } },
  { id: "acc-wd-auth", type: "account", position: { x: 740, y: 400 }, data: { name: "authority", accountType: "signer", isMut: false, isSigner: true, isInit: false, isClose: false } },
  { id: "acc-wd-sys", type: "account", position: { x: 740, y: 480 }, data: { name: "system_program", accountType: "system-program", isMut: false, isSigner: false, isInit: false, isClose: false } },
  { id: "acc-cl-vault", type: "account", position: { x: 520, y: 600 }, data: { name: "vault", accountType: "account", isMut: true, isSigner: false, isInit: false, isClose: true, closeTarget: "authority", stateType: "VaultState", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" } },
  { id: "acc-cl-auth", type: "account", position: { x: 740, y: 600 }, data: { name: "authority", accountType: "signer", isMut: false, isSigner: true, isInit: false, isClose: false } },
  { id: "acc-cl-sys", type: "account", position: { x: 740, y: 680 }, data: { name: "system_program", accountType: "system-program", isMut: false, isSigner: false, isInit: false, isClose: false } },
  { id: "log-init-1", type: "logic", position: { x: 520, y: 80 }, data: { logicType: "set-field", setAccount: "vault", setField: "authority", setValue: "*ctx.accounts.authority.key" } },
  { id: "log-init-2", type: "logic", position: { x: 520, y: 110 }, data: { logicType: "set-field", setAccount: "vault", setField: "balance", setValue: "0" } },
  { id: "log-init-3", type: "logic", position: { x: 520, y: 140 }, data: { logicType: "set-field", setAccount: "vault", setField: "bump", setValue: "ctx.bumps.vault" } },
  { id: "log-dep-1", type: "logic", position: { x: 520, y: 240 }, data: { logicType: "require", requireCondition: "amount > 0", requireErrorCode: "InvalidAmount" } },
  { id: "log-dep-2", type: "logic", position: { x: 520, y: 270 }, data: { logicType: "transfer-sol", transferFrom: "authority", transferTo: "vault", transferAmount: "amount" } },
  { id: "log-dep-3", type: "logic", position: { x: 520, y: 300 }, data: { logicType: "math", mathOperation: "add", mathLeft: "vault.balance", mathRight: "amount", mathResult: "new_balance", mathChecked: true } },
  { id: "log-dep-4", type: "logic", position: { x: 520, y: 330 }, data: { logicType: "set-field", setAccount: "vault", setField: "balance", setValue: "new_balance" } },
  { id: "log-dep-5", type: "logic", position: { x: 520, y: 360 }, data: { logicType: "emit-event", emitEvent: "DepositEvent", emitFields: { authority: "*ctx.accounts.authority.key", amount: "amount", new_balance: "new_balance" } } },
  { id: "log-wd-1", type: "logic", position: { x: 520, y: 440 }, data: { logicType: "require", requireCondition: "amount > 0", requireErrorCode: "InvalidAmount" } },
  { id: "log-wd-2", type: "logic", position: { x: 520, y: 470 }, data: { logicType: "require", requireCondition: "vault.balance >= amount", requireErrorCode: "InsufficientFunds" } },
  { id: "log-wd-3", type: "logic", position: { x: 520, y: 500 }, data: { logicType: "math", mathOperation: "sub", mathLeft: "vault.balance", mathRight: "amount", mathResult: "remaining", mathChecked: true } },
  { id: "log-wd-4", type: "logic", position: { x: 520, y: 530 }, data: { logicType: "set-field", setAccount: "vault", setField: "balance", setValue: "remaining" } },
  { id: "log-wd-5", type: "logic", position: { x: 520, y: 560 }, data: { logicType: "emit-event", emitEvent: "WithdrawEvent", emitFields: { authority: "*ctx.accounts.authority.key", amount: "amount" } } },
  { id: "state-vault", type: "state", position: { x: 960, y: 340 }, data: { name: "VaultState", fields: [{ name: "authority", type: "Pubkey", description: "Vault owner" }, { name: "balance", type: "u64", description: "Current balance" }, { name: "bump", type: "u8", description: "PDA bump" }], isZeroCopy: false } },
  { id: "err-inv", type: "error", position: { x: 40, y: 440 }, data: { name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" } },
  { id: "err-insuf", type: "error", position: { x: 40, y: 500 }, data: { name: "InsufficientFunds", code: 6001, message: "Insufficient funds in vault" } },
  { id: "evt-deposit", type: "event", position: { x: 40, y: 580 }, data: { name: "DepositEvent", fields: [{ name: "authority", type: "Pubkey" }, { name: "amount", type: "u64" }, { name: "new_balance", type: "u64" }] } },
  { id: "evt-withdraw", type: "event", position: { x: 40, y: 660 }, data: { name: "WithdrawEvent", fields: [{ name: "authority", type: "Pubkey" }, { name: "amount", type: "u64" }] } },
];

const edges = [
  { id: "e1", source: "prog", target: "ix-init", sourceHandle: "instruction-out", targetHandle: "instruction-in" },
  { id: "e2", source: "prog", target: "ix-deposit", sourceHandle: "instruction-out", targetHandle: "instruction-in" },
  { id: "e3", source: "prog", target: "ix-withdraw", sourceHandle: "instruction-out", targetHandle: "instruction-in" },
  { id: "e4", source: "prog", target: "ix-close", sourceHandle: "instruction-out", targetHandle: "instruction-in" },
  { id: "e5", source: "ix-init", target: "acc-init-vault", sourceHandle: "account-out", targetHandle: "account-in" },
  { id: "e6", source: "ix-init", target: "acc-init-auth", sourceHandle: "account-out", targetHandle: "account-in" },
  { id: "e7", source: "ix-init", target: "acc-init-sys", sourceHandle: "account-out", targetHandle: "account-in" },
  { id: "e8", source: "ix-init", target: "log-init-1", sourceHandle: "logic-out", targetHandle: "logic-in" },
  { id: "e9", source: "log-init-1", target: "log-init-2", sourceHandle: "logic-out", targetHandle: "logic-in" },
  { id: "e10", source: "log-init-2", target: "log-init-3", sourceHandle: "logic-out", targetHandle: "logic-in" },
  { id: "e11", source: "ix-deposit", target: "acc-dep-vault", sourceHandle: "account-out", targetHandle: "account-in" },
  { id: "e12", source: "ix-deposit", target: "acc-dep-auth", sourceHandle: "account-out", targetHandle: "account-in" },
  { id: "e13", source: "ix-deposit", target: "acc-dep-sys", sourceHandle: "account-out", targetHandle: "account-in" },
  { id: "e14", source: "ix-deposit", target: "log-dep-1", sourceHandle: "logic-out", targetHandle: "logic-in" },
  { id: "e15", source: "log-dep-1", target: "log-dep-2", sourceHandle: "logic-out", targetHandle: "logic-in" },
  { id: "e16", source: "log-dep-2", target: "log-dep-3", sourceHandle: "logic-out", targetHandle: "logic-in" },
  { id: "e17", source: "log-dep-3", target: "log-dep-4", sourceHandle: "logic-out", targetHandle: "logic-in" },
  { id: "e18", source: "log-dep-4", target: "log-dep-5", sourceHandle: "logic-out", targetHandle: "logic-in" },
  { id: "e19", source: "ix-withdraw", target: "acc-wd-vault", sourceHandle: "account-out", targetHandle: "account-in" },
  { id: "e20", source: "ix-withdraw", target: "acc-wd-auth", sourceHandle: "account-out", targetHandle: "account-in" },
  { id: "e21", source: "ix-withdraw", target: "acc-wd-sys", sourceHandle: "account-out", targetHandle: "account-in" },
  { id: "e22", source: "ix-withdraw", target: "log-wd-1", sourceHandle: "logic-out", targetHandle: "logic-in" },
  { id: "e23", source: "log-wd-1", target: "log-wd-2", sourceHandle: "logic-out", targetHandle: "logic-in" },
  { id: "e24", source: "log-wd-2", target: "log-wd-3", sourceHandle: "logic-out", targetHandle: "logic-in" },
  { id: "e25", source: "log-wd-3", target: "log-wd-4", sourceHandle: "logic-out", targetHandle: "logic-in" },
  { id: "e26", source: "log-wd-4", target: "log-wd-5", sourceHandle: "logic-out", targetHandle: "logic-in" },
  { id: "e27", source: "ix-close", target: "acc-cl-vault", sourceHandle: "account-out", targetHandle: "account-in" },
  { id: "e28", source: "ix-close", target: "acc-cl-auth", sourceHandle: "account-out", targetHandle: "account-in" },
  { id: "e29", source: "ix-close", target: "acc-cl-sys", sourceHandle: "account-out", targetHandle: "account-in" },
  { id: "e30", source: "state-vault", target: "acc-init-vault", sourceHandle: "data-out", targetHandle: "data-in" },
  { id: "e31", source: "err-inv", target: "ix-deposit", sourceHandle: "error-out", targetHandle: "error-in" },
  { id: "e32", source: "err-inv", target: "ix-withdraw", sourceHandle: "error-out", targetHandle: "error-in" },
  { id: "e33", source: "err-insuf", target: "ix-withdraw", sourceHandle: "error-out", targetHandle: "error-in" },
  { id: "e34", source: "evt-deposit", target: "ix-deposit", sourceHandle: "event-out", targetHandle: "event-in" },
  { id: "e35", source: "evt-withdraw", target: "ix-withdraw", sourceHandle: "event-out", targetHandle: "event-in" },
];

console.log("Converting seed vault flow to IR...");
const ir = flowToIR(nodes as any, edges as any);
console.log(`  IR: program=${ir.program.name}, instructions=${ir.instructions.length}, states=${ir.states.length}`);
console.log(JSON.stringify(ir.instructions.map(ix => ({ name: ix.name, accounts: ix.accounts.map(a => ({ name: a.name, constraints: a.constraints.map(c => c.type) })), body: ix.body.map(b => b.type) })), null, 2));

// Generate for all 3 frameworks
for (const fw of ["anchor", "pinocchio", "quasar"]) {
  const result = generateCode(ir, fw as any);
  console.log(`\n${fw}: ${result.files.length} files, ${result.errors.length} errors`);
  if (result.errors.length > 0) console.log("  ERRORS:", result.errors.map(e => e.message));
}
