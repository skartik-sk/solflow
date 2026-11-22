import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import {
  checkPaymentTransaction,
  getPaymentConfig,
  requiredLamports,
  type PaymentTx,
} from "../lib/marketplace/payment";
import { canAccessTemplate, redactLockedTemplate } from "../lib/marketplace/access";
import { buildProjectFromTemplate } from "../lib/marketplace/template-project";
import { keypairFromStoredSecret } from "../server/secret-key-crypto";

const BUYER = Keypair.generate().publicKey.toBase58();
const TREASURY = Keypair.generate().publicKey.toBase58();
const OTHER = Keypair.generate().publicKey.toBase58();

function transferTx(
  transfers: Array<{ source: string; destination: string; lamports: number }>,
  err: unknown = null,
): PaymentTx {
  return {
    meta: { err },
    transaction: {
      message: {
        instructions: transfers.map((info) => ({
          program: "system",
          parsed: { type: "transfer", info },
        })),
      },
    },
  };
}

describe("getPaymentConfig", () => {
  it("fails closed without a treasury and defaults to mainnet", () => {
    const cfg = getPaymentConfig({} as NodeJS.ProcessEnv);
    expect(cfg.treasury).toBeNull();
    expect(cfg.cluster).toBe("mainnet-beta");
    expect(cfg.rpcUrl).toContain("api.mainnet-beta.solana.com");
  });

  it("rejects a malformed treasury and honours devnet + RPC override", () => {
    expect(getPaymentConfig({ SOLFLOW_TREASURY_WALLET: "not a key" } as any).treasury).toBeNull();
    const cfg = getPaymentConfig({
      SOLFLOW_TREASURY_WALLET: TREASURY,
      SOLFLOW_PAYMENT_CLUSTER: "devnet",
      SOLFLOW_PAYMENT_RPC_URL: "https://rpc.example/devnet",
    } as any);
    expect(cfg).toEqual({ treasury: TREASURY, cluster: "devnet", rpcUrl: "https://rpc.example/devnet" });
  });
});

describe("requiredLamports", () => {
  it("prices PAID listings and refuses a PAID listing with no price", () => {
    expect(requiredLamports({ pricingModel: "PAID", priceSOL: 0.5 })).toBe(500_000_000);
    expect(requiredLamports({ pricingModel: "PAID", priceSOL: null })).toBeNull();
    expect(requiredLamports({ pricingModel: "FREE", priceSOL: 1 })).toBeNull();
    expect(requiredLamports({ pricingModel: "PAY_WHAT_YOU_WANT", priceSOL: null })).toBe(1);
  });
});

describe("checkPaymentTransaction", () => {
  const opts = { buyerWallet: BUYER, treasury: TREASURY, minLamports: 1_000 };

  it("accepts a transfer from the buyer to the treasury of at least the price", () => {
    const res = checkPaymentTransaction(
      transferTx([{ source: BUYER, destination: TREASURY, lamports: 1_000 }]),
      opts,
    );
    expect(res).toEqual({ ok: true, lamports: 1_000 });
  });

  it("rejects a payment sent from someone else's wallet (replayed signature)", () => {
    const res = checkPaymentTransaction(
      transferTx([{ source: OTHER, destination: TREASURY, lamports: 5_000 }]),
      opts,
    );
    expect(res.ok).toBe(false);
  });

  it("rejects underpayment, wrong recipient, failed and missing txs", () => {
    expect(
      checkPaymentTransaction(transferTx([{ source: BUYER, destination: TREASURY, lamports: 999 }]), opts).ok,
    ).toBe(false);
    expect(
      checkPaymentTransaction(transferTx([{ source: BUYER, destination: OTHER, lamports: 5_000 }]), opts).ok,
    ).toBe(false);
    expect(
      checkPaymentTransaction(
        transferTx([{ source: BUYER, destination: TREASURY, lamports: 5_000 }], { InstructionError: [0, "x"] }),
        opts,
      ).ok,
    ).toBe(false);
    expect(checkPaymentTransaction(null, opts).ok).toBe(false);
  });

  it("ignores non-System instructions that look like transfers", () => {
    const tx = transferTx([]);
    tx.transaction.message.instructions.push({
      program: "spl-token",
      parsed: { type: "transfer", info: { source: BUYER, destination: TREASURY, lamports: 9_999 } },
    });
    expect(checkPaymentTransaction(tx, opts).ok).toBe(false);
  });
});

describe("template access", () => {
  const prisma = (hasPurchase: boolean) => ({
    marketplacePurchase: { findUnique: async () => (hasPurchase ? { id: "p" } : null) },
  });
  const paid = { id: "l1", authorId: "author", pricingModel: "PAID" };

  it("opens FREE listings to everyone and paid ones to author or buyer only", async () => {
    expect(await canAccessTemplate(prisma(false), { ...paid, pricingModel: "FREE" }, null)).toBe(true);
    expect(await canAccessTemplate(prisma(false), paid, null)).toBe(false);
    expect(await canAccessTemplate(prisma(false), paid, "stranger")).toBe(false);
    expect(await canAccessTemplate(prisma(false), paid, "author")).toBe(true);
    expect(await canAccessTemplate(prisma(true), paid, "buyer")).toBe(true);
    expect(
      await canAccessTemplate(prisma(false), { ...paid, pricingModel: "PAY_WHAT_YOU_WANT" }, "stranger"),
    ).toBe(false);
  });

  it("redacts template contents when locked", () => {
    const listing = { id: "l1", templateFlowData: { nodes: [1] }, templateIR: { program: {} } };
    expect(redactLockedTemplate(listing, false)).toMatchObject({
      templateFlowData: null,
      templateIR: null,
      locked: true,
    });
    expect(redactLockedTemplate(listing, true).templateFlowData).toEqual({ nodes: [1] });
  });
});

describe("buildProjectFromTemplate", () => {
  it("gives the copy its own program id in flowData and irData and keeps the framework", () => {
    process.env.ENCRYPTION_MASTER_KEY = "test-master-key";
    const template = {
      templateFlowData: {
        nodes: [
          { id: "p", type: "program", data: { name: "vault" } },
          { id: "i", type: "instruction", data: { name: "deposit" } },
        ],
        edges: [{ id: "e" }],
      },
      templateIR: { program: { name: "vault" }, instructions: [] },
    };
    const a = buildProjectFromTemplate(template, "PINOCCHIO");
    const b = buildProjectFromTemplate(template, "PINOCCHIO");

    expect(a.framework).toBe("PINOCCHIO");
    const programNode = (a.flowData.nodes as any[]).find((n) => n.type === "program");
    expect(programNode.data.programId).toBe(a.programId);
    expect((a.irData as any).program.programId).toBe(a.programId);
    expect(keypairFromStoredSecret(a.programKeypair).publicKey.toBase58()).toBe(a.programId);
    expect(a.programId).not.toBe(b.programId);
    // the template itself is untouched
    expect((template.templateFlowData.nodes[0].data as any).programId).toBeUndefined();
  });

  it("falls back to the requested framework when the source project is gone", () => {
    process.env.ENCRYPTION_MASTER_KEY = "test-master-key";
    const res = buildProjectFromTemplate({ templateFlowData: null, templateIR: null }, null, "QUASAR");
    expect(res.framework).toBe("QUASAR");
    expect(res.irData).toBeUndefined();
    expect(res.flowData).toEqual({ nodes: [], edges: [] });
  });
});
