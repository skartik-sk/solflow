import { describe, it, expect } from "vitest";
import { isValidCloudConnection, canNodeHaveInputs } from "../src/connection-rules";

describe("isValidCloudConnection", () => {
  it("allows trigger → action via main", () => {
    expect(isValidCloudConnection("trigger", "action", "main", "main")).toBe(true);
  });

  it("allows action → transform via main", () => {
    expect(isValidCloudConnection("action", "transform", "main", "main")).toBe(true);
  });

  it("blocks output → anything", () => {
    expect(isValidCloudConnection("output", "action", "main", "main")).toBe(false);
  });

  it("blocks trigger → trigger (same category)", () => {
    expect(isValidCloudConnection("trigger", "trigger", "main", "main")).toBe(false);
  });

  it("allows logic → action", () => {
    expect(isValidCloudConnection("logic", "action", "main", "main")).toBe(true);
  });

  it("blocks incompatible connection types (trigger port → ai port)", () => {
    expect(isValidCloudConnection("trigger", "action", "trigger", "ai")).toBe(false);
  });
});

describe("canNodeHaveInputs", () => {
  it("trigger nodes have no inputs", () => {
    expect(canNodeHaveInputs("trigger")).toBe(false);
  });

  it("action nodes can have inputs", () => {
    expect(canNodeHaveInputs("action")).toBe(true);
  });

  it("logic nodes can have inputs", () => {
    expect(canNodeHaveInputs("logic")).toBe(true);
  });
});
