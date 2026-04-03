// Properties Panel — right sidebar.
// Renders a form for the currently selected node's data fields.
// Each node type gets its own sub-form.

"use client";

import React from "react";
import { X, Code2, Zap, Wallet, Database, Settings, Shield, AlertTriangle, Radio, GitBranch, Terminal } from "lucide-react";
import { useFlowStore } from "@/store/flow-store";
import { useUIStore } from "@/store/ui-store";
import type { ProgramNodeData } from "@solflow/flow-nodes";
import type { InstructionNodeData } from "@solflow/flow-nodes";
import type { AccountNodeData, AccountType } from "@solflow/flow-nodes";
import type { StateNodeData, StateField, SolanaType } from "@solflow/flow-nodes";
import type { ConstraintNodeData, ConstraintType } from "@solflow/flow-nodes";
import type { ErrorNodeData } from "@solflow/flow-nodes";
import type { EventNodeData, EventField } from "@solflow/flow-nodes";
import type { LogicNodeData, LogicType } from "@solflow/flow-nodes";
import type { CustomCodeNodeData } from "@solflow/flow-nodes";

// ─── Field helpers ────────────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-border bg-input px-2.5 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50";

// ─── Per-node-type forms ──────────────────────────────────────────────────────

function ProgramForm({
  nodeId,
  data,
}: {
  nodeId: string;
  data: ProgramNodeData;
}) {
  const update = useFlowStore((s) => s.updateNodeData);
  const set = (partial: Partial<ProgramNodeData>) => update(nodeId, partial);

  return (
    <div className="space-y-3">
      <FieldRow label="Program Name">
        <input
          className={`${inputClass} font-mono`}
          value={data.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="my_program"
        />
      </FieldRow>
      <FieldRow label="Description">
        <textarea
          className={`${inputClass} resize-none`}
          rows={2}
          value={data.description ?? ""}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="What does this program do?"
        />
      </FieldRow>
      <FieldRow label="Version">
        <input
          className={inputClass}
          value={data.version ?? "0.1.0"}
          onChange={(e) => set({ version: e.target.value })}
          placeholder="0.1.0"
        />
      </FieldRow>
      <FieldRow label="Program ID (optional)">
        <input
          className={`${inputClass} font-mono`}
          value={data.programId ?? ""}
          onChange={(e) => set({ programId: e.target.value })}
          placeholder="11111111…"
        />
      </FieldRow>
      <FieldRow label="License">
        <select
          className={inputClass}
          value={data.license ?? "MIT"}
          onChange={(e) => set({ license: e.target.value })}
        >
          {["MIT", "Apache-2.0", "GPL-3.0", "UNLICENSED"].map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </FieldRow>
    </div>
  );
}

const SOLANA_PRIMITIVES = [
  "bool",
  "u8","u16","u32","u64","u128",
  "i8","i16","i32","i64","i128",
  "f32","f64","String","Pubkey",
];

function InstructionForm({
  nodeId,
  data,
}: {
  nodeId: string;
  data: InstructionNodeData;
}) {
  const update = useFlowStore((s) => s.updateNodeData);
  const set = (partial: Partial<InstructionNodeData>) => update(nodeId, partial);

  const args = data.instructionData ?? [];

  const addArg = () => {
    set({ instructionData: [...args, { name: `arg${args.length + 1}`, type: "u64" }] });
  };

  const removeArg = (i: number) => {
    set({ instructionData: args.filter((_, idx) => idx !== i) });
  };

  const updateArg = (i: number, field: string, value: string) => {
    set({
      instructionData: args.map((a, idx) =>
        idx === i ? { ...a, [field]: value } : a
      ),
    });
  };

  return (
    <div className="space-y-3">
      <FieldRow label="Instruction Name">
        <input
          className={`${inputClass} font-mono`}
          value={data.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="initialize"
        />
      </FieldRow>
      <FieldRow label="Description">
        <textarea
          className={`${inputClass} resize-none`}
          rows={2}
          value={data.description ?? ""}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="What does this instruction do?"
        />
      </FieldRow>
      <FieldRow label="Access Control">
        <select
          className={inputClass}
          value={data.accessControl ?? "none"}
          onChange={(e) =>
            set({ accessControl: e.target.value as InstructionNodeData["accessControl"] })
          }
        >
          <option value="none">None</option>
          <option value="admin_only">Admin only</option>
          <option value="custom">Custom</option>
        </select>
      </FieldRow>

      {/* Instruction arguments */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">
            Arguments ({args.length})
          </span>
          <button
            onClick={addArg}
            className="text-[10px] text-primary hover:underline"
          >
            + Add
          </button>
        </div>
        <div className="space-y-1.5">
          {args.map((arg, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                className={`${inputClass} flex-1 font-mono`}
                value={arg.name}
                onChange={(e) => updateArg(i, "name", e.target.value)}
                placeholder="name"
              />
              <select
                className={`${inputClass} w-24 shrink-0`}
                value={typeof arg.type === "string" ? arg.type : "u64"}
                onChange={(e) => updateArg(i, "type", e.target.value)}
              >
                {SOLANA_PRIMITIVES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                onClick={() => removeArg(i)}
                className="shrink-0 text-muted-foreground/60 hover:text-destructive"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const ACCOUNT_TYPES: AccountType[] = [
  "account","system-account","signer","program","token-account","mint",
  "associated-token","unchecked-account","system-program","token-program",
  "rent","clock","custom",
];

function AccountForm({
  nodeId,
  data,
}: {
  nodeId: string;
  data: AccountNodeData;
}) {
  const update = useFlowStore((s) => s.updateNodeData);
  const set = (partial: Partial<AccountNodeData>) => update(nodeId, partial);

  return (
    <div className="space-y-3">
      <FieldRow label="Account Name">
        <input
          className={`${inputClass} font-mono`}
          value={data.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="authority"
        />
      </FieldRow>
      <FieldRow label="Account Type">
        <select
          className={inputClass}
          value={data.accountType ?? "account"}
          onChange={(e) => set({ accountType: e.target.value as AccountType })}
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </FieldRow>

      {/* Flags */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">Flags</span>
        {(
          [
            ["isMut", "Mutable (#[account(mut)])"],
            ["isSigner", "Signer"],
            ["isInit", "Init (#[account(init)])"],
            ["isClose", "Close"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={!!(data as Record<string, unknown>)[key]}
              onChange={(e) => set({ [key]: e.target.checked })}
              className="rounded"
            />
            <span className="text-xs">{label}</span>
          </label>
        ))}
      </div>

      {data.isInit && (
        <FieldRow label="Payer account">
          <input
            className={`${inputClass} font-mono`}
            value={data.payer ?? ""}
            onChange={(e) => set({ payer: e.target.value })}
            placeholder="payer"
          />
        </FieldRow>
      )}
      {data.isInit && (
        <FieldRow label="Space (bytes or &apos;auto&apos;)">
          <input
            className={inputClass}
            value={data.space !== undefined ? String(data.space) : ""}
            onChange={(e) =>
              set({
                space:
                  e.target.value === "auto"
                    ? "auto"
                    : Number(e.target.value) || undefined,
              })
            }
            placeholder="auto"
          />
        </FieldRow>
      )}

      <FieldRow label="Description">
        <textarea
          className={`${inputClass} resize-none`}
          rows={2}
          value={data.description ?? ""}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="What is this account?"
        />
      </FieldRow>
    </div>
  );
}

function StateForm({
  nodeId,
  data,
}: {
  nodeId: string;
  data: StateNodeData;
}) {
  const update = useFlowStore((s) => s.updateNodeData);
  const set = (partial: Partial<StateNodeData>) => update(nodeId, partial);

  const fields = data.fields ?? [];

  const addField = () => {
    set({
      fields: [...fields, { name: `field${fields.length + 1}`, type: "u64" as SolanaType }],
    });
  };

  const removeField = (i: number) => {
    set({ fields: fields.filter((_, idx) => idx !== i) });
  };

  const updateField = (i: number, key: keyof StateField, value: string) => {
    set({
      fields: fields.map((f, idx) =>
        idx === i ? { ...f, [key]: key === "type" ? (value as SolanaType) : value } : f
      ),
    });
  };

  return (
    <div className="space-y-3">
      <FieldRow label="Struct Name">
        <input
          className={`${inputClass} font-mono`}
          value={data.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="VaultState"
        />
      </FieldRow>

      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={!!data.isZeroCopy}
          onChange={(e) => set({ isZeroCopy: e.target.checked })}
          className="rounded"
        />
        <span className="text-xs">Zero-copy (#[account(zero_copy)])</span>
      </label>

      {/* Fields */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">
            Fields ({fields.length})
          </span>
          <button
            onClick={addField}
            className="text-[10px] text-primary hover:underline"
          >
            + Add field
          </button>
        </div>
        <div className="space-y-1.5">
          {fields.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                className={`${inputClass} flex-1 font-mono`}
                value={f.name}
                onChange={(e) => updateField(i, "name", e.target.value)}
                placeholder="amount"
              />
              <select
                className={`${inputClass} w-24 shrink-0`}
                value={typeof f.type === "string" ? f.type : "u64"}
                onChange={(e) => updateField(i, "type", e.target.value)}
              >
                {SOLANA_PRIMITIVES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                onClick={() => removeField(i)}
                className="shrink-0 text-muted-foreground/60 hover:text-destructive"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Constraint form ──────────────────────────────────────────────────────────

const CONSTRAINT_TYPES: ConstraintType[] = [
  "mut","signer","init","init-if-needed","close","has-one","seeds",
  "owner","address","token-authority","token-mint","realloc","custom",
];

function ConstraintForm({ nodeId, data }: { nodeId: string; data: ConstraintNodeData }) {
  const update = useFlowStore((s) => s.updateNodeData);
  const set = (partial: Partial<ConstraintNodeData>) => update(nodeId, partial);
  const ct = data.constraintType ?? "mut";

  return (
    <div className="space-y-3">
      <FieldRow label="Constraint Type">
        <select
          className={inputClass}
          value={ct}
          onChange={(e) => set({ constraintType: e.target.value as ConstraintType })}
        >
          {CONSTRAINT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </FieldRow>

      {(ct === "init" || ct === "init-if-needed") && (
        <>
          <FieldRow label="Payer account">
            <input className={`${inputClass} font-mono`} value={data.payer ?? ""} onChange={(e) => set({ payer: e.target.value })} placeholder="payer" />
          </FieldRow>
          <FieldRow label="Space (bytes or 'auto')">
            <input className={inputClass} value={data.space !== undefined ? String(data.space) : ""} onChange={(e) => set({ space: e.target.value === "auto" ? "auto" : (Number(e.target.value) || undefined) })} placeholder="auto" />
          </FieldRow>
        </>
      )}
      {ct === "close" && (
        <FieldRow label="Close target account">
          <input className={`${inputClass} font-mono`} value={data.closeTarget ?? ""} onChange={(e) => set({ closeTarget: e.target.value })} placeholder="receiver" />
        </FieldRow>
      )}
      {ct === "has-one" && (
        <>
          <FieldRow label="Field name">
            <input className={`${inputClass} font-mono`} value={data.hasOneField ?? ""} onChange={(e) => set({ hasOneField: e.target.value })} placeholder="authority" />
          </FieldRow>
          <FieldRow label="Target account">
            <input className={`${inputClass} font-mono`} value={data.hasOneTarget ?? ""} onChange={(e) => set({ hasOneTarget: e.target.value })} placeholder="authority" />
          </FieldRow>
          <FieldRow label="Error code (optional)">
            <input className={inputClass} value={data.hasOneErrorCode ?? ""} onChange={(e) => set({ hasOneErrorCode: e.target.value })} placeholder="Unauthorized" />
          </FieldRow>
        </>
      )}
      {ct === "seeds" && (
        <>
          <FieldRow label="Seeds (comma-separated)">
            <input className={`${inputClass} font-mono`} value={data.seeds ?? ""} onChange={(e) => set({ seeds: e.target.value })} placeholder='b"vault", authority.key().as_ref()' />
          </FieldRow>
          <FieldRow label="Bump var (optional)">
            <input className={`${inputClass} font-mono`} value={data.bump ?? ""} onChange={(e) => set({ bump: e.target.value })} placeholder="bump" />
          </FieldRow>
        </>
      )}
      {ct === "owner" && (
        <FieldRow label="Owner program">
          <input className={`${inputClass} font-mono`} value={data.owner ?? ""} onChange={(e) => set({ owner: e.target.value })} placeholder="program_id" />
        </FieldRow>
      )}
      {ct === "address" && (
        <FieldRow label="Expected address">
          <input className={`${inputClass} font-mono`} value={data.address ?? ""} onChange={(e) => set({ address: e.target.value })} placeholder="pubkey" />
        </FieldRow>
      )}
      {ct === "token-authority" && (
        <FieldRow label="Authority account">
          <input className={`${inputClass} font-mono`} value={data.tokenAuthority ?? ""} onChange={(e) => set({ tokenAuthority: e.target.value })} placeholder="authority" />
        </FieldRow>
      )}
      {ct === "token-mint" && (
        <FieldRow label="Mint account">
          <input className={`${inputClass} font-mono`} value={data.tokenMint ?? ""} onChange={(e) => set({ tokenMint: e.target.value })} placeholder="mint" />
        </FieldRow>
      )}
      {ct === "realloc" && (
        <>
          <FieldRow label="New space (bytes)">
            <input className={inputClass} type="number" value={data.reallocSpace ?? ""} onChange={(e) => set({ reallocSpace: Number(e.target.value) })} placeholder="256" />
          </FieldRow>
          <FieldRow label="Payer account">
            <input className={`${inputClass} font-mono`} value={data.reallocPayer ?? ""} onChange={(e) => set({ reallocPayer: e.target.value })} placeholder="payer" />
          </FieldRow>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={!!data.reallocZeroInit} onChange={(e) => set({ reallocZeroInit: e.target.checked })} className="rounded" />
            <span className="text-xs">Zero-init new bytes</span>
          </label>
        </>
      )}
      {ct === "custom" && (
        <>
          <FieldRow label="Expression">
            <input className={`${inputClass} font-mono`} value={data.expression ?? ""} onChange={(e) => set({ expression: e.target.value })} placeholder="ctx.accounts.vault.amount > 0" />
          </FieldRow>
          <FieldRow label="Error code (optional)">
            <input className={inputClass} value={data.errorCode ?? ""} onChange={(e) => set({ errorCode: e.target.value })} placeholder="InvalidAmount" />
          </FieldRow>
        </>
      )}
    </div>
  );
}

// ─── Error form ───────────────────────────────────────────────────────────────

function ErrorForm({ nodeId, data }: { nodeId: string; data: ErrorNodeData }) {
  const update = useFlowStore((s) => s.updateNodeData);
  const set = (partial: Partial<ErrorNodeData>) => update(nodeId, partial);

  return (
    <div className="space-y-3">
      <FieldRow label="Error Name (PascalCase)">
        <input
          className={`${inputClass} font-mono`}
          value={data.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="InsufficientFunds"
        />
      </FieldRow>
      <FieldRow label="Error Code">
        <input
          className={inputClass}
          type="number"
          value={data.code ?? 6000}
          onChange={(e) => set({ code: Number(e.target.value) })}
          placeholder="6000"
        />
      </FieldRow>
      <FieldRow label="Message">
        <input
          className={inputClass}
          value={data.message ?? ""}
          onChange={(e) => set({ message: e.target.value })}
          placeholder="Insufficient funds"
        />
      </FieldRow>
    </div>
  );
}

// ─── Event form ───────────────────────────────────────────────────────────────

function EventForm({ nodeId, data }: { nodeId: string; data: EventNodeData }) {
  const update = useFlowStore((s) => s.updateNodeData);
  const set = (partial: Partial<EventNodeData>) => update(nodeId, partial);
  const fields = data.fields ?? [];

  const addField = () => set({ fields: [...fields, { name: `field${fields.length + 1}`, type: "u64" }] });
  const removeField = (i: number) => set({ fields: fields.filter((_, idx) => idx !== i) });
  const updateField = (i: number, key: keyof EventField, value: string) =>
    set({ fields: fields.map((f, idx) => idx === i ? { ...f, [key]: value } : f) });

  return (
    <div className="space-y-3">
      <FieldRow label="Event Name (PascalCase)">
        <input className={`${inputClass} font-mono`} value={data.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="TransferEvent" />
      </FieldRow>
      <FieldRow label="Description">
        <textarea className={`${inputClass} resize-none`} rows={2} value={data.description ?? ""} onChange={(e) => set({ description: e.target.value })} placeholder="Emitted when..." />
      </FieldRow>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">Fields ({fields.length})</span>
          <button onClick={addField} className="text-[10px] text-primary hover:underline">+ Add</button>
        </div>
        <div className="space-y-1.5">
          {fields.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input className={`${inputClass} flex-1 font-mono`} value={f.name} onChange={(e) => updateField(i, "name", e.target.value)} placeholder="amount" />
              <select className={`${inputClass} w-24 shrink-0`} value={typeof f.type === "string" ? f.type : "u64"} onChange={(e) => updateField(i, "type", e.target.value)}>
                {SOLANA_PRIMITIVES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button onClick={() => removeField(i)} className="shrink-0 text-muted-foreground/60 hover:text-destructive"><X size={12} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Logic form ───────────────────────────────────────────────────────────────

const LOGIC_TYPES: LogicType[] = [
  "set-field","transfer-sol","transfer-token","mint-to","burn",
  "require","if-else","emit-event","return-error","math","cpi",
];

function LogicForm({ nodeId, data }: { nodeId: string; data: LogicNodeData }) {
  const update = useFlowStore((s) => s.updateNodeData);
  const set = (partial: Partial<LogicNodeData>) => update(nodeId, partial);
  const lt = data.logicType ?? "set-field";

  return (
    <div className="space-y-3">
      <FieldRow label="Operation">
        <select className={inputClass} value={lt} onChange={(e) => set({ logicType: e.target.value as LogicType })}>
          {LOGIC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </FieldRow>

      {lt === "set-field" && (
        <>
          <FieldRow label="Account"><input className={`${inputClass} font-mono`} value={data.setAccount ?? ""} onChange={(e) => set({ setAccount: e.target.value })} placeholder="counter" /></FieldRow>
          <FieldRow label="Field"><input className={`${inputClass} font-mono`} value={data.setField ?? ""} onChange={(e) => set({ setField: e.target.value })} placeholder="count" /></FieldRow>
          <FieldRow label="Value"><input className={`${inputClass} font-mono`} value={data.setValue ?? ""} onChange={(e) => set({ setValue: e.target.value })} placeholder="0" /></FieldRow>
        </>
      )}
      {(lt === "transfer-sol" || lt === "transfer-token") && (
        <>
          <FieldRow label="From"><input className={`${inputClass} font-mono`} value={data.transferFrom ?? ""} onChange={(e) => set({ transferFrom: e.target.value })} placeholder="sender" /></FieldRow>
          <FieldRow label="To"><input className={`${inputClass} font-mono`} value={data.transferTo ?? ""} onChange={(e) => set({ transferTo: e.target.value })} placeholder="receiver" /></FieldRow>
          <FieldRow label="Amount"><input className={`${inputClass} font-mono`} value={data.transferAmount ?? ""} onChange={(e) => set({ transferAmount: e.target.value })} placeholder="1_000_000" /></FieldRow>
        </>
      )}
      {lt === "require" && (
        <>
          <FieldRow label="Condition"><input className={`${inputClass} font-mono`} value={data.requireCondition ?? ""} onChange={(e) => set({ requireCondition: e.target.value })} placeholder="ctx.accounts.counter.count < 100" /></FieldRow>
          <FieldRow label="Error code"><input className={`${inputClass} font-mono`} value={data.requireErrorCode ?? ""} onChange={(e) => set({ requireErrorCode: e.target.value })} placeholder="CounterOverflow" /></FieldRow>
        </>
      )}
      {lt === "if-else" && (
        <FieldRow label="Condition"><input className={`${inputClass} font-mono`} value={data.ifCondition ?? ""} onChange={(e) => set({ ifCondition: e.target.value })} placeholder="some_bool_expr" /></FieldRow>
      )}
      {lt === "emit-event" && (
        <FieldRow label="Event name"><input className={`${inputClass} font-mono`} value={data.emitEvent ?? ""} onChange={(e) => set({ emitEvent: e.target.value })} placeholder="TransferEvent" /></FieldRow>
      )}
      {lt === "return-error" && (
        <FieldRow label="Error code"><input className={`${inputClass} font-mono`} value={data.returnErrorCode ?? ""} onChange={(e) => set({ returnErrorCode: e.target.value })} placeholder="Unauthorized" /></FieldRow>
      )}
      {lt === "math" && (
        <>
          <FieldRow label="Left operand"><input className={`${inputClass} font-mono`} value={data.mathLeft ?? ""} onChange={(e) => set({ mathLeft: e.target.value })} placeholder="counter.count" /></FieldRow>
          <FieldRow label="Operation">
            <select className={inputClass} value={data.mathOperation ?? "add"} onChange={(e) => set({ mathOperation: e.target.value as LogicNodeData["mathOperation"] })}>
              {(["add","sub","mul","div","mod"] as const).map((op) => <option key={op} value={op}>{op}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Right operand"><input className={`${inputClass} font-mono`} value={data.mathRight ?? ""} onChange={(e) => set({ mathRight: e.target.value })} placeholder="1" /></FieldRow>
          <FieldRow label="Result var"><input className={`${inputClass} font-mono`} value={data.mathResult ?? ""} onChange={(e) => set({ mathResult: e.target.value })} placeholder="new_count" /></FieldRow>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={!!data.mathChecked} onChange={(e) => set({ mathChecked: e.target.checked })} className="rounded" />
            <span className="text-xs">Checked arithmetic (overflow-safe)</span>
          </label>
        </>
      )}
      {lt === "cpi" && (
        <>
          <FieldRow label="Target program"><input className={`${inputClass} font-mono`} value={data.cpiProgram ?? ""} onChange={(e) => set({ cpiProgram: e.target.value })} placeholder="token_program" /></FieldRow>
          <FieldRow label="Instruction"><input className={`${inputClass} font-mono`} value={data.cpiInstruction ?? ""} onChange={(e) => set({ cpiInstruction: e.target.value })} placeholder="transfer" /></FieldRow>
        </>
      )}
    </div>
  );
}

// ─── Custom Code form ─────────────────────────────────────────────────────────

function CustomCodeForm({ nodeId, data }: { nodeId: string; data: CustomCodeNodeData }) {
  const update = useFlowStore((s) => s.updateNodeData);
  const set = (partial: Partial<CustomCodeNodeData>) => update(nodeId, partial);

  const inputsStr = (data.inputs ?? []).join(", ");
  const outputsStr = (data.outputs ?? []).join(", ");

  return (
    <div className="space-y-3">
      <FieldRow label="Description">
        <textarea className={`${inputClass} resize-none`} rows={2} value={data.description ?? ""} onChange={(e) => set({ description: e.target.value })} placeholder="What does this code do?" />
      </FieldRow>
      <FieldRow label="Input bindings (comma-separated)">
        <input className={`${inputClass} font-mono`} value={inputsStr} onChange={(e) => set({ inputs: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="counter, authority" />
      </FieldRow>
      <FieldRow label="Output bindings (comma-separated)">
        <input className={`${inputClass} font-mono`} value={outputsStr} onChange={(e) => set({ outputs: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="result" />
      </FieldRow>
      <FieldRow label="Rust code">
        <textarea
          className={`${inputClass} resize-y font-mono text-[11px]`}
          rows={8}
          value={data.code ?? ""}
          onChange={(e) => set({ code: e.target.value })}
          placeholder={"// Write Rust code here\nlet x = ctx.accounts.counter.count + 1;"}
          spellCheck={false}
        />
      </FieldRow>
    </div>
  );
}

// ─── Main PropertiesPanel ─────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  program:       { label: "Program Root",      icon: <Code2 size={13} />,         color: "#4a47a3" },
  instruction:   { label: "Instruction",       icon: <Zap size={13} />,           color: "#2563eb" },
  account:       { label: "Account",           icon: <Wallet size={13} />,        color: "#16a34a" },
  state:         { label: "State Definition",  icon: <Database size={13} />,      color: "#7c3aed" },
  constraint:    { label: "Constraint",        icon: <Shield size={13} />,        color: "#ea580c" },
  error:         { label: "Error Definition",  icon: <AlertTriangle size={13} />, color: "#dc2626" },
  event:         { label: "Event",             icon: <Radio size={13} />,         color: "#eab308" },
  logic:         { label: "Logic Block",       icon: <GitBranch size={13} />,     color: "#0d9488" },
  "custom-code": { label: "Rust Code Block",   icon: <Terminal size={13} />,      color: "#374151" },
};

export function PropertiesPanel() {
  const { propertiesOpen, toggleProperties } = useUIStore();
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const nodes = useFlowStore((s) => s.nodes);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  if (!propertiesOpen) return null;

  const meta = selectedNode
    ? TYPE_META[selectedNode.type ?? ""] ?? {
        label: selectedNode.type ?? "Node",
        icon: <Settings size={13} />,
        color: "#6b7280",
      }
    : null;

  return (
    <div className="flex h-full w-[260px] flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          {meta && (
            <span
              className="flex h-5 w-5 items-center justify-center rounded"
              style={{
                background: `${meta.color}22`,
                color: meta.color,
              }}
            >
              {meta.icon}
            </span>
          )}
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {meta ? meta.label : "Properties"}
          </p>
        </div>
        <button
          onClick={toggleProperties}
          className="text-muted-foreground hover:text-foreground"
        >
          <X size={13} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3">
        {!selectedNode ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Settings className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              Select a node to edit its properties
            </p>
          </div>
        ) : selectedNode.type === "program" ? (
          <ProgramForm
            nodeId={selectedNode.id}
            data={selectedNode.data as ProgramNodeData}
          />
        ) : selectedNode.type === "instruction" ? (
          <InstructionForm
            nodeId={selectedNode.id}
            data={selectedNode.data as InstructionNodeData}
          />
        ) : selectedNode.type === "account" ? (
          <AccountForm
            nodeId={selectedNode.id}
            data={selectedNode.data as AccountNodeData}
          />
        ) : selectedNode.type === "state" ? (
          <StateForm
            nodeId={selectedNode.id}
            data={selectedNode.data as StateNodeData}
          />
        ) : selectedNode.type === "constraint" ? (
          <ConstraintForm
            nodeId={selectedNode.id}
            data={selectedNode.data as ConstraintNodeData}
          />
        ) : selectedNode.type === "error" ? (
          <ErrorForm
            nodeId={selectedNode.id}
            data={selectedNode.data as ErrorNodeData}
          />
        ) : selectedNode.type === "event" ? (
          <EventForm
            nodeId={selectedNode.id}
            data={selectedNode.data as EventNodeData}
          />
        ) : selectedNode.type === "logic" ? (
          <LogicForm
            nodeId={selectedNode.id}
            data={selectedNode.data as LogicNodeData}
          />
        ) : selectedNode.type === "custom-code" ? (
          <CustomCodeForm
            nodeId={selectedNode.id}
            data={selectedNode.data as CustomCodeNodeData}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            No editor for type &ldquo;{selectedNode.type}&rdquo; yet.
          </p>
        )}
      </div>
    </div>
  );
}
