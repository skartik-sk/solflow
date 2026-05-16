import { createHash, randomBytes } from "crypto";

export function generateCliToken(): string {
  return `sst_${randomBytes(32).toString("base64url")}`;
}

export function hashCliToken(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}

export function extractBearerToken(authorization: string | null): string | undefined {
  if (!authorization) return undefined;
  const match = authorization.match(/^bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

export function redactCliToken(token: string): string {
  if (token.length <= 8) return "****";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}
