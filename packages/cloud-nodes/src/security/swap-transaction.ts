// Decode a Jupiter swap transaction before the workflow wallet signs it.
//
// The transaction bytes can come from an expression (a prior node, a webhook
// body), so they are untrusted. We only sign when the message looks like a
// swap: the workflow wallet pays the fee, only swap-related programs are
// invoked, and the SOL and token outflows we can see are accounted for.

import type { VersionedTransaction } from "@solana/web3.js";

export const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ATA_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const COMPUTE_BUDGET_PROGRAM_ID = "ComputeBudget111111111111111111111111111111";
export const JUPITER_V6_PROGRAM_ID = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
export const JUPITER_ORDER_ENGINE_PROGRAM_ID = "61DFfeTKM7trxYcPQCM78bJ794ddZprZpAwAnLiwTpYH";

/** Programs a Jupiter swap transaction may invoke at the top level. */
export const JUPITER_ALLOWED_PROGRAM_IDS: ReadonlySet<string> = new Set([
  JUPITER_V6_PROGRAM_ID,
  JUPITER_ORDER_ENGINE_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ATA_PROGRAM_ID,
  COMPUTE_BUDGET_PROGRAM_ID,
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", // SPL Memo
  "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo", // SPL Memo v1
  "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95", // Lighthouse assertions (Jupiter Ultra)
]);

const LAMPORTS_PER_SIGNATURE = BigInt(5_000);
// Rent for a 165-byte token account, charged when the wallet pays for an ATA.
const TOKEN_ACCOUNT_RENT_LAMPORTS = BigInt(2_039_280);
const MAX_COMPUTE_UNITS = BigInt(1_400_000);
const DEFAULT_UNITS_PER_INSTRUCTION = BigInt(200_000);

export interface SwapTokenTransfer {
  programId: string;
  amount: bigint;
  /** Known only for TransferChecked with a static mint key. */
  mint?: string;
}

export interface SwapTransactionInspection {
  feePayer: string;
  programIds: string[];
  /** Lamports moved out of the wallet by top-level System transfers/creates. */
  lamportTransfers: bigint;
  /** Signature + priority fee upper bound. */
  feeLamports: bigint;
  /** Rent the wallet pays for token accounts it creates. */
  rentLamports: bigint;
  /** lamportTransfers + feeLamports + rentLamports. */
  totalLamports: bigint;
  /** Top-level token transfers signed by the wallet. */
  walletTokenTransfers: SwapTokenTransfer[];
  /** Mints visible in static account keys (ATA creates, TransferChecked). */
  mints: string[];
}

function extraAllowedPrograms(): string[] {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return (env?.JUPITER_EXTRA_ALLOWED_PROGRAMS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function readU32(data: Uint8Array, offset: number): number {
  if (data.length < offset + 4) throw new Error("instruction data too short");
  return new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, true);
}

function readU64(data: Uint8Array, offset: number): bigint {
  if (data.length < offset + 8) throw new Error("instruction data too short");
  return new DataView(data.buffer, data.byteOffset + offset, 8).getBigUint64(0, true);
}

/**
 * Decode and check a swap transaction. Throws with a clear reason when the
 * transaction must not be signed by `walletPublicKey`.
 */
export function inspectSwapTransaction(
  tx: VersionedTransaction,
  walletPublicKey: string,
): SwapTransactionInspection {
  const message = tx.message;
  const staticKeys = message.staticAccountKeys.map((key) => key.toBase58());
  const keyAt = (index: number): string | undefined => staticKeys[index];

  const feePayer = keyAt(0);
  if (!feePayer || feePayer !== walletPublicKey) {
    throw new Error(
      `Swap transaction fee payer ${feePayer ?? "(none)"} is not the workflow wallet ${walletPublicKey}; refusing to sign.`,
    );
  }

  const allowed = new Set([...JUPITER_ALLOWED_PROGRAM_IDS, ...extraAllowedPrograms()]);
  const programIds = new Set<string>();
  const mints = new Set<string>();
  const walletTokenTransfers: SwapTokenTransfer[] = [];
  let lamportTransfers = BigInt(0);
  let rentLamports = BigInt(0);
  let computeUnitLimit: bigint | undefined;
  let microLamportsPerUnit = BigInt(0);
  let nonBudgetInstructions = 0;

  for (const [position, ix] of message.compiledInstructions.entries()) {
    const programId = keyAt(ix.programIdIndex);
    if (!programId) {
      throw new Error(`Swap transaction instruction ${position} has an unresolvable program id; refusing to sign.`);
    }
    if (!allowed.has(programId)) {
      throw new Error(`Swap transaction invokes program ${programId}, which is not allowed for Jupiter swaps; refusing to sign.`);
    }
    programIds.add(programId);
    const data = ix.data;
    const account = (n: number) => {
      const index = ix.accountKeyIndexes[n];
      return index === undefined ? undefined : keyAt(index);
    };
    const reject = (what: string): never => {
      throw new Error(`Swap transaction instruction ${position} (${what}) is not allowed; refusing to sign.`);
    };

    try {
      if (programId === COMPUTE_BUDGET_PROGRAM_ID) {
        if (data[0] === 2) computeUnitLimit = BigInt(readU32(data, 1));
        else if (data[0] === 3) microLamportsPerUnit = readU64(data, 1);
        continue;
      }
      nonBudgetInstructions += 1;

      if (programId === SYSTEM_PROGRAM_ID) {
        const kind = readU32(data, 0);
        if (kind === 0 || kind === 2) {
          // CreateAccount / Transfer: lamports at offset 4, funder is account 0.
          if (account(0) === walletPublicKey) lamportTransfers += readU64(data, 4);
        } else if (kind === 3) {
          // CreateAccountWithSeed: base (32) + seed (u64 len + bytes) then lamports.
          const seedLength = Number(readU64(data, 36));
          if (account(0) === walletPublicKey) lamportTransfers += readU64(data, 44 + seedLength);
        } else if (kind !== 4) {
          // 4 = AdvanceNonceAccount. Assign, Allocate, withdraws etc. are refused.
          reject(`System instruction ${kind}`);
        }
        continue;
      }

      if (programId === TOKEN_PROGRAM_ID || programId === TOKEN_2022_PROGRAM_ID) {
        const kind = data[0];
        if (kind === 1 || kind === 16 || kind === 17 || kind === 18) continue; // init account, SyncNative
        if (kind === 3 || kind === 12) {
          const authority = account(kind === 3 ? 2 : 3);
          if (authority === walletPublicKey) {
            const mint = kind === 12 ? account(1) : undefined;
            if (mint) mints.add(mint);
            walletTokenTransfers.push({ programId, amount: readU64(data, 1), mint });
          }
          continue;
        }
        if (kind === 9) {
          // CloseAccount must send the rent back to the wallet.
          if (account(1) !== walletPublicKey) reject("CloseAccount to a destination other than the wallet");
          continue;
        }
        reject(`Token instruction ${kind}`);
      }

      if (programId === ATA_PROGRAM_ID) {
        if (data.length > 0 && data[0] !== 0 && data[0] !== 1) reject(`ATA instruction ${data[0]}`);
        const mint = account(3);
        if (mint) mints.add(mint);
        if (account(0) === walletPublicKey) rentLamports += TOKEN_ACCOUNT_RENT_LAMPORTS;
        continue;
      }
    } catch (error) {
      if ((error as Error).message.includes("refusing to sign")) throw error;
      throw new Error(`Swap transaction instruction ${position} could not be decoded; refusing to sign.`);
    }
  }

  const units =
    computeUnitLimit ??
    (BigInt(nonBudgetInstructions) * DEFAULT_UNITS_PER_INSTRUCTION > MAX_COMPUTE_UNITS
      ? MAX_COMPUTE_UNITS
      : BigInt(nonBudgetInstructions) * DEFAULT_UNITS_PER_INSTRUCTION);
  const priorityFee = (microLamportsPerUnit * units + BigInt(999_999)) / BigInt(1_000_000);
  const feeLamports =
    LAMPORTS_PER_SIGNATURE * BigInt(Math.max(1, message.header.numRequiredSignatures)) + priorityFee;

  return {
    feePayer,
    programIds: [...programIds],
    lamportTransfers,
    feeLamports,
    rentLamports,
    totalLamports: lamportTransfers + feeLamports + rentLamports,
    walletTokenTransfers,
    mints: [...mints],
  };
}

/**
 * Check simulation logs beyond `err`: every top-level program invocation must
 * be on the allowlist (catches mismatches between what we decoded and what
 * actually ran).
 */
export function assertSimulationLogs(logs: string[] | null | undefined): void {
  if (!logs) return;
  const allowed = new Set([...JUPITER_ALLOWED_PROGRAM_IDS, ...extraAllowedPrograms()]);
  for (const line of logs) {
    const match = line.match(/^Program (\w+) invoke \[1\]$/);
    if (match && !allowed.has(match[1])) {
      throw new Error(`Swap simulation invoked program ${match[1]}, which is not allowed; refusing to sign.`);
    }
    if (/^Program \w+ failed/.test(line)) {
      throw new Error(`Swap simulation reported a failure: ${line.slice(0, 200)}`);
    }
  }
}
