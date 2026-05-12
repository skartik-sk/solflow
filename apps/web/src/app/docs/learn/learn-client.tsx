"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cloud,
  Code2,
  Copy,
  Database,
  Filter,
  GitBranch,
  Play,
  RotateCcw,
  Send,
  Shield,
  Terminal,
  TrendingUp,
  Wallet,
  Workflow,
  Zap,
} from "lucide-react";

type NodeId = string;

type ExerciseNode = {
  id: NodeId;
  label: string;
  type: string;
  x: number;
  y: number;
};

type Edge = {
  from: NodeId;
  to: NodeId;
};

type Exercise = {
  id: string;
  title: string;
  goal: string;
  nodes: ExerciseNode[];
  requiredEdges: Edge[];
  hints: string[];
};

const visualNodeLessons = [
  {
    type: "Program",
    use: "The root of the program. Use one Program node per visual builder project.",
    fields: "name, version, programId, description",
    connects: "Program -> Instruction",
    mistake: "Do not connect Program directly to Account, State, or Logic.",
  },
  {
    type: "Instruction",
    use: "A callable entry point like initialize, deposit, withdraw, create_escrow, or accept_trade.",
    fields: "name, args, accessControl",
    connects:
      "Program -> Instruction, Instruction -> Account, Instruction -> Logic",
    mistake:
      "Do not put account data fields here. Put stored data in State nodes.",
  },
  {
    type: "Account",
    use: "A Solana account passed into an instruction. It can be signer, mutable, init, token account, mint, PDA, or unchecked.",
    fields: "name, accountType, flags, seeds, payer, space",
    connects: "Instruction -> Account, State -> Account, Account -> Constraint",
    mistake:
      "Do not use Account as the stored data schema. Use State for that.",
  },
  {
    type: "State",
    use: "The stored struct for program-owned account data.",
    fields: "name, fields, derives",
    connects: "State -> Account",
    mistake: "State does not connect to Program or Instruction directly.",
  },
  {
    type: "Constraint",
    use: "A validation rule attached to an account: seeds, owner, has_one, address, mint, token authority, close target.",
    fields: "constraintType, account, expression, seeds",
    connects: "Account -> Constraint",
    mistake:
      "Do not attach a constraint to the instruction. Attach it to the account being checked.",
  },
  {
    type: "Logic",
    use: "The instruction body: require checks, transfers, minting, burning, math, CPI, if/else, custom code.",
    fields: "logicType, inputs, outputs, order",
    connects: "Instruction -> Logic, Logic -> Logic",
    mistake:
      "Do not connect Logic directly to Program. Logic runs inside an Instruction.",
  },
  {
    type: "Event",
    use: "A structured event that an instruction can emit for clients and indexers.",
    fields: "name, fields",
    connects: "Instruction -> Event",
    mistake:
      "An Event describes output. It is not an executable step by itself.",
  },
  {
    type: "Error",
    use: "A custom error variant used by require checks or return-error logic.",
    fields: "name, code, message",
    connects: "Instruction -> Error",
    mistake: "Errors are referenced by logic; they are not accounts.",
  },
];

const visualExercises: Exercise[] = [
  {
    id: "vault",
    title: "Build a vault program",
    goal: "Connect initialize and deposit around a shared vault account, stored Vault state, one authority constraint, and transfer_sol logic.",
    nodes: [
      { id: "program", label: "Vault Program", type: "Program", x: 360, y: 10 },
      {
        id: "initialize",
        label: "initialize",
        type: "Instruction",
        x: 140,
        y: 112,
      },
      { id: "deposit", label: "deposit", type: "Instruction", x: 580, y: 112 },
      { id: "vaultAccount", label: "vault", type: "Account", x: 250, y: 250 },
      { id: "vaultState", label: "Vault", type: "State", x: 20, y: 250 },
      {
        id: "requireAuthority",
        label: "has_one authority",
        type: "Constraint",
        x: 480,
        y: 250,
      },
      {
        id: "transferSol",
        label: "transfer_sol",
        type: "Logic",
        x: 710,
        y: 250,
      },
    ],
    requiredEdges: [
      { from: "program", to: "initialize" },
      { from: "program", to: "deposit" },
      { from: "initialize", to: "vaultAccount" },
      { from: "deposit", to: "vaultAccount" },
      { from: "vaultState", to: "vaultAccount" },
      { from: "vaultAccount", to: "requireAuthority" },
      { from: "deposit", to: "transferSol" },
    ],
    hints: [
      "Program nodes connect down to every instruction.",
      "Both instructions use the vault account, so both instructions connect to it.",
      "Vault state connects into the vault account because the account stores that struct.",
      "Authority validation hangs off the vault account.",
      "transfer_sol runs inside deposit, so connect deposit to transfer_sol.",
    ],
  },
  {
    id: "escrow",
    title: "Build an escrow program",
    goal: "Connect initialize_escrow and accept_trade around escrow state, token accounts, transfer_token logic, and close behavior.",
    nodes: [
      {
        id: "program",
        label: "Escrow Program",
        type: "Program",
        x: 360,
        y: 10,
      },
      {
        id: "initEscrow",
        label: "initialize_escrow",
        type: "Instruction",
        x: 110,
        y: 112,
      },
      {
        id: "acceptTrade",
        label: "accept_trade",
        type: "Instruction",
        x: 640,
        y: 112,
      },
      { id: "escrowState", label: "Escrow", type: "State", x: 20, y: 250 },
      { id: "escrowAccount", label: "escrow", type: "Account", x: 250, y: 250 },
      {
        id: "initializerToken",
        label: "initializer_ata",
        type: "Account",
        x: 480,
        y: 250,
      },
      { id: "vaultToken", label: "vault_ata", type: "Account", x: 710, y: 250 },
      {
        id: "transferTokens",
        label: "transfer_token",
        type: "Logic",
        x: 350,
        y: 365,
      },
      {
        id: "closeEscrow",
        label: "close escrow",
        type: "Constraint",
        x: 610,
        y: 365,
      },
    ],
    requiredEdges: [
      { from: "program", to: "initEscrow" },
      { from: "program", to: "acceptTrade" },
      { from: "escrowState", to: "escrowAccount" },
      { from: "initEscrow", to: "escrowAccount" },
      { from: "initEscrow", to: "initializerToken" },
      { from: "initEscrow", to: "vaultToken" },
      { from: "acceptTrade", to: "escrowAccount" },
      { from: "acceptTrade", to: "transferTokens" },
      { from: "escrowAccount", to: "closeEscrow" },
    ],
    hints: [
      "Escrow needs State because trade terms must persist between initialize and accept.",
      "initialize_escrow creates or fills the escrow account.",
      "Token accounts are Account nodes, not State nodes.",
      "accept_trade executes the token transfer logic.",
      "Close behavior belongs to the escrow account being closed.",
    ],
  },
];

function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="mt-2 relative rounded-md border border-border bg-card overflow-hidden">
      <div className="flex items-center">
        <code className="flex-1 overflow-x-auto px-3 py-2 font-mono text-xs text-foreground">
          {command}
        </code>
        <button
          onClick={handleCopy}
          className="shrink-0 px-2.5 py-2 border-l border-border text-muted-foreground/60 hover:text-foreground transition-colors"
          aria-label="Copy command"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-400" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </div>
    </div>
  );
}

type LessonProperty = {
  label: string;
  value: string;
};

type GuidedLessonStep = {
  id: string;
  title: string;
  add: string;
  configure: LessonProperty[];
  connect: string;
  focusNodeId: NodeId;
  requiredEdges: Edge[];
  generatedFile: string;
  generatedCode: string;
};

const vaultLessonSteps: GuidedLessonStep[] = [
  {
    id: "program",
    title: "Add the Program node",
    add: "Drag Program from the palette. This becomes the root of the generated Rust crate.",
    configure: [
      { label: "name", value: "vault_program" },
      { label: "version", value: "0.1.0" },
      { label: "programId", value: "11111111111111111111111111111111" },
    ],
    connect:
      "No connection yet. A Program node is the source for instructions.",
    focusNodeId: "program",
    requiredEdges: [],
    generatedFile: "src/lib.rs",
    generatedCode: `declare_id!("11111111111111111111111111111111");

#[program]
pub mod vault_program {
    use super::*;
}`,
  },
  {
    id: "initialize",
    title: "Add initialize and connect it to Program",
    add: "Drag an Instruction node and name it initialize.",
    configure: [
      { label: "name", value: "initialize" },
      { label: "args", value: "none" },
      { label: "accessControl", value: "none" },
    ],
    connect: "Connect Vault Program -> initialize.",
    focusNodeId: "initialize",
    requiredEdges: [{ from: "program", to: "initialize" }],
    generatedFile: "src/instructions/initialize.rs",
    generatedCode: `pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    // accounts are added in the next steps
}`,
  },
  {
    id: "vault-account",
    title: "Add the vault account to initialize",
    add: "Drag an Account node. This is the on-chain account that initialize creates.",
    configure: [
      { label: "name", value: "vault" },
      { label: "accountType", value: "account" },
      { label: "flags", value: "mut, init" },
      { label: "payer", value: "authority" },
      { label: "space", value: "auto" },
    ],
    connect: "Connect initialize -> vault.",
    focusNodeId: "vaultAccount",
    requiredEdges: [
      { from: "program", to: "initialize" },
      { from: "initialize", to: "vaultAccount" },
    ],
    generatedFile: "src/instructions/initialize.rs",
    generatedCode: `#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = Vault::SPACE)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}`,
  },
  {
    id: "vault-state",
    title: "Define Vault state and bind it to the account",
    add: "Drag a State node. This is the data layout stored inside the vault account.",
    configure: [
      { label: "name", value: "Vault" },
      { label: "field", value: "authority: Pubkey" },
      { label: "field", value: "total_deposits: u64" },
    ],
    connect: "Connect Vault -> vault.",
    focusNodeId: "vaultState",
    requiredEdges: [
      { from: "program", to: "initialize" },
      { from: "initialize", to: "vaultAccount" },
      { from: "vaultState", to: "vaultAccount" },
    ],
    generatedFile: "src/state/vault.rs",
    generatedCode: `#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub total_deposits: u64,
}

impl Vault {
    pub const SPACE: usize = 8 + 32 + 8;
}`,
  },
  {
    id: "deposit",
    title: "Add deposit and reuse the vault account",
    add: "Drag another Instruction node. This handler receives an amount and writes to the same vault account.",
    configure: [
      { label: "name", value: "deposit" },
      { label: "arg", value: "amount: u64" },
      { label: "accessControl", value: "none" },
    ],
    connect: "Connect Vault Program -> deposit, then deposit -> vault.",
    focusNodeId: "deposit",
    requiredEdges: [
      { from: "program", to: "initialize" },
      { from: "initialize", to: "vaultAccount" },
      { from: "vaultState", to: "vaultAccount" },
      { from: "program", to: "deposit" },
      { from: "deposit", to: "vaultAccount" },
    ],
    generatedFile: "src/instructions/deposit.rs",
    generatedCode: `pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    // transfer logic is added in the next step
    Ok(())
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub authority: Signer<'info>,
}`,
  },
  {
    id: "constraint",
    title: "Attach the authority constraint",
    add: "Drag a Constraint node. This protects the vault so only the recorded authority can deposit through this path.",
    configure: [
      { label: "constraintType", value: "has_one" },
      { label: "field", value: "authority" },
      { label: "target", value: "authority" },
    ],
    connect: "Connect vault -> has_one authority.",
    focusNodeId: "requireAuthority",
    requiredEdges: [
      { from: "program", to: "initialize" },
      { from: "initialize", to: "vaultAccount" },
      { from: "vaultState", to: "vaultAccount" },
      { from: "program", to: "deposit" },
      { from: "deposit", to: "vaultAccount" },
      { from: "vaultAccount", to: "requireAuthority" },
    ],
    generatedFile: "src/instructions/deposit.rs",
    generatedCode: `#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, has_one = authority)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub authority: Signer<'info>,
}`,
  },
  {
    id: "logic",
    title: "Add transfer_sol logic and generate the handler body",
    add: "Drag a Logic node and choose transfer-sol. This is the body operation inside deposit.",
    configure: [
      { label: "logicType", value: "transfer-sol" },
      { label: "from", value: "authority" },
      { label: "to", value: "vault" },
      { label: "amount", value: "amount" },
    ],
    connect: "Connect deposit -> transfer_sol.",
    focusNodeId: "transferSol",
    requiredEdges: [
      { from: "program", to: "initialize" },
      { from: "initialize", to: "vaultAccount" },
      { from: "vaultState", to: "vaultAccount" },
      { from: "program", to: "deposit" },
      { from: "deposit", to: "vaultAccount" },
      { from: "vaultAccount", to: "requireAuthority" },
      { from: "deposit", to: "transferSol" },
    ],
    generatedFile: "src/instructions/deposit.rs",
    generatedCode: `pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    ctx.accounts.vault.total_deposits =
        ctx.accounts.vault.total_deposits.checked_add(amount).unwrap();

    // generated transfer_sol operation
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.authority.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount,
    )?;

    Ok(())
}`,
  },
];

const escrowLessonSteps: GuidedLessonStep[] = [
  {
    id: "program",
    title: "Add the Escrow Program node",
    add: "Drag Program from the palette. This is the root for both escrow instructions.",
    configure: [
      { label: "name", value: "escrow_program" },
      { label: "version", value: "0.1.0" },
      { label: "programId", value: "11111111111111111111111111111111" },
    ],
    connect: "No connection yet. Instructions connect out of this node.",
    focusNodeId: "program",
    requiredEdges: [],
    generatedFile: "src/lib.rs",
    generatedCode: `declare_id!("11111111111111111111111111111111");

#[program]
pub mod escrow_program {
    use super::*;
}`,
  },
  {
    id: "instructions",
    title: "Add initialize_escrow and accept_trade",
    add: "Drag two Instruction nodes: initialize_escrow creates the trade, accept_trade completes it.",
    configure: [
      { label: "instruction", value: "initialize_escrow" },
      { label: "arg", value: "amount_a: u64" },
      { label: "instruction", value: "accept_trade" },
      { label: "arg", value: "amount_b: u64" },
    ],
    connect:
      "Connect Escrow Program -> initialize_escrow and Escrow Program -> accept_trade.",
    focusNodeId: "initEscrow",
    requiredEdges: [
      { from: "program", to: "initEscrow" },
      { from: "program", to: "acceptTrade" },
    ],
    generatedFile: "src/lib.rs",
    generatedCode: `pub fn initialize_escrow(ctx: Context<InitializeEscrow>, amount_a: u64) -> Result<()> {
    instructions::initialize_escrow::handler(ctx, amount_a)
}

pub fn accept_trade(ctx: Context<AcceptTrade>, amount_b: u64) -> Result<()> {
    instructions::accept_trade::handler(ctx, amount_b)
}`,
  },
  {
    id: "state",
    title: "Add Escrow state and bind it to the escrow account",
    add: "Drag State and Account nodes. Escrow state stores the terms between initialize and accept.",
    configure: [
      { label: "state", value: "Escrow" },
      { label: "fields", value: "initializer, mint_a, mint_b" },
      { label: "fields", value: "amount_a, amount_b, bump" },
      { label: "account", value: "escrow / init / space auto" },
    ],
    connect: "Connect Escrow -> escrow and initialize_escrow -> escrow.",
    focusNodeId: "escrowState",
    requiredEdges: [
      { from: "program", to: "initEscrow" },
      { from: "program", to: "acceptTrade" },
      { from: "escrowState", to: "escrowAccount" },
      { from: "initEscrow", to: "escrowAccount" },
    ],
    generatedFile: "src/state/escrow.rs",
    generatedCode: `#[account]
pub struct Escrow {
    pub initializer: Pubkey,
    pub mint_a: Pubkey,
    pub mint_b: Pubkey,
    pub amount_a: u64,
    pub amount_b: u64,
    pub bump: u8,
}`,
  },
  {
    id: "token-accounts",
    title: "Add token accounts used during initialization",
    add: "Drag Account nodes for initializer_ata and vault_ata. These represent token accounts, not stored state structs.",
    configure: [
      { label: "initializer_ata", value: "associated-token" },
      { label: "vault_ata", value: "token-account / init" },
      { label: "tokenMint", value: "mint_a" },
      { label: "tokenAuthority", value: "escrow" },
    ],
    connect:
      "Connect initialize_escrow -> initializer_ata and initialize_escrow -> vault_ata.",
    focusNodeId: "initializerToken",
    requiredEdges: [
      { from: "program", to: "initEscrow" },
      { from: "program", to: "acceptTrade" },
      { from: "escrowState", to: "escrowAccount" },
      { from: "initEscrow", to: "escrowAccount" },
      { from: "initEscrow", to: "initializerToken" },
      { from: "initEscrow", to: "vaultToken" },
    ],
    generatedFile: "src/instructions/initialize_escrow.rs",
    generatedCode: `#[derive(Accounts)]
pub struct InitializeEscrow<'info> {
    #[account(mut)]
    pub initializer_ata: Account<'info, TokenAccount>,
    #[account(init, payer = initializer, token::mint = mint_a, token::authority = escrow)]
    pub vault_ata: Account<'info, TokenAccount>,
}`,
  },
  {
    id: "accept-logic",
    title: "Connect accept_trade to escrow and transfer logic",
    add: "Drag Logic and choose transfer-token. accept_trade reads escrow and executes the token movement.",
    configure: [
      { label: "logicType", value: "transfer-token" },
      { label: "from", value: "taker_ata" },
      { label: "to", value: "initializer_receive_ata" },
      { label: "authority", value: "taker" },
    ],
    connect:
      "Connect accept_trade -> escrow and accept_trade -> transfer_token.",
    focusNodeId: "transferTokens",
    requiredEdges: [
      { from: "program", to: "initEscrow" },
      { from: "program", to: "acceptTrade" },
      { from: "escrowState", to: "escrowAccount" },
      { from: "initEscrow", to: "escrowAccount" },
      { from: "initEscrow", to: "initializerToken" },
      { from: "initEscrow", to: "vaultToken" },
      { from: "acceptTrade", to: "escrowAccount" },
      { from: "acceptTrade", to: "transferTokens" },
    ],
    generatedFile: "src/instructions/accept_trade.rs",
    generatedCode: `pub fn handler(ctx: Context<AcceptTrade>, amount_b: u64) -> Result<()> {
    require!(amount_b == ctx.accounts.escrow.amount_b, EscrowError::InvalidAmount);

    token::transfer(ctx.accounts.transfer_to_initializer_ctx(), amount_b)?;
    token::transfer(ctx.accounts.release_to_taker_ctx(), ctx.accounts.escrow.amount_a)?;

    Ok(())
}`,
  },
  {
    id: "close",
    title: "Close escrow when the trade finishes",
    add: "Drag a Constraint node for close behavior. The escrow account should return rent after accept_trade.",
    configure: [
      { label: "constraintType", value: "close" },
      { label: "account", value: "escrow" },
      { label: "closeTarget", value: "initializer" },
    ],
    connect: "Connect escrow -> close escrow.",
    focusNodeId: "closeEscrow",
    requiredEdges: [
      { from: "program", to: "initEscrow" },
      { from: "program", to: "acceptTrade" },
      { from: "escrowState", to: "escrowAccount" },
      { from: "initEscrow", to: "escrowAccount" },
      { from: "initEscrow", to: "initializerToken" },
      { from: "initEscrow", to: "vaultToken" },
      { from: "acceptTrade", to: "escrowAccount" },
      { from: "acceptTrade", to: "transferTokens" },
      { from: "escrowAccount", to: "closeEscrow" },
    ],
    generatedFile: "src/instructions/accept_trade.rs",
    generatedCode: `#[derive(Accounts)]
pub struct AcceptTrade<'info> {
    #[account(mut, close = initializer)]
    pub escrow: Account<'info, Escrow>,
    #[account(mut)]
    pub initializer: SystemAccount<'info>,
}`,
  },
];

const cliLessons = [
  {
    step: "Initialize",
    command: "bun run solstudio init .",
    why: "Creates SolStudio project config and detects Anchor, Pinocchio, Quasar, or unknown mode.",
    useWhen: "Run this first in an existing Solana project.",
  },
  {
    step: "Open visualizer",
    command: "bun run solstudio view .",
    why: "Starts the local server and opens the project graph in the browser.",
    useWhen: "Use this when you want a visual read of a local project.",
  },
  {
    step: "Summarize Rust",
    command: "bun run solstudio parse . --format summary",
    why: "Counts instructions, accounts, states, errors, events, logic operations, nodes, and edges.",
    useWhen: "Use this before opening a large project.",
  },
  {
    step: "Export IR",
    command: "bun run solstudio parse . --format ir --output flow-ir.json",
    why: "Writes SolStudio intermediate representation for debugging or tooling.",
    useWhen: "Use this when you need structured data, not the UI.",
  },
  {
    step: "Import IDL",
    command:
      "bun run solstudio idl ./target/idl/vault.json --output vault-flow.json",
    why: "Converts IDL instructions, accounts, errors, and events into flow JSON.",
    useWhen: "Use this when you only have an IDL file.",
  },
];

const cliTasks = [
  {
    title: "You cloned an Anchor project and want the visualizer.",
    answer: "bun run solstudio view .",
    options: [
      "bun run solstudio view .",
      "bun run solstudio idl .",
      "bun run solstudio parse ./target/idl/vault.json",
    ],
    note: "`view` starts the local server and opens the visual project.",
  },
  {
    title: "You want a short count of instructions and accounts.",
    answer: "bun run solstudio parse . --format summary",
    options: [
      "bun run solstudio init . --scaffold",
      "bun run solstudio parse . --format summary",
      "bun run solstudio view . --no-open",
    ],
    note: "`parse` reads Rust source; `summary` keeps output compact.",
  },
  {
    title: "You have only an IDL JSON and want flow data.",
    answer:
      "bun run solstudio idl ./target/idl/vault.json --output vault-flow.json",
    options: [
      "bun run solstudio idl ./target/idl/vault.json --output vault-flow.json",
      "bun run solstudio init ./target/idl/vault.json",
      "bun run solstudio view ./target/idl/vault.json",
    ],
    note: "`idl` is for IDL JSON. Use `parse` for Rust code.",
  },
];

const cloudNodeLessons = [
  {
    type: "Manual Trigger",
    use: "Start a workflow by clicking Run. Best for testing, admin actions, and one-off operations.",
    connects: "Manual Trigger -> action or logic",
  },
  {
    type: "Cron Trigger",
    use: "Start a workflow on a schedule. Best for price checks, reporting, and repeated monitoring.",
    connects: "Cron Trigger -> first action",
  },
  {
    type: "Webhook Trigger",
    use: "Start a workflow from an external request. Best for bots, backend events, and product integrations.",
    connects: "Webhook Trigger -> transform, AI, or action",
  },
  {
    type: "Price Fetch",
    use: "Fetch token or market data before a decision.",
    connects: "Trigger -> Price Fetch -> If/Else or AI Agent",
  },
  {
    type: "AI Agent",
    use: "Summarize inputs, decide a route, score risk, or generate a message before the next step.",
    connects: "Data action -> AI Agent -> If/Else or Output",
  },
  {
    type: "Jupiter nodes",
    use: "Use separate Jupiter Price, Token, Portfolio, Swap Order, Swap Build, Swap Execute, and Direct Swap nodes.",
    connects: "If/Else or Trigger -> Jupiter Direct Swap or Swap Execute -> Output",
  },
  {
    type: "Pyth nodes",
    use: "Read one feed, search feed IDs, or fetch latest prices for multiple Pyth feeds.",
    connects: "Trigger -> Pyth Price or Latest Prices -> If/Else or Output",
  },
  {
    type: "Helius nodes",
    use: "Read wallet activity, raw transactions, enhanced parsed transactions, or enhanced address history.",
    connects: "Trigger -> Helius node -> If/Else or Output",
  },
  {
    type: "Token Transfer",
    use: "Move tokens from a configured wallet to a destination.",
    connects: "Trigger or logic -> Token Transfer -> Output",
  },
  {
    type: "Output nodes",
    use: "Show the final data in SolStudio with Display Output, append Run Log messages, or store a Workflow Result. Use Webhook Output only when another app must receive the payload.",
    connects: "Any final action -> Display Output, Run Log, Workflow Result, or Webhook Output",
  },
];

type CloudCategory =
  | "trigger"
  | "action"
  | "transform"
  | "logic"
  | "ai"
  | "output";

type CloudPort = {
  type: "main" | "ai" | "trigger";
  label: string;
};

type CloudLessonNode = {
  id: NodeId;
  label: string;
  type: string;
  category: CloudCategory;
  icon:
    | "Clock"
    | "TrendingUp"
    | "Bot"
    | "GitBranch"
    | "Send"
    | "Zap"
    | "Filter"
    | "Wallet"
    | "Workflow";
  x: number;
  y: number;
  inputs: CloudPort[];
  outputs: CloudPort[];
  rows: LessonProperty[];
};

type CloudLessonStep = {
  id: string;
  title: string;
  add: string;
  configure: LessonProperty[];
  connect: string;
  focusNodeId: NodeId;
  requiredEdges: Edge[];
  expectedInput: string;
  expectedOutput: string;
  executionLog: string[];
};

type CloudGuidedExercise = {
  id: "price-monitor" | "swap-guard" | "payout";
  title: string;
  goal: string;
  nodes: CloudLessonNode[];
  steps: CloudLessonStep[];
};

const CLOUD_CATEGORY_COLORS: Record<CloudCategory, string> = {
  trigger: "#22c55e",
  action: "#3b82f6",
  transform: "#f59e0b",
  logic: "#a855f7",
  ai: "#ec4899",
  output: "#06b6d4",
};

const CLOUD_CONNECTION_COLORS: Record<CloudPort["type"], string> = {
  main: "#3b82f6",
  ai: "#a855f7",
  trigger: "#22c55e",
};

const cloudGuidedExercises: CloudGuidedExercise[] = [
  {
    id: "price-monitor",
    title: "AI price monitor",
    goal: "Cron checks a token price, AI explains the move, If/Else routes the result, and Run Log records the alert inside SolStudio.",
    nodes: [
      {
        id: "cron",
        label: "Cron Trigger",
        type: "trigger:cron",
        category: "trigger",
        icon: "Clock",
        x: 40,
        y: 90,
        inputs: [],
        outputs: [{ type: "main", label: "output" }],
        rows: [
          { label: "cron", value: "*/15 * * * *" },
          { label: "tz", value: "UTC" },
        ],
      },
      {
        id: "price",
        label: "Fetch Price",
        type: "action:price-fetch",
        category: "action",
        icon: "TrendingUp",
        x: 300,
        y: 90,
        inputs: [{ type: "main", label: "input" }],
        outputs: [{ type: "main", label: "output" }],
        rows: [
          { label: "token", value: "SOL" },
          { label: "source", value: "birdeye" },
        ],
      },
      {
        id: "ai",
        label: "AI Agent",
        type: "action:ai-agent",
        category: "ai",
        icon: "Bot",
        x: 560,
        y: 90,
        inputs: [{ type: "main", label: "input" }],
        outputs: [{ type: "main", label: "output" }],
        rows: [
          { label: "model", value: "openai/gpt-4o-mini" },
          { label: "format", value: "json" },
        ],
      },
      {
        id: "if",
        label: "If / Else",
        type: "logic:if-else",
        category: "logic",
        icon: "GitBranch",
        x: 820,
        y: 90,
        inputs: [{ type: "main", label: "input" }],
        outputs: [
          { type: "main", label: "true" },
          { type: "main", label: "false" },
        ],
        rows: [
          { label: "field", value: "alert" },
          { label: "operator", value: "truthy" },
        ],
      },
      {
        id: "runLog",
        label: "Run Log",
        type: "output:log",
        category: "output",
        icon: "Send",
        x: 1080,
        y: 90,
        inputs: [{ type: "main", label: "input" }],
        outputs: [{ type: "main", label: "entry" }],
        rows: [
          { label: "level", value: "info" },
          { label: "message", value: "summary" },
        ],
      },
    ],
    steps: [
      {
        id: "cron",
        title: "Add Cron Trigger",
        add: "Drag Cron Trigger from Triggers. It starts the workflow without manual clicks.",
        configure: [
          { label: "cronExpression", value: "*/15 * * * *" },
          { label: "timezone", value: "UTC" },
        ],
        connect: "No input. This is the first source node.",
        focusNodeId: "cron",
        requiredEdges: [],
        expectedInput: "None. Triggers create the first workflow item.",
        expectedOutput: '{ triggered: true, triggerType: "cron", timestamp }',
        executionLog: [
          "Cron Trigger scheduled every 15 minutes.",
          "Emitted one workflow item with trigger metadata.",
        ],
      },
      {
        id: "price",
        title: "Fetch market data",
        add: "Drag Fetch Price from Actions. This enriches the trigger item with price data.",
        configure: [
          { label: "token", value: "SOL" },
          { label: "source", value: "birdeye" },
          { label: "credentialId", value: "optional" },
        ],
        connect: "Connect Cron Trigger output -> Fetch Price input.",
        focusNodeId: "price",
        requiredEdges: [{ from: "cron", to: "price" }],
        expectedInput: "{ triggered, timestamp }",
        expectedOutput: "{ token, priceUsd, source, fetchedAt }",
        executionLog: [
          "Received trigger item.",
          "Fetched SOL price from Birdeye.",
          "Attached priceUsd and fetchedAt to item.json.",
        ],
      },
      {
        id: "ai",
        title: "Ask AI to classify the move",
        add: "Drag AI Agent from AI. It should turn price data into a structured decision.",
        configure: [
          { label: "model", value: "gpt-4o-mini" },
          { label: "responseFormat", value: "json" },
          { label: "prompt", value: "Return { alert, summary, risk }" },
        ],
        connect: "Connect Fetch Price output -> AI Agent input.",
        focusNodeId: "ai",
        requiredEdges: [
          { from: "cron", to: "price" },
          { from: "price", to: "ai" },
        ],
        expectedInput: "{ token, priceUsd, source, fetchedAt }",
        expectedOutput: "{ alert: boolean, summary: string, risk: string }",
        executionLog: [
          "Resolved expression values from price item.",
          "Called AI provider with JSON response format.",
          "Merged AI decision into workflow item.",
        ],
      },
      {
        id: "if",
        title: "Branch on AI output",
        add: "Drag If / Else from Logic. It routes only alert-worthy items to the notification step.",
        configure: [
          { label: "field", value: "alert" },
          { label: "operator", value: "truthy" },
        ],
        connect: "Connect AI Agent output -> If / Else input.",
        focusNodeId: "if",
        requiredEdges: [
          { from: "cron", to: "price" },
          { from: "price", to: "ai" },
          { from: "ai", to: "if" },
        ],
        expectedInput: "{ alert, summary, risk }",
        expectedOutput:
          "true output receives alert items; false output receives quiet items",
        executionLog: [
          "Evaluated item.json.alert.",
          "Routed alert item through true output.",
        ],
      },
      {
        id: "runLog",
        title: "Record the alert",
        add: "Drag Run Log from Output. This records the AI summary inside the execution log so you can verify the run before wiring external delivery.",
        configure: [
          { label: "level", value: "info" },
          { label: "message", value: "{{ $json.summary }}" },
        ],
        connect: "Connect If / Else true -> Run Log input.",
        focusNodeId: "runLog",
        requiredEdges: [
          { from: "cron", to: "price" },
          { from: "price", to: "ai" },
          { from: "ai", to: "if" },
          { from: "if", to: "runLog" },
        ],
        expectedInput: "{ alert: true, summary, risk }",
        expectedOutput: "{ level, message, loggedAt }",
        executionLog: [
          "Resolved message from item.json.summary.",
          "Appended info entry to the run log.",
          "Forwarded the workflow item for the result tabs.",
        ],
      },
    ],
  },
  {
    id: "swap-guard",
    title: "AI-assisted swap guard",
    goal: "Webhook receives a trade idea, price data and AI score it, If/Else approves it, Jupiter Direct Swap executes the approved branch, then Workflow Result stores the signature.",
    nodes: [
      {
        id: "webhookTrigger",
        label: "Webhook Trigger",
        type: "trigger:webhook",
        category: "trigger",
        icon: "Workflow",
        x: 40,
        y: 90,
        inputs: [],
        outputs: [{ type: "main", label: "output" }],
        rows: [
          { label: "path", value: "/trade-signal" },
          { label: "method", value: "POST" },
        ],
      },
      {
        id: "price",
        label: "Fetch Price",
        type: "action:price-fetch",
        category: "action",
        icon: "TrendingUp",
        x: 300,
        y: 90,
        inputs: [{ type: "main", label: "input" }],
        outputs: [{ type: "main", label: "output" }],
        rows: [
          { label: "token", value: "{{ tokenIn }}" },
          { label: "source", value: "dexscreener" },
        ],
      },
      {
        id: "ai",
        label: "AI Agent",
        type: "action:ai-agent",
        category: "ai",
        icon: "Bot",
        x: 560,
        y: 90,
        inputs: [{ type: "main", label: "input" }],
        outputs: [{ type: "main", label: "output" }],
        rows: [
          { label: "model", value: "gpt-4o-mini" },
          { label: "format", value: "json" },
        ],
      },
      {
        id: "if",
        label: "If / Else",
        type: "logic:if-else",
        category: "logic",
        icon: "GitBranch",
        x: 820,
        y: 90,
        inputs: [{ type: "main", label: "input" }],
        outputs: [
          { type: "main", label: "true" },
          { type: "main", label: "false" },
        ],
        rows: [
          { label: "field", value: "approved" },
          { label: "operator", value: "truthy" },
        ],
      },
      {
        id: "swap",
        label: "Jupiter Direct Swap",
        type: "action:jupiter-swap",
        category: "action",
        icon: "Zap",
        x: 1080,
        y: 90,
        inputs: [{ type: "main", label: "input" }],
        outputs: [{ type: "main", label: "output" }],
        rows: [
          { label: "wallet", value: "trading" },
          { label: "slippage", value: "50 bps" },
        ],
      },
      {
        id: "result",
        label: "Workflow Result",
        type: "output:result",
        category: "output",
        icon: "Send",
        x: 1340,
        y: 90,
        inputs: [{ type: "main", label: "input" }],
        outputs: [{ type: "main", label: "result" }],
        rows: [
          { label: "key", value: "swapSignature" },
          { label: "value", value: "signature" },
        ],
      },
    ],
    steps: [
      {
        id: "webhook",
        title: "Receive a trade signal",
        add: "Drag Webhook Trigger. It starts this workflow from your bot, backend, or alerting system.",
        configure: [
          { label: "path", value: "/trade-signal" },
          { label: "method", value: "POST" },
        ],
        connect: "No input. This is the source node.",
        focusNodeId: "webhookTrigger",
        requiredEdges: [],
        expectedInput: "HTTP POST body from your app",
        expectedOutput: "{ tokenIn, tokenOut, amount, reason }",
        executionLog: [
          "Accepted POST /trade-signal.",
          "Normalized body into one workflow item.",
        ],
      },
      {
        id: "price",
        title: "Fetch price for the signal",
        add: "Drag Fetch Price. Use expressions so the token comes from the webhook body.",
        configure: [
          { label: "token", value: "{{ $json.tokenIn }}" },
          { label: "source", value: "dexscreener" },
        ],
        connect: "Connect Webhook Trigger output -> Fetch Price input.",
        focusNodeId: "price",
        requiredEdges: [{ from: "webhookTrigger", to: "price" }],
        expectedInput: "{ tokenIn, tokenOut, amount }",
        expectedOutput: "{ tokenIn, tokenOut, amount, priceUsd, liquidityUsd }",
        executionLog: [
          "Read tokenIn from webhook item.",
          "Fetched price and liquidity data.",
        ],
      },
      {
        id: "ai",
        title: "Ask AI to approve or reject",
        add: "Drag AI Agent. It scores risk before the workflow can swap.",
        configure: [
          { label: "prompt", value: "Return { approved, reason }" },
          { label: "responseFormat", value: "json" },
          { label: "temperature", value: "0.2" },
        ],
        connect: "Connect Fetch Price output -> AI Agent input.",
        focusNodeId: "ai",
        requiredEdges: [
          { from: "webhookTrigger", to: "price" },
          { from: "price", to: "ai" },
        ],
        expectedInput: "{ priceUsd, liquidityUsd, amount, reason }",
        expectedOutput: "{ approved: boolean, reason: string }",
        executionLog: [
          "Built AI prompt from signal and price data.",
          "Returned structured approval decision.",
        ],
      },
      {
        id: "if",
        title: "Branch on approval",
        add: "Drag If / Else. It protects the swap action from running on rejected signals.",
        configure: [
          { label: "field", value: "approved" },
          { label: "operator", value: "truthy" },
        ],
        connect: "Connect AI Agent output -> If / Else input.",
        focusNodeId: "if",
        requiredEdges: [
          { from: "webhookTrigger", to: "price" },
          { from: "price", to: "ai" },
          { from: "ai", to: "if" },
        ],
        expectedInput: "{ approved, reason }",
        expectedOutput:
          "true output continues to swap; false output stops or reports rejection",
        executionLog: [
          "Checked approved flag.",
          "Routed approved item to true output.",
        ],
      },
      {
        id: "swap",
        title: "Execute Jupiter direct swap",
        add: "Drag Jupiter Direct Swap. This is the wallet action, so it should come after the approval branch.",
        configure: [
          { label: "walletId", value: "trading-wallet" },
          { label: "inputMint", value: "{{ $json.tokenIn }}" },
          { label: "outputMint", value: "{{ $json.tokenOut }}" },
          { label: "amount", value: "{{ $json.amount }}" },
        ],
        connect: "Connect If / Else true -> Jupiter Direct Swap input.",
        focusNodeId: "swap",
        requiredEdges: [
          { from: "webhookTrigger", to: "price" },
          { from: "price", to: "ai" },
          { from: "ai", to: "if" },
          { from: "if", to: "swap" },
        ],
        expectedInput: "{ tokenIn, tokenOut, amount, approved: true }",
        expectedOutput: "{ signature, inputMint, outputMint, amountOut }",
        executionLog: [
          "Requested quote from Jupiter.",
          "Signed transaction with selected wallet.",
          "Sent swap and captured signature.",
        ],
      },
      {
        id: "report",
        title: "Store the result",
        add: "Drag Workflow Result. Store the transaction signature in the execution result so the run can be inspected before any external callback is added.",
        configure: [
          { label: "key", value: "swapSignature" },
          { label: "value", value: "{{ $json.signature }}" },
        ],
        connect: "Connect Jupiter Direct Swap output -> Workflow Result input.",
        focusNodeId: "result",
        requiredEdges: [
          { from: "webhookTrigger", to: "price" },
          { from: "price", to: "ai" },
          { from: "ai", to: "if" },
          { from: "if", to: "swap" },
          { from: "swap", to: "result" },
        ],
        expectedInput: "{ signature, amountOut }",
        expectedOutput: "{ resultKey, value, savedAt }",
        executionLog: [
          "Resolved signature from the swap output.",
          "Stored swapSignature in Workflow Result.",
        ],
      },
    ],
  },
  {
    id: "payout",
    title: "Manual token payout",
    goal: "Manual trigger sends tokens from a selected wallet, waits briefly, then reports the transfer signature.",
    nodes: [
      {
        id: "manual",
        label: "Manual Trigger",
        type: "trigger:manual",
        category: "trigger",
        icon: "Workflow",
        x: 40,
        y: 90,
        inputs: [],
        outputs: [{ type: "main", label: "output" }],
        rows: [{ label: "mode", value: "click Run" }],
      },
      {
        id: "transfer",
        label: "Token Transfer",
        type: "action:token-transfer",
        category: "action",
        icon: "Wallet",
        x: 300,
        y: 90,
        inputs: [{ type: "main", label: "input" }],
        outputs: [{ type: "main", label: "output" }],
        rows: [
          { label: "wallet", value: "ops" },
          { label: "amount", value: "10" },
        ],
      },
      {
        id: "filter",
        label: "Filter",
        type: "transform:filter",
        category: "transform",
        icon: "Filter",
        x: 560,
        y: 90,
        inputs: [{ type: "main", label: "input" }],
        outputs: [{ type: "main", label: "matched" }],
        rows: [
          { label: "field", value: "signature" },
          { label: "operator", value: "exists" },
        ],
      },
      {
        id: "result",
        label: "Workflow Result",
        type: "output:result",
        category: "output",
        icon: "Send",
        x: 820,
        y: 90,
        inputs: [{ type: "main", label: "input" }],
        outputs: [{ type: "main", label: "result" }],
        rows: [
          { label: "key", value: "payoutSignature" },
          { label: "value", value: "signature" },
        ],
      },
    ],
    steps: [
      {
        id: "manual",
        title: "Start with Manual Trigger",
        add: "Drag Manual Trigger. Use this for operator-controlled workflows and tests.",
        configure: [{ label: "mode", value: "manual run" }],
        connect: "No input. This is the source node.",
        focusNodeId: "manual",
        requiredEdges: [],
        expectedInput: "None",
        expectedOutput: "{ triggered: true, triggerType: 'manual' }",
        executionLog: ["Manual run started.", "Emitted one trigger item."],
      },
      {
        id: "transfer",
        title: "Transfer tokens",
        add: "Drag Token Transfer. This wallet action sends SPL tokens to a recipient.",
        configure: [
          { label: "walletId", value: "ops-wallet" },
          { label: "mint", value: "USDC" },
          { label: "recipient", value: "recipient pubkey" },
          { label: "amount", value: "10" },
        ],
        connect: "Connect Manual Trigger output -> Token Transfer input.",
        focusNodeId: "transfer",
        requiredEdges: [{ from: "manual", to: "transfer" }],
        expectedInput: "{ triggered: true }",
        expectedOutput: "{ signature, mint, recipient, amount }",
        executionLog: [
          "Loaded selected wallet public key.",
          "Built token transfer transaction.",
          "Signed and sent transaction.",
        ],
      },
      {
        id: "filter",
        title: "Verify signature exists",
        add: "Drag Filter. It keeps only successful transfer outputs before reporting.",
        configure: [
          { label: "field", value: "signature" },
          { label: "operator", value: "exists" },
        ],
        connect: "Connect Token Transfer output -> Filter input.",
        focusNodeId: "filter",
        requiredEdges: [
          { from: "manual", to: "transfer" },
          { from: "transfer", to: "filter" },
        ],
        expectedInput: "{ signature, mint, recipient, amount }",
        expectedOutput: "matched output keeps successful transfer item",
        executionLog: [
          "Checked signature field.",
          "Forwarded successful transfer item.",
        ],
      },
      {
        id: "report",
        title: "Report payout result",
        add: "Drag Workflow Result and store the transfer signature in SolStudio. Add Webhook Output later only when a backend callback is required.",
        configure: [
          { label: "key", value: "payoutSignature" },
          { label: "value", value: "{{ $json.signature }}" },
        ],
        connect: "Connect Filter matched -> Workflow Result input.",
        focusNodeId: "result",
        requiredEdges: [
          { from: "manual", to: "transfer" },
          { from: "transfer", to: "filter" },
          { from: "filter", to: "result" },
        ],
        expectedInput: "{ signature, recipient, amount }",
        expectedOutput: "{ resultKey, value, savedAt }",
        executionLog: [
          "Resolved signature from the transfer output.",
          "Stored payoutSignature in Workflow Result.",
        ],
      },
    ],
  },
];

const cloudNodeCards = [
  {
    node: cloudGuidedExercises[2].nodes[0],
    use: cloudNodeLessons[0].use,
    connects: cloudNodeLessons[0].connects,
    expects: "None. The operator clicks Run.",
    output: "{ triggered: true, triggerType: 'manual' }",
  },
  {
    node: cloudGuidedExercises[0].nodes[0],
    use: cloudNodeLessons[1].use,
    connects: cloudNodeLessons[1].connects,
    expects: "None. The schedule creates the workflow item.",
    output: "{ triggered: true, timestamp, schedule }",
  },
  {
    node: cloudGuidedExercises[1].nodes[0],
    use: cloudNodeLessons[2].use,
    connects: cloudNodeLessons[2].connects,
    expects: "HTTP request body from an external app.",
    output: "{ body, headers, method, path }",
  },
  {
    node: cloudGuidedExercises[0].nodes[1],
    use: cloudNodeLessons[3].use,
    connects: cloudNodeLessons[3].connects,
    expects: "{ token, timestamp } or a token expression.",
    output: "{ token, priceUsd, source, fetchedAt }",
  },
  {
    node: cloudGuidedExercises[0].nodes[2],
    use: cloudNodeLessons[4].use,
    connects: cloudNodeLessons[4].connects,
    expects: "Any item with the fields referenced by the prompt.",
    output: "{ decision fields requested in responseFormat }",
  },
  {
    node: cloudGuidedExercises[1].nodes[4],
    use: cloudNodeLessons[5].use,
    connects: cloudNodeLessons[5].connects,
    expects: "{ inputMint, outputMint, amount, walletId }",
    output: "{ signature, amountOut, route }",
  },
  {
    node: cloudGuidedExercises[2].nodes[1],
    use: cloudNodeLessons[6].use,
    connects: cloudNodeLessons[6].connects,
    expects: "{ mint, recipient, amount, walletId }",
    output: "{ signature, mint, recipient, amount }",
  },
  {
    node: cloudGuidedExercises[0].nodes[4],
    use: cloudNodeLessons[7].use,
    connects: cloudNodeLessons[7].connects,
    expects: "The final item from an action, AI, filter, or branch.",
    output: "{ status, response, sentAt }",
  },
];

function edgeKey(edge: Edge) {
  return `${edge.from}->${edge.to}`;
}

function buildPath(from: ExerciseNode, to: ExerciseNode) {
  const startX = from.x + 100;
  const startY = from.y + 96;
  const endX = to.x + 100;
  const endY = to.y;
  const midY = (startY + endY) / 2;
  return `M${startX} ${startY} C${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
}

function DocsLearnShell({
  title,
  description,
  eyebrow,
  children,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground font-bricolage">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/docs"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft size={16} />
            </Link>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Link
                href="/docs"
                className="transition-colors hover:text-foreground"
              >
                Docs
              </Link>
              <ChevronRight size={12} className="text-muted-foreground/40" />
              <Link
                href="/docs/learn"
                className="transition-colors hover:text-foreground"
              >
                Learn
              </Link>
              {eyebrow && (
                <>
                  <ChevronRight
                    size={12}
                    className="text-muted-foreground/40"
                  />
                  <span className="font-medium text-foreground">{eyebrow}</span>
                </>
              )}
            </div>
          </div>
          <Link
            href="/"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            SolStudio
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6">
        <main className="py-10 pb-24">
          <div className="mx-auto max-w-3xl">
            <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function LessonSection({
  number,
  title,
  body,
  children,
}: {
  number: string;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-card p-5">
      <div className="flex items-start gap-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {body}
          </p>
        </div>
      </div>
      {children && <div className="mt-5">{children}</div>}
    </section>
  );
}

function accentForNode(type: string) {
  if (type === "Program") return "#4a47a3";
  if (type === "Instruction") return "#2563eb";
  if (type === "Account") return "#16a34a";
  if (type === "State") return "#7c3aed";
  if (type === "Constraint") return "#ea580c";
  if (type === "Event") return "#eab308";
  if (type === "Error") return "#dc2626";
  return "#0d9488";
}

const HANDLE_COLORS: Record<string, string> = {
  "instruction-in": "#2563eb",
  "instruction-out": "#2563eb",
  "account-in": "#16a34a",
  "account-out": "#16a34a",
  "data-in": "#7c3aed",
  "data-out": "#7c3aed",
  "constraint-in": "#ea580c",
  "constraint-out": "#ea580c",
  "logic-in": "#0d9488",
  "logic-out": "#0d9488",
  "event-out": "#eab308",
  "error-out": "#dc2626",
};

function iconForNode(type: string) {
  if (type === "Program") return <Code2 size={10} />;
  if (type === "Instruction") return <Zap size={10} />;
  if (type === "Account") return <Wallet size={10} />;
  if (type === "State") return <Database size={10} />;
  if (type === "Constraint") return <Shield size={10} />;
  if (type === "Event") return <GitBranch size={10} />;
  return <Workflow size={10} />;
}

function handlesForNode(type: string) {
  if (type === "Program") {
    return [{ kind: "instruction-out", side: "bottom" as const }];
  }
  if (type === "Instruction") {
    return [
      { kind: "instruction-in", side: "top" as const },
      { kind: "account-out", side: "right" as const, top: "38%" },
      { kind: "logic-out", side: "bottom" as const },
      { kind: "error-out", side: "left" as const, top: "38%" },
      { kind: "event-out", side: "left" as const, top: "62%" },
    ];
  }
  if (type === "Account") {
    return [
      { kind: "account-in", side: "top" as const },
      { kind: "constraint-out", side: "right" as const },
      { kind: "data-in", side: "left" as const },
    ];
  }
  if (type === "State") {
    return [{ kind: "data-out", side: "right" as const }];
  }
  if (type === "Constraint") {
    return [{ kind: "constraint-in", side: "left" as const }];
  }
  return [
    { kind: "logic-in", side: "top" as const },
    { kind: "logic-out", side: "bottom" as const },
  ];
}

function LessonHandle({
  kind,
  side,
  top,
}: {
  kind: string;
  side: "top" | "right" | "bottom" | "left";
  top?: string;
}) {
  const color = HANDLE_COLORS[kind] ?? "#4a47a3";
  const positionClass =
    side === "top"
      ? "left-1/2 top-[-6px] -translate-x-1/2"
      : side === "bottom"
        ? "bottom-[-6px] left-1/2 -translate-x-1/2"
        : side === "right"
          ? "right-[-6px] -translate-y-1/2"
          : "left-[-6px] -translate-y-1/2";

  return (
    <span
      title={kind.replace(/-/g, " ")}
      className={`absolute h-3 w-3 rounded-full border-2 border-background ${positionClass}`}
      style={{
        background: color,
        top: side === "left" || side === "right" ? (top ?? "50%") : undefined,
      }}
    />
  );
}

function rowsForNode(node: ExerciseNode): LessonProperty[] {
  if (node.type === "Program") {
    return [
      { label: "name", value: node.label.toLowerCase().replace(/\s+/g, "_") },
      { label: "version", value: "0.1.0" },
    ];
  }
  if (node.type === "Instruction") {
    return [
      { label: "fn", value: node.label },
      { label: "args", value: node.label.includes("deposit") ? "1" : "0" },
    ];
  }
  if (node.type === "Account") {
    return [
      { label: "name", value: node.label },
      {
        label: "type",
        value: node.label.includes("ata") ? "token-account" : "account",
      },
    ];
  }
  if (node.type === "State") {
    return [
      { label: "struct", value: node.label },
      { label: "fields", value: node.label === "Vault" ? "2" : "6" },
    ];
  }
  if (node.type === "Constraint") {
    return [
      { label: "rule", value: node.label },
      { label: "target", value: "account" },
    ];
  }
  return [
    { label: "logic", value: node.label },
    { label: "order", value: "1" },
  ];
}

function StaticEditorNode({ type, label }: { type: string; label?: string }) {
  const accent = accentForNode(type);
  return (
    <div
      className="relative min-h-[96px] min-w-[200px] rounded-xl border border-border bg-card text-card-foreground shadow-lg shadow-black/30"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-center gap-2 rounded-t-xl border-b border-border px-3 py-2">
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px]"
          style={{ background: `${accent}22`, color: accent }}
        >
          {iconForNode(type)}
        </span>
        <span className="truncate text-xs font-semibold leading-none tracking-wide">
          {label ?? type}
        </span>
      </div>
      <div className="space-y-1 px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground/70">type</span>
          <span className="truncate max-w-[110px] text-right font-mono">
            {type}
          </span>
        </div>
      </div>
      {handlesForNode(type).map((handle) => (
        <LessonHandle key={handle.kind} {...handle} />
      ))}
    </div>
  );
}

function EditorLessonNode({
  node,
  selected,
  active,
  onClick,
}: {
  node: ExerciseNode;
  selected: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const accent = accentForNode(node.type);
  const rows = rowsForNode(node);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ left: node.x, top: node.y, borderLeft: `3px solid ${accent}` }}
      className={`absolute min-h-[96px] w-[200px] rounded-xl border bg-card text-left text-card-foreground shadow-lg shadow-black/30 transition-all hover:border-border/80 focus-visible:ring-2 focus-visible:ring-ring ${
        active ? "border-primary shadow-primary/20" : "border-border"
      } ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
    >
      <div className="flex items-center gap-2 rounded-t-xl border-b border-border px-3 py-2">
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px]"
          style={{ background: `${accent}22`, color: accent }}
        >
          {iconForNode(node.type)}
        </span>
        <span className="truncate text-xs font-semibold leading-none tracking-wide">
          {node.label}
        </span>
      </div>
      <div className="space-y-1 px-3 py-2 text-xs text-muted-foreground">
        {rows.map((row) => (
          <div
            key={`${row.label}-${row.value}`}
            className="flex items-center justify-between gap-2"
          >
            <span className="text-muted-foreground/70">{row.label}</span>
            <span className="truncate max-w-[120px] text-right font-mono text-[10px]">
              {row.value}
            </span>
          </div>
        ))}
      </div>
      {handlesForNode(node.type).map((handle) => (
        <LessonHandle key={handle.kind} {...handle} />
      ))}
    </button>
  );
}

function GuidedProgramBuilder({
  defaultExercise = "vault",
}: {
  defaultExercise?: "vault" | "escrow";
}) {
  const [exerciseId, setExerciseId] = useState<"vault" | "escrow">(
    defaultExercise,
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selected, setSelected] = useState<NodeId | null>(null);
  const [result, setResult] = useState("");
  const exercise =
    visualExercises.find((item) => item.id === exerciseId) ??
    visualExercises[0];
  const steps = exerciseId === "vault" ? vaultLessonSteps : escrowLessonSteps;
  const currentStep = steps[stepIndex];
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const nodeMap = useMemo(
    () => new Map(exercise.nodes.map((node) => [node.id, node])),
    [exercise],
  );
  const currentComplete = completed.has(currentStep.id);

  function switchExercise(id: "vault" | "escrow") {
    setExerciseId(id);
    setStepIndex(0);
    setEdges([]);
    setSelected(null);
    setResult("");
    setCompleted(new Set());
  }

  function handleNodeClick(id: NodeId) {
    if (!selected) {
      setSelected(id);
      setResult("Pick the target node for this connection.");
      return;
    }
    if (selected === id) {
      setSelected(null);
      setResult("Pick two different nodes.");
      return;
    }
    const nextEdge = { from: selected, to: id };
    const exists = edges.some((edge) => edgeKey(edge) === edgeKey(nextEdge));
    setEdges(exists ? edges : [...edges, nextEdge]);
    setSelected(null);
    setResult(
      "Connection added. Run the step check when it matches the instruction.",
    );
  }

  function runCheck() {
    const made = new Set(edges.map(edgeKey));
    const missing = currentStep.requiredEdges.filter(
      (edge) => !made.has(edgeKey(edge)),
    );

    if (missing.length === 0) {
      const nextCompleted = new Set(completed);
      nextCompleted.add(currentStep.id);
      setCompleted(nextCompleted);
      setResult("Step verified. The generated code preview is unlocked.");
      return;
    }

    const firstMissing = missing[0];
    setResult(
      `Missing: ${nodeMap.get(firstMissing.from)?.label} -> ${nodeMap.get(firstMissing.to)?.label}`,
    );
  }

  function nextStep() {
    setStepIndex((index) => Math.min(index + 1, steps.length - 1));
    setSelected(null);
    setResult("");
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border/50 bg-background/40 px-3 py-1.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-500/40" />
        </div>
        <div className="flex items-center gap-3 text-[9px] font-mono text-muted-foreground">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
            canvas
          </span>
          <span>properties</span>
          <span>generated code</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => switchExercise("vault")}
            className={`h-7 rounded-md px-2.5 text-[10px] font-medium ${
              exerciseId === "vault"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Vault
          </button>
          <button
            type="button"
            onClick={() => switchExercise("escrow")}
            className={`h-7 rounded-md px-2.5 text-[10px] font-medium ${
              exerciseId === "escrow"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Escrow
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[160px_1fr_280px]">
        <aside className="border-b border-border/40 bg-card/70 p-3 lg:border-b-0 lg:border-r">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Lesson steps
          </p>
          <div className="space-y-1">
            {steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                onClick={() => {
                  setStepIndex(index);
                  setSelected(null);
                  setResult("");
                }}
                className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-[11px] transition-colors ${
                  stepIndex === index
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span className="truncate">
                  {index + 1}. {step.title}
                </span>
                {completed.has(step.id) && (
                  <CheckCircle2
                    size={12}
                    className="shrink-0 text-emerald-400"
                  />
                )}
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-border/50 bg-background/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Add now
            </p>
            <p className="mt-2 text-xs leading-relaxed text-foreground">
              {currentStep.add}
            </p>
          </div>
        </aside>

        <div className="overflow-x-auto bg-background/50">
          <div className="relative h-[490px] min-w-[940px]">
            <div
              className="absolute inset-0 opacity-25"
              style={{
                backgroundImage:
                  "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            />
            <svg className="absolute inset-0 h-full w-full">
              <defs>
                <marker
                  id={`guided-arrow-${exercise.id}`}
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8 z" className="fill-primary" />
                </marker>
              </defs>
              {edges.map((edge) => {
                const from = nodeMap.get(edge.from);
                const to = nodeMap.get(edge.to);
                if (!from || !to) return null;
                return (
                  <path
                    key={edgeKey(edge)}
                    d={buildPath(from, to)}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    markerEnd={`url(#guided-arrow-${exercise.id})`}
                    className="text-primary"
                  />
                );
              })}
            </svg>

            {exercise.nodes.map((node) => (
              <EditorLessonNode
                key={node.id}
                node={node}
                selected={selected === node.id}
                active={currentStep.focusNodeId === node.id}
                onClick={() => handleNodeClick(node.id)}
              />
            ))}
          </div>
        </div>

        <aside className="border-t border-border/40 bg-card/70 p-3 lg:border-l lg:border-t-0">
          <div className="rounded-lg border border-border/50 bg-background/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Current step
            </p>
            <h3 className="mt-2 text-sm font-semibold text-foreground">
              {currentStep.title}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {currentStep.connect}
            </p>
          </div>

          <div className="mt-3 rounded-lg border border-border/50 bg-background/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Properties panel
            </p>
            <div className="mt-2 space-y-1.5">
              {currentStep.configure.map((property, index) => (
                <div
                  key={`${property.label}-${index}`}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="text-muted-foreground/70">
                    {property.label}
                  </span>
                  <span className="max-w-[148px] truncate text-right font-mono text-foreground">
                    {property.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={runCheck}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Play size={14} /> Run check
            </button>
            <button
              type="button"
              onClick={() => {
                setEdges([]);
                setSelected(null);
                setResult("");
                setCompleted(new Set());
                setStepIndex(0);
              }}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent"
            >
              <RotateCcw size={14} /> Reset
            </button>
            {currentComplete && stepIndex < steps.length - 1 && (
              <button
                type="button"
                onClick={nextStep}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent"
              >
                Next step <ChevronRight size={14} />
              </button>
            )}
          </div>

          {result && (
            <p className="mt-3 rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
              {result}
            </p>
          )}

          <div className="mt-3 rounded-lg border border-border/50 bg-background/40">
            <div className="border-b border-border/50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Generated code
              </p>
              <p className="mt-1 font-mono text-[10px] text-primary">
                {currentStep.generatedFile}
              </p>
            </div>
            {currentComplete ? (
              <pre className="max-h-72 overflow-auto p-3 text-[11px] leading-relaxed text-foreground/90">
                <code>{currentStep.generatedCode}</code>
              </pre>
            ) : (
              <p className="p-3 text-xs leading-relaxed text-muted-foreground">
                Run the step check after making the required connection to
                unlock this generated code preview.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function CliPractice() {
  const [selected, setSelected] = useState<Record<number, string>>({});

  return (
    <div className="space-y-4">
      {cliTasks.map((task, index) => {
        const picked = selected[index];
        const correct = picked === task.answer;
        return (
          <div
            key={task.title}
            className="rounded-lg border border-border/50 p-4"
          >
            <p className="text-sm font-medium text-foreground">{task.title}</p>
            <div className="mt-3 grid gap-2">
              {task.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSelected({ ...selected, [index]: option })}
                  className={`min-h-10 rounded-md border px-3 py-2 text-left font-mono text-[12px] transition-colors ${
                    picked === option
                      ? correct
                        ? "border-emerald-500/50 bg-emerald-500/10 text-foreground"
                        : "border-destructive/50 bg-destructive/10 text-foreground"
                      : "border-border bg-background/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            {picked && (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {correct ? "Correct. " : "Not quite. "}
                {task.note}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function cloudIconFor(icon: CloudLessonNode["icon"]) {
  if (icon === "Clock") return <Clock size={12} />;
  if (icon === "TrendingUp") return <TrendingUp size={12} />;
  if (icon === "Bot") return <Bot size={12} />;
  if (icon === "GitBranch") return <GitBranch size={12} />;
  if (icon === "Send") return <Send size={12} />;
  if (icon === "Zap") return <Zap size={12} />;
  if (icon === "Filter") return <Filter size={12} />;
  if (icon === "Wallet") return <Wallet size={12} />;
  return <Workflow size={12} />;
}

function buildCloudPath(from: CloudLessonNode, to: CloudLessonNode) {
  const startX = from.x + 220;
  const startY = from.y + 58;
  const endX = to.x;
  const endY = to.y + 58;
  const midX = (startX + endX) / 2;
  return `M${startX} ${startY} C${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
}

function CloudLessonHandle({
  port,
  side,
  index,
  total,
}: {
  port: CloudPort;
  side: "left" | "right";
  index: number;
  total: number;
}) {
  const color = CLOUD_CONNECTION_COLORS[port.type];
  const top = `${((index + 1) / (total + 1)) * 100}%`;
  return (
    <span
      title={port.label}
      className={`absolute h-[11px] w-[11px] -translate-y-1/2 rounded-full border-2 border-background ${
        side === "left" ? "left-[-5px]" : "right-[-5px]"
      }`}
      style={{ top, background: color }}
    />
  );
}

function CloudEditorNode({
  node,
  selected,
  active,
  status,
  onClick,
}: {
  node: CloudLessonNode;
  selected: boolean;
  active: boolean;
  status: "idle" | "running" | "success";
  onClick: () => void;
}) {
  const accent = CLOUD_CATEGORY_COLORS[node.category];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ left: node.x, top: node.y, borderLeft: `3px solid ${accent}` }}
      className={`absolute min-h-[116px] w-[220px] rounded-xl border bg-card text-left text-card-foreground shadow-lg shadow-black/30 transition-all duration-150 hover:border-border/80 focus-visible:ring-2 focus-visible:ring-ring ${
        active ? "border-primary shadow-primary/20" : "border-border"
      } ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
    >
      <div className="flex items-center gap-2 rounded-t-xl border-b border-border px-3 py-2">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs"
          style={{ background: `${accent}22`, color: accent }}
        >
          {cloudIconFor(node.icon)}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold leading-none tracking-wide">
          {node.label}
        </span>
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            status === "running"
              ? "animate-pulse bg-blue-400"
              : status === "success"
                ? "bg-emerald-400"
                : "bg-zinc-500"
          }`}
        />
      </div>
      <div className="space-y-0.5 px-3 py-2 text-[11px] text-muted-foreground">
        {node.rows.map((row) => (
          <div
            key={`${node.id}-${row.label}`}
            className="flex items-center justify-between gap-2"
          >
            <span className="text-muted-foreground/70">{row.label}</span>
            <span className="max-w-[120px] truncate text-right font-mono text-[10px] text-foreground/90">
              {row.value}
            </span>
          </div>
        ))}
      </div>
      {node.inputs.map((port, index) => (
        <CloudLessonHandle
          key={`in-${port.label}`}
          port={port}
          side="left"
          index={index}
          total={node.inputs.length}
        />
      ))}
      {node.outputs.map((port, index) => (
        <CloudLessonHandle
          key={`out-${port.label}`}
          port={port}
          side="right"
          index={index}
          total={node.outputs.length}
        />
      ))}
    </button>
  );
}

function StaticCloudNode({ node }: { node: CloudLessonNode }) {
  const accent = CLOUD_CATEGORY_COLORS[node.category];
  return (
    <div
      className="relative min-h-[116px] w-full rounded-xl border border-border bg-card text-card-foreground shadow-lg shadow-black/30"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-center gap-2 rounded-t-xl border-b border-border px-3 py-2">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs"
          style={{ background: `${accent}22`, color: accent }}
        >
          {cloudIconFor(node.icon)}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold leading-none tracking-wide">
          {node.label}
        </span>
        <span className="h-2 w-2 shrink-0 rounded-full bg-zinc-500" />
      </div>
      <div className="space-y-0.5 px-3 py-2 text-[11px] text-muted-foreground">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground/70">category</span>
          <span className="font-mono text-[10px] text-foreground/90">
            {node.category}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground/70">type</span>
          <span className="max-w-[120px] truncate text-right font-mono text-[10px] text-foreground/90">
            {node.type}
          </span>
        </div>
      </div>
      {node.inputs.map((port, index) => (
        <CloudLessonHandle
          key={`static-in-${port.label}`}
          port={port}
          side="left"
          index={index}
          total={node.inputs.length}
        />
      ))}
      {node.outputs.map((port, index) => (
        <CloudLessonHandle
          key={`static-out-${port.label}`}
          port={port}
          side="right"
          index={index}
          total={node.outputs.length}
        />
      ))}
    </div>
  );
}

function GuidedCloudBuilder({
  defaultExercise = "price-monitor",
  lockedExercise = false,
}: {
  defaultExercise?: CloudGuidedExercise["id"];
  lockedExercise?: boolean;
}) {
  const [exerciseId, setExerciseId] =
    useState<CloudGuidedExercise["id"]>(defaultExercise);
  const [stepIndex, setStepIndex] = useState(0);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selected, setSelected] = useState<NodeId | null>(null);
  const [result, setResult] = useState("");
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const exercise =
    cloudGuidedExercises.find((item) => item.id === exerciseId) ??
    cloudGuidedExercises[0];
  const currentStep = exercise.steps[stepIndex];
  const currentComplete = completed.has(currentStep.id);
  const nodeMap = useMemo(
    () => new Map(exercise.nodes.map((node) => [node.id, node])),
    [exercise],
  );
  const canvasWidth = Math.max(
    1080,
    Math.max(...exercise.nodes.map((node) => node.x)) + 280,
  );

  function switchExercise(id: CloudGuidedExercise["id"]) {
    setExerciseId(id);
    setStepIndex(0);
    setEdges([]);
    setSelected(null);
    setResult("");
    setCompleted(new Set());
  }

  function handleNodeClick(id: NodeId) {
    if (!selected) {
      setSelected(id);
      setResult("Pick the target Cloud node for this connection.");
      return;
    }
    if (selected === id) {
      setSelected(null);
      setResult("Pick two different nodes.");
      return;
    }
    const nextEdge = { from: selected, to: id };
    const exists = edges.some((edge) => edgeKey(edge) === edgeKey(nextEdge));
    setEdges(exists ? edges : [...edges, nextEdge]);
    setSelected(null);
    setResult(
      "Connection added. Run the step check when it matches the instruction.",
    );
  }

  function runCheck() {
    const made = new Set(edges.map(edgeKey));
    const missing = currentStep.requiredEdges.filter(
      (edge) => !made.has(edgeKey(edge)),
    );

    if (missing.length === 0) {
      const nextCompleted = new Set(completed);
      nextCompleted.add(currentStep.id);
      setCompleted(nextCompleted);
      setResult(
        "Step verified. Expected output and execution logs are unlocked.",
      );
      return;
    }

    const firstMissing = missing[0];
    setResult(
      `Missing: ${nodeMap.get(firstMissing.from)?.label} -> ${nodeMap.get(firstMissing.to)?.label}`,
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border/50 bg-background/40 px-3 py-1.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-500/40" />
        </div>
        <div className="flex items-center gap-3 text-[9px] font-mono text-muted-foreground">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
            workflow
          </span>
          <span>properties</span>
          <span>execution</span>
        </div>
        {lockedExercise ? (
          <div className="rounded bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
            {exercise.title}
          </div>
        ) : (
          <div className="flex gap-2">
            {cloudGuidedExercises.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => switchExercise(item.id)}
                className={`h-7 rounded-md px-2.5 text-[10px] font-medium ${
                  exerciseId === item.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.id === "price-monitor"
                  ? "Monitor"
                  : item.id === "swap-guard"
                    ? "Swap"
                    : "Payout"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[170px_1fr_300px]">
        <aside className="border-b border-border/40 bg-card/70 p-3 lg:border-b-0 lg:border-r">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Workflow steps
          </p>
          <div className="space-y-1">
            {exercise.steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                onClick={() => {
                  setStepIndex(index);
                  setSelected(null);
                  setResult("");
                }}
                className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-[11px] transition-colors ${
                  stepIndex === index
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span className="truncate">
                  {index + 1}. {step.title}
                </span>
                {completed.has(step.id) && (
                  <CheckCircle2
                    size={12}
                    className="shrink-0 text-emerald-400"
                  />
                )}
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-border/50 bg-background/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Add now
            </p>
            <p className="mt-2 text-xs leading-relaxed text-foreground">
              {currentStep.add}
            </p>
          </div>
        </aside>

        <div className="overflow-x-auto bg-background/50">
          <div className="relative h-[330px]" style={{ minWidth: canvasWidth }}>
            <div
              className="absolute inset-0 opacity-25"
              style={{
                backgroundImage:
                  "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            />
            <svg className="absolute inset-0 h-full w-full">
              <defs>
                <marker
                  id={`cloud-arrow-${exercise.id}`}
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8 z" className="fill-primary" />
                </marker>
              </defs>
              {edges.map((edge) => {
                const from = nodeMap.get(edge.from);
                const to = nodeMap.get(edge.to);
                if (!from || !to) return null;
                return (
                  <path
                    key={edgeKey(edge)}
                    d={buildCloudPath(from, to)}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    markerEnd={`url(#cloud-arrow-${exercise.id})`}
                    className="text-primary"
                  />
                );
              })}
            </svg>
            {exercise.nodes.map((node) => (
              <CloudEditorNode
                key={node.id}
                node={node}
                selected={selected === node.id}
                active={currentStep.focusNodeId === node.id}
                status={
                  completed.has(currentStep.id) &&
                  currentStep.focusNodeId === node.id
                    ? "success"
                    : currentStep.focusNodeId === node.id
                      ? "running"
                      : "idle"
                }
                onClick={() => handleNodeClick(node.id)}
              />
            ))}
          </div>
        </div>

        <aside className="border-t border-border/40 bg-card/70 p-3 lg:border-l lg:border-t-0">
          <div className="rounded-lg border border-border/50 bg-background/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Current step
            </p>
            <h3 className="mt-2 text-sm font-semibold text-foreground">
              {currentStep.title}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {currentStep.connect}
            </p>
          </div>

          <div className="mt-3 rounded-lg border border-border/50 bg-background/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Properties
            </p>
            <div className="mt-2 space-y-1.5">
              {currentStep.configure.map((property, index) => (
                <div
                  key={`${property.label}-${index}`}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="text-muted-foreground/70">
                    {property.label}
                  </span>
                  <span className="max-w-[154px] truncate text-right font-mono text-foreground">
                    {property.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={runCheck}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Play size={14} /> Run check
            </button>
            <button
              type="button"
              onClick={() => {
                setEdges([]);
                setSelected(null);
                setResult("");
                setCompleted(new Set());
                setStepIndex(0);
              }}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent"
            >
              <RotateCcw size={14} /> Reset
            </button>
            {currentComplete && stepIndex < exercise.steps.length - 1 && (
              <button
                type="button"
                onClick={() => {
                  setStepIndex((index) =>
                    Math.min(index + 1, exercise.steps.length - 1),
                  );
                  setSelected(null);
                  setResult("");
                }}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent"
              >
                Next step <ChevronRight size={14} />
              </button>
            )}
          </div>

          {result && (
            <p className="mt-3 rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
              {result}
            </p>
          )}

          <div className="mt-3 rounded-lg border border-border/50 bg-background/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Expected input
            </p>
            <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {currentStep.expectedInput}
            </p>
          </div>

          <div className="mt-3 rounded-lg border border-border/50 bg-background/40">
            <div className="border-b border-border/50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Expected output
              </p>
            </div>
            {currentComplete ? (
              <p className="p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
                {currentStep.expectedOutput}
              </p>
            ) : (
              <p className="p-3 text-xs leading-relaxed text-muted-foreground">
                Run the step check to unlock the expected output.
              </p>
            )}
          </div>

          <div className="mt-3 rounded-lg border border-border/50 bg-background/40">
            <div className="border-b border-border/50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Execution log
              </p>
            </div>
            {currentComplete ? (
              <div className="space-y-1 p-3">
                {currentStep.executionLog.map((line) => (
                  <p
                    key={line}
                    className="font-mono text-[11px] text-foreground/90"
                  >
                    {">"} {line}
                  </p>
                ))}
              </div>
            ) : (
              <p className="p-3 text-xs leading-relaxed text-muted-foreground">
                Logs appear after the step is verified.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export function LearnClient() {
  return (
    <DocsLearnShell
      title="Learn by Doing"
      description="Choose one focused learning path. Each path teaches only that part of SolStudio, step by step, with practice built into the docs."
    >
      <div className="grid gap-3">
        {[
          {
            href: "/docs/learn/visual-builder",
            icon: Workflow,
            title: "Visual Builder path",
            body: "Start with every node, learn what connects to what, then build Vault and Escrow graphs step by step.",
          },
          {
            href: "/docs/learn/cli",
            icon: Terminal,
            title: "CLI path",
            body: "Learn the local command flow: init, view, parse, summary, IR export, and IDL import.",
          },
          {
            href: "/docs/learn/cloud",
            icon: Cloud,
            title: "Cloud path",
            body: "Learn Cloud nodes, trigger-action workflow structure, and an AI-assisted workflow from start to finish.",
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-start gap-4 rounded-xl border border-border/60 bg-card p-5 transition-all hover:border-primary/30 hover:bg-accent/30 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <item.icon size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                {item.title}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </div>
            <ChevronRight
              size={16}
              className="mt-1 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-primary"
            />
          </Link>
        ))}
      </div>
    </DocsLearnShell>
  );
}

export function VisualBuilderLearnClient() {
  return (
    <DocsLearnShell
      title="Visual Builder Learning Path"
      eyebrow="Visual Builder"
      description="A complete path for learning the visual editor: what each node does, when to use it, how connections work, then two guided program builds."
    >
      <div className="space-y-5">
        <LessonSection
          number="1"
          title="Learn each node before building"
          body="The visual builder becomes easier when each node has one job in your head. Read these as the mental model for the editor."
        >
          <div className="grid gap-3">
            {visualNodeLessons.map((lesson) => (
              <div
                key={lesson.type}
                className="grid gap-4 rounded-lg border border-border/50 bg-background/40 p-4 md:grid-cols-[220px_1fr]"
              >
                <StaticEditorNode type={lesson.type} />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {lesson.use}
                  </p>
                  <div className="mt-3 grid gap-2 text-xs leading-relaxed text-muted-foreground md:grid-cols-3">
                    <p>
                      <span className="font-semibold text-foreground">
                        Fields:
                      </span>{" "}
                      {lesson.fields}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">
                        Connects:
                      </span>{" "}
                      {lesson.connects}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">
                        Avoid:
                      </span>{" "}
                      {lesson.mistake}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </LessonSection>

        <LessonSection
          number="2"
          title="Learn the connection grammar"
          body="Connections describe ownership, inputs, validation, and execution. If a connection fails in the editor, check this grammar first."
        >
          <div className="grid gap-3 md:grid-cols-2">
            {[
              [
                "Program -> Instruction",
                "The program exposes this callable handler.",
              ],
              [
                "Instruction -> Account",
                "The handler receives this Solana account.",
              ],
              ["State -> Account", "This account stores this data struct."],
              [
                "Account -> Constraint",
                "This account must satisfy this validation rule.",
              ],
              [
                "Instruction -> Logic",
                "This operation runs inside the handler.",
              ],
              ["Logic -> Logic", "These operations run in sequence."],
              ["Instruction -> Event", "This handler may emit this event."],
              [
                "Instruction -> Error",
                "This handler may return this custom error.",
              ],
            ].map(([rule, meaning]) => (
              <div
                key={rule}
                className="rounded-lg border border-border/50 bg-background/40 p-4"
              >
                <p className="font-mono text-xs font-semibold text-primary">
                  {rule}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {meaning}
                </p>
              </div>
            ))}
          </div>
        </LessonSection>

        <LessonSection
          number="3"
          title="Guided build: Vault"
          body="Build this first. It teaches the normal Solana shape: one program, multiple instructions, one state-backed account, one validation rule, and one transfer operation."
        >
          <div className="mb-4 rounded-lg bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">Build order</p>
            <p className="mt-2">
              Add Program, add initialize, add deposit, add vault account, bind
              Vault state, add has_one authority, add transfer_sol logic, then
              run the connection check below.
            </p>
          </div>
          <GuidedProgramBuilder defaultExercise="vault" />
        </LessonSection>

        <LessonSection
          number="4"
          title="Guided build: Escrow"
          body="Escrow is the next level because state persists between instructions and token accounts participate in the trade."
        >
          <div className="mb-4 rounded-lg bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">Build order</p>
            <p className="mt-2">
              Add initialize_escrow and accept_trade, create Escrow state,
              connect escrow/token accounts to initialize, connect escrow and
              transfer_token logic to accept_trade, then attach close behavior
              to the escrow account.
            </p>
          </div>
          <GuidedProgramBuilder defaultExercise="escrow" />
        </LessonSection>

        <LessonSection
          number="5"
          title="What you should be able to build next"
          body="After Vault and Escrow, most beginner Solana programs are variations of the same shape."
        >
          <div className="grid gap-3 md:grid-cols-3">
            {[
              [
                "Counter",
                "Program -> increment instruction -> counter account -> Counter state -> math logic",
              ],
              [
                "Token gate",
                "Instruction -> wallet account -> token account -> require balance logic",
              ],
              [
                "Simple DAO",
                "Program -> create_proposal/vote -> Proposal state -> voter account -> require and math logic",
              ],
            ].map(([title, body]) => (
              <div
                key={title}
                className="rounded-lg border border-border/50 p-4"
              >
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </LessonSection>
      </div>
    </DocsLearnShell>
  );
}

export function CliLearnClient() {
  return (
    <DocsLearnShell
      title="CLI Learning Path"
      eyebrow="CLI"
      description="A focused path for using SolStudio from a terminal. The CLI path is short on purpose: learn the command, when to use it, then practice choosing it."
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-border/50 bg-background/40 p-4">
          <p className="text-sm font-semibold text-foreground mb-2">Install the CLI</p>
          <CopyableCommand command="npm install -g @solstudio/cli" />
          <p className="mt-2 text-xs text-muted-foreground">Requires Node.js 18+ or Bun. After install the <code className="text-foreground bg-card px-1 py-0.5 rounded text-[11px]">solstudio</code> binary is available globally.</p>
        </div>

        <LessonSection
          number="1"
          title="Understand the local workflow"
          body="The CLI is for local projects and local inspection. It does not replace the visual builder; it feeds local Rust or IDL into SolStudio."
        >
          <div className="grid gap-3">
            {cliLessons.map((lesson) => (
              <div
                key={lesson.step}
                className="rounded-lg border border-border/50 bg-background/40 p-4"
              >
                <p className="text-sm font-semibold text-foreground">
                  {lesson.step}
                </p>
                <CopyableCommand command={lesson.command} />
                <div className="mt-3 grid gap-2 text-xs leading-relaxed text-muted-foreground md:grid-cols-2">
                  <p>{lesson.why}</p>
                  <p>
                    <span className="font-semibold text-foreground">
                      Use when:
                    </span>{" "}
                    {lesson.useWhen}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </LessonSection>

        <LessonSection
          number="2"
          title="Practice choosing commands"
          body="Pick the command that matches each situation. This is the fastest way to remember the CLI."
        >
          <CliPractice />
        </LessonSection>

        <LessonSection
          number="3"
          title="Recommended first local session"
          body="Use this exact sequence the first time you bring a local project into SolStudio."
        >
          <div className="space-y-3">
            {[
              ["1", "Run init", "bun run solstudio init ."],
              [
                "2",
                "Check the summary",
                "bun run solstudio parse . --format summary",
              ],
              ["3", "Open the visualizer", "bun run solstudio view ."],
              [
                "4",
                "Export IR only if needed",
                "bun run solstudio parse . --format ir --output flow-ir.json",
              ],
            ].map(([step, title, command]) => (
              <div
                key={step}
                className="flex gap-3 rounded-lg border border-border/50 p-4"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {step}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <code className="mt-1 block overflow-x-auto font-mono text-xs text-muted-foreground">
                    {command}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </LessonSection>
      </div>
    </DocsLearnShell>
  );
}

export function CloudLearnClient() {
  return (
    <DocsLearnShell
      title="Cloud Learning Path"
      eyebrow="Cloud"
      description="A focused path for SolStudio Cloud. Learn each workflow node family, how to connect them, then build AI-assisted automations step by step."
    >
      <div className="space-y-5">
        <LessonSection
          number="1"
          title="Learn Cloud node families"
          body="Cloud workflows are not Rust programs. They are trigger-action graphs that can run continuously."
        >
          <div className="grid gap-3">
            {cloudNodeCards.map((lesson) => (
              <div
                key={lesson.node.id}
                className="grid gap-3 rounded-xl border border-border/50 bg-background/40 p-3 md:grid-cols-[230px_1fr]"
              >
                <StaticCloudNode node={lesson.node} />
                <div className="grid gap-3 py-1 text-xs leading-relaxed md:grid-cols-2">
                  <div>
                    <p className="font-semibold text-foreground">
                      What it does
                    </p>
                    <p className="mt-1 text-muted-foreground">{lesson.use}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">
                      Connect rule
                    </p>
                    <p className="mt-1 font-mono text-primary">
                      {lesson.connects}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">
                      Expected input
                    </p>
                    <p className="mt-1 font-mono text-muted-foreground">
                      {lesson.expects}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">
                      Expected output
                    </p>
                    <p className="mt-1 font-mono text-muted-foreground">
                      {lesson.output}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </LessonSection>

        <LessonSection
          number="2"
          title="Learn the Cloud connection pattern"
          body="Most workflows follow the same order: trigger, fetch or transform data, decide, act, then output. The blue handles carry normal item data; trigger nodes create the first item."
        >
          <div className="overflow-x-auto rounded-lg border border-border/50 bg-background p-4">
            <div className="flex min-w-[640px] items-center gap-3 text-center">
              {[
                ["Trigger", "starts run"],
                ["Data", "fetches context"],
                ["AI / Logic", "decides"],
                ["Action", "does work"],
                ["Output", "reports result"],
              ].map(([title, body], index, arr) => (
                <div key={title} className="flex flex-1 items-center gap-3">
                  <div className="min-h-20 flex-1 rounded-lg border border-border bg-card p-3">
                    <p className="text-sm font-semibold text-foreground">
                      {title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{body}</p>
                  </div>
                  {index < arr.length - 1 && (
                    <ChevronRight size={16} className="shrink-0 text-primary" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </LessonSection>

        <LessonSection
          number="3"
          title="Guided workflow: AI price monitor"
          body="This teaches a real Cloud shape: scheduled trigger, market data, AI reasoning, branch, and notification output."
        >
          <div className="mb-4 rounded-lg bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">Build order</p>
            <p className="mt-2">
              Cron Trigger runs every interval, Price Fetch gets market data, AI
              Agent labels the movement, If/Else checks the AI result, and
              Run Log records the alert inside SolStudio.
            </p>
          </div>
          <GuidedCloudBuilder defaultExercise="price-monitor" lockedExercise />
        </LessonSection>

        <LessonSection
          number="4"
          title="Guided workflow: AI-assisted swap guard"
          body="This one teaches the safer Cloud pattern for wallet actions: receive a signal, enrich it, ask AI, branch, then swap only on the approved path."
        >
          <div className="mb-4 rounded-lg bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">Build order</p>
            <p className="mt-2">
              Webhook Trigger receives a trade idea, Fetch Price adds market
              context, AI Agent returns an approval object, If/Else blocks
              rejected runs, Jupiter Direct Swap executes the swap branch, and
              Workflow Result stores the signature.
            </p>
          </div>
          <GuidedCloudBuilder defaultExercise="swap-guard" lockedExercise />
        </LessonSection>

        <LessonSection
          number="5"
          title="Guided workflow: Manual payout"
          body="This teaches a short operator workflow where a human starts the run, the Cloud action sends tokens, a filter verifies success, and the output reports the result."
        >
          <div className="mb-4 rounded-lg bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">Build order</p>
            <p className="mt-2">
              Manual Trigger starts the item, Token Transfer signs and sends the
              SPL transfer, Filter keeps only successful outputs, and Workflow
              Result stores the transfer signature.
            </p>
          </div>
          <GuidedCloudBuilder defaultExercise="payout" lockedExercise />
        </LessonSection>

        <LessonSection
          number="6"
          title="Activation checklist"
          body="Before activating any Cloud workflow, slow down and verify the operational details."
        >
          <div className="grid gap-2">
            {[
              "The trigger is the one you intend: manual, cron, or webhook.",
              "Every wallet action uses the intended encrypted wallet.",
              "AI output is followed by an explicit If/Else check before risky actions.",
              "Webhook URLs and credentials are configured.",
              "A manual test run produced the expected execution log.",
            ].map((item) => (
              <div
                key={item}
                className="flex items-start gap-2 text-xs text-muted-foreground"
              >
                <CheckCircle2
                  size={14}
                  className="mt-0.5 shrink-0 text-primary"
                />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </LessonSection>
      </div>
    </DocsLearnShell>
  );
}
