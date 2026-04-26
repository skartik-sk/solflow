"use client";

// Executions Page.

import React from "react";
import Link from "next/link";
import { Activity, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";

const MOCK_EXECUTIONS = [
  {
    id: "exec-1",
    workflowName: "SOL Price Monitor",
    workflowId: "demo-1",
    status: "success" as "success" | "error" | "running",
    duration: "1.2s",
    nodes: 4,
    startedAt: "2 min ago",
  },
  {
    id: "exec-2",
    workflowName: "SOL Price Monitor",
    workflowId: "demo-1",
    status: "success" as "success" | "error" | "running",
    duration: "0.9s",
    nodes: 4,
    startedAt: "5 min ago",
  },
  {
    id: "exec-3",
    workflowName: "DCA Strategy",
    workflowId: "demo-2",
    status: "error" as "success" | "error" | "running",
    duration: "0.3s",
    nodes: 3,
    startedAt: "1 day ago",
  },
];

const STATUS_STYLES = {
  success: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  error: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
  running: { icon: Loader2, color: "text-blue-400", bg: "bg-blue-500/10" },
};

export default function ExecutionsPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm font-bold tracking-tight">
              SolStudio <span className="text-primary">Cloud</span>
            </Link>
            <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
              <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
              <Link href="/workflows" className="hover:text-foreground transition-colors">Workflows</Link>
              <Link href="/wallets" className="hover:text-foreground transition-colors">Wallets</Link>
              <Link href="/executions" className="text-foreground font-medium">Executions</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-lg font-bold">Executions</h1>
          <p className="text-xs text-muted-foreground">History of workflow executions</p>
        </div>

        <div className="space-y-2">
          {MOCK_EXECUTIONS.map((exec) => {
            const style = STATUS_STYLES[exec.status];
            const Icon = style.icon;
            return (
              <div
                key={exec.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.bg}`}
                  >
                    <Icon size={14} className={`${style.color} ${exec.status === "running" ? "animate-spin" : ""}`} />
                  </div>
                  <div>
                    <Link
                      href={`/editor/${exec.workflowId}`}
                      className="text-sm font-semibold hover:text-primary transition-colors"
                    >
                      {exec.workflowName}
                    </Link>
                    <p className="text-[11px] text-muted-foreground">
                      Execution {exec.id}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="hidden md:flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{exec.nodes} nodes</span>
                    <span>{exec.duration}</span>
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {exec.startedAt}
                    </span>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.color}`}
                  >
                    {exec.status}
                  </span>
                </div>
              </div>
            );
          })}

          {MOCK_EXECUTIONS.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Activity className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No executions yet</p>
              <p className="text-xs text-muted-foreground/60">
                Run a workflow to see execution history
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
