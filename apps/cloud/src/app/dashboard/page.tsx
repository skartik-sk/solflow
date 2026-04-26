"use client";

// Cloud Dashboard — main landing page after login.

import React from "react";
import Link from "next/link";
import {
  Workflow,
  Plus,
  Activity,
  Wallet,
  Clock,
  ArrowRight,
  Zap,
  Shield,
  Bot,
  TrendingUp,
} from "lucide-react";

const FEATURED_TEMPLATES = [
  {
    name: "Price Alert Bot",
    description: "Monitor token prices and get notified when thresholds are hit",
    nodes: ["trigger:cron", "action:price-fetch", "logic:if-else"],
    color: "#22c55e",
  },
  {
    name: "DCA Strategy",
    description: "Automatically swap tokens on a schedule using Jupiter",
    nodes: ["trigger:cron", "action:jupiter-swap"],
    color: "#3b82f6",
  },
  {
    name: "Portfolio Monitor",
    description: "Track wallet balances and token holdings across protocols",
    nodes: ["trigger:cron", "action:price-fetch", "logic:if-else"],
    color: "#f59e0b",
  },
];

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm font-bold tracking-tight">
              SolStudio <span className="text-primary">Cloud</span>
            </Link>
            <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
              <Link href="/dashboard" className="text-foreground font-medium">Dashboard</Link>
              <Link href="/workflows" className="hover:text-foreground transition-colors">Workflows</Link>
              <Link href="/wallets" className="hover:text-foreground transition-colors">Wallets</Link>
              <Link href="/executions" className="hover:text-foreground transition-colors">Executions</Link>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
              S
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Build and automate Solana workflows visually
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Link
            href="/editor/new"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all group"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
              <Plus size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold">New Workflow</p>
              <p className="text-xs text-muted-foreground">Start from scratch</p>
            </div>
          </Link>

          <Link
            href="/workflows"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-blue-500/40 hover:shadow-lg hover:shadow-blue-500/5 transition-all group"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 transition-colors">
              <Workflow size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold">My Workflows</p>
              <p className="text-xs text-muted-foreground">Manage existing workflows</p>
            </div>
          </Link>

          <Link
            href="/wallets"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5 transition-all group"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
              <Wallet size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold">Wallets</p>
              <p className="text-xs text-muted-foreground">Manage cloud wallets</p>
            </div>
          </Link>
        </div>

        {/* Getting Started */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Getting Started
          </h2>
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  1
                </div>
                <div>
                  <p className="text-sm font-medium">Create a Wallet</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Set up an encrypted cloud wallet for automated signing
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-400 text-xs font-bold">
                  2
                </div>
                <div>
                  <p className="text-sm font-medium">Build a Workflow</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Drag and drop nodes to create automation flows
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold">
                  3
                </div>
                <div>
                  <p className="text-sm font-medium">Run & Monitor</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Execute manually or set up triggers for automation
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Featured Templates */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Starter Templates
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {FEATURED_TEMPLATES.map((template) => (
              <div
                key={template.name}
                className="group rounded-xl border border-border bg-card p-4 hover:border-border/80 hover:shadow-lg transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: template.color }}
                  />
                  <p className="text-sm font-semibold">{template.name}</p>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {template.description}
                </p>
                <div className="flex flex-wrap gap-1">
                  {template.nodes.map((node) => (
                    <span
                      key={node}
                      className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {node.split(":")[1]}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
