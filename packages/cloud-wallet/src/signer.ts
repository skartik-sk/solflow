// WalletSigner — decrypts stored keys and provides sign/send operations.
// Implements WalletOperations from @solflow/cloud-nodes.

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { decryptPrivateKey, type EncryptedKey } from "./encryption";

export interface WalletSignerConfig {
  rpcUrl: string;
  masterKey: string;
  keypairCacheTtlMs?: number;
  keypairCacheMaxEntries?: number;
}

interface CachedKeypair {
  keypair: Keypair;
  expiresAt: number;
  lastUsedAt: number;
}

export class WalletSigner {
  private connection: Connection;
  private masterKey: string;
  private keypairCache: Map<string, CachedKeypair> = new Map();
  private keypairCacheTtlMs: number;
  private keypairCacheMaxEntries: number;

  constructor(config: WalletSignerConfig) {
    this.connection = new Connection(config.rpcUrl, "confirmed");
    this.masterKey = config.masterKey;
    this.keypairCacheTtlMs = config.keypairCacheTtlMs ?? 60_000;
    this.keypairCacheMaxEntries = config.keypairCacheMaxEntries ?? 50;
  }

  /** Decrypt a stored private key and cache it briefly to avoid retaining secrets indefinitely. */
  getKeypair(
    walletId: string,
    encryptedKey: EncryptedKey,
  ): Keypair {
    const now = Date.now();
    this.pruneExpiredKeypairs(now);

    const cached = this.keypairCache.get(walletId);
    if (cached && cached.expiresAt > now) {
      cached.lastUsedAt = now;
      return cached.keypair;
    }

    const secretKey = decryptPrivateKey(encryptedKey, this.masterKey);
    const kp = Keypair.fromSecretKey(secretKey);
    secretKey.fill(0);

    this.keypairCache.set(walletId, {
      keypair: kp,
      expiresAt: now + this.keypairCacheTtlMs,
      lastUsedAt: now,
    });
    this.enforceKeypairCacheLimit();
    return kp;
  }

  /** Sign and send a transaction */
  async signAndSend(
    tx: Transaction | VersionedTransaction,
    walletId: string,
    encryptedKey: EncryptedKey,
  ): Promise<string> {
    const keypair = this.getKeypair(walletId, encryptedKey);

    if (tx instanceof VersionedTransaction) {
      tx.sign([keypair]);
      const signature = await this.connection.sendRawTransaction(tx.serialize());
      await this.connection.confirmTransaction(signature, "confirmed");
      return signature;
    }

    const signature = await sendAndConfirmTransaction(
      this.connection,
      tx as Transaction,
      [keypair],
    );
    return signature;
  }

  /** Sign a transaction without broadcasting it */
  async signTransaction(
    tx: Transaction | VersionedTransaction,
    walletId: string,
    encryptedKey: EncryptedKey,
  ): Promise<Transaction | VersionedTransaction> {
    const keypair = this.getKeypair(walletId, encryptedKey);

    if (tx instanceof VersionedTransaction) {
      tx.sign([keypair]);
      return tx;
    }

    tx.sign(keypair);
    return tx;
  }

  /** Sign and simulate a transaction without broadcasting it */
  async simulate(
    tx: Transaction | VersionedTransaction,
    walletId: string,
    encryptedKey: EncryptedKey,
  ): Promise<{ err: unknown; logs?: string[] | null }> {
    const keypair = this.getKeypair(walletId, encryptedKey);

    if (tx instanceof VersionedTransaction) {
      tx.sign([keypair]);
      const result = await this.connection.simulateTransaction(tx);
      return { err: result.value.err, logs: result.value.logs };
    }

    tx.sign(keypair);
    const result = await this.connection.simulateTransaction(tx);
    return { err: result.value.err, logs: result.value.logs };
  }

  /** Get the public key for a wallet */
  async getPublicKey(
    walletId: string,
    encryptedKey: EncryptedKey,
  ): Promise<string> {
    const keypair = this.getKeypair(walletId, encryptedKey);
    return keypair.publicKey.toBase58();
  }

  /** Get SOL balance for a wallet */
  async getBalance(
    walletId: string,
    encryptedKey: EncryptedKey,
  ): Promise<number> {
    const keypair = this.getKeypair(walletId, encryptedKey);
    const balance = await this.connection.getBalance(keypair.publicKey);
    return balance / LAMPORTS_PER_SOL;
  }

  /** Get SPL token balance */
  async getTokenBalance(
    walletId: string,
    encryptedKey: EncryptedKey,
    mint: string,
  ): Promise<number> {
    const keypair = this.getKeypair(walletId, encryptedKey);
    const mintPk = new PublicKey(mint);

    const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
      keypair.publicKey,
      { mint: mintPk },
    );

    if (tokenAccounts.value.length === 0) return 0;

    const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
    return Number(balance) || 0;
  }

  /** Clear cached keypairs */
  clearCache(): void {
    this.keypairCache.clear();
  }

  getCacheSize(): number {
    return this.keypairCache.size;
  }

  getConnection(): Connection {
    return this.connection;
  }

  private pruneExpiredKeypairs(now = Date.now()): void {
    for (const [walletId, cached] of this.keypairCache) {
      if (cached.expiresAt <= now) {
        this.keypairCache.delete(walletId);
      }
    }
  }

  private enforceKeypairCacheLimit(): void {
    while (this.keypairCache.size > this.keypairCacheMaxEntries) {
      let oldestWalletId: string | undefined;
      let oldestLastUsedAt = Number.POSITIVE_INFINITY;

      for (const [walletId, cached] of this.keypairCache) {
        if (cached.lastUsedAt < oldestLastUsedAt) {
          oldestWalletId = walletId;
          oldestLastUsedAt = cached.lastUsedAt;
        }
      }

      if (!oldestWalletId) return;
      this.keypairCache.delete(oldestWalletId);
    }
  }
}
