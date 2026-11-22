// Program keypair generation for scaffolds (ed25519 via node:crypto, Solana JSON format).

import { generateKeyPairSync } from "crypto";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function bs58Encode(bytes: ArrayLike<number>): string {
  let num = 0n;
  for (let i = 0; i < bytes.length; i++) num = num * 256n + BigInt(bytes[i]);
  let result = "";
  while (num > 0n) {
    result = ALPHABET[Number(num % 58n)] + result;
    num /= 58n;
  }
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) result = "1" + result;
  return result;
}

/** A new program keypair: `secretKey` is the 64-byte Solana JSON array, `address` its base58 pubkey. */
export function generateProgramKeypair(): { address: string; secretKey: number[] } {
  const { privateKey } = generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" }) as { d: string; x: string };
  const seed = Buffer.from(jwk.d, "base64url");
  const pub = Buffer.from(jwk.x, "base64url");
  return { address: bs58Encode(pub), secretKey: [...seed, ...pub] };
}
