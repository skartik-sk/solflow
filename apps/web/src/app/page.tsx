import Link from "next/link";
import {
  ArrowRight,
  Code2,
  GitBranch,
  Layers,
  Menu,
  ShieldCheck,
  Zap,
  Workflow,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* ─── Navbar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <Workflow className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold tracking-tight">SolFlow</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <Link
              href="/marketplace"
              className="hover:text-foreground transition-colors"
            >
              Marketplace
            </Link>
            <Link
              href="https://github.com"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </Link>
            <Link
              href="/docs"
              className="hover:text-foreground transition-colors"
            >
              Docs
            </Link>
          </nav>

          {/* Desktop CTA */}
          <div className="hidden items-center gap-3 md:flex">
            <Link
              href="/auth/signin"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/auth/signin"
              className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Get started
            </Link>
          </div>

          {/* Mobile: compact sign-in + menu icon */}
          <div className="flex items-center gap-2 md:hidden">
            <Link
              href="/auth/signin"
              className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Sign in
            </Link>
            {/* Static menu icon — mobile nav is kept minimal for now */}
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground">
              <Menu className="h-4 w-4" />
            </span>
          </div>
        </div>

        {/* Mobile link strip under the bar */}
        <nav className="flex items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground md:hidden">
          <Link
            href="/marketplace"
            className="hover:text-foreground transition-colors"
          >
            Marketplace
          </Link>
          <Link
            href="https://github.com"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </Link>
          <Link
            href="/docs"
            className="hover:text-foreground transition-colors"
          >
            Docs
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        {/* ─── Hero ─────────────────────────────────────────────── */}
        <section className="relative overflow-hidden px-4 pb-16 pt-14 text-center md:pb-24 md:pt-20">
          {/* Background glow */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[600px] w-[600px] rounded-full bg-primary/5 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-4xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Now supporting Anchor v0.32 + Pinocchio
            </div>

            <h1 className="mb-5 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              Build Solana contracts{" "}
              <span className="bg-gradient-to-r from-primary via-violet-400 to-cyan-400 bg-clip-text text-transparent">
                visually
              </span>
            </h1>

            <p className="mx-auto mb-8 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Drag, drop, and connect nodes to generate production-ready{" "}
              <strong className="text-foreground">Anchor</strong> or{" "}
              <strong className="text-foreground">Pinocchio</strong> Rust code
              in real-time. No Rust knowledge required to start.
            </p>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Link
                href="/auth/signin"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors sm:w-auto"
              >
                Start building free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/marketplace"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-8 py-3 text-sm font-semibold text-foreground hover:bg-accent transition-colors sm:w-auto"
              >
                Browse templates
              </Link>
            </div>
          </div>

          {/* Editor preview mockup — hidden on small screens */}
          <div className="relative mx-auto mt-14 hidden max-w-5xl md:block">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/50">
              <div className="flex h-8 items-center gap-1.5 border-b border-border px-4">
                <div className="h-3 w-3 rounded-full bg-red-500/70" />
                <div className="h-3 w-3 rounded-full bg-amber-500/70" />
                <div className="h-3 w-3 rounded-full bg-emerald-500/70" />
                <span className="ml-2 text-xs text-muted-foreground">
                  SolFlow Editor — vault_program
                </span>
              </div>
              <div className="grid h-64 grid-cols-[1fr_320px]">
                {/* Canvas placeholder */}
                <div className="relative border-r border-border bg-background p-6">
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <div className="space-y-3 text-center">
                      <Workflow className="mx-auto h-10 w-10 opacity-20" />
                      <p className="text-xs opacity-50">Flow canvas</p>
                    </div>
                  </div>
                  {/* Mock nodes */}
                  <div className="absolute left-8 top-8 rounded-lg border border-[oklch(0.55_0.20_260)/50] bg-[oklch(0.55_0.20_260)/10] px-4 py-2 text-xs">
                    <div className="font-semibold text-[oklch(0.75_0.15_260)]">
                      Program Root
                    </div>
                    <div className="text-muted-foreground">vault_program</div>
                  </div>
                  <div className="absolute left-48 top-6 rounded-lg border border-[oklch(0.55_0.18_180)/50] bg-[oklch(0.55_0.18_180)/10] px-4 py-2 text-xs">
                    <div className="font-semibold text-[oklch(0.75_0.15_180)]">
                      Instruction
                    </div>
                    <div className="text-muted-foreground">initialize</div>
                  </div>
                  <div className="absolute left-48 top-28 rounded-lg border border-[oklch(0.55_0.18_180)/50] bg-[oklch(0.55_0.18_180)/10] px-4 py-2 text-xs">
                    <div className="font-semibold text-[oklch(0.75_0.15_180)]">
                      Instruction
                    </div>
                    <div className="text-muted-foreground">deposit</div>
                  </div>
                </div>
                {/* Code preview placeholder */}
                <div className="bg-[oklch(0.07_0.01_240)] p-4 font-mono text-xs text-green-400/70 overflow-hidden">
                  <pre className="leading-relaxed opacity-80">{`use anchor_lang::prelude::*;

declare_id!("...");

#[program]
pub mod vault_program {
  use super::*;

  pub fn initialize(
    ctx: Context<Initialize>,
    max_deposit: u64,
  ) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.authority = ctx.accounts
      .authority.key();
    vault.max_deposit = max_deposit;
    Ok(())
  }
}`}</pre>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile: simple code snippet instead of full mockup */}
          <div className="relative mx-auto mt-10 max-w-sm md:hidden">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/40">
              <div className="flex h-7 items-center gap-1.5 border-b border-border px-3">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
              </div>
              <div className="bg-[oklch(0.07_0.01_240)] p-4 font-mono text-[11px] text-green-400/80 overflow-hidden">
                <pre className="leading-relaxed">{`#[program]
pub mod vault_program {
  pub fn initialize(
    ctx: Context<Initialize>,
  ) -> Result<()> {
    // ✨ Generated by SolFlow
    Ok(())
  }
}`}</pre>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Features ─────────────────────────────────────────── */}
        <section className="px-4 py-16 md:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mb-12 text-center md:mb-16">
              <h2 className="mb-3 text-2xl font-bold tracking-tight md:mb-4 md:text-4xl">
                Everything you need to ship on Solana
              </h2>
              <p className="text-muted-foreground text-sm md:text-base">
                From visual design to on-chain deployment in minutes.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-xl border border-border bg-card p-5 hover:border-primary/40 transition-colors md:p-6"
                >
                  <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary md:mb-4 md:h-10 md:w-10">
                    <feature.icon className="h-4 w-4 md:h-5 md:w-5" />
                  </div>
                  <h3 className="mb-1.5 text-sm font-semibold md:mb-2 md:text-base">
                    {feature.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed md:text-sm">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Framework Toggle CTA ─────────────────────────────── */}
        <section className="border-y border-border bg-card px-4 py-16 md:py-20">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="mb-3 text-2xl font-bold tracking-tight md:mb-4 md:text-3xl">
              Anchor or Pinocchio — your choice
            </h2>
            <p className="mb-6 text-sm text-muted-foreground md:mb-8 md:text-base">
              Toggle between frameworks at the project level. SolFlow generates
              identical program behavior with framework-specific patterns.
              Anchor for developer experience, Pinocchio for maximum
              performance.
            </p>
            <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-background p-1">
              <div className="rounded-lg bg-primary px-5 py-1.5 text-xs font-medium text-primary-foreground md:px-6 md:py-2 md:text-sm">
                Anchor
              </div>
              <div className="rounded-lg px-5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors md:px-6 md:py-2 md:text-sm">
                Pinocchio
              </div>
            </div>
          </div>
        </section>

        {/* ─── CTA ──────────────────────────────────────────────── */}
        <section className="px-4 py-16 text-center md:py-24">
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-3 text-2xl font-bold tracking-tight md:mb-4 md:text-4xl">
              Ready to build?
            </h2>
            <p className="mb-6 text-sm text-muted-foreground md:mb-8 md:text-base">
              Free forever. Open source. Self-hostable.
            </p>
            <Link
              href="/auth/signin"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors sm:w-auto"
            >
              Create your first contract
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      {/* ─── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t border-border px-4 py-6 md:py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 text-sm text-muted-foreground sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/80">
              <Workflow className="h-3 w-3 text-primary-foreground" />
            </div>
            <span>SolFlow</span>
          </div>
          <p className="text-xs md:text-sm">Open source. MIT license.</p>
        </div>
      </footer>
    </div>
  );
}

const features = [
  {
    icon: Workflow,
    title: "Visual Flow Editor",
    description:
      "Drag-and-drop nodes to design your program. Connect instructions, accounts, state, and logic blocks intuitively.",
  },
  {
    icon: Code2,
    title: "Real-time Code Generation",
    description:
      "Watch production-ready Rust code appear in Monaco Editor as you build. Deterministic, zero surprises.",
  },
  {
    icon: Zap,
    title: "Anchor & Pinocchio",
    description:
      "First-class support for both frameworks. Toggle at project level. Same visual flow, different output targets.",
  },
  {
    icon: ShieldCheck,
    title: "Built-in Security Audit",
    description:
      "40+ static analysis rules catch missing signer checks, arithmetic overflow, unauthorized access, and more.",
  },
  {
    icon: Layers,
    title: "One-click Deploy",
    description:
      "Compile, test, and deploy to Devnet, Mainnet, or Localnet directly from the browser.",
  },
  {
    icon: GitBranch,
    title: "Version Control",
    description:
      "Full snapshot history with visual flow diffs. See exactly what changed between versions.",
  },
];
