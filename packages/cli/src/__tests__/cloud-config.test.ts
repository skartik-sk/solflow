import { describe, expect, it } from "vitest";
import { join } from "path";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import {
  deleteCloudProfile,
  getActiveCloudProfile,
  getCloudConfigPath,
  listCloudProfiles,
  normalizeCloudEndpoint,
  redactCloudToken,
  readCloudConfig,
  updateCloudProfile,
  upsertCloudProfile,
} from "../utils/cloud-config";

describe("cloud config utilities", () => {
  it("normalizes cloud endpoints without trailing slashes", () => {
    expect(normalizeCloudEndpoint("https://cloud.solstudio.fun///")).toBe(
      "https://cloud.solstudio.fun",
    );
  });

  it("rejects endpoints that are not http or https", () => {
    expect(() => normalizeCloudEndpoint("file:///tmp/cloud")).toThrow(
      "Cloud endpoint must use http or https",
    );
  });

  it("stores profiles outside project .solstudio state", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-cloud-config-"));
    try {
      upsertCloudProfile(tempDir, {
        name: "dev",
        endpoint: "http://localhost:3001/",
        token: "sst_dev_1234567890abcdef",
        makeActive: true,
      });

      const config = readCloudConfig(tempDir);
      expect(getCloudConfigPath(tempDir)).toBe(join(tempDir, "cloud.json"));
      expect(config.currentProfile).toBe("dev");
      expect(config.profiles.dev.endpoint).toBe("http://localhost:3001");
      expect(config.profiles.dev.token).toBe("sst_dev_1234567890abcdef");
      expect(getActiveCloudProfile(tempDir)?.name).toBe("dev");
      expect(listCloudProfiles(tempDir).map((profile) => profile.name)).toEqual([
        "dev",
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("moves the active profile when deleting the current profile", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-cloud-config-"));
    try {
      upsertCloudProfile(tempDir, {
        name: "hosted",
        endpoint: "https://cloud.solstudio.fun",
        token: "sst_hosted_1234567890abcdef",
        makeActive: true,
      });
      upsertCloudProfile(tempDir, {
        name: "local",
        endpoint: "http://localhost:3001",
        token: "sst_local_1234567890abcdef",
        makeActive: false,
      });

      deleteCloudProfile(tempDir, "hosted");

      expect(readCloudConfig(tempDir).currentProfile).toBe("local");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("redacts tokens but keeps enough prefix for profile debugging", () => {
    expect(redactCloudToken("sst_1234567890abcdef")).toBe("sst_...cdef");
  });

  it("can retarget a profile to another hosted or self-hosted URL", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-cloud-config-"));
    try {
      upsertCloudProfile(tempDir, {
        name: "prod",
        endpoint: "https://cloud.solstudio.fun",
        token: "sst_prod_1234567890abcdef",
        makeActive: true,
      });

      const profile = updateCloudProfile(tempDir, "prod", {
        endpoint: "203.0.113.10:3001",
      });

      expect(profile.endpoint).toBe("https://203.0.113.10:3001");
      expect(profile.token).toBe("sst_prod_1234567890abcdef");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
