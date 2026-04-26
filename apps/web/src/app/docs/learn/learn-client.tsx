"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Code2,
  GitBranch,
  Play,
  RotateCcw,
  Terminal,
  Workflow,
  XCircle,
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
      { id: "program", label: "Vault Program", type: "Program", x: 250, y: 10 },
      {
        id: "initialize",
        label: "initialize",
        type: "Instruction",
        x: 80,
        y: 92,
      },
      { id: "deposit", label: "deposit", type: "Instruction", x: 420, y: 92 },
      { id: "vaultAccount", label: "vault", type: "Account", x: 170, y: 178 },
      { id: "vaultState", label: "Vault", type: "State", x: 18, y: 178 },
      {
        id: "requireAuthority",
        label: "has_one authority",
        type: "Constraint",
        x: 315,
        y: 178,
      },
      {
        id: "transferSol",
        label: "transfer_sol",
        type: "Logic",
        x: 468,
        y: 178,
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
        x: 250,
        y: 10,
      },
      {
        id: "initEscrow",
        label: "initialize_escrow",
        type: "Instruction",
        x: 70,
        y: 92,
      },
      {
        id: "acceptTrade",
        label: "accept_trade",
        type: "Instruction",
        x: 418,
        y: 92,
      },
      { id: "escrowState", label: "Escrow", type: "State", x: 18, y: 178 },
      { id: "escrowAccount", label: "escrow", type: "Account", x: 170, y: 178 },
      {
        id: "initializerToken",
        label: "initializer_ata",
        type: "Account",
        x: 320,
        y: 178,
      },
      { id: "vaultToken", label: "vault_ata", type: "Account", x: 470, y: 178 },
      {
        id: "transferTokens",
        label: "transfer_token",
        type: "Logic",
        x: 250,
        y: 264,
      },
      {
        id: "closeEscrow",
        label: "close escrow",
        type: "Constraint",
        x: 420,
        y: 264,
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
    type: "Jupiter Swap",
    use: "Execute a swap with configured wallet and token inputs.",
    connects: "If/Else or Trigger -> Jupiter Swap -> Output",
  },
  {
    type: "Token Transfer",
    use: "Move tokens from a configured wallet to a destination.",
    connects: "Trigger or logic -> Token Transfer -> Output",
  },
  {
    type: "Webhook Output",
    use: "Send workflow result to another app after the action completes.",
    connects: "Any final action -> Webhook Output",
  },
];

const cloudTasks = [
  {
    title: "AI price monitor",
    goal: "Check price on a schedule, ask AI to classify the move, branch on that decision, then alert.",
    required: [
      "Cron Trigger",
      "Price Fetch",
      "AI Agent",
      "If/Else",
      "Webhook Output",
    ],
    options: [
      "Manual Trigger",
      "Cron Trigger",
      "Price Fetch",
      "AI Agent",
      "If/Else",
      "Jupiter Swap",
      "Webhook Output",
    ],
  },
  {
    title: "AI-assisted swap guard",
    goal: "Receive a webhook, fetch price, let AI review risk, then swap only after the branch passes.",
    required: [
      "Webhook Trigger",
      "Price Fetch",
      "AI Agent",
      "If/Else",
      "Jupiter Swap",
      "Webhook Output",
    ],
    options: [
      "Webhook Trigger",
      "Manual Trigger",
      "Price Fetch",
      "AI Agent",
      "If/Else",
      "Jupiter Swap",
      "Token Transfer",
      "Webhook Output",
    ],
  },
];

function edgeKey(edge: Edge) {
  return `${edge.from}->${edge.to}`;
}

function nodeColor(type: string) {
  if (type === "Program") return "border-primary/50 bg-primary/10 text-primary";
  if (type === "Instruction")
    return "border-node-instruction/50 bg-node-instruction/10 text-foreground";
  if (type === "Account")
    return "border-node-account/50 bg-node-account/10 text-foreground";
  if (type === "State")
    return "border-node-state/50 bg-node-state/10 text-foreground";
  if (type === "Constraint")
    return "border-node-constraint/50 bg-node-constraint/10 text-foreground";
  if (type === "Event" || type === "Error")
    return "border-node-event/50 bg-node-event/10 text-foreground";
  return "border-node-logic/50 bg-node-logic/10 text-foreground";
}

function buildPath(from: ExerciseNode, to: ExerciseNode) {
  const startX = from.x + 60;
  const startY = from.y + 52;
  const endX = to.x + 60;
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

function MiniNode({ type, label }: { type: string; label?: string }) {
  return (
    <div className={`rounded-lg border p-3 ${nodeColor(type)}`}>
      <p className="truncate text-xs font-semibold">{label ?? type}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{type}</p>
    </div>
  );
}

function VisualPractice({
  defaultExercise = "vault",
}: {
  defaultExercise?: string;
}) {
  const [exerciseId, setExerciseId] = useState(defaultExercise);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selected, setSelected] = useState<NodeId | null>(null);
  const [result, setResult] = useState("");
  const [hintIndex, setHintIndex] = useState(0);
  const exercise =
    visualExercises.find((item) => item.id === exerciseId) ??
    visualExercises[0];
  const nodeMap = useMemo(
    () => new Map(exercise.nodes.map((node) => [node.id, node])),
    [exercise],
  );
  const correctCount = edges.filter((edge) =>
    exercise.requiredEdges.some(
      (required) => required.from === edge.from && required.to === edge.to,
    ),
  ).length;

  function switchExercise(id: string) {
    setExerciseId(id);
    setEdges([]);
    setSelected(null);
    setResult("");
    setHintIndex(0);
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
    setResult("Connection added. Hit Run when the graph looks right.");
  }

  function runCheck() {
    const made = new Set(edges.map(edgeKey));
    const missing = exercise.requiredEdges.filter(
      (edge) => !made.has(edgeKey(edge)),
    );
    const extra = edges.filter(
      (edge) =>
        !exercise.requiredEdges.some(
          (required) => edgeKey(required) === edgeKey(edge),
        ),
    );

    if (missing.length === 0 && extra.length === 0) {
      setResult("Correct. This graph has the required SolStudio connections.");
      return;
    }
    if (missing.length > 0) {
      const firstMissing = missing[0];
      setResult(
        `Missing: ${nodeMap.get(firstMissing.from)?.label} -> ${nodeMap.get(firstMissing.to)?.label}`,
      );
      return;
    }
    const firstExtra = extra[0];
    setResult(
      `Check this edge: ${nodeMap.get(firstExtra.from)?.label} -> ${nodeMap.get(firstExtra.to)?.label}`,
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {exercise.title}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {exercise.goal}
          </p>
        </div>
        <div className="flex gap-2">
          {visualExercises.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => switchExercise(item.id)}
              className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${
                exercise.id === item.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.id === "vault" ? "Vault" : "Escrow"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border/50 bg-background">
        <div className="relative h-[336px] min-w-[620px]">
          <svg className="absolute inset-0 h-full w-full">
            <defs>
              <marker
                id={`practice-arrow-${exercise.id}`}
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
                  markerEnd={`url(#practice-arrow-${exercise.id})`}
                  className="text-primary"
                />
              );
            })}
          </svg>

          {exercise.nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => handleNodeClick(node.id)}
              style={{ left: node.x, top: node.y }}
              className={`absolute h-[54px] w-[120px] rounded-lg border p-2 text-left transition-all hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-ring ${
                selected === node.id
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                  : ""
              } ${nodeColor(node.type)}`}
            >
              <span className="block truncate text-xs font-semibold">
                {node.label}
              </span>
              <span className="mt-1 block text-[10px] text-muted-foreground">
                {node.type}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-xs font-medium text-foreground">
            Hint {hintIndex + 1}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {exercise.hints[hintIndex]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              setHintIndex((index) => (index + 1) % exercise.hints.length)
            }
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent"
          >
            Next hint <ChevronRight size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              setEdges([]);
              setSelected(null);
              setResult("");
            }}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent"
          >
            <RotateCcw size={14} /> Reset
          </button>
          <button
            type="button"
            onClick={runCheck}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Play size={14} /> Run check
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {correctCount}/{exercise.requiredEdges.length} required edges
          connected
        </p>
        {result && (
          <p className="text-xs font-medium text-foreground">{result}</p>
        )}
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

function CloudPractice() {
  const [taskIndex, setTaskIndex] = useState(0);
  const [sequence, setSequence] = useState<string[]>([]);
  const [result, setResult] = useState("");
  const task = cloudTasks[taskIndex];

  function runCheck() {
    const correct =
      sequence.length === task.required.length &&
      sequence.every((item, index) => item === task.required[index]);
    setResult(
      correct
        ? "Correct. This workflow has the right trigger, data, AI, decision, action, and output order."
        : `Expected: ${task.required.join(" -> ")}`,
    );
  }

  return (
    <div className="rounded-lg border border-border/50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {task.title}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {task.goal}
          </p>
        </div>
        <div className="flex gap-2">
          {cloudTasks.map((item, index) => (
            <button
              key={item.title}
              type="button"
              onClick={() => {
                setTaskIndex(index);
                setSequence([]);
                setResult("");
              }}
              className={`h-8 rounded-md px-3 text-xs font-medium ${
                taskIndex === index
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {index + 1}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {task.options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setSequence([...sequence, option])}
            className="h-8 rounded-md border border-border bg-background/40 px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {option}
          </button>
        ))}
      </div>
      <div className="mt-4 min-h-14 rounded-lg bg-muted/40 p-3">
        {sequence.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Your workflow sequence will appear here.
          </p>
        ) : (
          <p className="text-xs font-medium text-foreground">
            {sequence.join(" -> ")}
          </p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setSequence([]);
            setResult("");
          }}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent"
        >
          <RotateCcw size={14} /> Reset
        </button>
        <button
          type="button"
          onClick={runCheck}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Play size={14} /> Run check
        </button>
        {result && <p className="text-xs text-muted-foreground">{result}</p>}
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
                className="grid gap-3 rounded-lg border border-border/50 bg-background/40 p-4 md:grid-cols-[140px_1fr]"
              >
                <MiniNode type={lesson.type} />
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
          <VisualPractice defaultExercise="vault" />
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
          <VisualPractice defaultExercise="escrow" />
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
                <code className="mt-2 block overflow-x-auto rounded-md border border-border bg-card px-3 py-2 font-mono text-xs text-foreground">
                  {lesson.command}
                </code>
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
          <div className="grid gap-3 md:grid-cols-2">
            {cloudNodeLessons.map((lesson) => (
              <div
                key={lesson.type}
                className="rounded-lg border border-border/50 bg-background/40 p-4"
              >
                <p className="text-sm font-semibold text-foreground">
                  {lesson.type}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {lesson.use}
                </p>
                <p className="mt-3 font-mono text-xs text-primary">
                  {lesson.connects}
                </p>
              </div>
            ))}
          </div>
        </LessonSection>

        <LessonSection
          number="2"
          title="Learn the Cloud connection pattern"
          body="Most workflows follow the same order: trigger, fetch or transform data, decide, act, then output."
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
              Webhook Output sends the alert.
            </p>
          </div>
          <CloudPractice />
        </LessonSection>

        <LessonSection
          number="4"
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
