import { describe, it, expect, vi, afterEach } from "vitest";
import { Keypair } from "@solana/web3.js";
import { encryptPrivateKey, decryptPrivateKey } from "../src/encryption";
import { WalletSigner } from "../src/signer";

afterEach(() => {
  vi.useRealTimers();
});

describe("encryption", () => {
  it("encrypts and decrypts a private key", () => {
    const originalKey = new Uint8Array(64).fill(42);
    const masterKey = "test-master-key-32-bytes-long!!";

    const encrypted = encryptPrivateKey(originalKey, masterKey);
    expect(encrypted.encrypted).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.tag).toBeDefined();
    expect(encrypted.salt).toBeDefined();

    const decrypted = decryptPrivateKey(encrypted, masterKey);
    expect(decrypted).toEqual(originalKey);
  });

  it("fails with wrong master key", () => {
    const originalKey = new Uint8Array(64).fill(42);
    const encrypted = encryptPrivateKey(originalKey, "correct-key-32-bytes-long!!");
    expect(() => decryptPrivateKey(encrypted, "wrong-key-32-bytes-long!!!!!")).toThrow();
  });

  it("produces different ciphertext for same input (random salt/iv)", () => {
    const key = new Uint8Array(64).fill(1);
    const masterKey = "test-master-key-32-bytes-long!!";
    const enc1 = encryptPrivateKey(key, masterKey);
    const enc2 = encryptPrivateKey(key, masterKey);
    expect(enc1.encrypted).not.toBe(enc2.encrypted);
    expect(enc1.salt).not.toBe(enc2.salt);
  });
});

describe("WalletSigner keypair cache", () => {
  it("expires cached keypairs after the configured TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    const keypair = Keypair.generate();
    const encrypted = encryptPrivateKey(keypair.secretKey, "test-master-key-32-bytes-long!!");
    const signer = new WalletSigner({
      rpcUrl: "http://127.0.0.1:8899",
      masterKey: "test-master-key-32-bytes-long!!",
      keypairCacheTtlMs: 100,
    });

    const first = signer.getKeypair("wallet-1", encrypted);
    expect(signer.getCacheSize()).toBe(1);

    vi.setSystemTime(1_101);
    const second = signer.getKeypair("wallet-1", encrypted);

    expect(second).not.toBe(first);
    expect(signer.getCacheSize()).toBe(1);
  });

  it("evicts least recently used keypairs when the cache limit is reached", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    const masterKey = "test-master-key-32-bytes-long!!";
    const signer = new WalletSigner({
      rpcUrl: "http://127.0.0.1:8899",
      masterKey,
      keypairCacheMaxEntries: 2,
    });

    const encryptedA = encryptPrivateKey(Keypair.generate().secretKey, masterKey);
    const encryptedB = encryptPrivateKey(Keypair.generate().secretKey, masterKey);
    const encryptedC = encryptPrivateKey(Keypair.generate().secretKey, masterKey);

    signer.getKeypair("wallet-a", encryptedA);
    vi.setSystemTime(1_010);
    signer.getKeypair("wallet-b", encryptedB);
    vi.setSystemTime(1_020);
    signer.getKeypair("wallet-c", encryptedC);

    expect(signer.getCacheSize()).toBe(2);
  });
});
