// Birdeye Price Adapter — fetches token prices via Birdeye REST API.

import type { DeFiAdapter } from "../types";

const BIRDEYE_API = "https://public-api.birdeye.so";

export interface BirdeyePriceResult {
  price: number;
  token: string;
  source: "birdeye";
  fetchedAt: string;
}

export class BirdeyeAdapter implements DeFiAdapter {
  protocol = "birdeye";
  operations = ["getPrice", "getMultiplePrices"];
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? "";
  }

  async execute(
    operation: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    switch (operation) {
      case "getPrice":
        return this.getPrice(params.token as string);
      case "getMultiplePrices":
        return this.getMultiplePrices(params.tokens as string[]);
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  private async getPrice(token: string): Promise<BirdeyePriceResult> {
    // SOL native token
    const address = token === "SOL" || !token
      ? "So11111111111111111111111111111111111111112"
      : token;

    const url = `${BIRDEYE_API}/defi/price?address=${address}`;
    const headers: Record<string, string> = {
      "Accept": "application/json",
    };
    if (this.apiKey) {
      headers["X-API-KEY"] = this.apiKey;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Birdeye API error: ${res.status} ${res.statusText}`);
    }

    const json = await res.json() as { data?: { value?: number } };
    const price = json.data?.value ?? 0;

    return {
      price,
      token: address,
      source: "birdeye",
      fetchedAt: new Date().toISOString(),
    };
  }

  private async getMultiplePrices(tokens: string[]): Promise<BirdeyePriceResult[]> {
    const results = await Promise.all(tokens.map((t) => this.getPrice(t)));
    return results;
  }
}
