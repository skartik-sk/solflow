import { describe, expect, it } from "vitest";
import {
  buildAssistantWorkflowDraft,
  createSimulationReport,
  evaluateCloudTemplateCertification,
  redactPreviewValue,
} from "./cloud-workflow-features";

describe("cloud workflow feature helpers", () => {
  it("creates an assistant workflow from a wallet activity prompt with inspectable output", () => {
    const draft = buildAssistantWorkflowDraft("watch wallet activity and show the result");

    expect(draft.matchedIntent).toBe("wallet-activity-alert");
    expect(draft.definition.nodes.map((node) => node.type)).toEqual([
      "trigger:cron",
      "action:helius-wallet-activity",
      "output:display",
    ]);
    expect(draft.definition.nodes[1]?.data?.address).not.toContain("YOUR_");
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

  it("warns when a wallet action is missing required runtime fields", () => {
    const report = createSimulationReport(
      {
        nodes: [
          { id: "n1", type: "trigger:manual", data: {} },
          {
            id: "n2",
            type: "action:token-transfer",
            data: {
              to: "",
              amount: "1000",
              token: "So11111111111111111111111111111111111111112",
              walletId: "",
            },
          },
        ],
        edges: [{ id: "e1", source: "n1", target: "n2" }],
      },
      {
        safety: {
          simulationRequired: true,
          manualApprovalRequired: true,
        },
      },
    );

    expect(report.walletDeltas[0]?.asset).toBe("So11111111111111111111111111111111111111112");
    expect(report.transactionPlan[0]?.effect).toContain("configured recipient");
    expect(report.warnings.join("\n")).toContain("Token Transfer destination");
    expect(report.warnings.join("\n")).toContain("Token Transfer source wallet");
  });

  it("simulates Umbra transfer plans as wallet and external actions", () => {
    const report = createSimulationReport(
      {
        nodes: [
          { id: "n1", type: "trigger:manual", data: {} },
          {
            id: "n2",
            type: "action:umbra-transfer",
            data: {
              recipientAddress: "",
              amountBaseUnits: "1000000",
              mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
              senderWalletId: "",
            },
          },
        ],
        edges: [{ id: "e1", source: "n1", target: "n2" }],
      },
      {
        safety: {
          simulationRequired: true,
          manualApprovalRequired: true,
        },
      },
    );

    expect(report.walletActions).toBe(1);
    expect(report.externalCalls).toBe(1);
    expect(report.walletDeltas[0]?.reason).toBe("Umbra private transfer plan");
    expect(report.transactionPlan[0]?.effect).toContain("Umbra private transfer");
    expect(report.warnings.join("\n")).toContain("Umbra Transfer recipient");
    expect(report.warnings.join("\n")).toContain("Umbra Transfer sender wallet");
  });

  it("creates an assistant workflow for Umbra privacy prompts", () => {
    const draft = buildAssistantWorkflowDraft("make an Umbra private transfer");

    expect(draft.matchedIntent).toBe("umbra-private-transfer-plan");
    expect(draft.definition.nodes.map((node) => node.type)).toEqual([
      "trigger:manual",
      "action:umbra-relayer-info",
      "action:umbra-transfer",
      "output:result",
    ]);
  });

  it("creates and simulates a Solana RPC workflow", () => {
    const draft = buildAssistantWorkflowDraft("check rpcfast rpc health");
    expect(draft.matchedIntent).toBe("solana-rpc-check");
    expect(draft.definition.nodes.map((node) => node.type)).toEqual([
      "trigger:manual",
      "action:solana-rpc",
      "output:display",
    ]);

    const report = createSimulationReport(draft.definition, draft.settings);
    expect(report.externalCalls).toBe(1);
    expect(report.transactionPlan[0]?.effect).toContain("getHealth");
  });

  it("creates a Helius webhook source workflow", () => {
    const draft = buildAssistantWorkflowDraft("set up a helius webhook source");
    expect(draft.matchedIntent).toBe("helius-webhook-source");
    expect(draft.definition.nodes.map((node) => node.type)).toEqual([
      "trigger:manual",
      "action:helius-webhook-create",
      "output:result",
    ]);
  });

  it("creates a Jito readiness workflow", () => {
    const draft = buildAssistantWorkflowDraft("check jito tip floor before bundle");
    expect(draft.matchedIntent).toBe("jito-tip-check");
    expect(draft.definition.nodes.map((node) => node.type)).toEqual([
      "trigger:manual",
      "action:jito-tip-floor",
      "action:jito-tip-accounts",
      "output:display",
    ]);
  });

  it("creates a notification workflow for discord prompts", () => {
    const draft = buildAssistantWorkflowDraft("send a discord notification");
    expect(draft.matchedIntent).toBe("external-notification");
    expect(draft.definition.nodes.map((node) => node.type)).toEqual([
      "trigger:manual",
      "action:discord-message",
      "output:result",
    ]);
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
    expect(
      redactPreviewValue({
        callbackUrl: "https://hooks.example.com/services/token-secret-1234567890?api_key=query-secret",
      }),
    ).toEqual({
      callbackUrl: expect.not.stringContaining("query-secret"),
    });
  });

  it("redacts URL secrets in simulation transaction plans", () => {
    const report = createSimulationReport(
      {
        nodes: [
          {
            id: "n1",
            type: "action:custom-api",
            data: {
              url: "https://api.example.com/v1/token-secret-1234567890?api_key=query-secret",
            },
          },
        ],
      },
      {},
    );

    expect(report.transactionPlan[0]?.effect).not.toContain("token-secret");
    expect(report.transactionPlan[0]?.effect).not.toContain("query-secret");
  });
});
