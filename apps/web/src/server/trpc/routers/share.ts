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

      const slug = await createUniqueSlug(ctx.prisma);
      const share = await ctx.prisma.projectShare.create({
        data: {
          slug,
          projectId: project.id,
          userId,
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
        },
        select: { slug: true },
      });

      const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://solstudio.fun";
      return {
        slug: share.slug,
        url: `${origin.replace(/\/$/, "")}/share/${share.slug}`,
      };
    }),
});

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
