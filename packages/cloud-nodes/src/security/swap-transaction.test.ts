import { describe, expect, it } from "vitest";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createApproveInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
} from "@solana/spl-token";
import {
  assertSimulationLogs,
  inspectSwapTransaction,
  JUPITER_V6_PROGRAM_ID,
} from "./swap-transaction";

const wallet = Keypair.generate().publicKey;
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

function tx(instructions: TransactionInstruction[], payer = wallet): VersionedTransaction {
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: "11111111111111111111111111111111",
    instructions,
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

const jupiterRoute = () =>
  new TransactionInstruction({
    programId: new PublicKey(JUPITER_V6_PROGRAM_ID),
    keys: [{ pubkey: wallet, isSigner: true, isWritable: true }],
    data: Buffer.from([1, 2, 3]),
  });

describe("inspectSwapTransaction", () => {
  it("accepts a typical SOL -> USDC swap and accounts for SOL outflow, fees and rent", () => {
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, wallet);
    const usdcAta = getAssociatedTokenAddressSync(USDC, wallet);
    const result = inspectSwapTransaction(
      tx([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000_000 }),
        createAssociatedTokenAccountIdempotentInstruction(wallet, wsolAta, wallet, NATIVE_MINT),
        SystemProgram.transfer({ fromPubkey: wallet, toPubkey: wsolAta, lamports: 1_000_000 }),
        createSyncNativeInstruction(wsolAta),
        createAssociatedTokenAccountIdempotentInstruction(wallet, usdcAta, wallet, USDC),
        jupiterRoute(),
        createCloseAccountInstruction(wsolAta, wallet, wallet),
      ]),
      wallet.toBase58(),
    );

    expect(result.lamportTransfers).toBe(BigInt(1_000_000));
    expect(result.feeLamports).toBe(BigInt(5_000 + 200_000)); // 1 sig + 200k CU * 1 lamport
    expect(result.rentLamports).toBe(BigInt(2 * 2_039_280));
    expect(result.totalLamports).toBe(result.lamportTransfers + result.feeLamports + result.rentLamports);
    expect(result.mints.sort()).toEqual([NATIVE_MINT.toBase58(), USDC.toBase58()].sort());
    expect(result.walletTokenTransfers).toEqual([]);
  });

  it("refuses when the fee payer is not the workflow wallet", () => {
    const other = Keypair.generate().publicKey;
    expect(() =>
      inspectSwapTransaction(
        tx([SystemProgram.transfer({ fromPubkey: other, toPubkey: wallet, lamports: 1 })], other),
        wallet.toBase58(),
      ),
    ).toThrow(/fee payer .* is not the workflow wallet/);
  });

  it("refuses programs outside the Jupiter allowlist", () => {
    const evil = new TransactionInstruction({
      programId: Keypair.generate().publicKey,
      keys: [{ pubkey: wallet, isSigner: true, isWritable: true }],
      data: Buffer.alloc(0),
    });
    expect(() => inspectSwapTransaction(tx([evil]), wallet.toBase58())).toThrow(/not allowed for Jupiter swaps/);
  });

  it("refuses System Assign and token Approve / foreign CloseAccount", () => {
    const assign = SystemProgram.assign({ accountPubkey: wallet, programId: Keypair.generate().publicKey });
    expect(() => inspectSwapTransaction(tx([assign]), wallet.toBase58())).toThrow(/System instruction 1/);

    const ata = getAssociatedTokenAddressSync(USDC, wallet);
    const approve = createApproveInstruction(ata, Keypair.generate().publicKey, wallet, 1_000);
    expect(() => inspectSwapTransaction(tx([approve]), wallet.toBase58())).toThrow(/Token instruction 4/);

    const close = createCloseAccountInstruction(ata, Keypair.generate().publicKey, wallet);
    expect(() => inspectSwapTransaction(tx([close]), wallet.toBase58())).toThrow(/CloseAccount/);
  });

  it("reports wallet-signed token transfers with their mint", () => {
    const source = getAssociatedTokenAddressSync(USDC, wallet);
    const dest = getAssociatedTokenAddressSync(USDC, Keypair.generate().publicKey);
    const result = inspectSwapTransaction(
      tx([createTransferCheckedInstruction(source, USDC, dest, wallet, 5_000_000, 6)]),
      wallet.toBase58(),
    );
    expect(result.walletTokenTransfers).toEqual([
      expect.objectContaining({ amount: BigInt(5_000_000), mint: USDC.toBase58() }),
    ]);
  });
});

describe("assertSimulationLogs", () => {
  it("accepts allowlisted top-level programs and rejects others", () => {
    expect(() =>
      assertSimulationLogs([
        `Program ${JUPITER_V6_PROGRAM_ID} invoke [1]`,
        "Program SomeAmm1111111111111111111111111111111111 invoke [2]",
        `Program ${JUPITER_V6_PROGRAM_ID} success`,
      ]),
    ).not.toThrow();
    expect(() => assertSimulationLogs(["Program Evil111111111111111111111111111111111111 invoke [1]"])).toThrow(
      /not allowed/,
    );
  });
});
