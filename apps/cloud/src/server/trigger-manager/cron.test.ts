import { describe, expect, it } from "vitest";
import { isValidTimezone, nextCronRun, parseCron } from "./cron";

describe("cron", () => {
  it("parses steps, ranges and lists", () => {
    const c = parseCron("*/15 9-17 * * 1-5");
    expect([...c.minutes]).toEqual([0, 15, 30, 45]);
    expect(c.hours.has(9) && c.hours.has(17) && !c.hours.has(18)).toBe(true);
    expect([...c.daysOfWeek].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects bad expressions", () => {
    expect(() => parseCron("* * * *")).toThrow(/5 fields/);
    expect(() => parseCron("61 * * * *")).toThrow(/minute/);
    expect(() => parseCron("a * * * *")).toThrow();
  });

  it("finds the next UTC run", () => {
    const from = new Date("2026-03-10T10:07:30Z");
    expect(nextCronRun("*/5 * * * *", "UTC", from)?.toISOString()).toBe("2026-03-10T10:10:00.000Z");
    expect(nextCronRun("0 0 1 1 *", "UTC", from)?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("honours the timezone", () => {
    // 09:00 in Tokyo (UTC+9) is 00:00 UTC.
    const from = new Date("2026-03-10T10:00:00Z");
    expect(nextCronRun("0 9 * * *", "Asia/Tokyo", from)?.toISOString()).toBe("2026-03-11T00:00:00.000Z");
  });

  it("treats day-of-week 7 as Sunday and ORs restricted dom/dow", () => {
    const from = new Date("2026-03-10T00:00:00Z"); // Tuesday
    expect(nextCronRun("0 12 * * 7", "UTC", from)?.toISOString()).toBe("2026-03-15T12:00:00.000Z");
    expect(nextCronRun("0 12 13 * 3", "UTC", from)?.toISOString()).toBe("2026-03-11T12:00:00.000Z");
  });

  it("validates timezones", () => {
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
  });
});
