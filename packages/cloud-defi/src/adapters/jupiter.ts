// Jupiter Swap Adapter — builds and executes swaps through Jupiter Swap API V2.

import {
  Connection,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import type { DeFiAdapter } from "../types";

const JUPITER_API = "https://api.jup.ag/swap/v2";
const DEFAULT_TIMEOUT_MS = 15_000;

export interface JupiterQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  taker?: string;
  slippageBps?: number;
  receiver?: string;
  payer?: string;
  referralAccount?: string;
  referralFee?: number;
  excludeRouters?: string;
}

export interface JupiterSwapResult {
  signature: string;
  status?: string;
  code?: number;
  inputMint: string;
  outputMint: string;
  inAmount?: string;
  outAmount?: string;
  inputAmountResult?: string;
  outputAmountResult?: string;
}

export interface JupiterAdapterOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class JupiterAdapter implements DeFiAdapter {
  protocol = "jupiter";
  operations = ["quote", "order", "swap"];
  private connection: Connection;
  private apiKey?: string;
  private baseUrl: string;
  private timeoutMs: number;
  private fetchFn: typeof fetch;

  constructor(rpcUrl: string, options: JupiterAdapterOptions = {}) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? JUPITER_API;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async execute(
    operation: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    switch (operation) {
      case "quote":
      case "order":
        return this.getQuote(params as unknown as JupiterQuoteParams);
      case "swap":
        return this.executeSwap(params);
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  async getQuote(params: JupiterQuoteParams): Promise<unknown> {
    validateQuoteParams(params);
    const slippage = params.slippageBps ?? 50;
    const url = new URL(`${trimTrailingSlash(this.baseUrl)}/quote`);
    url.pathname = `${url.pathname.replace(/\/quote$/, "")}/order`;
    const query: Record<string, string> = {
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: String(Math.trunc(params.amount)),
      slippageBps: String(Math.trunc(slippage)),
    };
    if (params.taker) query.taker = params.taker;
    if (params.receiver) query.receiver = params.receiver;
    if (params.payer) query.payer = params.payer;
    if (params.referralAccount) query.referralAccount = params.referralAccount;
    if (params.referralFee !== undefined) query.referralFee = String(Math.trunc(params.referralFee));
    if (params.excludeRouters) query.excludeRouters = params.excludeRouters;
    url.search = new URLSearchParams(query).toString();

    const { signal, cleanup } = timeoutSignal(this.timeoutMs);
    const res = await this.fetchFn(url.toString(), {
      headers: this.apiKey ? { "x-api-key": this.apiKey } : undefined,
      signal,
    }).finally(cleanup);
    if (!res.ok) {
      throw new Error(`Jupiter order error: ${res.status} ${res.statusText}: ${await readErrorBody(res)}`);
    }

    return res.json();
  }

  async executeSwap(params: Record<string, unknown>): Promise<JupiterSwapResult> {
    const { quoteResponse, orderResponse, signTransaction } = params as {
      quoteResponse?: any;
      orderResponse?: any;
      transactionBase64?: string;
      requestId?: string;
      signTransaction?: (tx: VersionedTransaction) => Promise<VersionedTransaction | string>;
    };

    const order = orderResponse ?? quoteResponse ?? {};
    const transactionBase64 = params.transactionBase64 as string | undefined ?? order.transaction;
    const requestId = params.requestId as string | undefined ?? order.requestId;

    if (typeof transactionBase64 !== "string" || transactionBase64.length === 0) {
      throw new Error("Jupiter order response did not include transaction");
    }
    if (typeof requestId !== "string" || requestId.length === 0) {
      throw new Error("Jupiter order response did not include requestId");
    }
    if (typeof signTransaction !== "function") throw new Error("signTransaction callback is required");

    // Deserialize the transaction
    const txBuf = Buffer.from(transactionBase64, "base64");
    const tx = VersionedTransaction.deserialize(txBuf);

    const signed = await signTransaction(tx);
    const signedTransaction =
      typeof signed === "string"
        ? signed
        : Buffer.from(signed.serialize()).toString("base64");

    const { signal, cleanup } = timeoutSignal(this.timeoutMs);
    const executeRes = await this.fetchFn(`${trimTrailingSlash(this.baseUrl)}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
      },
      signal,
      body: JSON.stringify({
        signedTransaction,
        requestId,
      }),
    }).finally(cleanup);

    if (!executeRes.ok) {
      throw new Error(`Jupiter execute error: ${executeRes.status}: ${await readErrorBody(executeRes)}`);
    }

    const execute = await executeRes.json() as {
      status?: string;
      signature?: string;
      code?: number;
      inputAmountResult?: string;
      outputAmountResult?: string;
      error?: string;
    };

    if (execute.status && execute.status !== "Success") {
      throw new Error(`Jupiter execute failed${execute.code !== undefined ? ` (${execute.code})` : ""}: ${execute.error ?? execute.status}`);
    }

    return {
      signature: execute.signature ?? "",
      status: execute.status,
      code: execute.code,
      inputMint: order.inputMint,
      outputMint: order.outputMint,
      inAmount: order.inAmount,
      outAmount: order.outAmount,
      inputAmountResult: execute.inputAmountResult,
      outputAmountResult: execute.outputAmountResult,
    };
  }

  getConnection(): Connection {
    return this.connection;
  }
}

function validateQuoteParams(params: JupiterQuoteParams): void {
  if (!params.inputMint || !params.outputMint) {
    throw new Error("inputMint and outputMint are required");
  }
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new Error("amount must be a positive number in smallest units");
  }
  if (params.slippageBps !== undefined && (!Number.isFinite(params.slippageBps) || params.slippageBps < 0 || params.slippageBps > 10_000)) {
    throw new Error("slippageBps must be between 0 and 10000");
  }
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function timeoutSignal(timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "";
  }
}
