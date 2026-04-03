"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Code2,
  Workflow,
  Cpu,
  Box,
  Terminal,
  Database,
  Layers,
  Zap,
  ShieldAlert,
  Menu,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex min-h-[200vh] flex-col bg-background text-foreground font-bricolage selection:bg-primary/30 selection:text-primary-foreground overflow-clip">
      {/* ─── Ambient Background Effects ─────────────────────────── */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(120,120,120,0.03)_0%,transparent_50%)]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] mix-blend-overlay" />
      </div>

      {/* ─── Navbar ─────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <Workflow className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold tracking-tight text-sm text-foreground">
              SolFlow
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <Link
              href="/marketplace"
              className="hover:text-foreground transition-colors"
            >
              Marketplace
            </Link>
            <Link href="/docs" className="hover:text-foreground transition-colors">
              Documentation
            </Link>
          </nav>

          <div className="flex items-center gap-4">
            <Link
              href="/auth/signin"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
            >
              Log in
            </Link>
            <Link
              href="/auth/signin"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start Building
              <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 relative z-10">
        {/* ─── Hero Section ──────────────────────────────────────── */}
        <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 lg:pt-56">
          <div className="mx-auto max-w-7xl px-6 flex flex-col items-center text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-1 text-xs font-medium text-foreground">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Solana Visual Development Environment
            </div>

            <h1 className="mb-6 text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl leading-[1.05] text-balance text-foreground">
              Architect Solana <br />
              <span className="text-muted-foreground">
                without writing Rust.
              </span>
            </h1>

            <p className="mx-auto mb-10 max-w-2xl text-base text-muted-foreground sm:text-lg leading-relaxed text-balance">
              Connect nodes, define state, and wire up instructions visually.
              SolFlow generates deterministic, production-ready Anchor or
              Pinocchio code in real-time.
            </p>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row w-full sm:w-auto">
              <Link
                href="/auth/signin"
                className="inline-flex h-11 w-full sm:w-auto items-center justify-center rounded-lg bg-primary px-8 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 shadow-sm"
              >
                Launch Editor
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/marketplace"
                className="inline-flex h-11 w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-border bg-card px-8 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Box className="h-4 w-4 text-muted-foreground" />
                Browse Marketplace
              </Link>
            </div>
          </div>
        </section>

        {/* ─── The Interface Showcase ────────────────────────────── */}
        <section className="relative z-20 px-6 pb-32 pt-10">
          <div className="mx-auto max-w-6xl">
            <div className="relative rounded-xl border border-border bg-card shadow-2xl p-1.5 overflow-hidden flex flex-col">
              
              {/* Fake IDE Header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background/50 rounded-t-lg">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full border border-border bg-muted" />
                  <div className="w-2.5 h-2.5 rounded-full border border-border bg-muted" />
                  <div className="w-2.5 h-2.5 rounded-full border border-border bg-muted" />
                </div>
                <div className="flex items-center gap-4 text-[11px] font-mono text-muted-foreground">
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-secondary text-foreground">
                    <Workflow className="w-3 h-3" /> flow_canvas.ts
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Code2 className="w-3 h-3" /> src/lib.rs
                  </span>
                </div>
                <div className="w-10 flex justify-end">
                  <Menu className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>

              {/* IDE Body */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] bg-background/50">
                {/* Visual Canvas Area */}
                <div className="relative min-h-[500px] border-r border-border bg-background/20 overflow-hidden bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:24px_24px]">
                  
                  {/* Nodes */}
                  <div className="absolute top-20 left-12 w-64 rounded-lg border border-border bg-card shadow-sm">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/50 rounded-t-lg">
                      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                        <Layers className="h-3.5 w-3.5 text-primary" />
                        Program Root
                      </div>
                    </div>
                    <div className="p-3 text-xs space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Name</span>
                        <span className="font-mono text-foreground bg-secondary px-1.5 py-0.5 rounded">vault_program</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Framework</span>
                        <span className="text-foreground bg-secondary px-1.5 py-0.5 rounded">Anchor</span>
                      </div>
                    </div>
                    {/* Connection dot */}
                    <div className="absolute -right-2 top-1/2 h-3 w-3 -translate-y-1/2 rounded border border-border bg-background" />
                  </div>

                  {/* Connecting Line (CSS simulated for simplicity/cleanliness) */}
                  <div className="absolute top-[138px] left-[320px] w-16 h-px bg-border pointer-events-none" />

                  <div className="absolute top-16 right-16 w-60 rounded-lg border border-border bg-card shadow-sm">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/50 rounded-t-lg">
                      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                        <Zap className="h-3.5 w-3.5 text-foreground" />
                        Initialize Instruction
                      </div>
                    </div>
                    <div className="p-3 space-y-3">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Context</span>
                        <span className="font-mono text-foreground">Initialize</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Accounts</span>
                        <div className="flex justify-between text-xs items-center bg-secondary/30 px-2 py-1 rounded">
                          <span className="text-muted-foreground">signer</span>
                          <span className="text-foreground font-mono">auth</span>
                        </div>
                        <div className="flex justify-between text-xs items-center bg-secondary/30 px-2 py-1 rounded">
                          <span className="text-muted-foreground">mut</span>
                          <span className="text-foreground font-mono">vault_state</span>
                        </div>
                      </div>
                    </div>
                    {/* Connection dot */}
                    <div className="absolute -left-2 top-1/2 h-3 w-3 -translate-y-1/2 rounded border border-border bg-background" />
                  </div>
                </div>

                {/* Code Generation Area */}
                <div className="p-4 font-mono text-[11px] sm:text-xs leading-relaxed overflow-hidden text-muted-foreground bg-card/50">
                  <div className="mb-2 text-muted-foreground/50 border-b border-border/50 pb-2">
                    // Auto-generated by SolFlow (Anchor)
                  </div>
                  <span className="text-foreground/80">use</span> anchor_lang::prelude::*;
                  <br />
                  <br />
                  declare_id!(<span className="text-foreground">"Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"</span>);
                  <br />
                  <br />
                  #[program]<br />
                  <span className="text-foreground/80">pub mod</span> vault_program {"{"}<br />
                  {"    "}<span className="text-foreground/80">use</span> super::*;
                  <br />
                  <br />
                  {"    "}<span className="text-foreground/80">pub fn</span> initialize(<br />
                  {"        "}ctx: Context&lt;Initialize&gt;,<br />
                  {"    "}) -&gt; Result&lt;()&gt; {"{"}<br />
                  {"        "}<span className="text-muted-foreground/50">// Instruction logic here</span><br />
                  {"        "}Ok(())<br />
                  {"    "}{"}"}<br />
                  {"}"}
                  <br />
                  <br />
                  #[derive(Accounts)]<br />
                  <span className="text-foreground/80">pub struct</span> Initialize&lt;'info&gt; {"{"}<br />
                  {"    "}#[account(mut)]<br />
                  {"    "}<span className="text-foreground/80">pub</span> auth: Signer&lt;'info&gt;,<br />
                  {"    "}#[account(<br />
                  {"        "}init,<br />
                  {"        "}payer = auth,<br />
                  {"        "}space = 8 + 32<br />
                  {"    "})]<br />
                  {"    "}<span className="text-foreground/80">pub</span> vault_state: Account&lt;'info, VaultState&gt;,<br />
                  {"    "}<span className="text-foreground/80">pub</span> system_program: Program&lt;'info, System&gt;,<br />
                  {"}"}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Features Grid ────────────────────────────────────────── */}
        <section className="px-6 py-24 bg-card border-y border-border">
          <div className="mx-auto max-w-7xl">
            <div className="mb-16 max-w-2xl">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
                Designed for precision.
              </h2>
              <p className="text-muted-foreground text-lg">
                SolFlow enforces best practices natively while providing absolute freedom over protocol logic.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1 */}
              <div className="md:col-span-2 group relative overflow-hidden rounded-xl border border-border bg-background p-6 lg:p-8">
                <Cpu className="w-8 h-8 text-foreground mb-6" />
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Framework Agnostic Code
                </h3>
                <p className="text-muted-foreground max-w-md text-sm">
                  Toggle between high-level abstractions like Anchor or optimize down to raw execution blocks using Pinocchio for bare-metal performance.
                </p>
              </div>

              {/* Card 2 */}
              <div className="group relative overflow-hidden rounded-xl border border-border bg-background p-6 lg:p-8">
                <ShieldAlert className="w-8 h-8 text-foreground mb-6" />
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Static Auditing
                </h3>
                <p className="text-muted-foreground text-sm">
                  Catch missing signers, unchecked accounts, and rent bypasses visually before a single compile.
                </p>
              </div>

              {/* Card 3 */}
              <div className="group relative overflow-hidden rounded-xl border border-border bg-background p-6 lg:p-8">
                <Database className="w-8 h-8 text-foreground mb-6" />
                <h3 className="text-xl font-bold text-foreground mb-2">
                  PDA Constraints
                </h3>
                <p className="text-muted-foreground text-sm">
                  Design complex seeds and derivation paths directly in the UI. No guesswork.
                </p>
              </div>

              {/* Card 4 */}
              <div className="md:col-span-2 group relative overflow-hidden rounded-xl border border-border bg-background p-6 lg:p-8">
                <Box className="w-8 h-8 text-foreground mb-6" />
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Template Marketplace
                </h3>
                <p className="text-muted-foreground max-w-md text-sm">
                  Don't start from scratch. Fork community-verified protocol logic, standard tokens, and escrow templates securely.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Final CTA ────────────────────────────────────────── */}
        <section className="px-6 py-32 flex items-center justify-center bg-background">
          <div className="text-center">
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground mb-6">
              Stop boilerplate.<br/>Start building.
            </h2>
            <Link
              href="/auth/signin"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-primary px-8 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 shadow-sm"
            >
              Start using SolFlow
            </Link>
          </div>
        </section>
      </main>

      {/* ─── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-border bg-card px-6 py-10 z-10 mt-auto">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-primary">
              <Workflow className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm text-foreground">SolFlow</span>
          </div>

          <div className="flex gap-6 text-sm font-medium text-muted-foreground">
            <Link
              href="https://github.com"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </Link>
            <Link
              href="https://twitter.com"
              className="hover:text-foreground transition-colors"
            >
              X
            </Link>
            <Link href="/docs" className="hover:text-foreground transition-colors">
              Docs
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
