import { beforeEach, describe, expect, it } from "vitest";
import { consumeNonce, generateNonce, verifyNonce } from "./solana-wallet";

describe("Solana wallet nonce lifecycle", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-auth-secret";
  });

  it("accepts a generated nonce once and rejects replay", async () => {
    const nonce = await generateNonce();

    await expect(verifyNonce(nonce)).resolves.toBe(true);
    await expect(consumeNonce(nonce)).resolves.toBe(true);
    await expect(verifyNonce(nonce)).resolves.toBe(false);
    await expect(consumeNonce(nonce)).resolves.toBe(false);
  });

  it("rejects tampered nonces", async () => {
    const nonce = await generateNonce();
    const [timestamp] = nonce.split(".");

    await expect(verifyNonce(`${timestamp}.bad-signature`)).resolves.toBe(false);
  });
});
