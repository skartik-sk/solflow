// AI Agent Node — calls an LLM to process data or make decisions.

import React, { memo } from "react";
import { Bot } from "lucide-react";
import type { CloudNodeDefinition, CloudFlowNodeData } from "../types";
import { CATEGORY_COLORS } from "../types";
import { CloudBaseNode } from "../components/cloud-base-node";

// ─── Visual Component ──────────────────────────────────────────────────────

export const AiAgentNode = memo(function AiAgentNode({
  data,
  selected,
}: {
  data: CloudFlowNodeData;
  selected?: boolean;
}) {
  const provider = (data.data?.provider as string) || "openai";
  const model = (data.data?.model as string) || "gpt-4o-mini";

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
  description: "Call an LLM to process data, make decisions, or generate content.",
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
      ],
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
      description: "The prompt to send to the LLM. Use {{ $json.field }} to reference data.",
      placeholder: "Analyze this token: {{ $json.token }}",
      supportsExpressions: true,
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
  ],
  inputs: [{ type: "main", label: "input" }],
  outputs: [{ type: "main", label: "output" }],
  defaultData: {
    provider: "openai",
    model: "gpt-4o-mini",
    systemPrompt: "",
    prompt: "",
    temperature: 0.7,
    maxTokens: 1024,
    responseFormat: "text",
  },
  component: AiAgentNode,
  async execute(ctx) {
    const provider = (ctx.params.provider as string) || "openai";
    const model = (ctx.params.model as string) || "gpt-4o-mini";
    const systemPrompt = (ctx.params.systemPrompt as string) || "";
    const prompt = ctx.params.prompt as string;
    const temperature = Number(ctx.params.temperature) || 0.7;
    const maxTokens = Number(ctx.params.maxTokens) || 1024;
    const responseFormat = (ctx.params.responseFormat as string) || "text";

    if (!prompt) {
      throw new Error("Prompt is required");
    }

    // TODO: Wire to actual LLM API via credential-stored API keys
    // For now return a mock response for development
    const inputItems = ctx.inputs?.[0] ?? [];
    const mockResponse = {
      content: `[Mock AI Response] Processed with ${provider}/${model}`,
      usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
      model,
      provider,
      timestamp: new Date().toISOString(),
    };

    // Try to parse as JSON if response format is json
    if (responseFormat === "json") {
      try {
        mockResponse.content = JSON.stringify({
          analysis: "mock analysis",
          recommendation: "hold",
          confidence: 0.85,
        });
      } catch {
        // Keep text response
      }
    }

    return inputItems.length > 0
      ? inputItems.map((item) => ({
          ...item,
          json: { ...item.json, ai: mockResponse },
        }))
      : [{ json: { ai: mockResponse } }];
  },
};
