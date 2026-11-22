import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
vi.mock("@solflow/auth", () => ({ auth }));
const reply = vi.fn(async () => ({ source: "local", model: "m", reply: "ok" }));
vi.mock("@solflow/ui/editor-ai-assistant", () => ({
  createDeepSeekEditorAssistantReply: reply,
  resolveEditorAssistantProvider: () => ({ model: "m" }),
}));

const { POST } = await import("./route");
const { resetRateLimitStoreForTests } = await import("../../../lib/rate-limit");

const body = JSON.stringify({ prompt: "hi", context: { surface: "cloud" } });
const req = () =>
  new Request("https://cloud.example.com/api/editor-assistant", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body,
  });

describe("cloud editor-assistant route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStoreForTests();
    vi.unstubAllEnvs();
  });

  it("requires a session in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    auth.mockResolvedValue(null);
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(reply).not.toHaveBeenCalled();
  });

  it("allows 20 prompts per user per minute, then 429", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    for (let i = 0; i < 20; i += 1) expect((await POST(req())).status).toBe(200);
    const limited = await POST(req());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    expect(reply).toHaveBeenCalledTimes(20);

    // a different user has their own budget
    auth.mockResolvedValue({ user: { id: "u2" } });
    expect((await POST(req())).status).toBe(200);
  });
});
