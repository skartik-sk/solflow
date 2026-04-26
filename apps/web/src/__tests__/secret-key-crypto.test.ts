import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import {
  encodeSecretKey,
  isEncryptedSecretKey,
  keypairFromStoredSecret,
  migrateStoredSecretKey,
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
});
