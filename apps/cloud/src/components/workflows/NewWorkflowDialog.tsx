"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Boxes, Check, Loader2, Play, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { btnGhost, btnPrimary, focusRing, iconBtn, inputClass } from "@/components/ui-kit/cloud-ui";

const STARTER_DEFINITION = {
  nodes: [
    {
      id: "manual-trigger",
      type: "trigger:manual",
      position: { x: 80, y: 180 },
      data: {},
    },
    {
      id: "jupiter-price",
      type: "action:jupiter-price",
      position: { x: 360, y: 180 },
      data: {
        tokenIds: "So11111111111111111111111111111111111111112",
        credentialId: "",
      },
    },
    {
      id: "show-result",
      type: "output:result",
      position: { x: 640, y: 180 },
      data: {
        name: "Jupiter price result",
        status: "success",
        value: "{{ $json.jupiter }}",
      },
    },
  ],
  edges: [
    {
      id: "starter-edge",
      source: "manual-trigger",
      target: "jupiter-price",
      sourceHandle: "output",
      targetHandle: "input",
    },
    {
      id: "starter-result-edge",
      source: "jupiter-price",
      target: "show-result",
      sourceHandle: "price",
      targetHandle: "input",
    },
  ],
};

const STARTER_SETTINGS = {
  timeout: 120,
  retryPolicy: { maxAttempts: 1, delayMs: 0 },
  onError: "stop",
  safety: {
    simulationRequired: true,
    manualApprovalRequired: true,
    walletAutomationAllowed: false,
    maxSlippageBps: 100,
    allowedMints: [],
    webhookAllowlist: [],
  },
};

type WorkflowTemplateChoice = {
  id: string;
  title: string;
  description: string | null;
  category: string;
};

export function NewWorkflowDialog({
  mode = "modal",
  onClose,
}: {
  mode?: "modal" | "page";
  onClose?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("Manual Jupiter Price Check");
  const [selectedTemplateId, setSelectedTemplateId] = useState("starter");
  const [formError, setFormError] = useState<string | null>(null);

  const templatesQuery = trpc.template.list.useQuery({
    featured: true,
    limit: 3,
  });
  const createWorkflow = trpc.workflow.create.useMutation();
  const forkTemplate = trpc.template.fork.useMutation();

  const templates = useMemo(
    () => (templatesQuery.data ?? []) as WorkflowTemplateChoice[],
    [templatesQuery.data],
  );
  const pending = createWorkflow.isPending || forkTemplate.isPending;
  const mutationError =
    createWorkflow.error?.message ?? forkTemplate.error?.message;
  const selectedTemplate = templates.find(
    (template) => template.id === selectedTemplateId,
  );
  const isModal = mode === "modal";

  useEffect(() => {
    if (!isModal) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isModal, onClose]);

  const handleCancel = () => {
    if (onClose) {
      onClose();
      return;
    }
    router.push("/dashboard");
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError("Workflow name is required.");
      return;
    }

    setFormError(null);
    try {
      const workflow =
        selectedTemplateId === "starter"
          ? await createWorkflow.mutateAsync({
              name: trimmedName,
              description:
                "Manual starter workflow for testing Jupiter Price API output in the run panel.",
              definition: STARTER_DEFINITION,
              settings: STARTER_SETTINGS,
              tags: ["manual", "jupiter", "starter"],
            })
          : await forkTemplate.mutateAsync({
              templateId: selectedTemplateId,
              name: trimmedName,
            });

      onClose?.();
      if (mode === "page") {
        router.replace(`/editor/${workflow.id}`);
      } else {
        router.push(`/editor/${workflow.id}`);
      }
      router.refresh();
    } catch {
      // The mutation error is rendered below.
    }
  };

  const form = (
    <form onSubmit={handleCreate} className="flex w-full flex-col">
      <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-4">
        <div className="min-w-0">
          <h1 id="new-workflow-title" className="text-[16px] font-semibold tracking-[-0.02em]">
            New workflow
          </h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Start with a runnable manual Jupiter Price check or fork one of the
            top marketplace templates.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          className={
            isModal
              ? `${iconBtn} -mr-1.5`
              : `${btnGhost} hidden sm:inline-flex`
          }
          aria-label={isModal ? "Close new workflow dialog" : undefined}
        >
          {isModal ? <X className="h-4 w-4" aria-hidden /> : "Cancel"}
        </button>
      </div>

      <div className="space-y-5 px-5 pb-5">
        <div>
          <label
            htmlFor="workflow-name"
            className="mb-1.5 block text-[12px] font-medium text-muted-foreground"
          >
            Workflow name
          </label>
          <input
            id="workflow-name"
            type="text"
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={`${inputClass} h-10`}
            placeholder={
              selectedTemplate ? selectedTemplate.title : "Cloud workflow name"
            }
            aria-invalid={formError ? true : undefined}
            aria-describedby={formError ? "workflow-name-error" : undefined}
            autoFocus
          />
          {formError && <p id="workflow-name-error" className="mt-1.5 text-[12px] text-red-400">{formError}</p>}
        </div>

        <fieldset>
          <div className="mb-2 flex items-center justify-between gap-3">
            <legend className="text-[12px] font-medium text-muted-foreground">
              Starting point
            </legend>
            {templatesQuery.isLoading && (
              <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Loading templates
              </span>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <TemplateChoice
              selected={selectedTemplateId === "starter"}
              icon={<Play className="h-3.5 w-3.5" />}
              title="Manual Jupiter Price"
              description="Runnable starter: Manual Trigger into Jupiter Price and Workflow Result."
              meta="No wallet required"
              onClick={() => setSelectedTemplateId("starter")}
            />

            {templates.map((template) => (
              <TemplateChoice
                key={template.id}
                selected={selectedTemplateId === template.id}
                icon={<Boxes className="h-3.5 w-3.5" />}
                title={template.title}
                description={template.description ?? ""}
                meta={template.category}
                onClick={() => {
                  setSelectedTemplateId(template.id);
                  if (name === "Manual Jupiter Price Check") {
                    setName(template.title);
                  }
                }}
              />
            ))}

            {templatesQuery.isLoading &&
              [0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="min-h-[132px] rounded-[12px] border border-white/[0.07] bg-card p-3.5"
                >
                  <div className="mb-3 h-7 w-7 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
                  <div className="mb-2 h-2.5 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                  <div className="h-2.5 w-full animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
                </div>
              ))}
          </div>
        </fieldset>

        {(mutationError || templatesQuery.error) && (
          <div className="flex items-start gap-2 rounded-[10px] border border-red-500/20 bg-red-500/[0.07] px-3 py-2 text-[12.5px] text-red-300" role="alert">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{mutationError ?? templatesQuery.error?.message}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-white/[0.07] px-5 py-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={handleCancel}
          className={`${btnGhost} ${isModal ? "" : "sm:hidden"}`}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className={btnPrimary}
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          Create workflow
          {!pending && <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
        </button>
      </div>
    </form>
  );

  if (!isModal) {
    return (
      <div className="min-h-screen bg-background px-4 py-8 text-foreground">
        <div className="mx-auto w-full max-w-4xl rounded-[16px] border border-white/[0.07] bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">{form}</div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-workflow-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close new workflow dialog"
        tabIndex={-1}
      />
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[16px] border border-white/[0.09] bg-popover shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_30px_80px_-20px_rgba(0,0,0,0.8)]">
        {form}
      </div>
    </div>
  );
}

function TemplateChoice({
  selected,
  icon,
  title,
  description,
  meta,
  onClick,
}: {
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex min-h-[132px] flex-col rounded-[12px] border p-3.5 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.98] ${focusRing} ${
        selected
          ? "border-primary/60 bg-primary/[0.06]"
          : "border-white/[0.07] bg-card hover:border-white/[0.14]"
      }`}
      aria-pressed={selected}
    >
      <span className="mb-2.5 flex items-center justify-between">
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${
            selected
              ? "bg-primary text-primary-foreground"
              : "border border-white/[0.07] bg-background text-muted-foreground"
          }`}
        >
          {icon}
        </span>
        {selected && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
      </span>
      <span className="block text-[13px] font-medium leading-snug">{title}</span>
      <span className="mt-1 line-clamp-2 block text-[12px] leading-relaxed text-muted-foreground">
        {description}
      </span>
      <span className="mt-auto pt-2.5 text-[11px] font-medium capitalize text-muted-foreground/80">
        {meta.toLowerCase()}
      </span>
    </button>
  );
}
