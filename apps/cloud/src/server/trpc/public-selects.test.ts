import { describe, expect, it } from "vitest";
import {
  cloudCredentialPublicSelect,
  cloudWalletPublicSelect,
  findSecretResponseFields,
  workflowPublicSelect,
} from "./public-selects";

describe("cloud API public selects", () => {
  it("do not select encrypted wallet, credential, or webhook secret fields", () => {
    const selectedFields = JSON.stringify({
      cloudWalletPublicSelect,
      cloudCredentialPublicSelect,
      workflowPublicSelect,
    });

    expect(selectedFields).not.toContain("encryptedKey");
    expect(selectedFields).not.toContain("keyIv");
    expect(selectedFields).not.toContain("keyTag");
    expect(selectedFields).not.toContain("keySalt");
    expect(selectedFields).not.toContain("encryptedData");
    expect(selectedFields).not.toContain("dataIv");
    expect(selectedFields).not.toContain("dataTag");
    expect(selectedFields).not.toContain("dataSalt");
    expect(selectedFields).not.toContain("webhookSecret");
  });

  it("detects secret fields in nested response payloads", () => {
    const leaked = {
      workflow: {
        id: "wf_1",
        webhookSecret: "secret",
        wallet: {
          id: "wallet_1",
          encryptedKey: "ciphertext",
          keyIv: "iv",
        },
      },
      credentials: [{ id: "cred_1", encryptedData: "ciphertext" }],
    };

    expect(findSecretResponseFields(leaked)).toEqual([
      "$.workflow.webhookSecret",
      "$.workflow.wallet.encryptedKey",
      "$.workflow.wallet.keyIv",
      "$.credentials[0].encryptedData",
    ]);
  });

  it("allows public wallet, credential, and workflow response fields", () => {
    const safe = {
      wallet: {
        id: "wallet_1",
        label: "Ops",
        publicKey: "pubkey",
        network: "devnet",
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      credential: {
        id: "cred_1",
        label: "OpenAI",
        type: "openai",
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      workflow: {
        id: "wf_1",
        userId: "user_1",
        name: "Monitor",
        description: null,
        status: "DRAFT",
        definition: { nodes: [], edges: [] },
        settings: {},
        cronExpression: null,
        cronTimezone: null,
        nextRunAt: null,
        webhookPath: "hook",
        tags: [],
        walletId: "wallet_1",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    expect(findSecretResponseFields(safe)).toEqual([]);
  });
});
