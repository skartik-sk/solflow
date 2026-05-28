"use client";

import * as React from "react";
import { Bot, Loader2, Send, Sparkles, X } from "lucide-react";
import { cn } from "../lib/utils";
import {
  EDITOR_AI_PROMPT_OPTIONS,
  createEditorAssistantReply,
  type EditorAiAssistantPromptInput,
  type EditorAiPromptOptionId,
  type EditorAssistantContext,
} from "../lib/editor-ai-assistant";

interface EditorAiMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
}

export interface EditorAiAssistantProps {
  context: EditorAssistantContext;
  className?: string;
  defaultOpen?: boolean;
  onPrompt?: (input: EditorAiAssistantPromptInput) => Promise<string> | string;
}

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function initialAssistantMessage(context: EditorAssistantContext): EditorAiMessage {
  const noun = context.surface === "cloud" ? "workflow" : "project";
  return {
    id: "initial",
    role: "assistant",
    text: `What should I help with in this ${noun}?`,
  };
}

export function EditorAiAssistant({
  context,
  className,
  defaultOpen = false,
  onPrompt,
}: EditorAiAssistantProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [draft, setDraft] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [messages, setMessages] = React.useState<EditorAiMessage[]>(() => [
    initialAssistantMessage(context),
  ]);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending]);

  async function submitPrompt(promptText: string, optionId?: EditorAiPromptOptionId) {
    const prompt = promptText.trim();
    if (!prompt || pending) return;

    setDraft("");
    setPending(true);
    setMessages((current) => [
      ...current,
      { id: createMessageId(), role: "user", text: prompt },
    ]);

    try {
      const reply =
        (await onPrompt?.({ prompt, optionId, context })) ??
        createEditorAssistantReply({ prompt, optionId, context });
      setMessages((current) => [
        ...current,
        { id: createMessageId(), role: "assistant", text: reply },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          text: error instanceof Error ? error.message : "Assistant request failed.",
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn("pointer-events-none fixed bottom-4 left-4 z-50", className)}>
      {open ? (
        <section className="pointer-events-auto flex max-h-[min(560px,calc(100vh-2rem))] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl shadow-black/35">
          <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Bot className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-foreground">AI Assistant</h2>
                <p className="truncate text-[11px] text-muted-foreground">
                  {context.projectName || (context.surface === "cloud" ? "Workflow" : "Project")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Close AI assistant"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="border-b border-border p-2">
            <div className="grid grid-cols-2 gap-1.5">
              {EDITOR_AI_PROMPT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => void submitPrompt(option.prompt, option.id)}
                  disabled={pending}
                  className="min-h-8 rounded-md border border-border bg-background px-2 py-1.5 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "max-w-[92%] rounded-lg px-3 py-2 text-xs leading-relaxed",
                  message.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-background text-foreground",
                )}
              >
                {message.text}
              </div>
            ))}
            {pending && (
              <div className="flex max-w-[92%] items-center gap-2 rounded-lg bg-background px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Thinking
              </div>
            )}
          </div>

          <form
            className="border-t border-border p-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submitPrompt(draft);
            }}
          >
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submitPrompt(draft);
                  }
                }}
                rows={2}
                className="min-h-10 flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Ask about this project"
              />
              <button
                type="submit"
                disabled={pending || draft.trim().length === 0}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-xl shadow-black/30 transition-colors hover:border-primary/50 hover:bg-accent"
          aria-label="Open AI assistant"
          title="Open AI assistant"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          AI
        </button>
      )}
    </div>
  );
}
