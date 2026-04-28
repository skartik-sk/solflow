import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLOUD_OG_IMAGE_HEIGHT,
  CLOUD_OG_IMAGE_PATH,
  CLOUD_OG_IMAGE_TYPE,
  CLOUD_OG_IMAGE_URL,
  CLOUD_OG_IMAGE_WIDTH,
  normalizeOrigin,
} from "./social-metadata";

describe("cloud social preview metadata", () => {
  it("uses a Cloud-specific static PNG URL", () => {
    const url = new URL(CLOUD_OG_IMAGE_URL);

    expect(CLOUD_OG_IMAGE_PATH).toBe("/cloud-og.png");
    expect(url.origin).toBe("https://cloud.solstudio.fun");
    expect(url.pathname).toBe("/cloud-og.png");
    expect(CLOUD_OG_IMAGE_TYPE).toBe("image/png");
    expect(normalizeOrigin("https://cloud.solstudio.fun///")).toBe(
      "https://cloud.solstudio.fun",
    );
  });

  it("ships an X-compatible Cloud large-card image", () => {
    const imagePath = path.join(process.cwd(), "public", "cloud-og.png");
    const image = readFileSync(imagePath);
    const stats = statSync(imagePath);

    expect([...image.subarray(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(image.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(image.readUInt32BE(16)).toBe(CLOUD_OG_IMAGE_WIDTH);
    expect(image.readUInt32BE(20)).toBe(CLOUD_OG_IMAGE_HEIGHT);
    expect(stats.size).toBeLessThan(5 * 1024 * 1024);
  });
});
