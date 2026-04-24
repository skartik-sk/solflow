// Types for the Rust parser — internal representations that map to IR schema types.

import type { SolanaType, Constraint, LogicOperation } from "@solflow/ir";

// ─── Parse Options ───────────────────────────────────────────────────

export interface ParseOptions {
  framework?: "anchor" | "pinocchio";
  includeLogic?: boolean; // default true
}

// ─── Parsed Field ────────────────────────────────────────────────────

export interface ParsedField {
  name: string;
  type: SolanaType;
  description?: string;
}

// ─── Parsed Constraint (from account attributes) ─────────────────────

export type ParsedConstraint = Constraint;

// ─── Parsed Account (from #[derive(Accounts)] structs) ───────────────

export interface ParsedAccount {
  name: string;
  accountType: string;
  stateType?: string;
  isMut: boolean;
  isSigner: boolean;
  isInit: boolean;
  isClose: boolean;
  isExecutable?: boolean;
  constraints: ParsedConstraint[];
  description?: string;
  seeds?: Array<{ type: string; value: string }>;
}

// ─── Parsed State (from #[account] data structs) ─────────────────────

export interface ParsedState {
  name: string;
  fields: ParsedField[];
  isZeroCopy: boolean;
  description?: string;
}

// ─── Parsed Instruction ──────────────────────────────────────────────

export interface ParsedInstruction {
  name: string;
  args: ParsedField[];
  accountsStructName: string;
  description?: string;
  logicOps: LogicOperation[];
  accessControl: "none" | "admin_only" | "custom";
}

// ─── Parsed Error ────────────────────────────────────────────────────

export interface ParsedError {
  name: string;
  code: number;
  message: string;
}

// ─── Parsed Event ────────────────────────────────────────────────────

export interface ParsedEvent {
  name: string;
  fields: ParsedField[];
}

// ─── Parsed Constant ─────────────────────────────────────────────────

export interface ParsedConstant {
  name: string;
  type: SolanaType;
  value: string;
}

// ─── Parsed Program (full output from parsing all files) ─────────────

export interface ParsedProgram {
  name: string;
  version: string;
  description?: string;
  programId?: string;
  instructions: ParsedInstruction[];
  accounts: Record<string, ParsedAccount[]>; // instruction name → accounts
  states: ParsedState[];
  errors: ParsedError[];
  events: ParsedEvent[];
  constants: ParsedConstant[];
}

// ─── Parse Result (public API output) ────────────────────────────────

export interface ParseStats {
  instructions: number;
  accounts: number;
  states: number;
  errors: number;
  events: number;
  logicOps: number;
}

export interface ParseResult {
  nodes: import("@xyflow/react").Node[];
  edges: import("@xyflow/react").Edge[];
  stats: ParseStats;
  warnings: string[];
}

// ─── Raw structures from a single file ───────────────────────────────

export interface ParsedStructures {
  programName?: string;
  instructions: ParsedInstruction[];
  accountStructs: Record<string, ParsedAccount[]>;
  states: ParsedState[];
  errors: ParsedError[];
  events: ParsedEvent[];
  constants: ParsedConstant[];
}
