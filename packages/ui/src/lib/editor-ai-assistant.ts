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
    prompt: "Find likely bugs in this project. List each bug, explain why it's a problem, and suggest a fix. If you'd change any node config, describe exactly what to change.",
  },
  {
    id: "connect-nodes",
    label: "Connect nodes",
    prompt: "Analyze the current graph and tell me which nodes should be connected but aren't. For each missing connection, say which node output should go to which node input.",
  },
  {
    id: "explain-project",
    label: "Explain project",
    prompt: "Explain what this Solana project does step by step based on the current graph. Describe each node's role and how data flows through the connections.",
  },
  {
    id: "security-check",
    label: "Security check",
    prompt: "Review this Solana project graph for security risks. Check for missing validation, unauthorized access, unchecked accounts, and other common Solana vulnerabilities. Suggest fixes for each issue.",
  },
  {
    id: "next-steps",
    label: "Next steps",
    prompt: "What should I do next to complete this project? Give me a prioritized checklist of specific actions I should take in the editor.",
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

function describeContext(context: EditorAssistantContext) {
  const surfaceName = context.surface === "cloud" ? "workflow" : "project";
  const name = context.projectName?.trim() || `this ${surfaceName}`;
  const nodeCount = context.nodeCount ?? 0;
  const edgeCount = context.edgeCount ?? 0;
  const parts = [`${name} ${surfaceName} has ${plural(nodeCount, "node")} and ${plural(edgeCount, "connection")}.`];
  if (context.selectedNodeLabel?.trim()) {
    parts.push(`Selected node: ${context.selectedNodeLabel.trim()}`);
  }
  if (context.dirty) {
    parts.push("Canvas has unsaved changes");
  }
  return parts.join(". ");
}

export function createEditorAssistantReply(input: CreateEditorAssistantReplyInput) {
  const context = describeContext(input.context);
  return `${context}\n\nI'm unable to connect to the AI service right now. Here's what I can suggest based on your graph:\n\n- Review disconnected nodes and ensure all outputs connect to valid inputs\n- Use the **Security check** option to validate your Solana program\n- Compile your project to catch any errors\n- Check that account roles (signer, writable) are set correctly on each node`;
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

const SYSTEM_PROMPT = `You are the SolStudio AI assistant — an expert in Solana blockchain development, Anchor framework, and visual node-based programming.

Your role:
- Help users build Solana programs using the visual graph editor
- Each node in the graph represents a Solana instruction, account, type, or condition
- Connections between nodes define the program's logic flow

When responding:
1. Use **markdown** formatting for readability (headers, bold, code blocks, lists)
2. Be specific and actionable — tell the user exactly what to do
3. If you suggest adding, removing, or configuring nodes, describe the exact steps
4. For code suggestions, use proper Solana/Anchor/Rust syntax in code blocks
5. When reviewing for bugs or security, list each issue with:
   - **What** the problem is
   - **Why** it matters
   - **How** to fix it (specific action)
6. Keep responses focused and practical — no filler text
7. If the user asks about something outside the graph, briefly answer and redirect to what they can do in the editor`;

function createAiMessages(input: CreateEditorAssistantReplyInput) {
  const surfaceName = input.context.surface === "cloud" ? "Cloud workflow" : "Solana program graph";
  const contextParts = [
    `${surfaceName}: ${input.context.projectName ?? "Untitled"}`,
    `Nodes: ${input.context.nodeCount ?? 0}`,
    `Connections: ${input.context.edgeCount ?? 0}`,
  ];
  if (input.context.selectedNodeLabel) {
    contextParts.push(`Selected node: ${input.context.selectedNodeLabel}`);
  }
  if (input.context.dirty) {
    contextParts.push("Canvas has unsaved changes.");
  }
  contextParts.push(`\nUser request: ${input.prompt}`);

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: contextParts.join("\n") },
  ];
}

function extractReply(payload: unknown) {
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
      messages: createAiMessages(input),
      temperature: 0.3,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(
      `AI assistant failed (${response.status} ${response.statusText})${body ? `: ${body}` : ""}`,
    );
  }

  const reply = extractReply(await response.json());
  if (!reply) {
    throw new Error("AI assistant returned an empty response");
  }

  return {
    source: "deepseek",
    model,
    reply,
  };
}
