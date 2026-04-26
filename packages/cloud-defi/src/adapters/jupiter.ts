// Jupiter Swap Adapter — builds and executes token swaps via Jupiter Aggregator API.

import {
  Connection,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import type { DeFiAdapter } from "../types";

const JUPITER_API = "https://quote-api.jup.ag/v6";
const DEFAULT_TIMEOUT_MS = 15_000;

export interface JupiterQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
}

export interface JupiterSwapResult {
  signature: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
}

export interface JupiterAdapterOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class JupiterAdapter implements DeFiAdapter {
  protocol = "jupiter";
  operations = ["quote", "swap"];
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
    url.search = new URLSearchParams({
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: String(Math.trunc(params.amount)),
      slippageBps: String(Math.trunc(slippage)),
    }).toString();

    const { signal, cleanup } = timeoutSignal(this.timeoutMs);
    const res = await this.fetchFn(url.toString(), {
      headers: this.apiKey ? { "x-api-key": this.apiKey } : undefined,
      signal,
    }).finally(cleanup);
    if (!res.ok) {
      throw new Error(`Jupiter quote error: ${res.status} ${res.statusText}: ${await readErrorBody(res)}`);
    }

    return res.json();
  }

  async executeSwap(params: Record<string, unknown>): Promise<JupiterSwapResult> {
    const { quoteResponse, userPublicKey, signAndSend } = params as {
      quoteResponse: any;
      userPublicKey: string;
      signAndSend: (tx: VersionedTransaction) => Promise<string>;
    };

    if (!quoteResponse) throw new Error("quoteResponse is required");
    if (!userPublicKey) throw new Error("userPublicKey is required");
    if (typeof signAndSend !== "function") throw new Error("signAndSend callback is required");

    // Get swap transaction from Jupiter
    const { signal, cleanup } = timeoutSignal(this.timeoutMs);
    const swapRes = await this.fetchFn(`${trimTrailingSlash(this.baseUrl)}/swap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
      },
      signal,
      body: JSON.stringify({
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto",
      }),
    }).finally(cleanup);

    if (!swapRes.ok) {
      throw new Error(`Jupiter swap error: ${swapRes.status}: ${await readErrorBody(swapRes)}`);
    }

    const { swapTransaction } = (await swapRes.json()) as { swapTransaction: string };
    if (typeof swapTransaction !== "string" || swapTransaction.length === 0) {
      throw new Error("Jupiter swap response did not include swapTransaction");
    }

    // Deserialize the transaction
    const txBuf = Buffer.from(swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(txBuf);

    // Sign and send via the provided callback
    const signature = await signAndSend(tx);

    return {
      signature,
      inputMint: quoteResponse.inputMint,
      outputMint: quoteResponse.outputMint,
      inAmount: quoteResponse.inAmount,
      outAmount: quoteResponse.outAmount,
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
