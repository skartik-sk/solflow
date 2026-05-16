import { describe, expect, it } from "vitest";
import {
  extractBearerToken,
  generateCliToken,
  hashCliToken,
  redactCliToken,
} from "./cli-api/tokens";

describe("Cloud CLI token helpers", () => {
  it("generates scoped SolStudio CLI tokens", () => {
    const token = generateCliToken();

    expect(token).toMatch(/^sst_[a-zA-Z0-9_-]{32,}$/);
  });

  it("hashes tokens before database storage", () => {
    const hash = hashCliToken("sst_example_token");

    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hash).not.toContain("sst_example_token");
  });

  it("extracts bearer tokens case-insensitively", () => {
    expect(extractBearerToken("Bearer sst_example_token")).toBe(
      "sst_example_token",
    );
    expect(extractBearerToken("bearer sst_example_token")).toBe(
      "sst_example_token",
    );
  });

  it("redacts tokens for responses and logs", () => {
    expect(redactCliToken("sst_1234567890abcdef")).toBe("sst_...cdef");
  });
});
