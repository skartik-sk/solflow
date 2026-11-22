import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for the VerificationToken table (unique on token), shared
// across "instances" the way the real DB is.
const tokens = new Map<string, { identifier: string; token: string; expires: Date }>();
vi.mock("@solflow/db", () => ({
  prisma: {
    verificationToken: {
      findUnique: async ({ where }: { where: { token: string } }) => tokens.get(where.token) ?? null,
      create: async ({ data }: { data: { identifier: string; token: string; expires: Date } }) => {
        if (tokens.has(data.token)) throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
        tokens.set(data.token, data);
        return data;
      },
      deleteMany: async ({ where }: { where: { expires: { lt: Date } } }) => {
        let count = 0;
        for (const [k, v] of tokens) {
          if (v.expires < where.expires.lt) {
            tokens.delete(k);
            count++;
          }
        }
        return { count };
      },
    },
  },
}));

const { consumeNonce, generateNonce, verifyNonce, allowedSiwsDomains, siwsDomainMatches } = await import(
  "./solana-wallet"
);

describe("Solana wallet nonce lifecycle", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-auth-secret";
    tokens.clear();
  });

  it("accepts a generated nonce once and rejects replay", async () => {
    const nonce = await generateNonce();

    await expect(verifyNonce(nonce)).resolves.toBe(true);
    await expect(consumeNonce(nonce)).resolves.toBe(true);
    await expect(verifyNonce(nonce)).resolves.toBe(false);
    await expect(consumeNonce(nonce)).resolves.toBe(false);
  });

  it("stores used nonces in the database, not process memory", async () => {
    const nonce = await generateNonce();
    await consumeNonce(nonce);
    expect(tokens.get(nonce)?.identifier).toBe("siws-nonce");
  });

  it("rejects tampered and expired nonces", async () => {
    const nonce = await generateNonce();
    const [timestamp] = nonce.split(".");
    await expect(verifyNonce(`${timestamp}.bad-signature`)).resolves.toBe(false);

    vi.useFakeTimers();
    try {
      const old = await generateNonce();
      vi.advanceTimersByTime(6 * 60_000);
      await expect(consumeNonce(old)).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("SIWS domain binding", () => {
  const msg = (domain: string) =>
    `SolStudio wants you to sign in with your Solana account:\nAbc\n\nURI: https://${domain}\nDomain: ${domain}\nNonce: 1.x`;

  it("accepts only the configured site", () => {
    const allowed = allowedSiwsDomains({ SIWS_ALLOWED_DOMAINS: "solstudio.fun, www.solstudio.fun" }, "evil.example");
    expect(allowed).toEqual(["solstudio.fun", "www.solstudio.fun"]);
    expect(siwsDomainMatches(msg("solstudio.fun"), allowed)).toBe(true);
    expect(siwsDomainMatches(msg("evil.example"), allowed)).toBe(false);
  });

  it("falls back to the app URL and the serving host", () => {
    const allowed = allowedSiwsDomains({ AUTH_URL: "https://solstudio.fun/api/auth" }, "localhost:3000");
    expect(allowed).toEqual(["solstudio.fun", "localhost:3000"]);
    expect(siwsDomainMatches(msg("localhost:3000"), allowed)).toBe(true);
  });

  it("rejects a missing or duplicated Domain line", () => {
    const allowed = ["solstudio.fun"];
    expect(siwsDomainMatches("Sign in\nNonce: 1.x", allowed)).toBe(false);
    expect(siwsDomainMatches(`${msg("solstudio.fun")}\nDomain: evil.example`, allowed)).toBe(false);
  });
});
