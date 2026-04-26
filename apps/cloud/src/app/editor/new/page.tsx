"use client";

// /editor/new — creates a new workflow and redirects to its editor page.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, RotateCw } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

export default function NewWorkflowPage() {
  const router = useRouter();
  const createWorkflow = trpc.workflow.create.useMutation({
    onSuccess: (workflow) => {
      router.replace(`/editor/${workflow.id}`);
    },
  });

  useEffect(() => {
    if (createWorkflow.isIdle) {
      createWorkflow.mutate({ name: "Untitled Workflow" });
    }
  }, [createWorkflow]);

  return (
    <div className="flex h-screen items-center justify-center bg-background p-6">
      {createWorkflow.isError ? (
        <div className="w-full max-w-sm rounded-lg border border-red-500/30 bg-card p-5 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <h1 className="text-sm font-semibold">Could not create workflow</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {createWorkflow.error.message}
          </p>
          <button
            onClick={() => createWorkflow.mutate({ name: "Untitled Workflow" })}
            className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <RotateCw size={12} />
            Retry
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Creating workflow...
        </div>
      )}
    </div>
  );
}
