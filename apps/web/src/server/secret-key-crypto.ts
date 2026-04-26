import { Keypair } from "@solana/web3.js";
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "crypto";
import bs58 from "bs58";

const ENCRYPTED_SECRET_PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

interface EncryptedKey {
  encrypted: string;
  iv: string;
  tag: string;
  salt: string;
}

function getSecretMasterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY ?? process.env.AUTH_SECRET;
  if (!key) {
    throw new Error("ENCRYPTION_MASTER_KEY or AUTH_SECRET must be configured before storing deploy keys");
  }
  return key;
}

function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return pbkdf2Sync(masterKey, salt, ITERATIONS, KEY_LENGTH, "sha256");
}

function encryptSecretKey(secretKey: Uint8Array, masterKey: string): EncryptedKey {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(masterKey, salt);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(secretKey)),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    salt: salt.toString("base64"),
  };
}

function decryptSecretKey(encryptedData: EncryptedKey, masterKey: string): Uint8Array {
  const salt = Buffer.from(encryptedData.salt, "base64");
  const key = deriveKey(masterKey, salt);
  const iv = Buffer.from(encryptedData.iv, "base64");
  const tag = Buffer.from(encryptedData.tag, "base64");
  const encrypted = Buffer.from(encryptedData.encrypted, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return new Uint8Array(decrypted);
}

export function isEncryptedSecretKey(stored: string): boolean {
  return stored.startsWith(ENCRYPTED_SECRET_PREFIX);
}

export function encodeSecretKey(secretKey: Uint8Array): string {
  const encrypted = encryptSecretKey(secretKey, getSecretMasterKey());
  const payload = Buffer.from(JSON.stringify(encrypted), "utf8").toString("base64url");
  return `${ENCRYPTED_SECRET_PREFIX}${payload}`;
}

export function decodeSecretKey(stored: string): Uint8Array {
  if (!isEncryptedSecretKey(stored)) {
    return bs58.decode(stored);
  }

  const encoded = stored.slice(ENCRYPTED_SECRET_PREFIX.length);
  const encrypted = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  ) as EncryptedKey;
  return decryptSecretKey(encrypted, getSecretMasterKey());
}

export function keypairFromStoredSecret(stored: string): Keypair {
  return Keypair.fromSecretKey(decodeSecretKey(stored));
}

export function migrateStoredSecretKey(stored: string): {
  stored: string;
  migrated: boolean;
  publicKey: string;
} {
  const keypair = keypairFromStoredSecret(stored);
  const publicKey = keypair.publicKey.toBase58();

  if (isEncryptedSecretKey(stored)) {
    return { stored, migrated: false, publicKey };
  }

  const encrypted = encodeSecretKey(keypair.secretKey);
  const encryptedPublicKey = keypairFromStoredSecret(encrypted).publicKey.toBase58();
  if (encryptedPublicKey !== publicKey) {
    throw new Error("Encrypted secret key failed public key verification");
  }

  return { stored: encrypted, migrated: true, publicKey };
}
