import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { cloudNodeRegistry } from "../src/registry";
import { registerBuiltinNodes } from "../src/index";
import { setOutboundResolver } from "../src/security/outbound-url";
import type { CloudSafetyControls, NodeExecutionContext } from "../src/types";

registerBuiltinNodes();

beforeEach(() => {
  setOutboundResolver(async () => ["93.184.216.34"]);
});

afterEach(() => {
  setOutboundResolver(undefined);
  vi.unstubAllGlobals();
});

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const JUPITER_V6 = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

const automated: CloudSafetyControls = {
  simulationRequired: true,
  manualApprovalRequired: false,
  walletAutomationAllowed: true,
  spendLimitLamports: 1_000,
  maxSlippageBps: 50,
  allowedMints: [SOL_MINT, USDC_MINT],
};

function serialize(payer: PublicKey, instructions: TransactionInstruction[]): string {
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: "11111111111111111111111111111111",
    instructions,
  }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(message).serialize()).toString("base64");
}

function okFetch() {
  return vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify({ status: "Success", signature: "sig" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

function executeCtx(
  wallet: PublicKey,
  transactionBase64: string,
  safety: CloudSafetyControls | undefined,
  extra: Record<string, unknown> = {},
  logs: string[] = [],
) {
  const signTransaction = vi.fn(async (tx: unknown) => tx);
  const ctx: NodeExecutionContext = {
    inputs: [[{ json: {} }]],
    params: { transactionBase64, requestId: "r1", walletId: "w1", ...extra },
    executionId: "e",
    nodeId: "n",
    signal: new AbortController().signal,
    logger: { info() {}, warn() {}, error() {} },
    safety,
    wallet: {
      simulate: async () => ({ err: null, logs }),
      signTransaction,
      signAndSend: async () => "unused",
      getPublicKey: async () => wallet.toBase58(),
      getBalance: async () => 0,
    },
  };
  return { ctx, signTransaction };
}

describe("Jupiter swap-execute signing guard", () => {
  const def = () => cloudNodeRegistry.get("action:jupiter-swap-execute")!;

  it("refuses a transaction paid by another key (audit scenario: arbitrary tx)", async () => {
    vi.stubGlobal("fetch", okFetch());
    const victim = Keypair.generate().publicKey;
    const wallet = Keypair.generate().publicKey;
    const tx = serialize(victim, [
      SystemProgram.transfer({ fromPubkey: victim, toPubkey: Keypair.generate().publicKey, lamports: 5_000_000_000 }),
    ]);
    const { ctx, signTransaction } = executeCtx(wallet, tx, automated);
    await expect(def().execute!(ctx)).rejects.toThrow(/fee payer/);
    expect(signTransaction).not.toHaveBeenCalled();
  });

  it("honours manual approval even when the transaction is well-formed", async () => {
    vi.stubGlobal("fetch", okFetch());
    const wallet = Keypair.generate().publicKey;
    const tx = serialize(wallet, [
      SystemProgram.transfer({ fromPubkey: wallet, toPubkey: Keypair.generate().publicKey, lamports: 10 }),
    ]);
    const { ctx, signTransaction } = executeCtx(wallet, tx, {
      manualApprovalRequired: true,
      walletAutomationAllowed: false,
      spendLimitLamports: 1_000,
    });
    await expect(def().execute!(ctx)).rejects.toThrow(/manual approval/);
    expect(signTransaction).not.toHaveBeenCalled();
  });

  it("fails closed when no safety policy is provided", async () => {
    vi.stubGlobal("fetch", okFetch());
    const wallet = Keypair.generate().publicKey;
    const tx = serialize(wallet, []);
    const { ctx, signTransaction } = executeCtx(wallet, tx, undefined);
    await expect(def().execute!(ctx)).rejects.toThrow(/manual approval/);
    expect(signTransaction).not.toHaveBeenCalled();
  });

  it("enforces the SOL spend limit on decoded outflow", async () => {
    vi.stubGlobal("fetch", okFetch());
    const wallet = Keypair.generate().publicKey;
    const tx = serialize(wallet, [
      SystemProgram.transfer({ fromPubkey: wallet, toPubkey: Keypair.generate().publicKey, lamports: 5_000_000_000 }),
    ]);
    const { ctx, signTransaction } = executeCtx(wallet, tx, automated);
    await expect(def().execute!(ctx)).rejects.toThrow(/spend limit/);
    expect(signTransaction).not.toHaveBeenCalled();
  });

  it("checks declared mints against the allowed mint list", async () => {
    vi.stubGlobal("fetch", okFetch());
    const wallet = Keypair.generate().publicKey;
    const tx = serialize(wallet, []);
    const { ctx, signTransaction } = executeCtx(
      wallet,
      tx,
      { ...automated, spendLimitLamports: 1_000_000 },
      { inputMint: USDC_MINT, outputMint: "Bonk111111111111111111111111111111111111111" },
    );
    await expect(def().execute!(ctx)).rejects.toThrow(/not in the allowed mint list/);
    expect(signTransaction).not.toHaveBeenCalled();
  });

  it("rejects when simulation logs show a non-allowlisted program", async () => {
    vi.stubGlobal("fetch", okFetch());
    const wallet = Keypair.generate().publicKey;
    const tx = serialize(wallet, []);
    const { ctx, signTransaction } = executeCtx(
      wallet,
      tx,
      { ...automated, spendLimitLamports: 1_000_000 },
      {},
      ["Program Evi1111111111111111111111111111111111111 invoke [1]"],
    );
    await expect(def().execute!(ctx)).rejects.toThrow(/not allowed/);
    expect(signTransaction).not.toHaveBeenCalled();
  });

  it("signs a Jupiter-only transaction that fits the policy", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const wallet = Keypair.generate().publicKey;
    const tx = serialize(wallet, [
      new TransactionInstruction({
        programId: new PublicKey(JUPITER_V6),
        keys: [{ pubkey: wallet, isSigner: true, isWritable: true }],
        data: Buffer.from([1]),
      }),
    ]);
    const { ctx, signTransaction } = executeCtx(
      wallet,
      tx,
      { ...automated, spendLimitLamports: 1_000_000 },
      { inputMint: USDC_MINT, outputMint: SOL_MINT, amount: "1000", slippageBps: "50" },
      [`Program ${JUPITER_V6} invoke [1]`, `Program ${JUPITER_V6} success`],
    );
    const result = await def().execute!(ctx);
    expect(signTransaction).toHaveBeenCalledTimes(1);
    expect((result[0].json as any).jupiter.signature).toBe("sig");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });
});

describe("outbound requests: SSRF and timeouts", () => {
  const baseCtx = (params: Record<string, unknown>): NodeExecutionContext => ({
    inputs: [[{ json: {} }]],
    params,
    executionId: "e",
    nodeId: "n",
    signal: new AbortController().signal,
    logger: { info() {}, warn() {}, error() {} },
    wallet: {
      signAndSend: async () => "sig",
      getPublicKey: async () => "pk",
      getBalance: async () => 0,
    },
  });

  it("custom-api refuses a redirect to the metadata IP", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest/meta-data/" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      cloudNodeRegistry.get("action:custom-api")!.execute!(baseCtx({ url: "https://example.com/api", method: "GET" })),
    ).rejects.toThrow(/private or local/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("output:webhook refuses hosts that resolve to private addresses", async () => {
    setOutboundResolver(async () => ["10.0.0.7"]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      cloudNodeRegistry.get("output:webhook")!.execute!(baseCtx({ url: "http://10.0.0.7.nip.io/hook" })),
    ).rejects.toThrow(/resolves to a private/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["action:solana-rpc", { rpcUrl: "https://rpc.example.com", method: "getHealth", params: [] }],
    ["action:jito-tip-floor", {}],
    ["action:umbra-indexer-health", { network: "mainnet" }],
    ["action:discord-message", { webhookUrl: "https://discord.com/api/webhooks/1/abc", content: "hi" }],
    ["action:jupiter-price", { tokenIds: SOL_MINT }],
  ])("%s sends a per-request timeout signal merged with the run signal", async (type, params) => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ result: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const ctx = baseCtx(params);
    const run = new AbortController();
    ctx.signal = run.signal;
    await cloudNodeRegistry.get(type)!.execute!(ctx).catch(() => undefined);

    expect(fetchMock).toHaveBeenCalled();
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal).not.toBe(run.signal);
    expect(init.signal!.aborted).toBe(false);
    run.abort();
    expect(init.signal!.aborted).toBe(true);
  });

  it("action:telegram-message uses a timeout signal", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const ctx = {
      ...baseCtx({ credentialId: "c", chatId: "1", text: "hi" }),
      credentials: { get: async () => ({ id: "c", label: "t", type: "telegram", data: { botToken: "123:abc" } }) },
    };
    await cloudNodeRegistry.get("action:telegram-message")!.execute!(ctx);
    expect(fetchMock.mock.calls[0][1]!.signal).not.toBe(ctx.signal);
  });
});
