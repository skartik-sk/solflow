// Properties Panel — right sidebar.
// Renders a form for the currently selected node's data fields.
// Each node type gets its own context-aware sub-form.

"use client";

import React from "react";
import { X, Code2, Zap, Wallet, Database, Settings, Shield, AlertTriangle, Radio, GitBranch, Terminal, Puzzle, Layers, Trash2, Copy, AlignHorizontalSpaceAround, AlignVerticalSpaceAround, Minimize2 } from "lucide-react";
import { useFlowStore } from "@/store/flow-store";
import { getRFInstance } from "@/lib/rf-instance";
import { useUIStore } from "@/store/ui-store";
import { useFlowGraph } from "@/hooks/use-flow-graph";
import { TypeEditor } from "./TypeEditor";
import type { ProgramNodeData } from "@solflow/flow-nodes";
import type { InstructionNodeData } from "@solflow/flow-nodes";
import type { AccountNodeData, AccountType, SeedDefinition } from "@solflow/flow-nodes";
import type { StateNodeData, StateField, SolanaType } from "@solflow/flow-nodes";
import type { ConstraintNodeData, ConstraintType } from "@solflow/flow-nodes";
import type { ErrorNodeData } from "@solflow/flow-nodes";
import type { EventNodeData, EventField } from "@solflow/flow-nodes";
import type { LogicNodeData, LogicType } from "@solflow/flow-nodes";
import type { CustomCodeNodeData } from "@solflow/flow-nodes";
import type { IntegrationNodeData } from "@solflow/flow-nodes";

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

const inputInvalidClass =
  "w-full rounded-md border border-red-500/50 bg-input px-2.5 py-1.5 text-xs outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 placeholder:text-muted-foreground/50";

const selectClass =
  "w-full rounded-md border border-border bg-input px-2 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary";

/** Validate a snake_case identifier (not empty, matches pattern, not a Rust keyword). */
function isValidIdentifier(value: string): boolean {
  if (!value || !value.trim()) return false;
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) return false;
  const keywords = new Set(["as","async","await","break","const","continue","crate","dyn","else","enum","extern","fn","for","if","impl","in","let","loop","match","mod","move","mut","pub","ref","return","self","static","struct","super","trait","type","unsafe","use","where","while","yield"]);
  return !keywords.has(value);
}

/** Validate a PascalCase identifier (not empty, matches pattern). */
function isValidPascalIdentifier(value: string): boolean {
  if (!value || !value.trim()) return false;
  return /^[A-Z][a-zA-Z0-9]*$/.test(value);
}

/** Validate a semver-like version string. */
function isValidVersion(value: string): boolean {
  if (!value.trim()) return true;
  return /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(value.trim());
}

/** Validate a base58 Solana pubkey (roughly — 32-44 chars, base58 alphabet). */
function isValidPubkey(value: string): boolean {
  if (!value.trim()) return true;
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

/** Check if a field name is duplicated within a list. */
function isDuplicateName(names: string[], index: number): boolean {
  const name = names[index];
  if (!name) return false;
  return names.some((n, i) => i !== index && n === name);
}

function ValidationHint({ show, message }: { show: boolean; message: string }) {
  if (!show) return null;
  return <p className="text-[10px] text-red-400 mt-0.5">{message}</p>;
}

// ─── Account Type Rules ───────────────────────────────────────────────────────

interface AccountFlagRules {
  mut: boolean;
  signer: boolean;
  init: boolean;
  close: boolean;
  seeds: boolean;
  payer: boolean;
  space: boolean;
  stateType: boolean;
  specialFields: Array<"tokenAuthority" | "tokenMint" | "mintAuthority" | "mintDecimals" | "associatedAuthority" | "associatedMint" | "safetyComment">;
}

const ACCOUNT_TYPE_RULES: Record<AccountType, AccountFlagRules> = {
  "account":            { mut: true,  signer: true,  init: true,  close: true,  seeds: true,  payer: true,  space: true,  stateType: true,  specialFields: [] },
  "system-account":     { mut: true,  signer: true,  init: false, close: false, seeds: false, payer: false, space: false, stateType: false, specialFields: [] },
  "signer":             { mut: true,  signer: false, init: false, close: false, seeds: false, payer: false, space: false, stateType: false, specialFields: [] },
  "program":            { mut: false, signer: false, init: false, close: false, seeds: false, payer: false, space: false, stateType: false, specialFields: [] },
  "token-account":      { mut: true,  signer: false, init: true,  close: true,  seeds: false, payer: true,  space: true,  stateType: false, specialFields: ["tokenAuthority", "tokenMint"] },
  "mint":               { mut: true,  signer: false, init: true,  close: true,  seeds: false, payer: true,  space: true,  stateType: false, specialFields: ["mintAuthority", "mintDecimals"] },
  "associated-token":   { mut: true,  signer: false, init: true,  close: true,  seeds: false, payer: true,  space: false, stateType: false, specialFields: ["associatedAuthority", "associatedMint"] },
  "unchecked-account":  { mut: true,  signer: true,  init: false, close: false, seeds: false, payer: false, space: false, stateType: false, specialFields: ["safetyComment"] },
  "system-program":     { mut: false, signer: false, init: false, close: false, seeds: false, payer: false, space: false, stateType: false, specialFields: [] },
  "token-program":      { mut: false, signer: false, init: false, close: false, seeds: false, payer: false, space: false, stateType: false, specialFields: [] },
  "associated-token-program": { mut: false, signer: false, init: false, close: false, seeds: false, payer: false, space: false, stateType: false, specialFields: [] },
  "rent":               { mut: false, signer: false, init: false, close: false, seeds: false, payer: false, space: false, stateType: false, specialFields: [] },
  "clock":              { mut: false, signer: false, init: false, close: false, seeds: false, payer: false, space: false, stateType: false, specialFields: [] },
  "custom":             { mut: true,  signer: true,  init: true,  close: true,  seeds: true,  payer: true,  space: true,  stateType: true,  specialFields: [] },
};

// ─── Account Select Dropdown ──────────────────────────────────────────────────

function AccountSelect({
  value,
  onChange,
  accounts,
  placeholder,
  allowCustom = true,
}: {
  value: string;
  onChange: (v: string) => void;
  accounts: Array<{ id: string; name: string }>;
  placeholder?: string;
  allowCustom?: boolean;
}) {
  const [isCustom, setIsCustom] = React.useState(false);

  React.useEffect(() => {
    if (value && !accounts.find((a) => a.name === value)) {
      setIsCustom(true);
    }
  }, [value, accounts]);

  if (isCustom && allowCustom) {
    return (
      <div className="flex items-center gap-1">
        <input
          className={`${inputClass} font-mono`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "account_name"}
        />
        <button
          onClick={() => { setIsCustom(false); }}
          className="text-[9px] text-primary hover:underline shrink-0"
        >
          list
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder ?? "Select account..."}</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.name}>{a.name}</option>
        ))}
      </select>
      {allowCustom && (
        <button
          onClick={() => setIsCustom(true)}
          className="text-[9px] text-primary hover:underline shrink-0"
        >
          custom
        </button>
      )}
    </div>
  );
}

// ─── Structured Seed Editor ───────────────────────────────────────────────────

function SeedEditor({
  seeds,
  onChange,
  siblingAccounts,
  instructionArgs,
}: {
  seeds: SeedDefinition[];
  onChange: (seeds: SeedDefinition[]) => void;
  siblingAccounts: Array<{ id: string; name: string }>;
  instructionArgs: Array<{ name: string; type: unknown }>;
}) {
  const addSeed = () => {
    onChange([...seeds, { type: "literal", value: "" }]);
  };

  const removeSeed = (i: number) => {
    onChange(seeds.filter((_, idx) => idx !== i));
  };

  const updateSeed = (i: number, field: keyof SeedDefinition, value: string) => {
    onChange(seeds.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  };

  return (
    <div className="space-y-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">Seeds ({seeds.length})</span>
      {seeds.map((seed, i) => (
        <div key={`${seed.type}:${seed.value}:${i}`} className="flex items-center gap-1">
          <select
            className={`${selectClass} w-28 shrink-0`}
            value={seed.type}
            onChange={(e) => updateSeed(i, "type", e.target.value as SeedDefinition["type"])}
          >
            <option value="literal">Literal</option>
            <option value="account-field">Account Key</option>
            <option value="instruction-arg">Instruction Arg</option>
            <option value="pubkey">Pubkey</option>
          </select>
          {seed.type === "literal" && (
            <input
              className={`${inputClass} flex-1 font-mono`}
              value={seed.value}
              onChange={(e) => updateSeed(i, "value", e.target.value)}
              placeholder='e.g. "vault"'
            />
          )}
          {seed.type === "account-field" && (
            <select
              className={`${selectClass} flex-1`}
              value={seed.value}
              onChange={(e) => updateSeed(i, "value", e.target.value)}
            >
              <option value="">Select account...</option>
              {siblingAccounts.map((a) => (
                <option key={a.id} value={a.name}>{a.name}</option>
              ))}
            </select>
          )}
          {seed.type === "instruction-arg" && (
            <select
              className={`${selectClass} flex-1`}
              value={seed.value}
              onChange={(e) => updateSeed(i, "value", e.target.value)}
            >
              <option value="">Select arg...</option>
              {instructionArgs.map((a) => (
                <option key={a.name} value={a.name}>{a.name}</option>
              ))}
            </select>
          )}
          {seed.type === "pubkey" && (
            <input
              className={`${inputClass} flex-1 font-mono`}
              value={seed.value}
              onChange={(e) => updateSeed(i, "value", e.target.value)}
              placeholder="DRpbCBMxVnDK7ma..."
            />
          )}
          <button onClick={() => removeSeed(i)} className="shrink-0 text-muted-foreground/60 hover:text-destructive">
            <X size={12} />
          </button>
        </div>
      ))}
      <button onClick={addSeed} className="text-[10px] text-primary hover:underline">+ Add Seed</button>
    </div>
  );
}

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

  const nameInvalid = data.name ? !isValidIdentifier(data.name) : false;
  const versionInvalid = data.version ? !isValidVersion(data.version) : false;
  const programIdInvalid = data.programId ? !isValidPubkey(data.programId) : false;

  return (
    <div className="space-y-3">
      <FieldRow label="Program Name">
        <input
          className={`${nameInvalid ? inputInvalidClass : inputClass} font-mono`}
          value={data.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="my_program"
        />
        <ValidationHint show={nameInvalid} message="Must be snake_case, not a Rust keyword" />
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
          className={`${versionInvalid ? inputInvalidClass : inputClass}`}
          value={data.version ?? "0.1.0"}
          onChange={(e) => set({ version: e.target.value })}
          placeholder="0.1.0"
        />
        <ValidationHint show={versionInvalid} message="Must be semver format (e.g. 0.1.0)" />
      </FieldRow>
      <FieldRow label="Program ID (optional)">
        <input
          className={`${programIdInvalid ? inputInvalidClass : inputClass} font-mono`}
          value={data.programId ?? ""}
          onChange={(e) => set({ programId: e.target.value })}
          placeholder="11111111…"
        />
        <ValidationHint show={programIdInvalid} message="Must be a valid base58 pubkey" />
      </FieldRow>
      <FieldRow label="License">
        <select
          className={inputClass}
          value={data.license ?? "MIT"}
          onChange={(e) => set({ license: e.target.value })}
        >
          {["MIT", "Apache-2.0", "GPL-3.0", "UNLICENSED"].map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </FieldRow>
    </div>
  );
}

function InstructionForm({
  nodeId,
  data,
}: {
  nodeId: string;
  data: InstructionNodeData;
}) {
  const update = useFlowStore((s) => s.updateNodeData);
  const set = (partial: Partial<InstructionNodeData>) => update(nodeId, partial);
  const graph = useFlowGraph();

  const allStates = graph.getAllStates();
  const args = data.instructionData ?? [];

  const addArg = () => {
    set({ instructionData: [...args, { name: `arg${args.length + 1}`, type: "u64" as SolanaType }] });
  };

  const removeArg = (i: number) => {
    set({ instructionData: args.filter((_, idx) => idx !== i) });
  };

  const updateArg = (i: number, field: string, value: unknown) => {
    set({
      instructionData: args.map((a, idx) =>
        idx === i ? { ...a, [field]: value } : a
      ),
    });
  };

  const nameInvalid = data.name ? !isValidIdentifier(data.name) : false;

  return (
    <div className="space-y-3">
      <FieldRow label="Instruction Name">
        <input
          className={`${nameInvalid ? inputInvalidClass : inputClass} font-mono`}
          value={data.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="initialize"
        />
        <ValidationHint show={nameInvalid} message="Must be snake_case, not a Rust keyword" />
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
          <button onClick={addArg} className="text-[10px] text-primary hover:underline">
            + Add
          </button>
        </div>
        <div className="space-y-1.5">
          {args.map((arg, i) => {
            const argNameInvalid = arg.name ? !isValidIdentifier(arg.name) : false;
            const argDuplicate = isDuplicateName(args.map((a) => a.name), i);
            return (
            <div key={arg.name || i} className="space-y-1 rounded border border-border p-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  className={`${(argNameInvalid || argDuplicate) ? inputInvalidClass : inputClass} flex-1 font-mono`}
                  value={arg.name}
                  onChange={(e) => updateArg(i, "name", e.target.value)}
                  placeholder="name"
                />
                <button
                  onClick={() => removeArg(i)}
                  className="shrink-0 text-muted-foreground/60 hover:text-destructive"
                >
                  <X size={12} />
                </button>
              </div>
              <ValidationHint show={argNameInvalid} message="Must be snake_case, not a Rust keyword" />
              <ValidationHint show={argDuplicate && !argNameInvalid} message="Duplicate argument name" />
              <TypeEditor
                value={arg.type as SolanaType}
                onChange={(t) => updateArg(i, "type", t)}
                availableStates={allStates}
                compact
              />
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const ACCOUNT_TYPES: AccountType[] = [
  "account","system-account","signer","program","token-account","mint",
  "associated-token","unchecked-account","system-program","token-program",
  "associated-token-program","rent","clock","custom",
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
  const graph = useFlowGraph();

  const rules = ACCOUNT_TYPE_RULES[data.accountType ?? "account"];
  const siblings = graph.getSiblingAccounts(nodeId);
  const instructionArgs = graph.getInstructionArgs(nodeId);

  const handleTypeChange = (newType: AccountType) => {
    const r = ACCOUNT_TYPE_RULES[newType];
    const updates: Partial<AccountNodeData> = { accountType: newType };
    if (!r.mut) updates.isMut = false;
    if (!r.signer) updates.isSigner = false;
    if (!r.init) { updates.isInit = false; updates.isInitIfNeeded = false; updates.payer = undefined; updates.space = undefined; }
    if (!r.close) { updates.isClose = false; updates.closeTarget = undefined; }
    if (!r.seeds) updates.seeds = undefined;
    if (!r.specialFields.includes("tokenAuthority")) { updates.tokenAuthority = undefined; updates.tokenMint = undefined; }
    if (!r.specialFields.includes("mintAuthority")) { updates.mintAuthority = undefined; updates.mintDecimals = undefined; }
    if (!r.specialFields.includes("associatedAuthority")) { updates.associatedAuthority = undefined; updates.associatedMint = undefined; }
    if (!r.specialFields.includes("safetyComment")) updates.safetyComment = undefined;
    set(updates);
  };

  const showFlags = rules.mut || rules.signer || rules.init || rules.close;
  const seeds = data.seeds ?? [];

  return (
    <div className="space-y-3">
      <FieldRow label="Account Name">
        <input
          className={`${inputClass} font-mono${data.name && !isValidIdentifier(data.name) ? " border-red-500" : ""}`}
          value={data.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="authority"
        />
      </FieldRow>
      <ValidationHint show={!!data.name && !isValidIdentifier(data.name)} message="Must be snake_case, not a Rust keyword" />
      <FieldRow label="Account Type">
        <select
          className={inputClass}
          value={data.accountType ?? "account"}
          onChange={(e) => handleTypeChange(e.target.value as AccountType)}
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </FieldRow>

      {/* State type selector for accounts that reference a state struct */}
      {rules.stateType && (
        <FieldRow label="State Type">
          <select
            className={selectClass}
            value={data.stateType ?? ""}
            onChange={(e) => set({ stateType: e.target.value || undefined })}
          >
            <option value="">Auto-detect</option>
            {graph.getAllStates().map((s) => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>
        </FieldRow>
      )}

      {/* Context-aware flags */}
      {showFlags && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Flags</span>
          {rules.mut && (
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={!!data.isMut} onChange={(e) => set({ isMut: e.target.checked })} className="rounded" />
              <span className="text-xs">Mutable (#[account(mut)])</span>
            </label>
          )}
          {rules.signer && (
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={!!data.isSigner} onChange={(e) => set({ isSigner: e.target.checked })} className="rounded" />
              <span className="text-xs">Signer</span>
            </label>
          )}
          {data.accountType === "signer" && (
            <p className="text-[10px] text-muted-foreground/60">Signer is implied by account type</p>
          )}
          {rules.init && (
            <>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={!!data.isInit} onChange={(e) => set({ isInit: e.target.checked, isInitIfNeeded: e.target.checked ? false : data.isInitIfNeeded })} className="rounded" />
                <span className="text-xs">Init (#[account(init)])</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={!!data.isInitIfNeeded} onChange={(e) => set({ isInitIfNeeded: e.target.checked, isInit: e.target.checked ? false : data.isInit })} className="rounded" />
                <span className="text-xs">Init if needed (#[account(init_if_needed)])</span>
              </label>
            </>
          )}
          {rules.close && (
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={!!data.isClose} onChange={(e) => set({ isClose: e.target.checked })} className="rounded" />
              <span className="text-xs">Close</span>
            </label>
          )}
        </div>
      )}

      {!showFlags && (
        <p className="text-[10px] text-muted-foreground/60">This account type has no configurable flags</p>
      )}

      {/* Init-related fields */}
      {(data.isInit || data.isInitIfNeeded) && rules.init && (
        <>
          {rules.payer && (
            <FieldRow label="Payer account">
              <AccountSelect
                value={data.payer ?? ""}
                onChange={(v) => set({ payer: v })}
                accounts={siblings}
                placeholder="Select payer..."
              />
            </FieldRow>
          )}
          {rules.space && (
            <FieldRow label="Space (bytes or 'auto')">
              <input
                className={`${inputClass}${data.space !== undefined && data.space !== "auto" && (typeof data.space === "number" && data.space < 8) ? " border-yellow-500/50" : ""}`}
                value={data.space !== undefined ? String(data.space) : ""}
                onChange={(e) =>
                  set({
                    space: e.target.value === "auto" ? "auto" : Number(e.target.value) || undefined,
                  })
                }
                placeholder="auto"
              />
              <ValidationHint show={data.space !== undefined && data.space !== "auto" && typeof data.space === "number" && data.space < 8} message="Anchor accounts need at least 8 bytes (discriminator)" />
            </FieldRow>
          )}
        </>
      )}

      {/* Structured seeds for PDA accounts */}
      {rules.seeds && (
        <SeedEditor
          seeds={seeds}
          onChange={(s) => set({ seeds: s })}
          siblingAccounts={siblings}
          instructionArgs={instructionArgs}
        />
      )}
      {data.isInit && rules.seeds && (
        <FieldRow label="Bump var (optional)">
          <input
            className={`${inputClass} font-mono`}
            value={data.bump ?? ""}
            onChange={(e) => set({ bump: e.target.value })}
            placeholder="bump"
          />
        </FieldRow>
      )}

      {/* Close target */}
      {data.isClose && rules.close && (
        <FieldRow label="Close target account">
          <AccountSelect
            value={data.closeTarget ?? ""}
            onChange={(v) => set({ closeTarget: v })}
            accounts={siblings}
            placeholder="Select receiver..."
          />
        </FieldRow>
      )}

      {/* Token account special fields */}
      {rules.specialFields.includes("tokenAuthority") && data.isInit && (
        <FieldRow label="Token Authority">
          <AccountSelect
            value={data.tokenAuthority ?? ""}
            onChange={(v) => set({ tokenAuthority: v })}
            accounts={siblings}
            placeholder="Select authority..."
          />
        </FieldRow>
      )}
      {rules.specialFields.includes("tokenMint") && data.isInit && (
        <FieldRow label="Token Mint">
          <AccountSelect
            value={data.tokenMint ?? ""}
            onChange={(v) => set({ tokenMint: v })}
            accounts={siblings}
            placeholder="Select mint account..."
          />
        </FieldRow>
      )}

      {/* Mint special fields */}
      {rules.specialFields.includes("mintAuthority") && data.isInit && (
        <FieldRow label="Mint Authority">
          <AccountSelect
            value={data.mintAuthority ?? ""}
            onChange={(v) => set({ mintAuthority: v })}
            accounts={siblings}
            placeholder="Select authority..."
          />
        </FieldRow>
      )}
      {rules.specialFields.includes("mintDecimals") && data.isInit && (
        <FieldRow label="Mint Decimals">
          <input
            className={inputClass}
            type="number"
            min={0}
            max={9}
            value={data.mintDecimals ?? ""}
            onChange={(e) => set({ mintDecimals: e.target.value === "" ? undefined : Math.min(9, Math.max(0, Number(e.target.value))) })}
          />
        </FieldRow>
      )}

      {/* Associated token special fields */}
      {rules.specialFields.includes("associatedAuthority") && (
        <FieldRow label="Authority">
          <AccountSelect
            value={data.associatedAuthority ?? ""}
            onChange={(v) => set({ associatedAuthority: v })}
            accounts={siblings}
            placeholder="Select authority..."
          />
        </FieldRow>
      )}
      {rules.specialFields.includes("associatedMint") && (
        <FieldRow label="Mint">
          <AccountSelect
            value={data.associatedMint ?? ""}
            onChange={(v) => set({ associatedMint: v })}
            accounts={siblings}
            placeholder="Select mint account..."
          />
        </FieldRow>
      )}

      {/* Unchecked account safety comment */}
      {rules.specialFields.includes("safetyComment") && (
        <FieldRow label="Safety Comment">
          <textarea
            className={`${inputClass} resize-none font-mono`}
            rows={2}
            value={data.safetyComment ?? ""}
            onChange={(e) => set({ safetyComment: e.target.value })}
            placeholder="Reason this account is safe to use unchecked"
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
  const graph = useFlowGraph();

  const allStates = graph.getAllStates();
  const fields = data.fields ?? [];

  const addField = () => {
    set({
      fields: [...fields, { name: `field${fields.length + 1}`, type: "u64" as SolanaType }],
    });
  };

  const removeField = (i: number) => {
    set({ fields: fields.filter((_, idx) => idx !== i) });
  };

  const updateField = (i: number, key: keyof StateField, value: unknown) => {
    set({
      fields: fields.map((f, idx) =>
        idx === i ? { ...f, [key]: value } : f
      ),
    });
  };

  return (
    <div className="space-y-3">
      <FieldRow label="Struct Name">
        <input
          className={`${inputClass} font-mono${data.name && !isValidPascalIdentifier(data.name) ? " border-red-500" : ""}`}
          value={data.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="VaultState"
        />
      </FieldRow>
      <ValidationHint show={!!data.name && !isValidPascalIdentifier(data.name)} message="Must be PascalCase, not a Rust keyword" />

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
          <button onClick={addField} className="text-[10px] text-primary hover:underline">
            + Add field
          </button>
        </div>
        <div className="space-y-1.5">
          {fields.map((f, i) => {
            const fieldNameInvalid = f.name ? !isValidIdentifier(f.name) : false;
            const fieldDuplicate = isDuplicateName(fields.map((fd) => fd.name), i);
            return (
            <div key={f.name || i} className="space-y-1 rounded border border-border p-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  className={`${(fieldNameInvalid || fieldDuplicate) ? inputInvalidClass : inputClass} flex-1 font-mono`}
                  value={f.name}
                  onChange={(e) => updateField(i, "name", e.target.value)}
                  placeholder="amount"
                />
                <button
                  onClick={() => removeField(i)}
                  className="shrink-0 text-muted-foreground/60 hover:text-destructive"
                >
                  <X size={12} />
                </button>
              </div>
              <ValidationHint show={fieldNameInvalid} message="Must be snake_case, not a Rust keyword" />
              <ValidationHint show={fieldDuplicate && !fieldNameInvalid} message="Duplicate field name" />
              <TypeEditor
                value={f.type}
                onChange={(t) => updateField(i, "type", t)}
                availableStates={allStates}
                compact
              />
              {typeof f.type === "string" && f.type === "String" && (
                <FieldRow label="Max Length">
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    value={f.maxLen ?? ""}
                    onChange={(e) => updateField(i, "maxLen", Number(e.target.value) || undefined)}
                    placeholder="64"
                  />
                </FieldRow>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Constraint form ──────────────────────────────────────────────────────────

const CONSTRAINT_TYPES: ConstraintType[] = [
  "mut","signer","init","init-if-needed","close","has-one","seeds",
  "owner","address","token-authority","token-mint","mint-authority",
  "mint-decimals","associated-token-authority","associated-token-mint",
  "realloc","safety-comment","custom",
];

function ConstraintForm({ nodeId, data }: { nodeId: string; data: ConstraintNodeData }) {
  const update = useFlowStore((s) => s.updateNodeData);
  const set = (partial: Partial<ConstraintNodeData>) => update(nodeId, partial);
  const graph = useFlowGraph();
  const ct = data.constraintType ?? "mut";

  const siblings = graph.getSiblingAccounts(nodeId);
  const instructionArgs = graph.getInstructionArgs(nodeId);
  const seeds = data.seeds ?? [];

  const structuredSeeds: SeedDefinition[] = Array.isArray(seeds) ? seeds : [];

  return (
    <div className="space-y-3">
      <FieldRow label="Label">
        <input
          className={`${inputClass} font-mono`}
          value={data.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={ct}
        />
      </FieldRow>
      <FieldRow label="Constraint Type">
        <select className={inputClass} value={ct} onChange={(e) => set({ constraintType: e.target.value as ConstraintType })}>
          {CONSTRAINT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </FieldRow>

      {(ct === "init" || ct === "init-if-needed") && (
        <>
          <FieldRow label="Payer account">
            <AccountSelect value={data.payer ?? ""} onChange={(v) => set({ payer: v })} accounts={siblings} placeholder="Select payer..." />
          </FieldRow>
          <FieldRow label="Space (bytes or 'auto')">
            <input className={inputClass} value={data.space !== undefined ? String(data.space) : ""} onChange={(e) => set({ space: e.target.value === "auto" ? "auto" : (Number(e.target.value) || undefined) })} placeholder="auto" />
          </FieldRow>
        </>
      )}
      {ct === "close" && (
        <FieldRow label="Close target account">
          <AccountSelect value={data.closeTarget ?? ""} onChange={(v) => set({ closeTarget: v })} accounts={siblings} placeholder="Select receiver..." />
        </FieldRow>
      )}
      {ct === "has-one" && (
        <>
          <FieldRow label="Field name">
            <input className={`${inputClass} font-mono`} value={data.hasOneField ?? ""} onChange={(e) => set({ hasOneField: e.target.value })} placeholder="authority" />
          </FieldRow>
          <FieldRow label="Target account">
            <AccountSelect value={data.hasOneTarget ?? ""} onChange={(v) => set({ hasOneTarget: v })} accounts={siblings} placeholder="Select target..." />
          </FieldRow>
          <FieldRow label="Error code (optional)">
            <input className={inputClass} value={data.hasOneErrorCode ?? ""} onChange={(e) => set({ hasOneErrorCode: e.target.value })} placeholder="Unauthorized" />
          </FieldRow>
        </>
      )}
      {ct === "seeds" && (
        <>
          <SeedEditor
            seeds={structuredSeeds}
            onChange={(s) => set({ seeds: s })}
            siblingAccounts={siblings}
            instructionArgs={instructionArgs}
          />
          <FieldRow label="Bump var (optional)">
            <input className={`${inputClass} font-mono`} value={data.bump ?? ""} onChange={(e) => set({ bump: e.target.value })} placeholder="bump" />
          </FieldRow>
          <FieldRow label="Program ID (optional)">
            <input className={`${inputClass} font-mono`} value={data.programId ?? ""} onChange={(e) => set({ programId: e.target.value })} placeholder="crate::ID or account name" />
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
          <AccountSelect value={data.tokenAuthority ?? ""} onChange={(v) => set({ tokenAuthority: v })} accounts={siblings} placeholder="Select authority..." />
        </FieldRow>
      )}
      {ct === "token-mint" && (
        <FieldRow label="Mint account">
          <AccountSelect value={data.tokenMint ?? ""} onChange={(v) => set({ tokenMint: v })} accounts={siblings} placeholder="Select mint..." />
        </FieldRow>
      )}
      {ct === "realloc" && (
        <>
          <FieldRow label="New space (bytes)">
            <input className={inputClass} type="number" value={data.reallocSpace ?? ""} onChange={(e) => set({ reallocSpace: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="256" />
          </FieldRow>
          <FieldRow label="Payer account">
            <AccountSelect value={data.reallocPayer ?? ""} onChange={(v) => set({ reallocPayer: v })} accounts={siblings} placeholder="Select payer..." />
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
      {ct === "mint-authority" && (
        <FieldRow label="Mint authority account">
          <AccountSelect value={data.mintAuthority ?? ""} onChange={(v) => set({ mintAuthority: v })} accounts={siblings} placeholder="Select authority..." />
        </FieldRow>
      )}
      {ct === "mint-decimals" && (
        <FieldRow label="Decimals">
          <input className={inputClass} type="number" min={0} max={9} value={data.mintDecimals ?? ""} onChange={(e) => set({ mintDecimals: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="9" />
        </FieldRow>
      )}
      {ct === "associated-token-authority" && (
        <FieldRow label="Authority account">
          <AccountSelect value={data.associatedAuthority ?? ""} onChange={(v) => set({ associatedAuthority: v })} accounts={siblings} placeholder="Select authority..." />
        </FieldRow>
      )}
      {ct === "associated-token-mint" && (
        <FieldRow label="Mint account">
          <AccountSelect value={data.associatedMint ?? ""} onChange={(v) => set({ associatedMint: v })} accounts={siblings} placeholder="Select mint..." />
        </FieldRow>
      )}
      {ct === "safety-comment" && (
        <FieldRow label="Safety comment">
          <textarea className={`${inputClass} resize-none font-mono`} rows={2} value={data.safetyComment ?? ""} onChange={(e) => set({ safetyComment: e.target.value })} placeholder="Reason this account is safe to use unchecked" />
        </FieldRow>
      )}
    </div>
  );
}

// ─── Error form ───────────────────────────────────────────────────────────────

function ErrorForm({ nodeId, data }: { nodeId: string; data: ErrorNodeData }) {
  const update = useFlowStore((s) => s.updateNodeData);
  const set = (partial: Partial<ErrorNodeData>) => update(nodeId, partial);

  const codeInvalid = data.code !== undefined && data.code !== null && (data.code < 0 || !Number.isInteger(data.code));

  return (
    <div className="space-y-3">
      <FieldRow label="Error Name (PascalCase)">
        <input className={`${inputClass} font-mono${data.name && !isValidPascalIdentifier(data.name) ? " border-red-500" : ""}`} value={data.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="InsufficientFunds" />
      </FieldRow>
      <ValidationHint show={!!data.name && !isValidPascalIdentifier(data.name)} message="Must be PascalCase, not a Rust keyword" />
      <FieldRow label="Error Code">
        <input className={`${codeInvalid ? inputInvalidClass : inputClass}`} type="number" value={data.code ?? ""} onChange={(e) => set({ code: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="6000" />
        <ValidationHint show={codeInvalid} message="Must be a non-negative integer" />
      </FieldRow>
      <FieldRow label="Message">
        <input className={`${inputClass}${data.message !== undefined && !data.message.trim() ? " border-yellow-500/50" : ""}`} value={data.message ?? ""} onChange={(e) => set({ message: e.target.value })} placeholder="Insufficient funds" />
        <ValidationHint show={data.message !== undefined && data.message !== null && !data.message.trim()} message="Error message is recommended" />
      </FieldRow>
    </div>
  );
}

// ─── Event form ───────────────────────────────────────────────────────────────

function EventForm({ nodeId, data }: { nodeId: string; data: EventNodeData }) {
  const update = useFlowStore((s) => s.updateNodeData);
  const set = (partial: Partial<EventNodeData>) => update(nodeId, partial);
  const graph = useFlowGraph();
  const allStates = graph.getAllStates();
  const fields = data.fields ?? [];

  const addField = () => set({ fields: [...fields, { name: `field${fields.length + 1}`, type: "u64" }] });
  const removeField = (i: number) => set({ fields: fields.filter((_, idx) => idx !== i) });
  const updateField = (i: number, key: keyof EventField, value: unknown) =>
    set({ fields: fields.map((f, idx) => idx === i ? { ...f, [key]: value } : f) });

  return (
    <div className="space-y-3">
      <FieldRow label="Event Name (PascalCase)">
        <input className={`${inputClass} font-mono${data.name && !isValidPascalIdentifier(data.name) ? " border-red-500" : ""}`} value={data.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="TransferEvent" />
      </FieldRow>
      <ValidationHint show={!!data.name && !isValidPascalIdentifier(data.name)} message="Must be PascalCase, not a Rust keyword" />
      <FieldRow label="Description">
        <textarea className={`${inputClass} resize-none`} rows={2} value={data.description ?? ""} onChange={(e) => set({ description: e.target.value })} placeholder="Emitted when..." />
      </FieldRow>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">Fields ({fields.length})</span>
          <button onClick={addField} className="text-[10px] text-primary hover:underline">+ Add</button>
        </div>
        <div className="space-y-1.5">
          {fields.map((f, i) => {
            const fieldNameInvalid = f.name ? !isValidIdentifier(f.name) : false;
            const fieldDuplicate = isDuplicateName(fields.map((fd) => fd.name), i);
            return (
            <div key={f.name || i} className="space-y-1 rounded border border-border p-1.5">
              <div className="flex items-center gap-1.5">
                <input className={`${(fieldNameInvalid || fieldDuplicate) ? inputInvalidClass : inputClass} flex-1 font-mono`} value={f.name} onChange={(e) => updateField(i, "name", e.target.value)} placeholder="amount" />
                <button onClick={() => removeField(i)} className="shrink-0 text-muted-foreground/60 hover:text-destructive"><X size={12} /></button>
              </div>
              <ValidationHint show={fieldNameInvalid} message="Must be snake_case, not a Rust keyword" />
              <ValidationHint show={fieldDuplicate && !fieldNameInvalid} message="Duplicate field name" />
              <TypeEditor value={f.type} onChange={(t) => updateField(i, "type", t)} availableStates={allStates} compact />
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Logic form ───────────────────────────────────────────────────────────────

const LOGIC_TYPES: LogicType[] = [
  "set-field","transfer-sol","transfer-token","mint-to","burn","close-account",
  "require","if-else","emit-event","return-error","math","cpi","custom-code",
];

function LogicForm({ nodeId, data }: { nodeId: string; data: LogicNodeData }) {
  const update = useFlowStore((s) => s.updateNodeData);
  const set = (partial: Partial<LogicNodeData>) => update(nodeId, partial);
  const graph = useFlowGraph();
  const lt = data.logicType ?? "set-field";

  const siblings = graph.getSiblingAccounts(nodeId);
  const allErrors = graph.getAllErrors();
  const allEvents = graph.getAllEvents();

  // For set-field: get linked state fields
  const selectedAccountForSet = data.setAccount ?? "";
  const accountNodeForSet = siblings.find((a) => a.name === selectedAccountForSet);
  const linkedState = accountNodeForSet ? graph.getLinkedState(accountNodeForSet.id) : null;

  // For emit-event: get selected event fields
  const selectedEventName = data.emitEvent ?? "";
  const selectedEvent = allEvents.find((e) => e.name === selectedEventName);

  return (
    <div className="space-y-3">
      <FieldRow label="Label">
        <input className={`${inputClass} font-mono`} value={data.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder={lt} />
      </FieldRow>
      <FieldRow label="Operation">
        <select className={inputClass} value={lt} onChange={(e) => set({ logicType: e.target.value as LogicType })}>
          {LOGIC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </FieldRow>

      {lt === "set-field" && (
        <>
          <FieldRow label="Account">
            <select className={selectClass} value={data.setAccount ?? ""} onChange={(e) => { set({ setAccount: e.target.value, setField: "", setValue: "" }); }}>
              <option value="">Select account...</option>
              {siblings.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </FieldRow>
          {linkedState && (
            <FieldRow label="Field">
              <select className={selectClass} value={data.setField ?? ""} onChange={(e) => set({ setField: e.target.value })}>
                <option value="">Select field...</option>
                {linkedState.fields.map((f) => (
                  <option key={f.name} value={f.name}>{f.name}: {typeof f.type === "string" ? f.type : "complex"}</option>
                ))}
              </select>
            </FieldRow>
          )}
          {!linkedState && selectedAccountForSet && (
            <FieldRow label="Field">
              <input className={`${inputClass} font-mono`} value={data.setField ?? ""} onChange={(e) => set({ setField: e.target.value })} placeholder="field_name" />
            </FieldRow>
          )}
          <FieldRow label="Value">
            <input className={`${inputClass} font-mono`} value={data.setValue ?? ""} onChange={(e) => set({ setValue: e.target.value })} placeholder="0" />
          </FieldRow>
        </>
      )}

      {(lt === "transfer-sol" || lt === "transfer-token") && (
        <>
          <FieldRow label="From">
            <select className={selectClass} value={data.transferFrom ?? ""} onChange={(e) => set({ transferFrom: e.target.value })}>
              <option value="">Select account...</option>
              {siblings.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="To">
            <select className={selectClass} value={data.transferTo ?? ""} onChange={(e) => set({ transferTo: e.target.value })}>
              <option value="">Select account...</option>
              {siblings.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </FieldRow>
          {lt === "transfer-token" && (
            <FieldRow label="Authority">
              <select className={selectClass} value={data.transferAuthority ?? ""} onChange={(e) => set({ transferAuthority: e.target.value })}>
                <option value="">Select authority...</option>
                {siblings.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
              </select>
            </FieldRow>
          )}
          <FieldRow label="Amount">
            <input className={`${inputClass} font-mono`} value={data.transferAmount ?? ""} onChange={(e) => set({ transferAmount: e.target.value })} placeholder="1_000_000" />
          </FieldRow>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={!!data.useSignerSeeds} onChange={(e) => set({ useSignerSeeds: e.target.checked })} className="rounded" />
            <span className="text-xs">PDA signer seeds</span>
          </label>
          {data.useSignerSeeds && (
            <SeedEditor
              seeds={data.signerSeeds ?? []}
              onChange={(s) => set({ signerSeeds: s })}
              siblingAccounts={siblings}
              instructionArgs={graph.getInstructionArgs(nodeId)}
            />
          )}
        </>
      )}

      {lt === "mint-to" && (
        <>
          <FieldRow label="Mint Account">
            <select className={selectClass} value={data.mintTo ?? ""} onChange={(e) => set({ mintTo: e.target.value })}>
              <option value="">Select mint...</option>
              {siblings.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Destination">
            <select className={selectClass} value={data.transferTo ?? ""} onChange={(e) => set({ transferTo: e.target.value })}>
              <option value="">Select destination...</option>
              {siblings.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Mint Authority">
            <select className={selectClass} value={data.mintAuthority ?? ""} onChange={(e) => set({ mintAuthority: e.target.value })}>
              <option value="">Select authority...</option>
              {siblings.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Amount">
            <input className={`${inputClass} font-mono`} value={data.transferAmount ?? ""} onChange={(e) => set({ transferAmount: e.target.value })} placeholder="1_000_000" />
          </FieldRow>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={!!data.useSignerSeeds} onChange={(e) => set({ useSignerSeeds: e.target.checked })} className="rounded" />
            <span className="text-xs">PDA signer seeds</span>
          </label>
          {data.useSignerSeeds && (
            <SeedEditor
              seeds={data.signerSeeds ?? []}
              onChange={(s) => set({ signerSeeds: s })}
              siblingAccounts={siblings}
              instructionArgs={graph.getInstructionArgs(nodeId)}
            />
          )}
        </>
      )}

      {lt === "burn" && (
        <>
          <FieldRow label="Mint Account">
            <select className={selectClass} value={data.burnMint ?? ""} onChange={(e) => set({ burnMint: e.target.value })}>
              <option value="">Select mint...</option>
              {siblings.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="From">
            <select className={selectClass} value={data.transferFrom ?? ""} onChange={(e) => set({ transferFrom: e.target.value })}>
              <option value="">Select account...</option>
              {siblings.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Authority">
            <select className={selectClass} value={data.burnAuthority ?? ""} onChange={(e) => set({ burnAuthority: e.target.value })}>
              <option value="">Select authority...</option>
              {siblings.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Amount">
            <input className={`${inputClass} font-mono`} value={data.transferAmount ?? ""} onChange={(e) => set({ transferAmount: e.target.value })} placeholder="1_000_000" />
          </FieldRow>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={!!data.useSignerSeeds} onChange={(e) => set({ useSignerSeeds: e.target.checked })} className="rounded" />
            <span className="text-xs">PDA signer seeds</span>
          </label>
          {data.useSignerSeeds && (
            <SeedEditor
              seeds={data.signerSeeds ?? []}
              onChange={(s) => set({ signerSeeds: s })}
              siblingAccounts={siblings}
              instructionArgs={graph.getInstructionArgs(nodeId)}
            />
          )}
        </>
      )}

      {lt === "close-account" && (
        <>
          <FieldRow label="Account to close">
            <select className={selectClass} value={data.closeAccount ?? ""} onChange={(e) => set({ closeAccount: e.target.value })}>
              <option value="">Select account...</option>
              {siblings.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Destination (receives lamports)">
            <select className={selectClass} value={data.closeDestination ?? ""} onChange={(e) => set({ closeDestination: e.target.value })}>
              <option value="">Select destination...</option>
              {siblings.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Authority (optional)">
            <select className={selectClass} value={data.closeAuthority ?? ""} onChange={(e) => set({ closeAuthority: e.target.value })}>
              <option value="">Select authority...</option>
              {siblings.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </FieldRow>
        </>
      )}

      {lt === "require" && (
        <>
          <FieldRow label="Condition">
            <input className={`${inputClass} font-mono`} value={data.requireCondition ?? ""} onChange={(e) => set({ requireCondition: e.target.value })} placeholder="ctx.accounts.counter.count < 100" />
          </FieldRow>
          <FieldRow label="Error">
            <select className={selectClass} value={data.requireErrorCode ?? ""} onChange={(e) => set({ requireErrorCode: e.target.value })}>
              <option value="">Select error...</option>
              {allErrors.map((e) => <option key={e.id} value={e.name}>{e.name} ({e.code})</option>)}
            </select>
          </FieldRow>
        </>
      )}

      {lt === "if-else" && (
        <FieldRow label="Condition">
          <input className={`${inputClass} font-mono`} value={data.ifCondition ?? ""} onChange={(e) => set({ ifCondition: e.target.value })} placeholder="some_bool_expr" />
        </FieldRow>
      )}

      {lt === "emit-event" && (
        <>
          <FieldRow label="Event">
            <select className={selectClass} value={data.emitEvent ?? ""} onChange={(e) => set({ emitEvent: e.target.value, emitFields: {} })}>
              <option value="">Select event...</option>
              {allEvents.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
            </select>
          </FieldRow>
          {selectedEvent && selectedEvent.fields.map((f) => (
            <FieldRow key={f.name} label={f.name}>
              <input
                className={`${inputClass} font-mono`}
                value={data.emitFields?.[f.name] ?? ""}
                onChange={(e) => set({ emitFields: { ...(data.emitFields ?? {}), [f.name]: e.target.value } })}
                placeholder={typeof f.type === "string" ? f.type : "value"}
              />
            </FieldRow>
          ))}
        </>
      )}

      {lt === "return-error" && (
        <FieldRow label="Error">
          <select className={selectClass} value={data.returnErrorCode ?? ""} onChange={(e) => set({ returnErrorCode: e.target.value })}>
            <option value="">Select error...</option>
            {allErrors.map((e) => <option key={e.id} value={e.name}>{e.name} ({e.code})</option>)}
          </select>
        </FieldRow>
      )}

      {lt === "math" && (
        <>
          <FieldRow label="Left operand">
            <input className={`${inputClass} font-mono`} value={data.mathLeft ?? ""} onChange={(e) => set({ mathLeft: e.target.value })} placeholder="counter.count" />
          </FieldRow>
          <FieldRow label="Operation">
            <select className={inputClass} value={data.mathOperation ?? "add"} onChange={(e) => set({ mathOperation: e.target.value as LogicNodeData["mathOperation"] })}>
              {(["add","sub","mul","div","mod"] as const).map((op) => <option key={op} value={op}>{op}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Right operand">
            <input className={`${inputClass} font-mono`} value={data.mathRight ?? ""} onChange={(e) => set({ mathRight: e.target.value })} placeholder="1" />
          </FieldRow>
          <FieldRow label="Result var">
            <input className={`${inputClass} font-mono`} value={data.mathResult ?? ""} onChange={(e) => set({ mathResult: e.target.value })} placeholder="new_count" />
          </FieldRow>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={!!data.mathChecked} onChange={(e) => set({ mathChecked: e.target.checked })} className="rounded" />
            <span className="text-xs">Checked arithmetic (overflow-safe)</span>
          </label>
        </>
      )}

      {lt === "cpi" && (
        <>
          <FieldRow label="Target program">
            <input className={`${inputClass} font-mono`} value={data.cpiProgram ?? ""} onChange={(e) => set({ cpiProgram: e.target.value })} placeholder="token_program" />
          </FieldRow>
          <FieldRow label="Instruction">
            <input className={`${inputClass} font-mono`} value={data.cpiInstruction ?? ""} onChange={(e) => set({ cpiInstruction: e.target.value })} placeholder="transfer" />
          </FieldRow>
        </>
      )}

      {lt === "custom-code" && (
        <FieldRow label="Rust code">
          <textarea
            className={`${inputClass} resize-y font-mono text-[11px]`}
            rows={8}
            value={data.customCode ?? ""}
            onChange={(e) => set({ customCode: e.target.value })}
            placeholder={"// Write Rust code here\nlet x = ctx.accounts.counter.count + 1;"}
            spellCheck={false}
          />
        </FieldRow>
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
      <FieldRow label="Block Name">
        <input className={`${inputClass} font-mono`} value={data.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="custom_logic" />
      </FieldRow>
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

function IntegrationForm({ nodeId, data }: { nodeId: string; data: IntegrationNodeData }) {
  const update = useFlowStore((s) => s.updateNodeData);
  const set = (partial: Partial<IntegrationNodeData>) => update(nodeId, partial);
  const configStr = JSON.stringify(data.config ?? {}, null, 2);

  return (
    <div className="space-y-3">
      <FieldRow label="Name">
        <input className={`${inputClass} font-mono`} value={data.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="oracle_feed" />
      </FieldRow>
      <FieldRow label="Plugin ID">
        <input className={inputClass} value={data.pluginId ?? ""} onChange={(e) => set({ pluginId: e.target.value })} placeholder="pyth-oracle" />
      </FieldRow>
      <FieldRow label="Integration ID">
        <input className={inputClass} value={data.integrationId ?? ""} onChange={(e) => set({ integrationId: e.target.value })} placeholder="price_feed" />
      </FieldRow>
      <FieldRow label="Description">
        <textarea className={`${inputClass} resize-none`} rows={2} value={data.description ?? ""} onChange={(e) => set({ description: e.target.value })} placeholder="What does this integration do?" />
      </FieldRow>
      <FieldRow label="Config (JSON)">
        <textarea
          className={`${inputClass} resize-y font-mono text-[11px]`}
          rows={4}
          value={configStr}
          onChange={(e) => {
            try { set({ config: JSON.parse(e.target.value) }); } catch { /* invalid JSON, ignore */ }
          }}
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
  integration:   { label: "Integration",        icon: <Puzzle size={13} />,        color: "#6b7280" },
};

export function PropertiesPanel() {
  const { propertiesOpen, toggleProperties } = useUIStore();
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const selectedNodeIds = useFlowStore((s) => s.selectedNodeIds);
  const nodes = useFlowStore((s) => s.nodes);
  const removeNode = useFlowStore((s) => s.removeNode);
  const duplicateNodes = useFlowStore((s) => s.duplicateNodes);
  const setSelectedNode = useFlowStore((s) => s.setSelectedNode);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const isMultiSelect = selectedNodeIds.length > 1;

  // Batch delete all selected nodes
  const handleBatchDelete = () => {
    for (const id of selectedNodeIds) {
      removeNode(id);
    }
    setSelectedNode(null);
  };

  // Batch duplicate all selected nodes
  const handleBatchDuplicate = () => {
    duplicateNodes(selectedNodeIds);
  };

  // Align selected nodes horizontally (equal vertical spacing)
  const handleAlignH = () => {
    if (selectedNodeIds.length < 2) return;
    const sel = nodes.filter((n) => selectedNodeIds.includes(n.id));
    const sorted = [...sel].sort((a, b) => a.position.x - b.position.x);
    const gap = 200;
    const startX = sorted[0].position.x;
    sorted.forEach((n, i) => {
      useFlowStore.getState().updateNodeData(n.id, {});
      useFlowStore.getState().onNodesChange([
        { type: "position", id: n.id, position: { x: startX + i * gap, y: n.position.y }, dragging: false },
      ]);
    });
  };

  // Align selected nodes vertically (equal horizontal spacing)
  const handleAlignV = () => {
    if (selectedNodeIds.length < 2) return;
    const sel = nodes.filter((n) => selectedNodeIds.includes(n.id));
    const sorted = [...sel].sort((a, b) => a.position.y - b.position.y);
    const gap = 100;
    const startY = sorted[0].position.y;
    sorted.forEach((n, i) => {
      useFlowStore.getState().onNodesChange([
        { type: "position", id: n.id, position: { x: n.position.x, y: startY + i * gap }, dragging: false },
      ]);
    });
  };

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
        {isMultiSelect ? (
          <div className="space-y-4">
            {/* Multi-select header */}
            <div className="flex flex-col items-center gap-2 py-3 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Layers size={18} />
              </div>
              <p className="text-sm font-medium">
                {selectedNodeIds.length} nodes selected
              </p>
              <p className="text-[11px] text-muted-foreground">
                Drag any selected node to move all
              </p>
            </div>

            {/* Selected node list */}
            <div className="space-y-1">
              {nodes
                .filter((n) => selectedNodeIds.includes(n.id))
                .map((n) => {
                  const m = TYPE_META[n.type ?? ""] ?? {
                    label: n.type ?? "Node",
                    color: "#6b7280",
                  };
                  const data = n.data as Record<string, unknown>;
                  const name = String(data?.name ?? data?.label ?? n.type ?? "Node");
                  return (
                    <div
                      key={n.id}
                      className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: m.color }}
                      />
                      <span className="truncate text-foreground/80">{name}</span>
                    </div>
                  );
                })}
            </div>

            {/* Batch actions */}
            <div className="space-y-1.5 pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </p>
              <button
                onClick={handleBatchDuplicate}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
              >
                <Copy size={12} />
                Duplicate all
              </button>
              <button
                onClick={handleAlignH}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
              >
                <AlignHorizontalSpaceAround size={12} />
                Align horizontal
              </button>
              <button
                onClick={handleAlignV}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
              >
                <AlignVerticalSpaceAround size={12} />
                Align vertical
              </button>
              <button
                onClick={() => {
                  useFlowStore.getState().compactSelectedNodes(selectedNodeIds);
                  setTimeout(() => getRFInstance()?.fitView({ duration: 400, padding: 0.2, nodes: selectedNodeIds.map((id) => ({ id })) }), 50);
                }}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
              >
                <Minimize2 size={12} />
                Compact
              </button>
              <button
                onClick={handleBatchDelete}
                className="flex w-full items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={12} />
                Delete all
              </button>
            </div>
          </div>
        ) : !selectedNode ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Settings className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              Select a node to edit its properties
            </p>
          </div>
        ) : selectedNode.type === "program" ? (
          <ProgramForm nodeId={selectedNode.id} data={selectedNode.data as ProgramNodeData} />
        ) : selectedNode.type === "instruction" ? (
          <InstructionForm nodeId={selectedNode.id} data={selectedNode.data as InstructionNodeData} />
        ) : selectedNode.type === "account" ? (
          <AccountForm nodeId={selectedNode.id} data={selectedNode.data as AccountNodeData} />
        ) : selectedNode.type === "state" ? (
          <StateForm nodeId={selectedNode.id} data={selectedNode.data as StateNodeData} />
        ) : selectedNode.type === "constraint" ? (
          <ConstraintForm nodeId={selectedNode.id} data={selectedNode.data as ConstraintNodeData} />
        ) : selectedNode.type === "error" ? (
          <ErrorForm nodeId={selectedNode.id} data={selectedNode.data as ErrorNodeData} />
        ) : selectedNode.type === "event" ? (
          <EventForm nodeId={selectedNode.id} data={selectedNode.data as EventNodeData} />
        ) : selectedNode.type === "logic" ? (
          <LogicForm nodeId={selectedNode.id} data={selectedNode.data as LogicNodeData} />
        ) : selectedNode.type === "custom-code" ? (
          <CustomCodeForm nodeId={selectedNode.id} data={selectedNode.data as CustomCodeNodeData} />
        ) : selectedNode.type === "integration" ? (
          <IntegrationForm nodeId={selectedNode.id} data={selectedNode.data as IntegrationNodeData} />
        ) : (
          <p className="text-xs text-muted-foreground">
            No editor for type &ldquo;{selectedNode.type}&rdquo; yet.
          </p>
        )}
      </div>
    </div>
  );
}
