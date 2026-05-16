import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface CloudProfile {
  name: string;
  endpoint: string;
  token: string;
  createdAt: string;
  updatedAt: string;
}

export interface CloudConfig {
  currentProfile?: string;
  profiles: Record<string, CloudProfile>;
}

export interface UpsertCloudProfileInput {
  name: string;
  endpoint: string;
  token: string;
  makeActive?: boolean;
}

export interface UpdateCloudProfileInput {
  endpoint?: string;
  token?: string;
  makeActive?: boolean;
}

const DEFAULT_CONFIG: CloudConfig = {
  profiles: {},
};

export function getDefaultCloudConfigDir(): string {
  return process.env.SOLSTUDIO_CLOUD_CONFIG_DIR ?? join(homedir(), ".solstudio");
}

export function getCloudConfigPath(configDir = getDefaultCloudConfigDir()): string {
  return join(configDir, "cloud.json");
}

export function normalizeCloudEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) throw new Error("Cloud endpoint is required");

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)
    ? trimmed
    : trimmed.startsWith("localhost") || trimmed.startsWith("127.") || trimmed.startsWith("[::1]")
      ? `http://${trimmed}`
      : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error(`Invalid cloud endpoint: ${endpoint}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Cloud endpoint must use http or https");
  }

  return url.toString().replace(/\/+$/, "");
}

export function readCloudConfig(configDir = getDefaultCloudConfigDir()): CloudConfig {
  const configPath = getCloudConfigPath(configDir);
  if (!existsSync(configPath)) return { ...DEFAULT_CONFIG, profiles: {} };

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as Partial<CloudConfig>;
    const profiles = parsed.profiles && typeof parsed.profiles === "object" ? parsed.profiles : {};
    const currentProfile =
      parsed.currentProfile && profiles[parsed.currentProfile]
        ? parsed.currentProfile
        : Object.keys(profiles)[0];

    return {
      currentProfile,
      profiles: profiles as Record<string, CloudProfile>,
    };
  } catch (err) {
    throw new Error(
      `Failed to read SolStudio Cloud config: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function writeCloudConfig(
  config: CloudConfig,
  configDir = getDefaultCloudConfigDir(),
): void {
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
  const configPath = getCloudConfigPath(configDir);
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  try {
    chmodSync(configPath, 0o600);
  } catch {
    // Best effort only; some platforms/filesystems do not support chmod.
  }
}

export function upsertCloudProfile(
  configDir: string,
  input: UpsertCloudProfileInput,
): CloudProfile {
  const config = readCloudConfig(configDir);
  const now = new Date().toISOString();
  const existing = config.profiles[input.name];
  const profile: CloudProfile = {
    name: input.name,
    endpoint: normalizeCloudEndpoint(input.endpoint),
    token: input.token.trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  config.profiles[input.name] = profile;
  if (input.makeActive ?? !config.currentProfile) {
    config.currentProfile = input.name;
  }
  writeCloudConfig(config, configDir);
  return profile;
}

export function listCloudProfiles(configDir = getDefaultCloudConfigDir()): CloudProfile[] {
  const config = readCloudConfig(configDir);
  return Object.values(config.profiles);
}

export function getActiveCloudProfile(
  configDir = getDefaultCloudConfigDir(),
  name?: string,
): CloudProfile | undefined {
  const config = readCloudConfig(configDir);
  const profileName = name ?? config.currentProfile;
  return profileName ? config.profiles[profileName] : undefined;
}

export function setActiveCloudProfile(
  configDir: string,
  name: string,
): CloudProfile {
  const config = readCloudConfig(configDir);
  const profile = config.profiles[name];
  if (!profile) throw new Error(`Cloud profile not found: ${name}`);
  config.currentProfile = name;
  writeCloudConfig(config, configDir);
  return profile;
}

export function updateCloudProfile(
  configDir: string,
  name: string,
  input: UpdateCloudProfileInput,
): CloudProfile {
  const config = readCloudConfig(configDir);
  const existing = config.profiles[name];
  if (!existing) throw new Error(`Cloud profile not found: ${name}`);

  const profile: CloudProfile = {
    ...existing,
    endpoint: input.endpoint ? normalizeCloudEndpoint(input.endpoint) : existing.endpoint,
    token: input.token?.trim() || existing.token,
    updatedAt: new Date().toISOString(),
  };

  config.profiles[name] = profile;
  if (input.makeActive) config.currentProfile = name;
  writeCloudConfig(config, configDir);
  return profile;
}

export function deleteCloudProfile(
  configDir: string,
  name: string,
): boolean {
  const config = readCloudConfig(configDir);
  if (!config.profiles[name]) return false;

  delete config.profiles[name];
  if (config.currentProfile === name) {
    config.currentProfile = Object.keys(config.profiles)[0];
  }
  writeCloudConfig(config, configDir);
  return true;
}

export function redactCloudToken(token: string): string {
  if (token.length <= 8) return "****";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}
