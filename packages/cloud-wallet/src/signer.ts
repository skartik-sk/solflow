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
}

export class WalletSigner {
  private connection: Connection;
  private masterKey: string;
  private keypairCache: Map<string, Keypair> = new Map();

  constructor(config: WalletSignerConfig) {
    this.connection = new Connection(config.rpcUrl, "confirmed");
    this.masterKey = config.masterKey;
  }

  /** Decrypt a stored private key and cache the Keypair */
  getKeypair(
    walletId: string,
    encryptedKey: EncryptedKey,
  ): Keypair {
    let kp = this.keypairCache.get(walletId);
    if (kp) return kp;

    const secretKey = decryptPrivateKey(encryptedKey, this.masterKey);
    kp = Keypair.fromSecretKey(secretKey);
    this.keypairCache.set(walletId, kp);
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

  getConnection(): Connection {
    return this.connection;
  }
}
