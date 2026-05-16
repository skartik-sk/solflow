import { describe, expect, it } from "vitest";
import {
  buildSelfHostDeployPlan,
  buildSelfHostFiles,
  generateSelfHostEnv,
  validateSelfHostEnv,
} from "../utils/cloud-self-host";

describe("cloud self-host templates", () => {
  it("generates a cloud-only compose kit", () => {
    const files = buildSelfHostFiles({
      domain: "cloud.example.com",
      image: "ghcr.io/skartik-sk/solstudio-cloud:latest",
    });

    expect(files["docker-compose.yml"]).toContain("solstudio-cloud");
    expect(files["docker-compose.yml"]).toContain("cloud-worker");
    expect(files["docker-compose.yml"]).not.toContain("apps/web");
    expect(files["docker-compose.yml"]).toContain("dist-server/server.js");
    expect(files["docker-compose.yml"]).toContain("dist-server/worker.js");
    expect(files["docker-compose.yml"]).toContain("../../packages/db/prisma/schema.prisma");
    expect(files[".env.example"]).toContain("ENCRYPTION_MASTER_KEY=");
    expect(files["README.md"]).toContain("solstudio cloud login");
    expect(files["README.md"]).toContain("cloud.example.com");
  });

  it("generates deployable env values without placeholders", () => {
    const env = generateSelfHostEnv({ domain: "cloud.example.com" });

    expect(env).toContain("NEXT_PUBLIC_APP_URL=https://cloud.example.com");
    expect(env).toContain("DATABASE_URL=postgresql://");
    expect(env).not.toContain("replace-with");
    expect(validateSelfHostEnv(env).ok).toBe(true);
  });

  it("reports missing and placeholder env values before deploy", () => {
    const report = validateSelfHostEnv([
      "NEXT_PUBLIC_APP_URL=https://cloud.example.com",
      "DATABASE_URL=postgresql://solstudio:solstudio@postgres:5432/solstudio_cloud",
      "REDIS_URL=redis://redis:6379",
      "AUTH_SECRET=replace-with-openssl-rand-base64-32",
    ].join("\n"));

    expect(report.ok).toBe(false);
    expect(report.missing).toContain("ENCRYPTION_MASTER_KEY");
    expect(report.placeholder).toContain("AUTH_SECRET");
  });

  it("builds a one-command docker compose deployment plan", () => {
    const plan = buildSelfHostDeployPlan({
      directory: "/srv/solstudio-cloud",
      pull: true,
    });

    expect(plan.map((step) => step.label)).toEqual([
      "Check Docker",
      "Pull Cloud images",
      "Start Cloud stack",
      "Show Cloud stack status",
    ]);
    expect(plan[2]?.command).toBe("docker");
    expect(plan[2]?.args).toEqual(["compose", "up", "-d"]);
  });
});
