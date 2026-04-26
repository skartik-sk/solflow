// Birdeye Price Adapter — fetches token prices via Birdeye REST API.

import type { DeFiAdapter } from "../types";

const BIRDEYE_API = "https://public-api.birdeye.so";
const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
const DEFAULT_TIMEOUT_MS = 15_000;

export interface BirdeyePriceResult {
  price: number;
  token: string;
  source: "birdeye";
  fetchedAt: string;
}

export interface BirdeyeAdapterOptions {
  apiKey?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class BirdeyeAdapter implements DeFiAdapter {
  protocol = "birdeye";
  operations = ["getPrice", "getMultiplePrices"];
  private apiKey: string;
  private timeoutMs: number;
  private fetchFn: typeof fetch;

  constructor(apiKeyOrOptions?: string | BirdeyeAdapterOptions) {
    const options = typeof apiKeyOrOptions === "string"
      ? { apiKey: apiKeyOrOptions }
      : apiKeyOrOptions ?? {};
    this.apiKey = options.apiKey ?? "";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? fetch;
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
    const address = normalizeMint(token);

    const url = new URL("/defi/price", BIRDEYE_API);
    url.searchParams.set("address", address);
    const headers: Record<string, string> = {
      "Accept": "application/json",
    };
    if (this.apiKey) {
      headers["X-API-KEY"] = this.apiKey;
    }

    const { signal, cleanup } = timeoutSignal(this.timeoutMs);
    const res = await this.fetchFn(url.toString(), { headers, signal }).finally(cleanup);
    if (!res.ok) {
      throw new Error(`Birdeye API error: ${res.status} ${res.statusText}: ${await readErrorBody(res)}`);
    }

    const json = await res.json() as { data?: { value?: number } };
    const price = json.data?.value;
    if (typeof price !== "number" || !Number.isFinite(price)) {
      throw new Error("Birdeye API response did not include a numeric data.value");
    }

    return {
      price,
      token: address,
      source: "birdeye",
      fetchedAt: new Date().toISOString(),
    };
  }

  private async getMultiplePrices(tokens: string[]): Promise<BirdeyePriceResult[]> {
    if (!Array.isArray(tokens) || tokens.length === 0) {
      throw new Error("tokens must be a non-empty array");
    }
    const results = await Promise.all(tokens.map((t) => this.getPrice(t)));
    return results;
  }
}

function normalizeMint(token: string): string {
  if (token === "SOL" || !token) return WRAPPED_SOL_MINT;
  if (typeof token !== "string" || token.trim() === "") {
    throw new Error("token must be a non-empty mint address or SOL");
  }
  return token.trim();
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
