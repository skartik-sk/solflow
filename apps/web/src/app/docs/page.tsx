import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DocsShell } from "@/components/ui-kit/docs-shell";
import { DocsTrackCards, type TrackCard } from "@/components/ui-kit/docs-tracks";

export const metadata = {
  title: "Documentation — SolStudio",
};

const platformSections: TrackCard[] = [
  {
    title: "Visual Builder Learning Path",
    href: "/docs/learn/visual-builder",
    mini: "visual",
    body: "Start with every node, learn what connects to what, then build Vault and Escrow graphs step by step.",
  },
  {
    title: "CLI Learning Path",
    href: "/docs/learn/cli",
    mini: "cli",
    body: "Learn the command flow for local projects: init, view, parse, summary, IR export, and IDL import.",
  },
  {
    title: "Cloud Learning Path",
    href: "/docs/learn/cloud",
    mini: "cloud",
    body: "Learn Cloud nodes, trigger-action workflow structure, and AI-assisted workflows from start to finish.",
  },
];

const referenceSections = [
  {
    title: "Visual Builder Reference",
    slug: "visual-editor",
    tag: "Editor",
    desc: "Main reference for the editor surface, graph structure, node palette, connections, constraints, and code generation.",
  },
  {
    title: "CLI Reference",
    slug: "cli",
    tag: "CLI",
    desc: "Command reference for init, view, parse, IDL import, output formats, local server behavior, and troubleshooting.",
  },
  {
    title: "Cloud Platform Reference",
    slug: "cloud",
    tag: "Cloud",
    desc: "Reference for Cloud workflow nodes, trigger-action graph rules, item data, expressions, wallets, credentials, and activation.",
  },
];

const deepDives = [
  { title: "Getting Started", slug: "getting-started" },
  { title: "Node Reference", slug: "node-reference" },
  { title: "Connection Rules", slug: "connection-rules" },
  { title: "Code Generation Guide", slug: "codegen-guide" },
  { title: "Flags & Constraints", slug: "flags-and-constraints" },
];

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const NODE_W = 140;
const NODE_H = 54;

const DIAGRAM_NODES = [
  { title: "Program", subtitle: "root", x: 270, y: 16, color: "#8b8cf8" },
  { title: "Instruction", subtitle: "callable action", x: 90, y: 128, color: "#38bdf8" },
  { title: "Instruction", subtitle: "another action", x: 450, y: 128, color: "#38bdf8" },
  { title: "State", subtitle: "stored data", x: 20, y: 234, color: "#f5a524" },
  { title: "Account", subtitle: "runtime input", x: 180, y: 234, color: "#4ade80" },
  { title: "Logic", subtitle: "body step", x: 360, y: 234, color: "#58d3db" },
  { title: "Event / Error", subtitle: "signals", x: 520, y: 234, color: "#c084fc" },
];

/** Edges as [from, to] indexes into DIAGRAM_NODES: bottom-centre of one box to top-centre of the next. */
const DIAGRAM_EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [1, 4],
  [2, 5],
  [2, 6],
];

function ConnectionPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex flex-col gap-1 border-b border-white/[0.06] px-5 py-4">
        <h2 className="text-[14.5px] font-medium tracking-[-0.01em] text-foreground">
          How nodes connect
        </h2>
        <p className="text-[13.5px] leading-[1.6] text-muted-foreground">
          A Solana program starts with a Program node, branches into
          instructions, then connects accounts, state, constraints, and logic.
        </p>
      </div>
      <div className="overflow-x-auto bg-background bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[length:16px_16px] px-4 py-6">
        <svg
          viewBox="0 0 680 290"
          role="img"
          aria-label="Animated diagram showing Program connected to Instruction, Account, State, Constraint, and Logic nodes"
          className="mx-auto h-auto w-full min-w-[520px] max-w-[680px] overflow-visible"
        >
          {DIAGRAM_EDGES.map(([from, to], index) => {
            const a = DIAGRAM_NODES[from];
            const b = DIAGRAM_NODES[to];
            const sx = a.x + NODE_W / 2;
            const sy = a.y + NODE_H;
            const ex = b.x + NODE_W / 2;
            const ey = b.y;
            const my = (sy + ey) / 2;
            const path = `M${sx} ${sy} C${sx} ${my} ${ex} ${my} ${ex} ${ey}`;
            return (
              <g key={path}>
                <path d={path} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.25" />
                <circle r="3" className="fill-primary motion-reduce:hidden">
                  <animateMotion
                    dur="3.6s"
                    begin={`${index * 0.28}s`}
                    repeatCount="indefinite"
                    path={path}
                  />
                </circle>
              </g>
            );
          })}

          {DIAGRAM_NODES.map(({ title, subtitle, x, y, color }) => (
            <g key={`${title}-${x}`}>
              <rect x={x} y={y} width={NODE_W} height={NODE_H} rx="9" fill="#14161a" stroke="rgba(255,255,255,0.12)" />
              <rect x={x} y={y + 10} width="2" height={NODE_H - 20} fill={color} />
              <text x={x + 14} y={y + 23} fill="#ededf0" className="text-[12.5px] font-medium">
                {title}
              </text>
              <text x={x + 14} y={y + 40} fill="#a3a7b0" className="font-mono text-[11px]">
                {subtitle}
              </text>
            </g>
          ))}

          {/* Handles: drawn last, centred on the border where each edge starts and ends */}
          {DIAGRAM_EDGES.flatMap(([from, to]) => [
            { x: DIAGRAM_NODES[from].x + NODE_W / 2, y: DIAGRAM_NODES[from].y + NODE_H },
            { x: DIAGRAM_NODES[to].x + NODE_W / 2, y: DIAGRAM_NODES[to].y },
          ])
            .filter((p, i, all) => all.findIndex((q) => q.x === p.x && q.y === p.y) === i)
            .map((p) => (
              <circle key={`${p.x}-${p.y}`} cx={p.x} cy={p.y} r="3.5" fill="#08090b" stroke="rgba(255,255,255,0.45)" strokeWidth="1.25" />
            ))}
        </svg>
      </div>
    </div>
  );
}

export default function DocsPage() {
  return (
    <DocsShell width="full">
      {/* Hero */}
      <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-[560px]">
          <h1 className="text-[32px] leading-[1.1] font-semibold tracking-[-0.035em] text-foreground md:text-[40px]">
            Documentation
          </h1>
          <p className="mt-3 text-[15.5px] leading-[1.65] text-muted-foreground">
            Learn SolStudio across all three surfaces: build programs in the
            visual editor, inspect local projects with the CLI, and automate
            workflows in Cloud.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/docs/getting-started"
            className={`inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-3.5 text-[13px] font-medium text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.97] ${FOCUS}`}
          >
            Getting Started
            <ArrowRight size={14} aria-hidden />
          </Link>
          <Link
            href="/docs/learn"
            className={`inline-flex h-9 items-center rounded-[10px] border border-white/[0.08] bg-card px-3.5 text-[13px] font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[background-color,transform] duration-150 hover:bg-popover active:scale-[0.97] ${FOCUS}`}
          >
            Learn by doing
          </Link>
        </div>
      </div>

      <section aria-labelledby="docs-learn" className="mb-12">
        <h2 id="docs-learn" className="mb-3 text-[13px] font-medium text-muted-foreground">
          Learn and practice
        </h2>
        <DocsTrackCards items={platformSections} />
      </section>

      <section aria-labelledby="docs-reference" className="mb-12 grid gap-8 lg:grid-cols-[1fr_260px]">
        <div>
          <h2 id="docs-reference" className="mb-3 text-[13px] font-medium text-muted-foreground">
            Reference
          </h2>
          <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.07] bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            {referenceSections.map((section) => (
              <li key={section.slug}>
                <Link
                  href={`/docs/${section.slug}`}
                  className={`group flex items-start gap-4 px-5 py-4 transition-colors duration-150 hover:bg-white/[0.025] active:bg-white/[0.04] ${FOCUS} focus-visible:-outline-offset-2`}
                >
                  <span className="mt-0.5 w-12 shrink-0 font-mono text-[11.5px] text-primary">
                    {section.tag}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-medium tracking-[-0.01em] text-foreground">
                      {section.title}
                    </span>
                    <span className="mt-1 block text-[13.5px] leading-[1.6] text-muted-foreground">
                      {section.desc}
                    </span>
                  </span>
                  <ArrowRight
                    size={15}
                    aria-hidden
                    className="mt-1 shrink-0 text-muted-foreground/60 transition-[transform,color] duration-150 group-hover:translate-x-0.5 group-hover:text-foreground"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-[13px] font-medium text-muted-foreground">Visual Builder in depth</h2>
          <ul className="space-y-px">
            {deepDives.map((d) => (
              <li key={d.slug}>
                <Link
                  href={`/docs/${d.slug}`}
                  className={`group flex items-center justify-between rounded-lg px-3 py-2 text-[13.5px] text-muted-foreground transition-colors duration-150 hover:bg-white/[0.03] hover:text-foreground ${FOCUS}`}
                >
                  {d.title}
                  <ArrowRight size={13} aria-hidden className="opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <ConnectionPreview />
    </DocsShell>
  );
}
