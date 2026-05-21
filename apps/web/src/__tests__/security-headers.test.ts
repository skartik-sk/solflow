import { describe, expect, it } from "vitest";
import nextConfigPromise from "../../next.config";

function headerValue(
  headers: Array<{ key: string; value: string }>,
  key: string,
): string {
  const match = headers.find((header) => header.key === key);
  if (!match) throw new Error(`Missing header: ${key}`);
  return match.value;
}

describe("web security headers", () => {
  it("allows SolStudio pages to embed internal docs and approved references", async () => {
    const nextConfig = await nextConfigPromise;
    const routes = await nextConfig.headers?.();
    const globalHeaders = routes?.find((route) => route.source === "/(.*)")?.headers;

    expect(globalHeaders).toBeDefined();
    expect(headerValue(globalHeaders!, "X-Frame-Options")).toBe("SAMEORIGIN");

    const csp = headerValue(globalHeaders!, "Content-Security-Policy");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("frame-src 'self' https://explorer.solana.com");
    expect(csp).not.toContain("frame-ancestors 'none'");
  });
});
