export type TemplateCertificationCheckId =
  | "compile"
  | "audit"
  | "tests"
  | "deploy"
  | "package";

export interface TemplateCertificationCheck {
  id: TemplateCertificationCheckId;
  label: string;
  ok: boolean;
  value: string;
}

export interface TemplateCertificationInput {
  compileStatus?: string | null;
  testStatus?: string | null;
  auditScore?: number | null;
  auditSummary?: {
    critical?: number | null;
    high?: number | null;
  } | null;
  hasDeployInstructions?: boolean;
  hasCodePackage?: boolean;
}

export interface TemplateCertificationResult {
  certified: boolean;
  auditScore: number;
  compileStatus: string;
  testStatus: string;
  checks: TemplateCertificationCheck[];
  missing: string[];
}

export const CERTIFICATION_TAG = "solstudio-certified";

export function evaluateMarketplaceCertification(
  input: TemplateCertificationInput,
): TemplateCertificationResult {
  const compileStatus = input.compileStatus ?? "MISSING";
  const testStatus = input.testStatus ?? "MISSING";
  const auditScore = input.auditScore ?? 0;
  const critical = input.auditSummary?.critical ?? 0;
  const high = input.auditSummary?.high ?? 0;

  const checks: TemplateCertificationCheck[] = [
    {
      id: "compile",
      label: "Compile",
      ok: compileStatus === "SUCCESS",
      value: compileStatus,
    },
    {
      id: "audit",
      label: "Audit",
      ok: auditScore >= 80 && critical === 0 && high === 0,
      value:
        auditScore > 0
          ? `${auditScore}/100${critical || high ? `, ${critical} critical, ${high} high` : ""}`
          : "MISSING",
    },
    {
      id: "tests",
      label: "Tests",
      ok: testStatus === "PASSED",
      value: testStatus,
    },
    {
      id: "deploy",
      label: "Deploy notes",
      ok: input.hasDeployInstructions === true,
      value: input.hasDeployInstructions ? "READY" : "MISSING",
    },
    {
      id: "package",
      label: "Export package",
      ok: input.hasCodePackage !== false,
      value: input.hasCodePackage === false ? "MISSING" : "READY",
    },
  ];

  const missing = checks
    .filter((check) => !check.ok)
    .map((check) => check.label);

  return {
    certified: missing.length === 0,
    auditScore,
    compileStatus,
    testStatus,
    checks,
    missing,
  };
}

export function hasDeployInstructionsText(value: string | null | undefined): boolean {
  if (!value) return false;
  return /\b(deploy|deployment|devnet|mainnet|localnet|anchor deploy|solana program deploy)\b/i.test(
    value,
  );
}

export function applyCertificationTag(tags: string[], certified: boolean): string[] {
  const base = tags.filter((tag) => tag !== CERTIFICATION_TAG);
  if (!certified) return base;
  return [...base.slice(0, 9), CERTIFICATION_TAG];
}

export function isCertifiedTag(tag: string): boolean {
  return tag === CERTIFICATION_TAG;
}
