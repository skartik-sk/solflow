import type { Prisma } from "@solflow/db";

export const cloudWalletPublicSelect = {
  id: true,
  label: true,
  publicKey: true,
  network: true,
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CloudWalletSelect;

export const cloudCredentialPublicSelect = {
  id: true,
  label: true,
  type: true,
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CloudCredentialSelect;

export const workflowVersionPublicSelect = {
  id: true,
  workflowId: true,
  version: true,
  label: true,
  definition: true,
  settings: true,
  createdAt: true,
} satisfies Prisma.WorkflowVersionSelect;

export const workflowPublicSelect = {
  id: true,
  userId: true,
  name: true,
  description: true,
  status: true,
  definition: true,
  settings: true,
  cronExpression: true,
  cronTimezone: true,
  nextRunAt: true,
  webhookPath: true,
  tags: true,
  walletId: true,
  createdAt: true,
  updatedAt: true,
  wallet: { select: cloudWalletPublicSelect },
} satisfies Prisma.WorkflowSelect;

export const secretResponseFieldNames = new Set([
  "deployerKeypair",
  "programKeypair",
  "encryptedKey",
  "keyIv",
  "keyTag",
  "keySalt",
  "encryptedData",
  "dataIv",
  "dataTag",
  "dataSalt",
  "webhookSecret",
]);

export function findSecretResponseFields(value: unknown, path = "$"): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findSecretResponseFields(item, `${path}[${index}]`));
  }

  const found: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (secretResponseFieldNames.has(key)) {
      found.push(childPath);
      continue;
    }
    found.push(...findSecretResponseFields(child, childPath));
  }
  return found;
}
