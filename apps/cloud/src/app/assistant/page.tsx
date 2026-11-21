"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpLeft, Info, Loader2, Workflow } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { trpc } from "@/lib/trpc/client";
import { PageHeader, btnPrimary, panel } from "@/components/ui-kit/cloud-ui";

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
      <PageHeader
        title="Describe a Solana workflow"
        description="The assistant creates an editable Cloud graph with triggers, protocol nodes, safety defaults, and an output path."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className={`${panel} flex flex-col overflow-hidden`}>
          <label htmlFor="assistant-prompt" className="flex h-10 items-center border-b border-white/[0.07] px-4 text-[12px] font-medium text-muted-foreground">
            Prompt
          </label>
          <textarea
            id="assistant-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={8}
            className="min-h-[200px] w-full flex-1 resize-none bg-transparent px-4 py-3 text-base leading-relaxed outline-none placeholder:text-muted-foreground/60 focus-visible:bg-white/[0.015] sm:text-[14px]"
            placeholder="Example: when SOL drops 5%, swap 10 USDC and send Discord alert"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] bg-background/40 px-4 py-2.5">
            <p className="flex min-w-0 items-start gap-1.5 text-[12px] leading-snug text-muted-foreground">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Rule-based: it does not call an external model. AI Agent nodes need an OpenAI, Anthropic, or Gemini credential before execution.
              </span>
            </p>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={createFromAssistant.isPending || prompt.trim().length < 3}
              className={btnPrimary}
            >
              {createFromAssistant.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Workflow className="h-3.5 w-3.5" aria-hidden />
              )}
              Generate workflow
            </button>
          </div>
        </section>

        <aside className={`${panel} overflow-hidden`}>
          <h2 className="flex h-10 items-center border-b border-white/[0.07] px-4 text-[12px] font-medium text-muted-foreground">Starting points</h2>
          <ul>
            {EXAMPLES.map((example) => {
              const selected = prompt === example;
              return (
                <li key={example} className="border-b border-white/[0.06] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setPrompt(example)}
                    aria-pressed={selected}
                    className={`group flex w-full items-start gap-2.5 px-4 py-2.5 text-left text-[12.5px] leading-snug transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${
                      selected ? "bg-primary/[0.06] text-foreground" : "text-muted-foreground hover:bg-white/[0.025] hover:text-foreground"
                    }`}
                  >
                    <ArrowUpLeft className={`mt-0.5 h-3.5 w-3.5 shrink-0 transition-colors ${selected ? "text-primary" : "text-muted-foreground/50 group-hover:text-muted-foreground"}`} aria-hidden />
                    <span>{example}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </AppShell>
  );
}
