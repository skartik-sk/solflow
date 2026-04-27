"use client";

// Cloud Dashboard — main landing page after login.

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { getIconByName } from "@solflow/cloud-nodes";
import { AppShell } from "@/components/layout/AppShell";

export default function DashboardPage() {
  const router = useRouter();
  const { data: templates, isLoading: templatesLoading } =
    trpc.template.list.useQuery({ limit: 6 });
  const forkTemplate = trpc.template.fork.useMutation();

  const handleUseTemplate = async (templateId: string, title: string) => {
    const workflow = await forkTemplate.mutateAsync({
      templateId,
      name: title,
    });
    router.push(`/editor/${workflow.id}`);
  };

  return (
    <AppShell>
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

        {/* Starter Templates */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Starter Templates
            </h2>
            {templates && templates.length > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {templates.length} template{templates.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {templatesLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!templatesLoading && templates && templates.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {templates.map((template: any) => (
                <div
                  key={template.id}
                  className="group rounded-xl border border-border bg-card p-4 hover:border-border/80 hover:shadow-lg transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          background:
                            template.category === "DEFI"
                              ? "#3b82f6"
                              : template.category === "UTILITY"
                              ? "#f59e0b"
                              : "#22c55e",
                        }}
                      />
                      <p className="text-sm font-semibold">{template.title}</p>
                    </div>
                    {template.featured && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                        Featured
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    {template.description}
                  </p>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {(template.nodeTypes as string[]).map((node: string) => (
                      <span
                        key={node}
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {node.split(":")[1]}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={() => handleUseTemplate(template.id, template.title)}
                    disabled={forkTemplate.isPending}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 transition-colors"
                  >
                    {forkTemplate.isPending ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      <Plus size={10} />
                    )}
                    Use Template
                  </button>
                </div>
              ))}
            </div>
          )}

          {!templatesLoading && templates && templates.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No templates available yet.
              </p>
            </div>
          )}
        </div>
    </AppShell>
  );
}
