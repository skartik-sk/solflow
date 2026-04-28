import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_OG_IMAGE_PATH,
  DEFAULT_OG_IMAGE_TYPE,
  DEFAULT_OG_IMAGE_URL,
  DEFAULT_OG_IMAGE_WIDTH,
  DEFAULT_OG_IMAGE_HEIGHT,
  normalizeOrigin,
} from "../lib/social-metadata";

describe("social preview metadata", () => {
  it("uses a stable absolute PNG URL for social crawlers", () => {
    const url = new URL(DEFAULT_OG_IMAGE_URL);

    expect(DEFAULT_OG_IMAGE_PATH).toBe("/og.png");
    expect(url.pathname).toBe("/og.png");
    expect(DEFAULT_OG_IMAGE_TYPE).toBe("image/png");
    expect(normalizeOrigin("https://solstudio.fun///")).toBe(
      "https://solstudio.fun",
    );
  });

  it("ships an X-compatible large-card image", () => {
    const imagePath = path.join(process.cwd(), "public", "og.png");
    const image = readFileSync(imagePath);
    const stats = statSync(imagePath);

    expect([...image.subarray(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(image.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(image.readUInt32BE(16)).toBe(DEFAULT_OG_IMAGE_WIDTH);
    expect(image.readUInt32BE(20)).toBe(DEFAULT_OG_IMAGE_HEIGHT);
    expect(stats.size).toBeLessThan(5 * 1024 * 1024);
  });
});
