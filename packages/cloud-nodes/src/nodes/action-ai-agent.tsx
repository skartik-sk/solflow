// AI Agent Node — calls an LLM to process data or make decisions.

import React, { memo } from "react";
import { Bot } from "lucide-react";
import type { CloudNodeDefinition, CloudFlowNodeData } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";

type AiProvider = "openai" | "anthropic" | "gemini";
type AiResponseFormat = "text" | "json";
type AiAgentMode = "single-shot" | "json-decision" | "summarize";

const DEFAULT_AI_TIMEOUT_MS = 60_000;
const MAX_AI_TIMEOUT_MS = 120_000;

interface AiCallOptions {
  provider: AiProvider;
  model: string;
  systemPrompt: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
  responseFormat: AiResponseFormat;
  signal: AbortSignal;
  apiKey?: string;
}

interface AiCallResult {
  content: string;
  parsedJson?: unknown;
  usage?: unknown;
  rawResponse: unknown;
}

function getEnv(name: string): string | undefined {
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  return env?.[name];
}

function requireFetch(): typeof fetch {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is not available in this runtime");
  }
  return fetch;
}

function defaultModelForProvider(provider: string): string {
  if (provider === "anthropic") return "claude-3-5-haiku-20241022";
  if (provider === "gemini") return "gemini-2.0-flash";
  return "gpt-4o-mini";
}

function resolveModelForProvider(provider: string, model?: string): string {
  if (!model) return defaultModelForProvider(provider);
  if (provider !== "openai" && model === "gpt-4o-mini") {
    return defaultModelForProvider(provider);
  }
  return model;
}

function parseTimeoutMs(value: unknown): number {
  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout <= 0) return DEFAULT_AI_TIMEOUT_MS;
  return Math.min(Math.floor(timeout), MAX_AI_TIMEOUT_MS);
}

function abortMessage(signal: AbortSignal): string {
  if (signal.reason instanceof Error) return signal.reason.message;
  if (typeof signal.reason === "string") return signal.reason;
  return "AI Agent request aborted";
}

function childSignal(
  parent: AbortSignal,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(`AI Agent timed out after ${timeoutMs}ms`);
  }, timeoutMs);
  const onAbort = () => controller.abort(abortMessage(parent));
  parent.addEventListener("abort", onAbort, { once: true });

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      parent.removeEventListener("abort", onAbort);
    },
  };
}

function modeInstructions(
  mode: AiAgentMode,
  responseFormat: AiResponseFormat,
): string {
  if (mode === "json-decision") {
    return "Make a decision from the input. Include decision, reason, confidence, and nextAction fields.";
  }
  if (mode === "summarize") {
    return "Summarize the important workflow input clearly and preserve exact identifiers, token mints, amounts, and errors.";
  }
  if (responseFormat === "json") {
    return "Process the input and return a structured JSON object.";
  }
  return "";
}

function normalizeAgentMode(value: unknown): AiAgentMode {
  if (value === "json-decision" || value === "summarize") return value;
  return "single-shot";
}

function readJsonObject(value: string, provider: AiProvider): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(
      `${provider} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "";
  }
}

function extractOpenAiText(payload: any): string {
  if (typeof payload.output_text === "string") return payload.output_text;

  const chunks: string[] = [];
  for (const output of Array.isArray(payload.output) ? payload.output : []) {
    for (const content of Array.isArray(output?.content)
      ? output.content
      : []) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }

  return chunks.join("");
}

function extractAnthropicText(payload: any): string {
  return (Array.isArray(payload.content) ? payload.content : [])
    .filter(
      (block: any) => block?.type === "text" && typeof block.text === "string",
    )
    .map((block: any) => block.text)
    .join("");
}

function extractGeminiText(payload: any): string {
  const parts = payload?.candidates?.[0]?.content?.parts;
  return (Array.isArray(parts) ? parts : [])
    .filter((part: any) => typeof part?.text === "string")
    .map((part: any) => part.text)
    .join("");
}

async function callOpenAi(options: AiCallOptions): Promise<AiCallResult> {
  const apiKey = options.apiKey ?? getEnv("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required to execute the OpenAI AI Agent node",
    );
  }

  const wantsJson = options.responseFormat === "json";
  const instructions = [
    options.systemPrompt.trim(),
    wantsJson ? "Respond only with a valid JSON object." : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await requireFetch()("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: options.signal,
    body: JSON.stringify({
      model: options.model,
      input: options.prompt,
      ...(instructions ? { instructions } : {}),
      temperature: options.temperature,
      max_output_tokens: options.maxTokens,
      ...(wantsJson ? { text: { format: { type: "json_object" } } } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI API error ${response.status} ${response.statusText}: ${await readErrorBody(response)}`,
    );
  }

  const payload = await response.json();
  const content = extractOpenAiText(payload);
  return {
    content,
    parsedJson: wantsJson ? readJsonObject(content, "openai") : undefined,
    usage: payload.usage,
    rawResponse: payload,
  };
}

async function callAnthropic(options: AiCallOptions): Promise<AiCallResult> {
  const apiKey = options.apiKey ?? getEnv("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is required to execute the Anthropic AI Agent node",
    );
  }

  const wantsJson = options.responseFormat === "json";
  const response = await requireFetch()(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      signal: options.signal,
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
        messages: [
          {
            role: "user",
            content: wantsJson
              ? `${options.prompt}\n\nRespond only with a valid JSON object.`
              : options.prompt,
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Anthropic API error ${response.status} ${response.statusText}: ${await readErrorBody(response)}`,
    );
  }

  const payload = await response.json();
  const content = extractAnthropicText(payload);
  return {
    content,
    parsedJson: wantsJson ? readJsonObject(content, "anthropic") : undefined,
    usage: payload.usage,
    rawResponse: payload,
  };
}

async function callGemini(options: AiCallOptions): Promise<AiCallResult> {
  const apiKey =
    options.apiKey ?? getEnv("GEMINI_API_KEY") ?? getEnv("GOOGLE_API_KEY");
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is required to execute the Gemini AI Agent node",
    );
  }

  const wantsJson = options.responseFormat === "json";
  const systemPrompt = [
    options.systemPrompt.trim(),
    wantsJson ? "Respond only with a valid JSON object." : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await requireFetch()(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: options.signal,
      body: JSON.stringify({
        ...(systemPrompt
          ? { systemInstruction: { parts: [{ text: systemPrompt }] } }
          : {}),
        contents: [
          {
            role: "user",
            parts: [{ text: options.prompt }],
          },
        ],
        generationConfig: {
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens,
          ...(wantsJson ? { responseMimeType: "application/json" } : {}),
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Gemini API error ${response.status} ${response.statusText}: ${await readErrorBody(response)}`,
    );
  }

  const payload = await response.json();
  const content = extractGeminiText(payload);
  return {
    content,
    parsedJson: wantsJson ? readJsonObject(content, "gemini") : undefined,
    usage: payload.usageMetadata,
    rawResponse: payload,
  };
}

async function callAiProvider(options: AiCallOptions): Promise<AiCallResult> {
  if (options.provider === "openai") return callOpenAi(options);
  if (options.provider === "anthropic") return callAnthropic(options);
  if (options.provider === "gemini") return callGemini(options);
  throw new Error(`Unsupported AI provider "${options.provider}"`);
}

async function resolveAiApiKey(
  ctx: {
    params: Record<string, unknown>;
    credentials?: {
      get(
        id: string,
        allowedTypes?: string[],
      ): Promise<{ type: string; data: Record<string, unknown> }>;
    };
  },
  provider: AiProvider,
): Promise<string | undefined> {
  const credentialId = ctx.params.credentialId as string | undefined;
  if (!credentialId) return undefined;

  const credential = await ctx.credentials?.get(credentialId, [provider]);
  if (!credential) {
    throw new Error(
      "Credential runtime is not available for this AI Agent node",
    );
  }

  const apiKey = credential.data.apiKey;
  if (typeof apiKey !== "string" || !apiKey) {
    throw new Error(`${provider} credential is missing apiKey`);
  }
  return apiKey;
}

// ─── Visual Component ──────────────────────────────────────────────────────

export const AiAgentNode = memo(function AiAgentNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  const provider = (data.data?.provider as string) || "openai";
  const model = resolveModelForProvider(
    provider,
    data.data?.model as string | undefined,
  );

  return (
    <CloudBaseNode data={data} selected={selected}>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground/70">model</span>
          <span className="truncate max-w-[120px] text-right font-mono text-[10px]">
            {provider}/{model}
          </span>
        </div>
      </div>
    </CloudBaseNode>
  );
});

// ─── Node Definition ───────────────────────────────────────────────────────

export const aiAgentDef: CloudNodeDefinition = {
  type: "action:ai-agent",
  label: "AI Agent",
  category: "ai",
  description:
    "Call an LLM to process data, make decisions, or generate content.",
  icon: "Bot",
  color: CATEGORY_COLORS.ai,
  properties: [
    {
      key: "provider",
      label: "Provider",
      type: "select",
      required: true,
      default: "openai",
      options: [
        { label: "OpenAI", value: "openai" },
        { label: "Anthropic", value: "anthropic" },
        { label: "Gemini", value: "gemini" },
      ],
    },
    {
      key: "agentMode",
      label: "Agent Mode",
      type: "select",
      required: false,
      default: "single-shot",
      options: [
        { label: "Single Shot", value: "single-shot" },
        { label: "JSON Decision", value: "json-decision" },
        { label: "Summarize", value: "summarize" },
      ],
      description:
        "n8n-style root-node behavior: process, decide, or summarize workflow data.",
    },
    {
      key: "credentialId",
      label: "Credential",
      type: "credential",
      required: false,
      credentialTypes: ["openai", "anthropic", "gemini"],
      description:
        "Select a saved provider credential, or leave blank to use OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY.",
    },
    {
      key: "model",
      label: "Model",
      type: "select",
      required: true,
      default: "gpt-4o-mini",
      options: [
        { label: "GPT-4o Mini", value: "gpt-4o-mini" },
        { label: "GPT-4o", value: "gpt-4o" },
        { label: "Claude Haiku", value: "claude-3-5-haiku-20241022" },
        { label: "Claude Sonnet", value: "claude-sonnet-4-20250514" },
        { label: "Gemini 2.0 Flash", value: "gemini-2.0-flash" },
        { label: "Gemini 1.5 Flash", value: "gemini-1.5-flash" },
      ],
    },
    {
      key: "systemPrompt",
      label: "System Prompt",
      type: "code",
      required: false,
      description: "Instructions for the AI agent",
      placeholder: "You are a Solana DeFi assistant...",
    },
    {
      key: "prompt",
      label: "User Prompt",
      type: "expression",
      required: true,
      description:
        "The prompt to send to the LLM. Use {{ $json.field }} to reference data.",
      placeholder: "Analyze this token: {{ $json.token }}",
      supportsExpressions: true,
    },
    {
      key: "toolInstructions",
      label: "Tool Instructions",
      type: "code",
      required: false,
      description:
        "Describe available SolStudio workflow context or tools the model should reason about. This does not execute tools by itself.",
      placeholder:
        "You can reason over previous node JSON. Do not send transactions unless a later wallet node is connected.",
    },
    {
      key: "temperature",
      label: "Temperature",
      type: "number",
      required: false,
      default: 0.7,
      description: "Higher = more creative, lower = more focused (0-2)",
    },
    {
      key: "maxTokens",
      label: "Max Tokens",
      type: "number",
      required: false,
      default: 1024,
      description: "Maximum response length",
    },
    {
      key: "requestTimeoutMs",
      label: "Request Timeout",
      type: "duration",
      required: false,
      default: DEFAULT_AI_TIMEOUT_MS,
      description:
        "Maximum AI provider request time in milliseconds. Capped at 120000ms.",
    },
    {
      key: "responseFormat",
      label: "Response Format",
      type: "select",
      required: false,
      default: "text",
      options: [
        { label: "Plain Text", value: "text" },
        { label: "JSON Object", value: "json" },
      ],
    },
    {
      key: "outputField",
      label: "Output Field",
      type: "text",
      required: false,
      default: "ai",
      description: "Field name used to store the AI response in output JSON.",
    },
    {
      key: "includeInput",
      label: "Include input JSON",
      type: "boolean",
      required: false,
      default: true,
      description: "Keep incoming node data alongside the AI result.",
    },
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "output" }],
  defaultData: {
    provider: "openai",
    agentMode: "single-shot",
    credentialId: "",
    model: "gpt-4o-mini",
    systemPrompt: "",
    prompt: "",
    toolInstructions: "",
    temperature: 0.7,
    maxTokens: 1024,
    requestTimeoutMs: DEFAULT_AI_TIMEOUT_MS,
    responseFormat: "text",
    outputField: "ai",
    includeInput: true,
  },
  component: AiAgentNode,
  async execute(ctx) {
    const provider = ((ctx.params.provider as string) ||
      "openai") as AiProvider;
    const agentMode = normalizeAgentMode(ctx.params.agentMode);
    const model = resolveModelForProvider(
      provider,
      ctx.params.model as string | undefined,
    );
    const systemPrompt = (ctx.params.systemPrompt as string) || "";
    const toolInstructions = (ctx.params.toolInstructions as string) || "";
    const prompt = ctx.params.prompt as string;
    const temperature = Math.max(
      0,
      Math.min(Number(ctx.params.temperature) || 0.7, 2),
    );
    const maxTokens = Math.max(
      1,
      Math.min(Number(ctx.params.maxTokens) || 1024, 16_384),
    );
    const requestTimeoutMs = parseTimeoutMs(ctx.params.requestTimeoutMs);
    const responseFormat = ((ctx.params.responseFormat as string) ||
      "text") as AiResponseFormat;
    const outputField = String(ctx.params.outputField || "ai").trim() || "ai";
    const includeInput = ctx.params.includeInput !== false;

    if (!prompt) {
      throw new Error("Prompt is required");
    }

    if (!["openai", "anthropic", "gemini"].includes(provider)) {
      throw new Error(`Unsupported AI provider "${provider}"`);
    }

    if (!["text", "json"].includes(responseFormat)) {
      throw new Error(`Unsupported AI response format "${responseFormat}"`);
    }

    const extraInstructions = [
      modeInstructions(agentMode, responseFormat),
      toolInstructions.trim(),
    ]
      .filter(Boolean)
      .join("\n\n");
    const requestSignal = childSignal(ctx.signal, requestTimeoutMs);
    let result: AiCallResult;
    try {
      result = await callAiProvider({
        provider,
        model,
        systemPrompt: [systemPrompt.trim(), extraInstructions]
          .filter(Boolean)
          .join("\n\n"),
        prompt,
        temperature,
        maxTokens,
        responseFormat,
        signal: requestSignal.signal,
        apiKey: await resolveAiApiKey(ctx, provider),
      });
    } catch (error) {
      if (requestSignal.signal.aborted) {
        throw new Error(abortMessage(requestSignal.signal));
      }
      throw error;
    } finally {
      requestSignal.cleanup();
    }

    const ai = {
      provider,
      model,
      mode: agentMode,
      content: result.content,
      ...(responseFormat === "json" ? { json: result.parsedJson } : {}),
      usage: result.usage,
      timestamp: new Date().toISOString(),
    };

    const inputItems = ctx.inputs[0] ?? [{ json: {} }];
    return inputItems.map((item) => ({
      ...item,
      json: {
        ...(includeInput ? item.json : {}),
        [outputField]: ai,
      },
    }));
  },
};
