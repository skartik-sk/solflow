import { describe, it, expect } from "vitest";
import { encryptPrivateKey, decryptPrivateKey } from "../src/encryption";

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
