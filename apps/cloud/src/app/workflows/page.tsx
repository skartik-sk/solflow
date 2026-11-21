"use client";

// Workflows List Page.

import React from "react";
import Link from "next/link";
import { ArrowUpRight, Plus, Power, PowerOff, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { NewWorkflowDialog } from "@/components/workflows/NewWorkflowDialog";
import { EmptyPanel, PageHeader, SkeletonRows, btnPrimary, btnQuiet, focusRing, iconBtn, panel, rowClass } from "@/components/ui-kit/cloud-ui";
import { WorkflowMini } from "@/components/ui-kit/cloud-minis";

type WorkflowListItem = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  _count?: { executions?: number };
};

export default function WorkflowsPage() {
  const [showNewWorkflow, setShowNewWorkflow] = React.useState(false);
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
      <PageHeader
        title="Workflows"
        description="Manage your automation workflows"
        actions={
          <button type="button" onClick={() => setShowNewWorkflow(true)} className={btnPrimary}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New workflow
          </button>
        }
      />

      {isLoading && <SkeletonRows rows={5} />}

      {!isLoading && workflows && workflows.length > 0 && (
        <div className={panel}>
          <div className="hidden h-9 grid-cols-[minmax(0,1fr)_80px_124px_40px] items-center gap-4 border-b border-white/[0.07] px-4 text-[12px] text-muted-foreground md:grid">
            <span>Name</span>
            <span className="text-right">Runs</span>
            <span>Status</span>
            <span />
          </div>
          {(workflows as WorkflowListItem[]).map((wf) => {
            const isActive = wf.status === "ACTIVE";
            const isToggling =
              (activate.isPending && activate.variables?.id === wf.id) ||
              (deactivate.isPending && deactivate.variables?.id === wf.id);

            return (
              <div
                key={wf.id}
                className={`group grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-white/[0.02] md:grid-cols-[minmax(0,1fr)_80px_124px_40px] md:gap-4 ${rowClass}`}
              >
                <div className="min-w-0">
                  <Link
                    href={`/editor/${wf.id}`}
                    className={`block truncate rounded-sm text-[13.5px] font-medium transition-colors hover:text-primary ${focusRing}`}
                  >
                    {wf.name}
                  </Link>
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                    {wf.description || "No description"}
                  </p>
                </div>

                <span className="hidden text-right text-[12.5px] tabular-nums text-muted-foreground md:block">
                  {wf._count?.executions ?? 0}
                </span>

                <button
                  type="button"
                  onClick={() => handleToggle(wf.id, isActive)}
                  disabled={isToggling}
                  className={`inline-flex h-7 w-fit items-center gap-1.5 rounded-md border px-2 text-[12px] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.97] disabled:opacity-50 ${focusRing} ${
                    isActive
                      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/15"
                      : "border-white/[0.08] text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                  title={isActive ? "Deactivate" : "Activate"}
                  aria-label={`${isActive ? "Deactivate" : "Activate"} ${wf.name}`}
                >
                  {isToggling ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  ) : isActive ? (
                    <PowerOff className="h-3 w-3" aria-hidden />
                  ) : (
                    <Power className="h-3 w-3" aria-hidden />
                  )}
                  {isActive ? "Active" : "Inactive"}
                </button>

                <Link
                  href={`/editor/${wf.id}`}
                  className={iconBtn}
                  aria-label={`Open ${wf.name} in the editor`}
                >
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && workflows && workflows.length === 0 && (
        <EmptyPanel
          title="No workflows yet"
          body="Create your first workflow to get started. The starter runs a Jupiter price check with no wallet."
          art={<WorkflowMini />}
          actions={
            <>
              <button type="button" onClick={() => setShowNewWorkflow(true)} className={btnPrimary}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Create workflow
              </button>
              <Link href="/marketplace" className={btnQuiet}>
                Browse templates
              </Link>
            </>
          }
        />
      )}
      {showNewWorkflow && (
        <NewWorkflowDialog onClose={() => setShowNewWorkflow(false)} />
      )}
    </AppShell>
  );
}
