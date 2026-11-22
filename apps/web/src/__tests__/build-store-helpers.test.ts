import { describe, expect, it } from "vitest";
import { clampForUpload, fundingRpcUrl } from "../store/build-store";

describe("deployer funding RPC", () => {
  it("funds mainnet deploys on mainnet, never the devnet RPC", () => {
    const env = { devnet: "https://devnet.example", mainnet: undefined };
    expect(fundingRpcUrl("MAINNET", env)).toBe("https://api.mainnet-beta.solana.com");
    expect(fundingRpcUrl("MAINNET", { ...env, mainnet: "https://main.example" })).toBe("https://main.example");
    expect(fundingRpcUrl("DEVNET", env)).toBe("https://devnet.example");
    expect(fundingRpcUrl("DEVNET", {})).toBe("https://api.devnet.solana.com");
    expect(fundingRpcUrl("LOCALNET", env)).toBe("http://localhost:8899");
  });
});

describe("browser build upload clamping", () => {
  it("fits the server limits", () => {
    const out = clampForUpload(Array.from({ length: 900 }, (_, i) => (i === 899 ? "y".repeat(15_000) : `l${i}`)));
    expect(out).toHaveLength(500);
    expect(out[0]).toMatch(/truncated/);
    expect(out[499].length).toBeLessThanOrEqual(10_000 + 20);
  });
});
