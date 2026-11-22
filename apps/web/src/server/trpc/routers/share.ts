import { randomBytes } from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { sanitizeFlowForMarketplace } from "@/lib/marketplace/sanitize";
import type { ProgramIR } from "@solflow/ir";

export const shareRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        title: z.string().max(120).optional(),
        description: z.string().max(240).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId },
        select: {
          id: true,
          name: true,
          description: true,
          flowData: true,
          irData: true,
          auditReports: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { score: true, summary: true, findings: true },
          },
        },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      if (!project.flowData) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Save the project before creating a share link.",
        });
      }

      const flowData = project.flowData as any;
      const irData = project.irData as ProgramIR | null;
      const sanitized = irData
        ? sanitizeFlowForMarketplace(flowData, irData)
        : { sanitizedFlow: sanitizeFlowOnly(flowData), sanitizedIR: null };
      const sanitizedIrData = sanitized.sanitizedIR
        ? (sanitized.sanitizedIR as object)
        : undefined;

      const content = {
        title: input.title ?? project.name,
        description: input.description ?? project.description,
        flowData: sanitized.sanitizedFlow as object,
        irData: sanitizedIrData,
        auditSummary: project.auditReports[0]
          ? {
              score: project.auditReports[0].score,
              summary: project.auditReports[0].summary,
              findings: project.auditReports[0].findings,
            }
          : undefined,
      };

      // One live link per project: refresh its snapshot instead of minting a
      // new slug on every click.
      const active = await ctx.prisma.projectShare.findFirst({
        where: { projectId: project.id, userId, revokedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      const share = active
        ? await ctx.prisma.projectShare.update({
            where: { id: active.id },
            data: content,
            select: { slug: true },
          })
        : await ctx.prisma.projectShare.create({
            data: {
              slug: await createUniqueSlug(ctx.prisma),
              projectId: project.id,
              userId,
              ...content,
            },
            select: { slug: true },
          });

      return { slug: share.slug, url: shareUrl(share.slug), reused: !!active };
    }),

  // Revoke every live link for a project. /share/[slug] only serves rows with
  // revokedAt = null, so revoked links 404 right away.
  revoke: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
      const result = await ctx.prisma.projectShare.updateMany({
        where: { projectId: input.projectId, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { revoked: result.count };
    }),

  // The project's live link, if any (lets the UI show "copy" / "revoke").
  getActive: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
      const share = await ctx.prisma.projectShare.findFirst({
        where: { projectId: input.projectId, userId, revokedAt: null },
        orderBy: { createdAt: "desc" },
        select: { slug: true },
      });
      return share ? { slug: share.slug, url: shareUrl(share.slug) } : null;
    }),
});

function shareUrl(slug: string): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://solstudio.fun";
  return `${origin.replace(/\/$/, "")}/share/${slug}`;
}

async function createUniqueSlug(prisma: any): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const slug = randomBytes(9).toString("base64url");
    const existing = await prisma.projectShare.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) return slug;
  }
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Could not create a unique share slug.",
  });
}

function sanitizeFlowOnly(flowData: any) {
  const cloned = JSON.parse(JSON.stringify(flowData));
  for (const node of cloned.nodes ?? []) {
    if (node?.data && typeof node.data === "object") {
      delete node.data.programId;
      delete node.data.secretKey;
      delete node.data.privateKey;
      delete node.data.mnemonic;
      delete node.data.apiKey;
      delete node.data.bearerToken;
    }
  }
  return cloned;
}
