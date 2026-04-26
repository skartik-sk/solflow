import { describe, expect, it } from "vitest";
import { summarizeHealth } from "./health";

describe("cloud health", () => {
  it("summarizes all-ok health", () => {
    expect(summarizeHealth(["ok", "ok"])).toBe("ok");
  });

  it("marks partial health as degraded", () => {
    expect(summarizeHealth(["ok", "degraded"])).toBe("degraded");
  });

  it("prioritizes down checks", () => {
    expect(summarizeHealth(["ok", "degraded", "down"])).toBe("down");
  });
});
