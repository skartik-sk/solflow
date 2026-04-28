// apps/web/src/server/trpc/routers/audit.ts
// Security audit router — local rules + optional external audit API.
// Per docs/architecture/14-audit-system.md

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import type { ProgramIR } from "@solflow/ir";
import type {
  AuditFinding,
  AuditStressSummary,
  AuditStressTestCase,
} from "@solflow/audit";

// ─── External API types ──────────────────────────────────────────────────────

interface ExternalAuditResponse {
  findings?: Array<{
    ruleId?: string;
    rule_id?: string;
    severity: string;
    title: string;
    description: string;
    recommendation?: string;
    location?: {
      instructionName?: string;
      instruction_name?: string;
      accountName?: string;
      account_name?: string;
    };
  }>;
  error?: string;
}

function normalizeExternalFindings(
  data: ExternalAuditResponse,
): AuditFinding[] {
  if (!data.findings) return [];
  return data.findings.map((f) => ({
    ruleId: f.ruleId ?? f.rule_id ?? "EXT-000",
    severity: (f.severity as AuditFinding["severity"]) ?? "info",
    title: f.title ?? "External finding",
    description: f.description ?? "",
    recommendation: f.recommendation ?? "",
    location: {
      instructionName:
        f.location?.instructionName ?? f.location?.instruction_name,
      accountName: f.location?.accountName ?? f.location?.account_name,
    },
  }));
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const auditRouter = router({
  // ── Run full audit (local rules + optional external API) ──────────────────
  run: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        /** Optional API key to forward to the external audit service */
        apiKey: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.session.user.id },
        select: { id: true, irData: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      // ── 1. Run local IR rules ──────────────────────────────────────────────
      let localFindings: AuditFinding[] = [];
      let localScore = 100;
      let stressTests: AuditStressTestCase[] = [];
      let stressSummary: AuditStressSummary | undefined;

      if (project.irData) {
        const { runInstantAudit } = await import("@solflow/audit");
        const ir = project.irData as ProgramIR;
        const report = runInstantAudit(ir);
        localFindings = report.findings;
        localScore = report.score;
        stressTests = report.stressTests;
        stressSummary = report.stressSummary;
      }

      // ── 2. Call external audit API (if configured) ────────────────────────
      let externalFindings: AuditFinding[] = [];
      const auditApiUrl = process.env.AUDIT_API_URL;

      if (auditApiUrl && project.irData) {
        try {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          const resolvedKey = input.apiKey ?? process.env.AUDIT_API_KEY ?? "";
          if (resolvedKey) {
            headers["Authorization"] = `Bearer ${resolvedKey}`;
          }

          const response = await fetch(auditApiUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({ ir: project.irData }),
            signal: AbortSignal.timeout(30_000), // 30s timeout
          });

          if (response.ok) {
            const data = (await response.json()) as ExternalAuditResponse;
            externalFindings = normalizeExternalFindings(data);
          }
          // If the external API fails, we silently fall back to local-only results.
        } catch {
          // Non-fatal — external API is optional
        }
      }

      // ── 3. Merge findings ─────────────────────────────────────────────────
      const allFindings = [...localFindings, ...externalFindings];

      const severityPenalty: Record<string, number> = {
        critical: 25,
        high: 15,
        medium: 7,
        low: 3,
        info: 0,
      };
      const extraPenalty = externalFindings.reduce(
        (acc, f) => acc + (severityPenalty[f.severity] ?? 0),
        0,
      );
      const mergedScore = Math.max(0, localScore - extraPenalty);

      const summary = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
      for (const f of allFindings) {
        const key = f.severity as keyof typeof summary;
        if (key in summary) summary[key]++;
      }

      // ── 4. Persist AuditReport to DB ──────────────────────────────────────
      const saved = await ctx.prisma.auditReport.create({
        data: {
          projectId: input.projectId, irHash: "manual-run", auditType: "STATIC_ANALYSIS",
          findings: allFindings as any,
          score: mergedScore,
          summary: {
            ...summary,
            stress: stressSummary?.total ?? stressTests.length,
          } as any,
        },
      });

      return {
        reportId: saved.id,
        status: "complete",
        findings: allFindings,
        score: mergedScore,
        summary,
        stressTests,
        stressSummary,
        externalCount: externalFindings.length,
        hasExternalApi: !!auditApiUrl,
      };
    }),

  // ── Get latest audit report ───────────────────────────────────────────────
  latest: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.prisma.auditReport.findFirst({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "desc" },
      });
    }),
});
