import { afterEach, describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import {
  encodeSecretKey,
  isEncryptedSecretKey,
  keypairFromStoredSecret,
  migrateStoredSecretKey,
  UnreadableSecretKeyError,
} from "../server/secret-key-crypto";

describe("secret key crypto", () => {
  it("encrypts stored keypair payloads and restores the same keypair", () => {
    process.env.ENCRYPTION_MASTER_KEY = "test-master-key";
    const keypair = Keypair.generate();

    const stored = encodeSecretKey(keypair.secretKey);

    expect(isEncryptedSecretKey(stored)).toBe(true);
    expect(stored).not.toContain(bs58.encode(keypair.secretKey));
    expect(keypairFromStoredSecret(stored).publicKey.toBase58()).toBe(
      keypair.publicKey.toBase58(),
    );
  });

  it("keeps legacy bs58 keypairs readable for migration", () => {
    const keypair = Keypair.generate();
    const legacyStored = bs58.encode(keypair.secretKey);

    expect(isEncryptedSecretKey(legacyStored)).toBe(false);
    expect(keypairFromStoredSecret(legacyStored).publicKey.toBase58()).toBe(
      keypair.publicKey.toBase58(),
    );
  });

  it("migrates legacy bs58 keypairs without changing the public key", () => {
    process.env.ENCRYPTION_MASTER_KEY = "test-master-key";
    const keypair = Keypair.generate();
    const legacyStored = bs58.encode(keypair.secretKey);

    const migrated = migrateStoredSecretKey(legacyStored);

    expect(migrated.migrated).toBe(true);
    expect(isEncryptedSecretKey(migrated.stored)).toBe(true);
    expect(migrated.stored).not.toBe(legacyStored);
    expect(migrated.publicKey).toBe(keypair.publicKey.toBase58());
    expect(keypairFromStoredSecret(migrated.stored).publicKey.toBase58()).toBe(
      keypair.publicKey.toBase58(),
    );
  });

  it("does not rewrite already encrypted keypairs", () => {
    process.env.ENCRYPTION_MASTER_KEY = "test-master-key";
    const keypair = Keypair.generate();
    const stored = encodeSecretKey(keypair.secretKey);

    const migrated = migrateStoredSecretKey(stored);

    expect(migrated.migrated).toBe(false);
    expect(migrated.stored).toBe(stored);
    expect(migrated.publicKey).toBe(keypair.publicKey.toBase58());
  });

  describe("master key handling", () => {
    const saved = { ...process.env };
    afterEach(() => {
      process.env.ENCRYPTION_MASTER_KEY = saved.ENCRYPTION_MASTER_KEY;
      process.env.AUTH_SECRET = saved.AUTH_SECRET;
    });

    it("never encrypts with AUTH_SECRET", () => {
      delete process.env.ENCRYPTION_MASTER_KEY;
      process.env.AUTH_SECRET = "session-secret";
      expect(() => encodeSecretKey(Keypair.generate().secretKey)).toThrow(/ENCRYPTION_MASTER_KEY/);
    });

    it("still decrypts old records written under AUTH_SECRET", () => {
      const keypair = Keypair.generate();
      process.env.ENCRYPTION_MASTER_KEY = "legacy-auth-secret";
      const oldRecord = encodeSecretKey(keypair.secretKey);

      process.env.ENCRYPTION_MASTER_KEY = "new-master-key";
      process.env.AUTH_SECRET = "legacy-auth-secret";
      expect(keypairFromStoredSecret(oldRecord).publicKey.toBase58()).toBe(keypair.publicKey.toBase58());
    });

    it("throws a typed error (and never a different key) when no key can decrypt", () => {
      process.env.ENCRYPTION_MASTER_KEY = "key-a";
      const stored = encodeSecretKey(Keypair.generate().secretKey);
      process.env.ENCRYPTION_MASTER_KEY = "key-b";
      process.env.AUTH_SECRET = "key-c";
      expect(() => keypairFromStoredSecret(stored)).toThrow(UnreadableSecretKeyError);
    });
  });
});
