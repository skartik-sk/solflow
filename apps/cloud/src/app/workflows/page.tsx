"use client";

// Workflows List Page.

import React from "react";
import Link from "next/link";
import { Workflow, Plus, Clock, MoreHorizontal, Trash2, Copy, Play } from "lucide-react";

const MOCK_WORKFLOWS = [
  {
    id: "demo-1",
    name: "SOL Price Monitor",
    description: "Monitor SOL price and alert on thresholds",
    status: "active" as const,
    nodes: 4,
    lastRun: "2 min ago",
    runs: 142,
  },
  {
    id: "demo-2",
    name: "DCA Strategy",
    description: "Weekly token swaps via Jupiter",
    status: "paused" as const,
    nodes: 3,
    lastRun: "1 day ago",
    runs: 28,
  },
];

export default function WorkflowsPage() {
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
              <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
              <Link href="/workflows" className="text-foreground font-medium">Workflows</Link>
              <Link href="/wallets" className="hover:text-foreground transition-colors">Wallets</Link>
              <Link href="/executions" className="hover:text-foreground transition-colors">Executions</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold">Workflows</h1>
            <p className="text-xs text-muted-foreground">Manage your automation workflows</p>
          </div>
          <Link
            href="/editor/new"
            className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus size={13} />
            New Workflow
          </Link>
        </div>

        {/* Workflow Cards */}
        <div className="space-y-2">
          {MOCK_WORKFLOWS.map((wf) => (
            <div
              key={wf.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4 hover:border-border/80 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                  <Workflow size={16} className="text-blue-400" />
                </div>
                <div>
                  <Link
                    href={`/editor/${wf.id}`}
                    className="text-sm font-semibold hover:text-primary transition-colors"
                  >
                    {wf.name}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">{wf.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="hidden md:flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{wf.nodes} nodes</span>
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {wf.lastRun}
                  </span>
                  <span>{wf.runs} runs</span>
                </div>

                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    wf.status === "active"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-amber-500/10 text-amber-400"
                  }`}
                >
                  {wf.status}
                </span>

                <Link
                  href={`/editor/${wf.id}`}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Play size={12} />
                </Link>
              </div>
            </div>
          ))}

          {MOCK_WORKFLOWS.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Workflow className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No workflows yet</p>
              <p className="text-xs text-muted-foreground/60 mb-4">
                Create your first workflow to get started
              </p>
              <Link
                href="/editor/new"
                className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
              >
                <Plus size={13} />
                Create Workflow
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
