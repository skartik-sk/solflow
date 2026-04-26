import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

export interface EncryptedKey {
  encrypted: string;
  iv: string;
  tag: string;
  salt: string;
}

function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return pbkdf2Sync(masterKey, salt, ITERATIONS, KEY_LENGTH, "sha256");
}

export function encryptPrivateKey(
  privateKey: Uint8Array,
  masterKey: string,
): EncryptedKey {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(masterKey, salt);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(privateKey)),
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

export function encryptString(value: string, masterKey: string): EncryptedKey {
  return encryptPrivateKey(new TextEncoder().encode(value), masterKey);
}

export function decryptPrivateKey(
  encryptedData: EncryptedKey,
  masterKey: string,
): Uint8Array {
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

export function decryptString(
  encryptedData: EncryptedKey,
  masterKey: string,
): string {
  return new TextDecoder().decode(decryptPrivateKey(encryptedData, masterKey));
}
