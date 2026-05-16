import { randomBytes } from "crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface SelfHostTemplateOptions {
  domain?: string;
  image?: string;
  databaseUrl?: string;
  redisUrl?: string;
}

export interface WriteSelfHostOptions extends SelfHostTemplateOptions {
  directory: string;
  force?: boolean;
}

export interface SelfHostEnvReport {
  ok: boolean;
  missing: string[];
  placeholder: string[];
  warnings: string[];
}

export interface SelfHostDeployStep {
  label: string;
  command: string;
  args: string[];
  cwd: string;
}

export interface SelfHostDeployPlanOptions {
  directory: string;
  pull?: boolean;
}

export interface PrepareSelfHostOptions extends SelfHostTemplateOptions {
  directory: string;
  force?: boolean;
  autoEnv?: boolean;
}

const DEFAULT_IMAGE = "ghcr.io/skartik-sk/solstudio-cloud:latest";
const REQUIRED_ENV_KEYS = [
  "AUTH_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_CLOUD_URL",
  "DATABASE_URL",
  "REDIS_URL",
  "AUTH_SECRET",
  "ENCRYPTION_MASTER_KEY",
] as const;

export function buildSelfHostFiles(options: SelfHostTemplateOptions = {}): Record<string, string> {
  const domain = options.domain ?? "cloud.localhost";
  const image = options.image ?? DEFAULT_IMAGE;
  const databaseUrl =
    options.databaseUrl ?? "postgresql://solstudio:solstudio@postgres:5432/solstudio_cloud";
  const redisUrl = options.redisUrl ?? "redis://redis:6379";

  return {
    ".env.example": [
      "# SolStudio Cloud self-host configuration",
      `AUTH_URL=https://${domain}`,
      `NEXT_PUBLIC_APP_URL=https://${domain}`,
      `NEXT_PUBLIC_CLOUD_URL=https://${domain}`,
      "NEXT_PUBLIC_WEB_URL=https://solstudio.fun",
      `DATABASE_URL=${databaseUrl}`,
      `REDIS_URL=${redisUrl}`,
      "AUTH_SECRET=replace-with-openssl-rand-base64-32",
      "AUTH_TRUST_HOST=true",
      "ENCRYPTION_MASTER_KEY=replace-with-32-byte-random-secret",
      "CLOUD_RUNTIME_MODE=worker",
      "CLOUD_QUOTA_ENFORCEMENT=false",
      "CLOUD_HEALTH_DETAILS_TOKEN=replace-with-health-read-token",
      "",
      "# Optional OAuth providers",
      "AUTH_GITHUB_ID=",
      "AUTH_GITHUB_SECRET=",
      "AUTH_GOOGLE_ID=",
      "AUTH_GOOGLE_SECRET=",
      "",
    ].join("\n"),
    "docker-compose.yml": [
      "services:",
      "  postgres:",
      "    image: postgres:16-alpine",
      "    restart: unless-stopped",
      "    environment:",
      "      POSTGRES_DB: solstudio_cloud",
      "      POSTGRES_USER: solstudio",
      "      POSTGRES_PASSWORD: solstudio",
      "    volumes:",
      "      - postgres-data:/var/lib/postgresql/data",
      "    healthcheck:",
      "      test: [\"CMD-SHELL\", \"pg_isready -U solstudio -d solstudio_cloud\"]",
      "      interval: 10s",
      "      timeout: 5s",
      "      retries: 5",
      "",
      "  redis:",
      "    image: redis:7-alpine",
      "    restart: unless-stopped",
      "    volumes:",
      "      - redis-data:/data",
      "",
      "  cloud-db-sync:",
      `    image: ${image}`,
      "    restart: \"no\"",
      "    env_file:",
      "      - .env",
      "    depends_on:",
      "      postgres:",
      "        condition: service_healthy",
      "    command: [\"../../node_modules/.bin/prisma\", \"db\", \"push\", \"--schema\", \"../../packages/db/prisma/schema.prisma\"]",
      "",
      "  solstudio-cloud:",
      `    image: ${image}`,
      "    restart: unless-stopped",
      "    env_file:",
      "      - .env",
      "    depends_on:",
      "      cloud-db-sync:",
      "        condition: service_completed_successfully",
      "      postgres:",
      "        condition: service_healthy",
      "      redis:",
      "        condition: service_started",
      "    ports:",
      "      - \"3001:3001\"",
      "    command: [\"node\", \"dist-server/server.js\"]",
      "",
      "  cloud-worker:",
      `    image: ${image}`,
      "    restart: unless-stopped",
      "    env_file:",
      "      - .env",
      "    depends_on:",
      "      cloud-db-sync:",
      "        condition: service_completed_successfully",
      "      postgres:",
      "        condition: service_healthy",
      "      redis:",
      "        condition: service_started",
      "    command: [\"node\", \"dist-server/worker.js\"]",
      "",
      "volumes:",
      "  postgres-data:",
      "  redis-data:",
      "",
    ].join("\n"),
    "README.md": [
      `# SolStudio Cloud Self-Host Kit for ${domain}`,
      "",
      "This folder runs only the Cloud workflow automation surface: the Cloud app, worker, Postgres, and Redis.",
      "It does not run the main IDE or local visualizer.",
      "",
      "## Start",
      "",
      "```bash",
      "solstudio cloud self-host deploy . --domain " + domain + " --yes",
      "```",
      "",
      "After the service is reachable, create a CLI token from the Cloud app and log in from any machine:",
      "",
      "```bash",
      `solstudio cloud login --endpoint https://${domain} --token sst_your_token`,
      "solstudio cloud whoami",
      "solstudio cloud workflow list",
      "```",
      "",
      "Use a unique `ENCRYPTION_MASTER_KEY` before adding wallets or credentials. Losing it makes encrypted Cloud wallets and credentials unrecoverable.",
      "",
    ].join("\n"),
  };
}

export function generateSelfHostEnv(options: SelfHostTemplateOptions = {}): string {
  const domain = options.domain ?? "cloud.localhost";
  const databaseUrl =
    options.databaseUrl ?? "postgresql://solstudio:solstudio@postgres:5432/solstudio_cloud";
  const redisUrl = options.redisUrl ?? "redis://redis:6379";

  return [
    "# SolStudio Cloud self-host configuration",
    `AUTH_URL=https://${domain}`,
    `NEXT_PUBLIC_APP_URL=https://${domain}`,
    `NEXT_PUBLIC_CLOUD_URL=https://${domain}`,
    "NEXT_PUBLIC_WEB_URL=https://solstudio.fun",
    `DATABASE_URL=${databaseUrl}`,
    `REDIS_URL=${redisUrl}`,
    `AUTH_SECRET=${randomSecret(32)}`,
    "AUTH_TRUST_HOST=true",
    `ENCRYPTION_MASTER_KEY=${randomSecret(32)}`,
    "CLOUD_RUNTIME_MODE=worker",
    "CLOUD_QUOTA_ENFORCEMENT=false",
    `CLOUD_HEALTH_DETAILS_TOKEN=${randomSecret(24)}`,
    "",
    "# Optional OAuth providers",
    "AUTH_GITHUB_ID=",
    "AUTH_GITHUB_SECRET=",
    "AUTH_GOOGLE_ID=",
    "AUTH_GOOGLE_SECRET=",
    "",
  ].join("\n");
}

export function validateSelfHostEnv(content: string): SelfHostEnvReport {
  const env = parseEnv(content);
  const missing: string[] = [];
  const placeholder: string[] = [];
  const warnings: string[] = [];

  for (const key of REQUIRED_ENV_KEYS) {
    const value = env[key];
    if (!value) {
      missing.push(key);
      continue;
    }
    if (isPlaceholder(value)) placeholder.push(key);
  }

  if (env.NEXT_PUBLIC_APP_URL && !/^https?:\/\//.test(env.NEXT_PUBLIC_APP_URL)) {
    warnings.push("NEXT_PUBLIC_APP_URL should include http:// or https://");
  }
  if (env.AUTH_URL && !/^https?:\/\//.test(env.AUTH_URL)) {
    warnings.push("AUTH_URL should include http:// or https://");
  }
  if (env.ENCRYPTION_MASTER_KEY && env.ENCRYPTION_MASTER_KEY.length < 32) {
    warnings.push("ENCRYPTION_MASTER_KEY should be at least 32 characters");
  }

  return {
    ok: missing.length === 0 && placeholder.length === 0,
    missing,
    placeholder,
    warnings,
  };
}

export function buildSelfHostDeployPlan(options: SelfHostDeployPlanOptions): SelfHostDeployStep[] {
  const steps: SelfHostDeployStep[] = [
    { label: "Check Docker", command: "docker", args: ["--version"], cwd: options.directory },
  ];
  if (options.pull ?? true) {
    steps.push({
      label: "Pull Cloud images",
      command: "docker",
      args: ["compose", "pull"],
      cwd: options.directory,
    });
  }
  steps.push(
    {
      label: "Start Cloud stack",
      command: "docker",
      args: ["compose", "up", "-d"],
      cwd: options.directory,
    },
    {
      label: "Show Cloud stack status",
      command: "docker",
      args: ["compose", "ps"],
      cwd: options.directory,
    },
  );
  return steps;
}

export function prepareSelfHostDirectory(options: PrepareSelfHostOptions): {
  written: string[];
  envPath: string;
  report: SelfHostEnvReport;
} {
  if (!existsSync(options.directory)) mkdirSync(options.directory, { recursive: true });
  const files = buildSelfHostFiles(options);
  const written: string[] = [];
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(options.directory, relativePath);
    if (existsSync(filePath) && !options.force) continue;
    writeFileSync(filePath, content);
    written.push(filePath);
  }
  const envPath = join(options.directory, ".env");

  if (!existsSync(envPath)) {
    if (options.autoEnv ?? true) {
      writeFileSync(envPath, generateSelfHostEnv(options));
      written.push(envPath);
    } else {
      copyFileSync(join(options.directory, ".env.example"), envPath);
      written.push(envPath);
    }
  }

  const report = validateSelfHostEnv(readFileSync(envPath, "utf-8"));
  return { written, envPath, report };
}

export function writeSelfHostFiles(options: WriteSelfHostOptions): string[] {
  if (!existsSync(options.directory)) mkdirSync(options.directory, { recursive: true });
  const files = buildSelfHostFiles(options);
  const written: string[] = [];

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(options.directory, relativePath);
    if (existsSync(filePath) && !options.force) {
      throw new Error(`${filePath} already exists. Re-run with --force to overwrite.`);
    }
    writeFileSync(filePath, content);
    written.push(filePath);
  }
  return written;
}

function parseEnv(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key) env[key] = value;
  }
  return env;
}

function randomSecret(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

function isPlaceholder(value: string): boolean {
  return value.length === 0 || /replace-with|change-me|your-/i.test(value);
}
