import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEEPSEEK_EDITOR_MODEL,
  EDITOR_AI_PROMPT_OPTIONS,
  createDeepSeekEditorAssistantReply,
  createEditorAssistantReply,
} from "@solflow/ui";

describe("editor AI assistant helpers", () => {
  it("ships the core predefined editor prompts", () => {
    expect(EDITOR_AI_PROMPT_OPTIONS.map((option) => option.label)).toEqual(
      expect.arrayContaining([
        "Fix bugs",
        "Connect correct nodes",
        "Explain my project",
      ]),
    );
    expect(new Set(EDITOR_AI_PROMPT_OPTIONS.map((option) => option.id)).size).toBe(
      EDITOR_AI_PROMPT_OPTIONS.length,
    );
  });

  it("builds connection guidance with current web project context", () => {
    const reply = createEditorAssistantReply({
      optionId: "connect-nodes",
      prompt: "connect correct nodes",
      context: {
        surface: "web",
        projectName: "Escrow Flow",
        nodeCount: 4,
        edgeCount: 1,
        selectedNodeLabel: "deposit",
      },
    });

    expect(reply).toContain("Escrow Flow");
    expect(reply).toContain("4 nodes");
    expect(reply).toContain("1 connection");
    expect(reply).toContain("selected node: deposit");
    expect(reply).toContain("valid handles");
  });

  it("uses workflow wording for cloud editor context", () => {
    const reply = createEditorAssistantReply({
      optionId: "explain-project",
      prompt: "explain my project",
      context: {
        surface: "cloud",
        projectName: "SOL price monitor",
        nodeCount: 5,
        edgeCount: 4,
      },
    });

    expect(reply).toContain("SOL price monitor");
    expect(reply).toContain("workflow");
    expect(reply).toContain("5 nodes");
    expect(reply).toContain("4 connections");
  });

  it("prepares DeepSeek v4 requests and falls back without an API key", async () => {
    const input = {
      optionId: "fix-bugs" as const,
      prompt: "fix bugs",
      context: {
        surface: "web" as const,
        projectName: "Vault",
        nodeCount: 2,
        edgeCount: 1,
      },
    };

    const fallback = await createDeepSeekEditorAssistantReply(input, {
      apiKey: "",
    });
    expect(fallback.source).toBe("local");
    expect(fallback.model).toBe(DEFAULT_DEEPSEEK_EDITOR_MODEL);
    expect(fallback.reply).toContain("Vault");

    const calls: Array<{ url: string; init: RequestInit }> = [];
    const response = await createDeepSeekEditorAssistantReply(input, {
      apiKey: "test-key",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "DeepSeek answer" } }],
          }),
          { status: 200 },
        );
      },
    });

    expect(response).toEqual({
      source: "deepseek",
      model: DEFAULT_DEEPSEEK_EDITOR_MODEL,
      reply: "DeepSeek answer",
    });
    expect(calls[0]?.url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(calls[0]?.init.headers).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      model: DEFAULT_DEEPSEEK_EDITOR_MODEL,
    });
  });
});
