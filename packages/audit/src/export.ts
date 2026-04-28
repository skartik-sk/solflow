import type {
  AuditExportFormat,
  AuditFinding,
  AuditReport,
  AuditSeverity,
} from "./types";
import { getFixSuggestion } from "./fixes";

export interface AuditExportContext {
  projectName?: string;
  projectPath?: string;
  framework?: string;
  parseStats?: unknown;
  parserReport?: unknown;
}

export function formatAuditReport(
  report: AuditReport,
  format: AuditExportFormat,
  context: AuditExportContext = {},
): string {
  switch (format) {
    case "json":
      return JSON.stringify({ report, ...context }, null, 2);
    case "markdown":
      return formatMarkdown(report, context);
    case "sarif":
      return JSON.stringify(formatSarif(report, context), null, 2);
    case "summary":
      return formatSummary(report, context);
    default:
      return assertNever(format);
  }
}

export function formatSummary(
  report: AuditReport,
  context: AuditExportContext = {},
): string {
  const lines: string[] = [];
  if (context.projectName) lines.push(`Project      : ${context.projectName}`);
  if (context.framework) lines.push(`Framework    : ${context.framework}`);
  lines.push(`Score        : ${report.score}/100`);
  lines.push(`Findings     : ${report.findings.length}`);
  lines.push(
    `Severity     : ${(["critical", "high", "medium", "low", "info"] as AuditSeverity[])
      .map((severity) => `${severity}=${report.summary[severity]}`)
      .join(", ")}`,
  );
  lines.push(`Stress cases : ${report.stressSummary.total}`);

  const topFindings = report.findings.slice(0, 8);
  if (topFindings.length > 0) {
    lines.push("");
    lines.push("Top findings:");
    for (const finding of topFindings) {
      const location = formatFindingLocation(finding);
      lines.push(
        `  - [${finding.severity}] ${finding.ruleId}: ${finding.title}${location ? ` (${location})` : ""}`,
      );
    }
  }

  const highSignalStress = report.stressTests
    .filter((test) => test.severity !== "info")
    .slice(0, 10);
  if (highSignalStress.length > 0) {
    lines.push("");
    lines.push("Deterministic stress:");
    for (const test of highSignalStress) {
      lines.push(
        `  - [${test.severity}] ${test.instructionName}: ${test.title} -> ${test.expected}`,
      );
    }
  }

  if (report.findings.length === 0 && report.stressSummary.total === 0) {
    lines.push("");
    lines.push("No findings or deterministic stress cases were generated.");
  }

  return lines.join("\n");
}

export function formatMarkdown(
  report: AuditReport,
  context: AuditExportContext = {},
): string {
  const lines: string[] = [];
  lines.push(`# SolStudio Audit Report`);
  lines.push("");
  lines.push(`- Score: **${report.score}/100**`);
  lines.push(`- Findings: **${report.findings.length}**`);
  lines.push(`- Stress cases: **${report.stressSummary.total}**`);
  if (context.framework) lines.push(`- Framework: **${context.framework}**`);
  if (context.projectPath) lines.push(`- Project path: \`${context.projectPath}\``);
  lines.push("");
  lines.push("## Severity");
  lines.push("");
  lines.push("| Critical | High | Medium | Low | Info |");
  lines.push("| ---: | ---: | ---: | ---: | ---: |");
  lines.push(
    `| ${report.summary.critical} | ${report.summary.high} | ${report.summary.medium} | ${report.summary.low} | ${report.summary.info} |`,
  );
  lines.push("");

  lines.push("## Findings");
  lines.push("");
  if (report.findings.length === 0) {
    lines.push("No static findings.");
  } else {
    for (const finding of report.findings) {
      const fix = getFixSuggestion(finding);
      lines.push(`### ${finding.ruleId} - ${finding.title}`);
      lines.push("");
      lines.push(`- Severity: **${finding.severity}**`);
      if (finding.standardIds?.length) {
        lines.push(`- Standard: ${finding.standardIds.join(", ")}`);
      }
      const location = formatFindingLocation(finding);
      if (location) lines.push(`- Location: \`${location}\``);
      const sourceLocation = formatSourceLocation(finding);
      if (sourceLocation) lines.push(`- Source: \`${sourceLocation}\``);
      if (finding.location.nodeId) lines.push(`- Node: \`${finding.location.nodeId}\``);
      lines.push(`- Description: ${finding.description}`);
      lines.push(`- Recommendation: ${finding.recommendation}`);
      lines.push(`- Graph fix: ${fix.graphAction ?? "Manual review"}`);
      lines.push(`- Code fix: ${fix.codeAction ?? "Manual review"}`);
      lines.push("");
    }
  }

  lines.push("## Deterministic Stress Cases");
  lines.push("");
  if (report.stressTests.length === 0) {
    lines.push("No deterministic stress cases were generated.");
  } else {
    lines.push("| ID | Severity | Instruction | Category | Expected |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const test of report.stressTests) {
      lines.push(
        `| \`${escapeTable(test.id)}\` | ${test.severity} | \`${escapeTable(test.instructionName)}\` | ${test.category} | ${test.expected} |`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

export function formatSarif(
  report: AuditReport,
  context: AuditExportContext = {},
) {
  const rules = Array.from(
    new Map(
      report.findings.map((finding) => [
        finding.ruleId,
        {
          id: finding.ruleId,
          shortDescription: { text: finding.title },
          fullDescription: { text: finding.description },
          help: { text: finding.recommendation },
          properties: {
            standardIds: finding.standardIds ?? [],
            severity: finding.severity,
          },
        },
      ]),
    ).values(),
  );

  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "SolStudio Audit",
            informationUri: "https://solstudio.fun",
            rules,
          },
        },
        results: report.findings.map((finding) => ({
          ruleId: finding.ruleId,
          level: sarifLevel(finding.severity),
          message: {
            text: `${finding.title}. ${finding.recommendation}`,
          },
          locations: [
            {
              physicalLocation: buildPhysicalLocation(finding, context),
              logicalLocations: [
                {
                  name: formatFindingLocation(finding) || finding.ruleId,
                  kind: finding.location.accountName ? "member" : "function",
                },
              ],
            },
          ],
          properties: {
            severity: finding.severity,
            standardIds: finding.standardIds ?? [],
            nodeId: finding.location.nodeId,
            fix: getFixSuggestion(finding),
          },
        })),
      },
    ],
  };
}

function buildPhysicalLocation(
  finding: AuditFinding,
  context: AuditExportContext,
) {
  const uri = finding.location.file ?? context.projectPath ?? ".";
  const region =
    typeof finding.location.line === "number" && finding.location.line > 0
      ? {
          startLine: finding.location.line,
          ...(typeof finding.location.column === "number" && finding.location.column > 0
            ? { startColumn: finding.location.column }
            : {}),
        }
      : undefined;

  return {
    artifactLocation: { uri },
    ...(region ? { region } : {}),
  };
}

function sarifLevel(severity: AuditSeverity): "error" | "warning" | "note" {
  if (severity === "critical" || severity === "high") return "error";
  if (severity === "medium" || severity === "low") return "warning";
  return "note";
}

function formatFindingLocation(finding: AuditFinding): string {
  return [
    finding.location.instructionName,
    finding.location.accountName,
  ].filter(Boolean).join(" > ");
}

function formatSourceLocation(finding: AuditFinding): string {
  if (!finding.location.file) return "";
  const line = finding.location.line ? `:${finding.location.line}` : "";
  const column = finding.location.column ? `:${finding.location.column}` : "";
  return `${finding.location.file}${line}${column}`;
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function assertNever(value: never): never {
  throw new Error(`Unsupported audit export format: ${String(value)}`);
}
