import Link from "next/link";
import { BookOpen, GitBranch, Code2, Shield, Zap, ChevronRight, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Documentation — SolStudio",
};

const sections = [
  {
    title: "Getting Started",
    slug: "getting-started",
    icon: <Zap size={20} />,
    desc: "Learn the basics of the visual editor. Create nodes, connect them, configure properties, and generate Solana programs.",
  },
  {
    title: "Node Reference",
    slug: "node-reference",
    icon: <GitBranch size={20} />,
    desc: "Complete reference for every node type: Program, Instruction, Account, State, Constraint, Logic, and more.",
  },
  {
    title: "Connection Rules",
    slug: "connection-rules",
    icon: <BookOpen size={20} />,
    desc: "What connects to what. Valid connections, handle types, and common patterns.",
  },
  {
    title: "Code Generation Guide",
    slug: "codegen-guide",
    icon: <Code2 size={20} />,
    desc: "How code generation works. The IR pipeline, framework comparison, and how every flag maps to generated Rust code.",
  },
  {
    title: "Flags & Constraints",
    slug: "flags-and-constraints",
    icon: <Shield size={20} />,
    desc: "What mut, signer, init, close, and PDA seeds mean. How each constraint works across Anchor, Pinocchio, and Quasar.",
  },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-bricolage">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft size={16} />
            </Link>
            <span className="text-sm font-medium">Documentation</span>
          </div>
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            SolStudio
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6">
        {/* Content */}
        <main className="py-10 pb-24">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-3">Documentation</h1>
            <p className="text-sm text-muted-foreground leading-relaxed mb-10">
              Everything you need to build Solana programs visually with SolStudio.
            </p>

            {/* Section Cards */}
            <div className="grid gap-3">
              {sections.map((s) => (
                <Link
                  key={s.slug}
                  href={`/docs/${s.slug}`}
                  className="group flex items-start gap-4 rounded-xl border border-border/60 bg-card p-5 transition-all hover:border-primary/30 hover:bg-accent/30 hover:shadow-sm"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {s.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                      {s.title}
                    </h2>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {s.desc}
                    </p>
                  </div>
                  <ChevronRight size={16} className="mt-1 shrink-0 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
