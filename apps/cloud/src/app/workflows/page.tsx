"use client";

// Workflows List Page.

import React from "react";
import Link from "next/link";
import { Workflow, Plus, Play, Power, PowerOff, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";

export default function WorkflowsPage() {
  const { data: workflows, isLoading } = trpc.workflow.list.useQuery();
  const activate = trpc.workflow.activate.useMutation({
    onSuccess: () => { toast.success("Workflow activated"); refetch(); },
    onError: (err) => toast.error(`Activation failed: ${err.message}`),
  });
  const deactivate = trpc.workflow.deactivate.useMutation({
    onSuccess: () => { toast.success("Workflow deactivated"); refetch(); },
    onError: (err) => toast.error(`Deactivation failed: ${err.message}`),
  });
  const utils = trpc.useUtils();

  const refetch = () => utils.workflow.list.invalidate();

  const handleToggle = async (id: string, isActive: boolean) => {
    if (isActive) {
      await deactivate.mutateAsync({ id });
    } else {
      await activate.mutateAsync({ id });
    }
  };

  return (
    <AppShell>
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

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && workflows && (
        <div className="space-y-2">
          {workflows.map((wf: any) => {
            const isActive = wf.status === "ACTIVE";
            const isToggling =
              (activate.isPending && activate.variables?.id === wf.id) ||
              (deactivate.isPending && deactivate.variables?.id === wf.id);

            return (
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
                    <p className="text-[11px] text-muted-foreground">
                      {wf.description || "No description"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="hidden md:flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{wf._count?.executions ?? 0} runs</span>
                  </div>

                  <button
                    onClick={() => handleToggle(wf.id, isActive)}
                    disabled={isToggling}
                    className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-medium transition-colors ${
                      isActive
                        ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    } disabled:opacity-50`}
                    title={isActive ? "Deactivate" : "Activate"}
                  >
                    {isToggling ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : isActive ? (
                      <PowerOff size={10} />
                    ) : (
                      <Power size={10} />
                    )}
                    {isActive ? "Active" : "Inactive"}
                  </button>

                  <Link
                    href={`/editor/${wf.id}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <Play size={12} />
                  </Link>
                </div>
              </div>
            );
          })}

          {workflows.length === 0 && (
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
      )}
    </AppShell>
  );
}
