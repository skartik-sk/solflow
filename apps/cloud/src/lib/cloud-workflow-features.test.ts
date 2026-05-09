import { describe, expect, it } from "vitest";
import {
  buildAssistantWorkflowDraft,
  createSimulationReport,
  evaluateCloudTemplateCertification,
  redactPreviewValue,
} from "./cloud-workflow-features";

describe("cloud workflow feature helpers", () => {
  it("creates an assistant workflow from a wallet activity prompt", () => {
    const draft = buildAssistantWorkflowDraft("watch wallet activity and alert my webhook");

    expect(draft.matchedIntent).toBe("wallet-activity-alert");
    expect(draft.definition.nodes.map((node) => node.type)).toEqual([
      "trigger:cron",
      "action:helius-wallet-activity",
      "output:webhook",
    ]);
    expect(draft.settings.safety?.simulationRequired).toBe(true);
  });

  it("simulates wallet actions with fee and approval warnings", () => {
    const report = createSimulationReport(
      {
        nodes: [
          { id: "n1", type: "trigger:manual", data: {} },
          {
            id: "n2",
            type: "action:jupiter-swap",
            data: {
              operation: "swap-direct-send",
              inputMint: "USDC",
              outputMint: "SOL",
              amount: "1000000",
            },
          },
        ],
        edges: [{ id: "e1", source: "n1", target: "n2" }],
      },
      {
        safety: {
          simulationRequired: true,
          manualApprovalRequired: true,
          walletAutomationAllowed: false,
        },
      },
    );

    expect(report.blocked).toBe(false);
    expect(report.riskLevel).toBe("medium");
    expect(report.walletActions).toBe(1);
    expect(report.estimatedFeeLamports).toBe(5000);
    expect(report.walletDeltas.map((delta) => delta.asset)).toEqual(["USDC", "SOL"]);
  });

  it("certifies a complete cloud template and redacts preview secrets", () => {
    const certification = evaluateCloudTemplateCertification({
      nodeTypes: ["trigger:cron", "action:oracle-price", "logic:if-else", "output:webhook"],
      settings: {
        safety: {
          simulationRequired: true,
          manualApprovalRequired: true,
        },
      },
    });

    expect(certification.certified).toBe(true);
    expect(redactPreviewValue({ credentialId: "cred_123", inputMint: "USDC" })).toEqual({
      credentialId: "[redacted]",
      inputMint: "USDC",
    });
  });
});
