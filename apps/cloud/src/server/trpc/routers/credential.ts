import { z } from "zod";
import { Prisma } from "@solflow/db";
import { encryptString } from "@solflow/cloud-wallet";
import { router, protectedProcedure } from "../trpc";
import { cloudCredentialPublicSelect } from "../public-selects";

const credentialTypeSchema = z.enum([
  "openai",
  "anthropic",
  "birdeye",
  "jupiter",
  "webhook",
]);

const secretDataSchema = z.record(z.string(), z.unknown()).refine(
  (data) => Object.keys(data).length > 0,
  "Credential data is required",
);

function getMasterKey(): string {
  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKey) {
    throw new Error("ENCRYPTION_MASTER_KEY not configured");
  }
  return masterKey;
}

function validateCredentialData(type: z.infer<typeof credentialTypeSchema>, data: Record<string, unknown>) {
  if (type === "webhook") {
    const hasBearer = typeof data.bearerToken === "string" && data.bearerToken.length > 0;
    const hasApiKey = typeof data.apiKey === "string" && data.apiKey.length > 0;
    const hasHeaders = data.headers && typeof data.headers === "object" && !Array.isArray(data.headers);
    if (!hasBearer && !hasApiKey && !hasHeaders) {
      throw new Error("Webhook credentials require bearerToken, apiKey, or headers");
    }
    return;
  }

  if (typeof data.apiKey !== "string" || data.apiKey.length === 0) {
    throw new Error(`${type} credentials require apiKey`);
  }
}

function encryptedPayload(data: Record<string, unknown>) {
  const encrypted = encryptString(JSON.stringify(data), getMasterKey());
  return {
    encryptedData: encrypted.encrypted,
    dataIv: encrypted.iv,
    dataTag: encrypted.tag,
    dataSalt: encrypted.salt,
  };
}

export const credentialRouter = router({
  list: protectedProcedure
    .input(z.object({ types: z.array(credentialTypeSchema).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.prisma.cloudCredential.findMany({
        where: {
          userId: ctx.session.user.id,
          ...(input?.types?.length ? { type: { in: input.types } } : {}),
        },
        orderBy: { createdAt: "desc" },
        select: cloudCredentialPublicSelect,
      });
    }),

  create: protectedProcedure
    .input(z.object({
      label: z.string().trim().min(1).max(80),
      type: credentialTypeSchema,
      data: secretDataSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      validateCredentialData(input.type, input.data);
      return ctx.prisma.cloudCredential.create({
        data: {
          user: { connect: { id: ctx.session.user.id } },
          label: input.label,
          type: input.type,
          ...encryptedPayload(input.data),
        },
        select: cloudCredentialPublicSelect,
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      label: z.string().trim().min(1).max(80).optional(),
      data: secretDataSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.cloudCredential.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        select: { id: true, type: true },
      });
      if (!existing) throw new Error("Credential not found");

      const data: Prisma.CloudCredentialUpdateInput = {};
      if (input.label) data.label = input.label;
      if (input.data) {
        validateCredentialData(existing.type as z.infer<typeof credentialTypeSchema>, input.data);
        Object.assign(data, encryptedPayload(input.data));
      }

      return ctx.prisma.cloudCredential.update({
        where: { id: input.id },
        data,
        select: cloudCredentialPublicSelect,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.cloudCredential.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!existing) throw new Error("Credential not found");

      return ctx.prisma.cloudCredential.delete({
        where: { id: input.id },
        select: cloudCredentialPublicSelect,
      });
    }),
});
