export type EditorAssistantSurface = "web" | "cloud";

export interface EditorAssistantContext {
  surface: EditorAssistantSurface;
  projectName?: string;
  nodeCount?: number;
  edgeCount?: number;
  selectedNodeLabel?: string | null;
  dirty?: boolean;
}

export type EditorAiPromptOptionId =
  | "fix-bugs"
  | "connect-nodes"
  | "explain-project"
  | "security-check"
  | "next-steps";

export interface EditorAiPromptOption {
  id: EditorAiPromptOptionId;
  label: string;
  prompt: string;
}

export const EDITOR_AI_PROMPT_OPTIONS: EditorAiPromptOption[] = [
  {
    id: "fix-bugs",
    label: "Fix bugs",
    prompt: "Find likely bugs in this project and tell me what to fix first.",
  },
  {
    id: "connect-nodes",
    label: "Connect correct nodes",
    prompt: "Connect correct nodes and explain which links are missing.",
  },
  {
    id: "explain-project",
    label: "Explain my project",
    prompt: "Explain what this project does from the current graph.",
  },
  {
    id: "security-check",
    label: "Security check",
    prompt: "Review this graph for security and safety risks.",
  },
  {
    id: "next-steps",
    label: "Next steps",
    prompt: "Tell me the next steps to finish this project.",
  },
];

export interface CreateEditorAssistantReplyInput {
  prompt: string;
  optionId?: EditorAiPromptOptionId;
  context: EditorAssistantContext;
}

export type EditorAiAssistantPromptInput = CreateEditorAssistantReplyInput;

export const DEFAULT_DEEPSEEK_EDITOR_MODEL = "gemini-2.5-flash";
export const DEFAULT_DEEPSEEK_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

export interface DeepSeekEditorAssistantOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export interface DeepSeekEditorAssistantReply {
  source: "deepseek" | "local";
  model: string;
  reply: string;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function normalizedPrompt(input: CreateEditorAssistantReplyInput) {
  return `${input.optionId ?? ""} ${input.prompt}`.toLowerCase();
}

function describeContext(context: EditorAssistantContext) {
  const surfaceName = context.surface === "cloud" ? "workflow" : "project";
  const name = context.projectName?.trim() || `this ${surfaceName}`;
  const nodeCount = context.nodeCount ?? 0;
  const edgeCount = context.edgeCount ?? 0;
  const base = `${name} ${surfaceName} currently has ${plural(nodeCount, "node")} and ${plural(edgeCount, "connection")}.`;
  const selected = context.selectedNodeLabel?.trim()
    ? ` I will start from selected node: ${context.selectedNodeLabel.trim()}.`
    : "";
  const dirty = context.dirty
    ? " Save the latest canvas changes before running compile, tests, or execution."
    : "";

  return `${base}${selected}${dirty}`;
}

export function createEditorAssistantReply(input: CreateEditorAssistantReplyInput) {
  const intent = normalizedPrompt(input);
  const context = describeContext(input.context);
  const surfaceName = input.context.surface === "cloud" ? "workflow" : "project";

  if (intent.includes("connect") || intent.includes("node")) {
    return `${context} To connect correct nodes, check every node with no incoming or outgoing edge, then draw from output handles into valid handles on the next step. Keep trigger or program nodes at the start, branch or validation nodes in the middle, and output or account/result nodes at the end.`;
  }

  if (intent.includes("bug") || intent.includes("fix")) {
    return `${context} I would debug this ${surfaceName} in this order: inspect disconnected nodes, run the built-in validation/audit tools, generate or compile once, then fix the first concrete error before changing anything else.`;
  }

  if (intent.includes("explain")) {
    return `${context} In plain terms, this ${surfaceName} is a graph of steps. The nodes define the main actions and data shapes, while the connections show the order data should move through the system.`;
  }

  if (intent.includes("security") || intent.includes("risk") || intent.includes("safety")) {
    return `${context} I would review signer requirements, writable accounts, unchecked external calls, wallet actions, and missing validation branches first. Any risky operation should have a clear approval, simulation, or output check before it runs.`;
  }

  return `${context} I captured your request: "${input.prompt.trim()}". Start with the selected node if there is one, then make the smallest graph change that proves the idea works.`;
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function createDeepSeekMessages(input: CreateEditorAssistantReplyInput) {
  const surfaceName = input.context.surface === "cloud" ? "Cloud workflow" : "Solana program graph";
  return [
    {
      role: "system",
      content:
        "You are the SolStudio editor assistant. Give concise, practical help for the current graph. Do not claim you changed files or canvas nodes unless the request explicitly includes an action result. Prefer small next steps.",
    },
    {
      role: "user",
      content: [
        `${surfaceName}: ${input.context.projectName ?? "Untitled"}`,
        `Nodes: ${input.context.nodeCount ?? 0}`,
        `Connections: ${input.context.edgeCount ?? 0}`,
        input.context.selectedNodeLabel
          ? `Selected node: ${input.context.selectedNodeLabel}`
          : "Selected node: none",
        input.context.dirty ? "Canvas has unsaved changes." : "Canvas is saved or clean.",
        `Request: ${input.prompt}`,
      ].join("\n"),
    },
  ];
}

function extractDeepSeekReply(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return "";
  const first = choices[0] as { message?: { content?: unknown }; text?: unknown } | undefined;
  const content = first?.message?.content ?? first?.text;
  return typeof content === "string" ? content.trim() : "";
}

async function readErrorBody(response: Response) {
  try {
    const text = await response.text();
    return text.slice(0, 400);
  } catch {
    return "";
  }
}

export async function createDeepSeekEditorAssistantReply(
  input: CreateEditorAssistantReplyInput,
  options: DeepSeekEditorAssistantOptions = {},
): Promise<DeepSeekEditorAssistantReply> {
  const model = options.model?.trim() || DEFAULT_DEEPSEEK_EDITOR_MODEL;
  const apiKey = options.apiKey?.trim();

  if (!apiKey) {
    return {
      source: "local",
      model,
      reply: createEditorAssistantReply(input),
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = normalizeBaseUrl(options.baseUrl?.trim() || DEFAULT_DEEPSEEK_BASE_URL);
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: options.signal,
    body: JSON.stringify({
      model,
      messages: createDeepSeekMessages(input),
      temperature: 0.2,
      max_tokens: 700,
    }),
  });

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(
      `DeepSeek assistant failed (${response.status} ${response.statusText})${body ? `: ${body}` : ""}`,
    );
  }

  const reply = extractDeepSeekReply(await response.json());
  if (!reply) {
    throw new Error("DeepSeek assistant returned an empty response");
  }

  return {
    source: "deepseek",
    model,
    reply,
  };
}
