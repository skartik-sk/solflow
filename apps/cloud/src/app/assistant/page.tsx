"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2, Plus, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { trpc } from "@/lib/trpc/client";

const EXAMPLES = [
  "When SOL goes below 180, prepare a Jupiter swap and send a webhook summary",
  "Watch wallet activity every 5 minutes and alert my Discord webhook",
  "Read NFT metadata for an asset and send the result to my backend",
  "Query treasury token accounts and create a Squads approval proposal",
  "Watch SPL Token accounts for an owner and alert when balance exists",
  "Create a price alert when SOL is above 200",
];

export default function AssistantPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState(EXAMPLES[0]);
  const createFromAssistant = trpc.workflow.createFromAssistant.useMutation();

  async function handleCreate() {
    try {
      const workflow = await createFromAssistant.mutateAsync({ prompt });
      toast.success("Workflow created");
      router.push(`/editor/${workflow.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create workflow");
    }
  }

  return (
    <AppShell>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground">
            <Bot className="h-3 w-3 text-primary" />
            Workflow assistant
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Describe a Solana workflow.</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The assistant creates an editable Cloud graph with triggers, protocol nodes, safety defaults, and an output path.
          </p>
          <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
            This generator is rule-based and does not call an external model. AI Agent nodes need an OpenAI, Anthropic, or Gemini credential before execution.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="rounded-xl border border-border bg-card p-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={8}
            className="w-full resize-none rounded-lg border border-border bg-background p-3 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Example: when SOL drops 5%, swap 10 USDC and send Discord alert"
          />
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Creates a real workflow, not just a mockup.
            </div>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={createFromAssistant.isPending || prompt.trim().length < 3}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createFromAssistant.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Generate Workflow
            </button>
          </div>
        </section>

        <aside className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Starting points</h2>
          <div className="space-y-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setPrompt(example)}
                className="flex w-full items-start gap-2 rounded-lg border border-border bg-background p-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <Plus className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                <span>{example}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
