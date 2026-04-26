// Jupiter Swap Adapter — builds and executes token swaps via Jupiter Aggregator API.

import {
  Connection,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import type { DeFiAdapter } from "../types";

const JUPITER_API = "https://quote-api.jup.ag/v6";

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

export class JupiterAdapter implements DeFiAdapter {
  protocol = "jupiter";
  operations = ["quote", "swap"];
  private connection: Connection;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, "confirmed");
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
    const slippage = params.slippageBps ?? 50;
    const url = `${JUPITER_API}/quote?inputMint=${params.inputMint}&outputMint=${params.outputMint}&amount=${params.amount}&slippageBps=${slippage}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Jupiter quote error: ${res.status} ${res.statusText}`);
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

    // Get swap transaction from Jupiter
    const swapRes = await fetch(`${JUPITER_API}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto",
      }),
    });

    if (!swapRes.ok) {
      throw new Error(`Jupiter swap error: ${swapRes.status}`);
    }

    const { swapTransaction } = (await swapRes.json()) as { swapTransaction: string };

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
