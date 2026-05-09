"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Boxes, Loader2, Play, Workflow, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

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
  ],
  edges: [
    {
      id: "starter-edge",
      source: "manual-trigger",
      target: "jupiter-price",
      sourceHandle: "output",
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

  const templatesQuery = trpc.template.list.useQuery({ featured: true, limit: 3 });
  const createWorkflow = trpc.workflow.create.useMutation();
  const forkTemplate = trpc.template.fork.useMutation();

  const templates = useMemo(
    () => (templatesQuery.data ?? []) as WorkflowTemplateChoice[],
    [templatesQuery.data],
  );
  const pending = createWorkflow.isPending || forkTemplate.isPending;
  const mutationError = createWorkflow.error?.message ?? forkTemplate.error?.message;
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
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
              description: "Manual starter workflow for testing Jupiter Price API output.",
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
    <form onSubmit={handleCreate} className="flex w-full flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            New Cloud workflow
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Name it, then choose a starting point
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Start with a runnable manual Jupiter Price check or fork one of the top marketplace templates.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          className={
            isModal
              ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              : "hidden h-9 items-center rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
          }
          aria-label={isModal ? "Close new workflow dialog" : undefined}
        >
          {isModal ? <X className="h-4 w-4" /> : "Cancel"}
        </button>
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <label htmlFor="workflow-name" className="mb-1 block text-xs font-semibold">
          Workflow name
        </label>
        <input
          id="workflow-name"
          type="text"
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-10 w-full rounded-lg border border-border bg-input px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary"
          placeholder={selectedTemplate ? selectedTemplate.title : "Cloud workflow name"}
          autoFocus
        />
        {formError && <p className="mt-2 text-xs text-red-400">{formError}</p>}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Starting point
          </h2>
          {templatesQuery.isLoading && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading templates
            </span>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <TemplateChoice
            selected={selectedTemplateId === "starter"}
            icon={<Play size={16} />}
            title="Manual Jupiter Price"
            description="Runnable starter: Manual Trigger into Jupiter Price."
            meta="No wallet required"
            onClick={() => setSelectedTemplateId("starter")}
          />

          {templates.map((template) => (
            <TemplateChoice
              key={template.id}
              selected={selectedTemplateId === template.id}
              icon={<Boxes size={16} />}
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
                className="min-h-[148px] rounded-xl border border-border bg-card p-4"
              >
                <div className="mb-4 h-8 w-8 animate-pulse rounded-lg bg-muted" />
                <div className="mb-2 h-3 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
              </div>
            ))}
        </div>
      </section>

      {(mutationError || templatesQuery.error) && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{mutationError ?? templatesQuery.error?.message}</span>
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={handleCancel}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Workflow className="h-4 w-4" />}
          Create workflow
          {!pending && <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
    </form>
  );

  if (!isModal) {
    return (
      <div className="min-h-screen bg-background px-4 py-8 text-foreground">
        <div className="mx-auto w-full max-w-4xl">{form}</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close new workflow dialog"
      />
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-2xl shadow-black/40">
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
      className={`min-h-[148px] rounded-xl border bg-card p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/35 hover:bg-accent/30"
      }`}
      aria-pressed={selected}
    >
      <span
        className={`mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg ${
          selected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
        }`}
      >
        {icon}
      </span>
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-1 line-clamp-3 block text-xs leading-relaxed text-muted-foreground">
        {description}
      </span>
      <span className="mt-3 inline-flex rounded bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {meta}
      </span>
    </button>
  );
}
