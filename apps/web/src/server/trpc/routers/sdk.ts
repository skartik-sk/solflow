// apps/web/src/server/trpc/routers/sdk.ts
// SDK generation router — uses @solflow/sdk-gen to produce TypeScript clients.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { zipSync } from "fflate";
import { router, protectedProcedure } from "../trpc";
import { generateSDK } from "@solflow/sdk-gen";
import type { ProgramIR } from "@solflow/ir";

export const sdkRouter = router({
  generate: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Fetch project with IR data
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.session.user.id },
        select: { id: true, irData: true, name: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      if (!project.irData) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Project has no IR data. Save the flow first.",
        });
      }

      // 2. Cast stored JSON to ProgramIR (already validated on save)
      const ir = project.irData as unknown as ProgramIR;

      // 3. Generate SDK via Codama
      const result = await generateSDK(ir);

      return {
        files: result.files,
        packageName: result.packageName,
        idlJson: result.idlJson,
        downloadUrl: `/api/sdk/${input.projectId}/download`,
      };
    }),

  download: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Fetch project IR
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.session.user.id },
        select: { id: true, irData: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      if (!project.irData) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Project has no IR data.",
        });
      }

      const ir = project.irData as unknown as ProgramIR;
      const result = await generateSDK(ir);

      // Zip all files
      const entries: Record<string, Uint8Array> = {};
      for (const file of result.files) {
        entries[file.path] = new TextEncoder().encode(file.content);
      }
      const zipBytes = zipSync(entries);
      const base64 = Buffer.from(zipBytes).toString("base64");

      return {
        base64,
        filename: `${result.packageName.replace(/\//g, "-")}-sdk.zip`,
      };
    }),
});
