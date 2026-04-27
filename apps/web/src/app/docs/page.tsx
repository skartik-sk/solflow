import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Cloud,
  Terminal,
  Workflow,
} from "lucide-react";

export const metadata = {
  title: "Documentation — SolStudio",
};

const platformSections = [
  {
    title: "Visual Builder Learning Path",
    href: "/docs/learn/visual-builder",
    icon: <Workflow size={20} />,
    desc: "Start with every node, learn what connects to what, then build Vault and Escrow graphs step by step.",
  },
  {
    title: "CLI Learning Path",
    href: "/docs/learn/cli",
    icon: <Terminal size={20} />,
    desc: "Learn the command flow for local projects: init, view, parse, summary, IR export, and IDL import.",
  },
  {
    title: "Cloud Learning Path",
    href: "/docs/learn/cloud",
    icon: <Cloud size={20} />,
    desc: "Learn Cloud nodes, trigger-action workflow structure, and AI-assisted workflows from start to finish.",
  },
];

const referenceSections = [
  {
    title: "Visual Builder Reference",
    slug: "visual-editor",
    icon: <Workflow size={20} />,
    desc: "Main reference for the editor surface, graph structure, node palette, connections, constraints, and code generation.",
  },
  {
    title: "CLI Reference",
    slug: "cli",
    icon: <Terminal size={20} />,
    desc: "Command reference for init, view, parse, IDL import, output formats, local server behavior, and troubleshooting.",
  },
  {
    title: "Cloud Platform Reference",
    slug: "cloud",
    icon: <Cloud size={20} />,
    desc: "Reference for Cloud workflow nodes, trigger-action graph rules, item data, expressions, wallets, credentials, and activation.",
  },
];

function ConnectionPreview() {
  return (
    <div className="mb-10 rounded-xl border border-border/60 bg-card p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">
          How nodes connect
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          A Solana program starts with a Program node, branches into
          instructions, then connects accounts, state, constraints, and logic.
        </p>
      </div>
      <svg
        viewBox="0 0 680 260"
        role="img"
        aria-label="Animated diagram showing Program connected to Instruction, Account, State, Constraint, and Logic nodes"
        className="h-auto w-full overflow-visible"
      >
        <defs>
          <marker
            id="docs-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 z" className="fill-primary/80" />
          </marker>
        </defs>

        {[
          "M340 54 C340 82 185 78 185 112",
          "M340 54 C340 82 495 78 495 112",
          "M185 166 C185 194 115 190 115 218",
          "M185 166 C185 194 255 190 255 218",
          "M495 166 C495 194 420 190 420 218",
          "M495 166 C495 194 565 190 565 218",
        ].map((path, index) => (
          <g key={path}>
            <path
              id={`docs-path-${index}`}
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#docs-arrow)"
              className="text-border"
            />
            <circle r="4" className="fill-primary">
              <animateMotion
                dur="3.6s"
                begin={`${index * 0.28}s`}
                repeatCount="indefinite"
                path={path}
              />
            </circle>
          </g>
        ))}

        {[
          ["Program", "root", 260, 16, "fill-primary/10 stroke-primary/40"],
          [
            "Instruction",
            "callable action",
            80,
            112,
            "fill-node-instruction/10 stroke-node-instruction/50",
          ],
          [
            "Instruction",
            "another action",
            390,
            112,
            "fill-node-instruction/10 stroke-node-instruction/50",
          ],
          [
            "State",
            "stored data",
            20,
            218,
            "fill-node-state/10 stroke-node-state/50",
          ],
          [
            "Account",
            "runtime input",
            160,
            218,
            "fill-node-account/10 stroke-node-account/50",
          ],
          [
            "Logic",
            "body step",
            330,
            218,
            "fill-node-logic/10 stroke-node-logic/50",
          ],
          [
            "Event / Error",
            "signals",
            470,
            218,
            "fill-node-event/10 stroke-node-event/50",
          ],
        ].map(([title, subtitle, x, y, className]) => (
          <g key={`${title}-${x}`}>
            <rect
              x={x as number}
              y={y as number}
              width="160"
              height="54"
              rx="10"
              className={`${className} stroke`}
            />
            <text
              x={(x as number) + 14}
              y={(y as number) + 24}
              className="fill-foreground text-[13px] font-semibold"
            >
              {title}
            </text>
            <text
              x={(x as number) + 14}
              y={(y as number) + 40}
              className="fill-muted-foreground text-[11px]"
            >
              {subtitle}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function SectionLink({
  section,
}: {
  section: {
    title: string;
    slug?: string;
    href?: string;
    icon: React.ReactNode;
    desc: string;
  };
}) {
  return (
    <Link
      href={section.href ?? `/docs/${section.slug}`}
      className="group flex items-start gap-4 rounded-xl border border-border/60 bg-card p-5 transition-all hover:border-primary/30 hover:bg-accent/30 hover:shadow-sm"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {section.icon}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
          {section.title}
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {section.desc}
        </p>
      </div>
      <ChevronRight
        size={16}
        className="mt-1 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-primary"
      />
    </Link>
  );
}

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-bricolage">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft size={16} />
            </Link>
            <span className="text-sm font-medium">Documentation</span>
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
        {/* Content */}
        <main className="py-10 pb-24">
          <div className="mx-auto max-w-3xl">
            <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-foreground">
              Documentation
            </h1>
            <p className="mb-10 text-sm leading-relaxed text-muted-foreground">
              Learn SolStudio across all three surfaces: build programs in the
              visual editor, inspect local projects with the CLI, and automate
              workflows in Cloud.
            </p>

            <ConnectionPreview />

            <div className="mb-10">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                Learn and practice
              </h2>
              <div className="grid gap-3">
                {platformSections.map((section) => (
                  <SectionLink key={section.href} section={section} />
                ))}
              </div>
            </div>

            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                Reference
              </h2>
              <div className="grid gap-3">
                {referenceSections.map((section) => (
                  <SectionLink key={section.slug} section={section} />
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
