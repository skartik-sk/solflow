import { prisma } from "@solflow/db";
import { extractBearerToken, hashCliToken } from "./tokens";

export class CloudCliAuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "CloudCliAuthError";
    this.status = status;
  }
}

export interface CloudCliContext {
  apiKeyId: string;
  apiKeyName: string;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    walletAddress: string | null;
  };
}

export async function authenticateCloudCliRequest(request: Request): Promise<CloudCliContext> {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) throw new CloudCliAuthError(401, "Missing bearer token");

  const hashed = hashCliToken(token);
  const apiKey = await prisma.apiKey.findFirst({
    where: { key: { in: [hashed, token] } },
    select: {
      id: true,
      name: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          walletAddress: true,
        },
      },
    },
  });

  if (!apiKey) throw new CloudCliAuthError(401, "Invalid bearer token");
  if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) {
    throw new CloudCliAuthError(401, "Bearer token expired");
  }

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    apiKeyId: apiKey.id,
    apiKeyName: apiKey.name,
    user: apiKey.user,
  };
}
