import { auth } from "@solflow/auth";
import {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_EDITOR_MODEL,
  createDeepSeekEditorAssistantReply,
  type CreateEditorAssistantReplyInput,
  type EditorAiPromptOptionId,
  type EditorAssistantSurface,
} from "@solflow/ui/editor-ai-assistant";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function isSurface(value: unknown): value is EditorAssistantSurface {
  return value === "web" || value === "cloud";
}

function parseAssistantInput(body: unknown): CreateEditorAssistantReplyInput | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const context = raw.context as Record<string, unknown> | undefined;
  if (typeof raw.prompt !== "string" || !context || !isSurface(context.surface)) {
    return null;
  }

  return {
    prompt: raw.prompt.slice(0, 4000),
    optionId:
      typeof raw.optionId === "string"
        ? (raw.optionId as EditorAiPromptOptionId)
        : undefined,
    context: {
      surface: context.surface,
      projectName:
        typeof context.projectName === "string" ? context.projectName.slice(0, 160) : undefined,
      nodeCount: typeof context.nodeCount === "number" ? context.nodeCount : undefined,
      edgeCount: typeof context.edgeCount === "number" ? context.edgeCount : undefined,
      selectedNodeLabel:
        typeof context.selectedNodeLabel === "string"
          ? context.selectedNodeLabel.slice(0, 160)
          : null,
      dirty: typeof context.dirty === "boolean" ? context.dirty : undefined,
    },
  };
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const input = parseAssistantInput(await request.json().catch(() => null));
  if (!input || input.prompt.trim().length < 1) {
    return NextResponse.json({ error: "Missing assistant prompt" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_DEEPSEEK_EDITOR_MODEL;

  try {
    const result = await createDeepSeekEditorAssistantReply(input, {
      apiKey,
      model,
      baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      source: "local",
      model,
      reply: null,
      error: error instanceof Error ? error.message : "AI assistant failed",
    });
  }
}
