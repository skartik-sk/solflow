import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildQstashScheduleHeaders,
  qstashCreateSchedule,
  qstashDeleteScheduleForWorkflow,
  scheduleTargetsWorkflow,
} from "./qstash-scheduler";

describe("qstash scheduler", () => {
  beforeEach(() => {
    process.env.QSTASH_TOKEN = "qtok";
    process.env.CLOUD_PUBLIC_BASE_URL = "https://cloud.example.com/";
    process.env.CRON_SECRET = "s3cret";
  });
  afterEach(() => {
    delete process.env.QSTASH_TOKEN;
    delete process.env.CLOUD_PUBLIC_BASE_URL;
    delete process.env.CRON_SECRET;
    vi.unstubAllGlobals();
  });

  it("puts the cron (with CRON_TZ) in the Upstash-Cron header and forwards the secret", () => {
    const headers = buildQstashScheduleHeaders({ workflowId: "wf1", cron: "0 9 * * *", timezone: "Asia/Tokyo", cronSecret: "s3cret" });
    expect(headers["Upstash-Cron"]).toBe("CRON_TZ=Asia/Tokyo 0 9 * * *");
    expect(headers["Upstash-Forward-X-Cron-Secret"]).toBe("s3cret");
    expect(headers["Upstash-Schedule-Id"]).toBe("solstudio-wf-wf1");
    expect(buildQstashScheduleHeaders({ workflowId: "wf1", cron: "*/5 * * * *" })["Upstash-Cron"]).toBe("*/5 * * * *");
  });

  it("creates the schedule against the encoded fire URL", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (!init?.method) return new Response("[]", { status: 200 });
      return new Response(JSON.stringify({ scheduleId: "solstudio-wf-wf1" }), { status: 200 });
    }));
    await expect(qstashCreateSchedule({ workflowId: "wf1", cron: "0 9 * * *", timezone: "UTC" })).resolves.toBe("solstudio-wf-wf1");
    const create = calls.find((c) => c.init?.method === "POST")!;
    expect(create.url).toBe(
      `https://qstash.upstash.io/v2/schedules/${encodeURIComponent("https://cloud.example.com/api/cron/fire?workflowId=wf1")}`,
    );
    const headers = create.init!.headers as Record<string, string>;
    expect(headers["Upstash-Cron"]).toBe("CRON_TZ=UTC 0 9 * * *");
    expect(headers["Upstash-Forward-X-Cron-Secret"]).toBe("s3cret");
  });

  it("deletes only this workflow's schedules and throws when QStash fails", async () => {
    const deleted: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        deleted.push(url);
        return new Response(null, { status: 200 });
      }
      return new Response(JSON.stringify([
        { scheduleId: "a", destination: "https://cloud.example.com/api/cron/fire?workflowId=wf1" },
        { scheduleId: "b", destination: "https://cloud.example.com/api/cron/fire?workflowId=wf10" },
      ]), { status: 200 });
    }));
    await expect(qstashDeleteScheduleForWorkflow("wf1")).resolves.toBe(1);
    expect(deleted).toEqual(["https://qstash.upstash.io/v2/schedules/a"]);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 500 })));
    await expect(qstashDeleteScheduleForWorkflow("wf1")).rejects.toThrow(/HTTP 500/);
  });

  it("matches destinations by exact workflowId", () => {
    expect(scheduleTargetsWorkflow("https://x/api/cron/fire?workflowId=wf1", "wf1")).toBe(true);
    expect(scheduleTargetsWorkflow("https://x/api/cron/fire?workflowId=wf10", "wf1")).toBe(false);
  });
});
