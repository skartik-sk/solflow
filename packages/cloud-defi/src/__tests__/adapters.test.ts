import { afterEach, describe, expect, it, vi } from "vitest";
import { BirdeyeAdapter } from "../adapters/birdeye";
import { JupiterAdapter } from "../adapters/jupiter";

function mockFetch(response: {
  ok: boolean;
  status?: number;
  statusText?: string;
  json?: unknown;
  text?: string;
}) {
  const fetchMock = vi.fn(async () => ({
    ok: response.ok,
    status: response.status ?? 200,
    statusText: response.statusText ?? "OK",
    json: async () => response.json,
    text: async () => response.text ?? "",
  })) as unknown as typeof fetch;

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock as unknown as ReturnType<typeof vi.fn>;
}

describe("BirdeyeAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches a token price with optional API key header", async () => {
    const fetchMock = mockFetch({
      ok: true,
      json: { data: { value: 123.45 } },
    });
    const adapter = new BirdeyeAdapter("birdeye-key");

    const result = await adapter.execute("getPrice", { token: "TOKEN_MINT" });

    expect(result).toMatchObject({
      price: 123.45,
      token: "TOKEN_MINT",
      source: "birdeye",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://public-api.birdeye.so/defi/price?address=TOKEN_MINT",
      expect.objectContaining({
        headers: { Accept: "application/json", "X-API-KEY": "birdeye-key" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("maps SOL to the native wrapped SOL mint", async () => {
    const fetchMock = mockFetch({
      ok: true,
      json: { data: { value: 150 } },
    });
    const adapter = new BirdeyeAdapter();

    await adapter.execute("getPrice", { token: "SOL" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://public-api.birdeye.so/defi/price?address=So11111111111111111111111111111111111111112",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("throws provider errors for failed price requests", async () => {
    mockFetch({ ok: false, status: 429, statusText: "Too Many Requests", text: "rate limited" });
    const adapter = new BirdeyeAdapter();

    await expect(adapter.execute("getPrice", { token: "TOKEN_MINT" })).rejects.toThrow(
      "Birdeye API error: 429 Too Many Requests: rate limited",
    );
  });

  it("rejects malformed Birdeye price payloads", async () => {
    mockFetch({ ok: true, json: { data: {} } });
    const adapter = new BirdeyeAdapter();

    await expect(adapter.execute("getPrice", { token: "TOKEN_MINT" })).rejects.toThrow(
      "numeric data.value",
    );
  });
});

describe("JupiterAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches a quote with default slippage", async () => {
    const quote = {
      inputMint: "SOL",
      outputMint: "USDC",
      inAmount: "1000",
      outAmount: "2500",
    };
    const fetchMock = mockFetch({ ok: true, json: quote });
    const adapter = new JupiterAdapter("https://api.devnet.solana.com");

    const result = await adapter.execute("quote", {
      inputMint: "SOL",
      outputMint: "USDC",
      amount: 1000,
    });

    expect(result).toEqual(quote);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://quote-api.jup.ag/v6/quote?inputMint=SOL&outputMint=USDC&amount=1000&slippageBps=50",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("throws provider errors for failed quote requests", async () => {
    mockFetch({ ok: false, status: 500, statusText: "Server Error", text: "upstream down" });
    const adapter = new JupiterAdapter("https://api.devnet.solana.com");

    await expect(
      adapter.execute("quote", {
        inputMint: "SOL",
        outputMint: "USDC",
        amount: 1000,
      }),
    ).rejects.toThrow("Jupiter quote error: 500 Server Error: upstream down");
  });

  it("validates Jupiter quote amounts before calling the provider", async () => {
    const fetchMock = mockFetch({ ok: true, json: {} });
    const adapter = new JupiterAdapter("https://api.devnet.solana.com");

    await expect(
      adapter.execute("quote", {
        inputMint: "SOL",
        outputMint: "USDC",
        amount: 0,
      }),
    ).rejects.toThrow("amount must be a positive number");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed Jupiter swap payloads before signing", async () => {
    const fetchMock = mockFetch({ ok: true, json: {} });
    const signAndSend = vi.fn(async () => "sig");
    const adapter = new JupiterAdapter("https://api.devnet.solana.com", {
      apiKey: "jupiter-key",
    });

    await expect(
      adapter.execute("swap", {
        quoteResponse: {
          inputMint: "SOL",
          outputMint: "USDC",
          inAmount: "1000",
          outAmount: "2500",
        },
        userPublicKey: "11111111111111111111111111111111",
        signAndSend,
      }),
    ).rejects.toThrow("swapTransaction");
    expect(signAndSend).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://quote-api.jup.ag/v6/swap",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-api-key": "jupiter-key" }),
      }),
    );
  });
});
