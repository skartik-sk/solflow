import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { deployRateLimit } from "@/lib/rate-limit";
import { broadcastToJob } from "@/lib/ws-broadcaster";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import bs58 from "bs58";
import { readFile } from "fs/promises";
import { createHash } from "crypto";

// ─── Constants ─────────────────────────────────────────────────────────────────

const log = (...args: unknown[]) => console.log("[deploy]", ...args);

const PACKET_DATA_SIZE = 1232;
const WRITE_OVERHEAD = 220 + 44 + 40;
const CHUNK_SIZE = PACKET_DATA_SIZE - WRITE_OVERHEAD;
const CHUNK_SEND_DELAY_MS = 350;
const MAX_RETRIES = 5;
const BATCH_DELAY_MS = 100;
const BLOCKHASH_CACHE_TTL_MS = 45_000;
const BUFFER_ACCOUNT_METADATA_SIZE = 37;

const NETWORK_CONFIG = {
  DEVNET: {
    rpcUrl:
      process.env.DEVNET_RPC_URL ??
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
      "https://api.devnet.solana.com",
    explorerBase: "https://explorer.solana.com",
  },
  MAINNET: {
    rpcUrl:
      process.env.MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com",
    explorerBase: "https://explorer.solana.com",
  },
  LOCALNET: {
    rpcUrl: "http://localhost:8899",
    explorerBase: null,
  },
} as const;

const BPF_LOADER_UPGRADEABLE = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildExplorerUrl(
  network: keyof typeof NETWORK_CONFIG,
  programId: string,
): string | null {
  const base = NETWORK_CONFIG[network].explorerBase;
  if (!base) return null;
  const suffix =
    network === "MAINNET" ? "" : `?cluster=${network.toLowerCase()}`;
  return `${base}/address/${programId}${suffix}`;
}

function buildTxExplorerUrl(
  network: keyof typeof NETWORK_CONFIG,
  txSig: string,
): string | null {
  const base = NETWORK_CONFIG[network].explorerBase;
  if (!base) return null;
  const suffix =
    network === "MAINNET" ? "" : `?cluster=${network.toLowerCase()}`;
  return `${base}/tx/${txSig}${suffix}`;
}

// Bincode serialization for BPFLoaderUpgradeable instructions.
function serializeU32(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value);
  return buf;
}

function serializeU64(value: number | bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

function serializeVecU8(data: Buffer): Buffer {
  return Buffer.concat([serializeU64(data.length), data]);
}

// ─── BPFLoaderUpgradeable Instructions ─────────────────────────────────────

function createInitializeBufferIx(
  bufferPk: PublicKey,
  authority: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: bufferPk, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: false, isWritable: false },
    ],
    programId: BPF_LOADER_UPGRADEABLE,
    data: serializeU32(0),
  });
}

function createWriteIx(
  destination: PublicKey,
  authority: PublicKey,
  offset: number,
  bytes: Buffer,
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    programId: BPF_LOADER_UPGRADEABLE,
    data: Buffer.concat([
      serializeU32(1),
      serializeU32(offset),
      serializeVecU8(bytes),
    ]),
  });
}

function createDeployWithMaxProgramLenIx(
  programDataAddress: PublicKey,
  programId: PublicKey,
  bufferPubkey: PublicKey,
  upgradeAuthority: PublicKey,
  payer: PublicKey,
  maxProgramLen: number,
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: programDataAddress, isSigner: false, isWritable: true },
      { pubkey: programId, isSigner: false, isWritable: true },
      { pubkey: bufferPubkey, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      {
        pubkey: new PublicKey("SysvarC1ock11111111111111111111111111111111"),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: upgradeAuthority, isSigner: true, isWritable: false },
    ],
    programId: BPF_LOADER_UPGRADEABLE,
    data: Buffer.concat([serializeU32(2), serializeU64(maxProgramLen)]),
  });
}

function createUpgradeIx(
  programDataAddress: PublicKey,
  programId: PublicKey,
  bufferPubkey: PublicKey,
  spillPk: PublicKey,
  authority: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: programDataAddress, isSigner: false, isWritable: true },
      { pubkey: programId, isSigner: false, isWritable: true },
      { pubkey: bufferPubkey, isSigner: false, isWritable: true },
      { pubkey: spillPk, isSigner: true, isWritable: true },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      {
        pubkey: new PublicKey("SysvarC1ock11111111111111111111111111111111"),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    programId: BPF_LOADER_UPGRADEABLE,
    data: serializeU32(3),
  });
}

function createCloseIx(
  closeAccount: PublicKey,
  destination: PublicKey,
  authority: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: closeAccount, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    programId: BPF_LOADER_UPGRADEABLE,
    data: serializeU32(5),
  });
}

// ─── Send + confirm using blockhash-based strategy ──────────────────────────

interface SendTxResult {
  signature: string;
  blockhash: string;
  lastValidBlockHeight: number;
}

async function tryUntilSuccess<T>(
  fn: () => Promise<T>,
  intervalMs: number,
): Promise<T> {
  while (true) {
    try {
      return await fn();
    } catch {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}

interface CachedBlockhash {
  blockhash: string;
  lastValidBlockHeight: number;
  timestamp: number;
}

const _blockhashCache = new Map<string, CachedBlockhash>();

async function getLatestBlockhash(
  connection: Connection,
  force?: boolean,
): Promise<CachedBlockhash> {
  const endpoint = connection.rpcEndpoint;
  const now = Date.now();
  const cached = _blockhashCache.get(endpoint);
  if (!force && cached && now < cached.timestamp + BLOCKHASH_CACHE_TTL_MS) {
    return cached;
  }
  const bh = await connection.getLatestBlockhash("confirmed");
  const entry = { ...bh, timestamp: now };
  _blockhashCache.set(endpoint, entry);
  return entry;
}

async function sendAndConfirmTxWithRetries(
  connection: Connection,
  sendTx: () => Promise<SendTxResult>,
  checkConfirmation: () => Promise<boolean>,
  label: string,
): Promise<string> {
  const SLEEP_MULTIPLIER = 1.8;
  let sleepMs = 1000;

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const { signature, blockhash, lastValidBlockHeight } = await sendTx();
      const result = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      if (!result?.value?.err) return signature;
      log(
        `${label} confirm returned error: ${JSON.stringify(result.value.err).slice(0, 200)}`,
      );
      if (await checkConfirmation()) return signature;
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      log(`${label} attempt ${i + 1}/${MAX_RETRIES}: ${msg.slice(0, 300)}`);

      if (
        msg.includes("already been processed") ||
        msg.includes("Blockhash not found")
      ) {
        log(`${label} forcing fresh blockhash`);
        await getLatestBlockhash(connection, true);
      }

      if (await checkConfirmation()) {
        log(`${label} confirmed on-chain despite error`);
        return "confirmed-via-check";
      }
    }
    await new Promise((r) => setTimeout(r, sleepMs));
    sleepMs *= SLEEP_MULTIPLIER;
  }
  throw new Error(`${label} failed after ${MAX_RETRIES} retries`);
}

// ─── Get or create the user's persistent deployer keypair ────────────────────

async function getOrCreateDeployer(ctx: any, userId: string): Promise<Keypair> {
  const user = await ctx.prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, deployerKeypair: true },
  });
  if (user?.deployerKeypair) {
    return Keypair.fromSecretKey(bs58.decode(user.deployerKeypair));
  }
  const deployerKp = Keypair.generate();
  await ctx.prisma.user.update({
    where: { id: userId },
    data: { deployerKeypair: bs58.encode(deployerKp.secretKey) },
  });
  log("created new deployer keypair:", deployerKp.publicKey.toBase58());
  return deployerKp;
}

// ─── Shared loader ─────────────────────────────────────────────────────────────

async function loadBinaryAndMeta(ctx: any, projectId: string, userId: string) {
  const project = await ctx.prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true, programKeypair: true },
  });
  if (!project) throw new TRPCError({ code: "NOT_FOUND" });

  let programSecretKey = project.programKeypair;

  if (!programSecretKey) {
    const programKp = Keypair.generate();
    programSecretKey = bs58.encode(programKp.secretKey);

    await ctx.prisma.project.update({
      where: { id: project.id },
      data: { programKeypair: programSecretKey },
    });

    const fd = await ctx.prisma.project.findUnique({
      where: { id: project.id },
      select: { flowData: true },
    });
    if (fd?.flowData) {
      const flow = fd.flowData as { nodes: any[]; edges: any[] };
      const idx = flow.nodes.findIndex((n: any) => n.type === "program");
      if (idx !== -1) {
        flow.nodes[idx] = {
          ...flow.nodes[idx],
          data: {
            ...(flow.nodes[idx].data as Record<string, unknown>),
            programId: programKp.publicKey.toBase58(),
          },
        };
        await ctx.prisma.project.update({
          where: { id: project.id },
          data: { flowData: flow as any },
        });
      }
    }
  }

  const rl = deployRateLimit(userId);
  if (!rl.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Deploy rate limit exceeded. Try again in ${Math.ceil((rl.resetAt - Date.now()) / 1000)}s.`,
    });
  }

  const compilation = await ctx.prisma.compilation.findFirst({
    where: {
      projectId,
      status: "SUCCESS",
      binaryUrl: { not: null },
    },
    orderBy: { completedAt: "desc" },
  });
  if (!compilation?.binaryUrl) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No compiled binary found. Compile first.",
    });
  }

  const binaryBuffer = await readFile(compilation.binaryUrl);
  const programKp = Keypair.fromSecretKey(bs58.decode(programSecretKey!));

  return {
    programKp,
    programSecretKey: programSecretKey!,
    binaryBuffer,
    compilation,
  };
}

// ─── Router ────────────────────────────────────────────────────────────────────

export const deployRouter = router({
  /**
   * Check deployer balance. Returns the deployer address + balance so the
   * UI can ask the user to fund it before deploying.
   */
  checkBalance: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        network: z.enum(["DEVNET", "MAINNET", "LOCALNET"]).default("DEVNET"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      const deployerKp = await getOrCreateDeployer(ctx, userId);

      const rpcUrl = NETWORK_CONFIG[input.network].rpcUrl;
      const connection = new Connection(rpcUrl, "confirmed");

      const balance = await connection.getBalance(deployerKp.publicKey);

      // Calculate actual cost from the latest compiled binary
      const compilation = await ctx.prisma.compilation.findFirst({
        where: {
          projectId: input.projectId,
          status: "SUCCESS",
          binaryUrl: { not: null },
        },
        orderBy: { completedAt: "desc" },
      });

      let needed = 2 * LAMPORTS_PER_SOL;
      if (compilation?.binaryUrl) {
        const binaryBuffer = await readFile(compilation.binaryUrl);
        const totalChunks = Math.ceil(binaryBuffer.length / CHUNK_SIZE);
        const bufferRent = await connection.getMinimumBalanceForRentExemption(
          37 + binaryBuffer.length,
        );
        const txFees = (totalChunks + 3) * 5000;
        needed = txFees + 3 * bufferRent;
      }
      needed += Math.floor(0.5 * LAMPORTS_PER_SOL);

      return {
        address: deployerKp.publicKey.toBase58(),
        balance,
        needed,
        funded: balance >= needed,
      };
    }),

  /**
   * Deploy a program:
   *   - deployerKeypair (user-level, persistent) = PAYER (funds everything)
   *   - programKeypair (per-project) = PROGRAM IDENTITY only
   *   - Server signs all transactions with both keypairs
   */
  start: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        network: z.enum(["DEVNET", "MAINNET", "LOCALNET"]).default("DEVNET"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      const { programKp, programSecretKey, binaryBuffer, compilation } =
        await loadBinaryAndMeta(ctx, input.projectId, userId);

      // Get the user's persistent deployer keypair (SEPARATE from program)
      const deployerKp = await getOrCreateDeployer(ctx, userId);
      const deployerPk = deployerKp.publicKey;

      const rpcUrl = NETWORK_CONFIG[input.network].rpcUrl;
      const connection = new Connection(rpcUrl, "confirmed");
      const programId = programKp.publicKey;

      log("=== DEPLOY START ===");
      log(
        "deployer:",
        deployerPk.toBase58(),
        "(payer — persists across projects)",
      );
      log("program:", programId.toBase58(), "(identity — per project)");
      log("network:", input.network, "rpc:", rpcUrl);
      log("binary size:", binaryBuffer.length, "bytes");

      // Validate: deployer and program keypairs MUST be different
      if (deployerPk.equals(programId)) {
        log("WARNING: deployer and program keypairs are the same! Regenerating program keypair…");
        const newProgramKp = Keypair.generate();
        const newProgramSecretKey = bs58.encode(newProgramKp.secretKey);

        await ctx.prisma.project.update({
          where: { id: input.projectId },
          data: { programKeypair: newProgramSecretKey },
        });

        // Update flow data with new program ID
        const fd = await ctx.prisma.project.findUnique({
          where: { id: input.projectId },
          select: { flowData: true },
        });
        if (fd?.flowData) {
          const flow = fd.flowData as { nodes: any[]; edges: any[] };
          const idx = flow.nodes.findIndex((n: any) => n.type === "program");
          if (idx !== -1) {
            flow.nodes[idx] = {
              ...flow.nodes[idx],
              data: {
                ...(flow.nodes[idx].data as Record<string, unknown>),
                programId: newProgramKp.publicKey.toBase58(),
              },
            };
            await ctx.prisma.project.update({
              where: { id: input.projectId },
              data: { flowData: flow as any },
            });
          }
        }

        // Recalculate with new program keypair
        const newProgramId = newProgramKp.publicKey;
        log("new program:", newProgramId.toBase58());
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Deployer and program keypairs were identical (bug). Program keypair has been regenerated to ${newProgramId.toBase58()}. Please try deploying again.`,
        });
      }

      const [programDataAddress] = PublicKey.findProgramAddressSync(
        [programId.toBuffer()],
        BPF_LOADER_UPGRADEABLE,
      );
      const existingProgramData =
        await connection.getAccountInfo(programDataAddress);
      const isUpgrade = existingProgramData !== null;
      log("isUpgrade:", isUpgrade);

      const totalChunks = Math.ceil(binaryBuffer.length / CHUNK_SIZE);
      log("total chunks:", totalChunks);

      // Create deployment record
      const deployment = await ctx.prisma.deployment.create({
        data: {
          projectId: input.projectId,
          userId,
          network: input.network,
          programId: programId.toBase58(),
          txSignature: "pending",
          irHash: createHash("sha256")
            .update(binaryBuffer)
            .digest("hex")
            .slice(0, 16),
          binaryHash: createHash("sha256")
            .update(binaryBuffer)
            .digest("hex")
            .slice(0, 16),
          status: "PENDING",
          programKeypair: programSecretKey,
        },
      });

      const deploymentId = deployment.id;
      log("deployment record:", deploymentId);

      const bufferKp = Keypair.generate();
      const bufferPubkey = bufferKp.publicKey;
      log("buffer:", bufferPubkey.toBase58());

      const sendProgress = (phase: string, message: string, extra?: any) => {
        log(`[${phase}]`, message, extra ?? "");
        try {
          broadcastToJob(deploymentId, {
            type: "deploy-status",
            jobId: deploymentId,
            data: { phase, message, ...extra },
          });
        } catch {
          /* WS not connected */
        }
      };

      try {
        // ─── Check deployer balance ──────────────────────────────────────
        sendProgress("funding", "Checking deployer balance…");

        const bufferSpace = 37 + binaryBuffer.length;
        const bufferRent =
          await connection.getMinimumBalanceForRentExemption(bufferSpace);
        const programRent =
          await connection.getMinimumBalanceForRentExemption(36);
        const estimatedCost =
          (totalChunks + 3) * 5000 +
          bufferRent +
          (isUpgrade ? 0 : 2 * bufferRent + programRent);

        const balance = await connection.getBalance(deployerPk);
        log("deployer balance:", balance / LAMPORTS_PER_SOL, "SOL");
        log("estimated cost:", estimatedCost / LAMPORTS_PER_SOL, "SOL");

        if (balance < estimatedCost) {
          const deficit = (estimatedCost - balance) / LAMPORTS_PER_SOL;
          const faucetUrl = `https://faucet.solana.com/?address=${deployerPk.toBase58()}`;
          log("INSUFFICIENT FUNDS. Need", deficit.toFixed(2), "more SOL");

          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Deployer needs ~${Math.ceil(estimatedCost / LAMPORTS_PER_SOL)} SOL but has ${(balance / LAMPORTS_PER_SOL).toFixed(2)} SOL. Send at least ${deficit.toFixed(1)} SOL to:\n\n${deployerPk.toBase58()}\n\nFaucet: ${faucetUrl}`,
          });
        }

        sendProgress(
          "funded",
          `Balance OK: ${(balance / LAMPORTS_PER_SOL).toFixed(2)} SOL`,
        );

        // ─── Pre-flight: Verify network and programs ──────────────────────
        log("verifying network connectivity…");
        try {
          const bpfAccount = await connection.getAccountInfo(
            BPF_LOADER_UPGRADEABLE,
          );
          if (!bpfAccount) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `BPFLoaderUpgradeable not found at ${rpcUrl}. Is this a valid Solana cluster?`,
            });
          }
          log(
            "BPFLoaderUpgradeable OK, owner:",
            bpfAccount.owner.toBase58(),
            "executable:",
            bpfAccount.executable,
          );
        } catch (e) {
          if (e instanceof TRPCError) throw e;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to verify network at ${rpcUrl}: ${e instanceof Error ? e.message : String(e)}`,
          });
        }

        // ─── Step 1: Create buffer account (deployer pays) ────────────────
        sendProgress("buffer", "Creating buffer account…");

        // Build the buffer creation transaction
        const buildBufferTx = () => {
          const bh = getLatestBlockhash(connection);
          return bh.then((bh) => {
            const tx = new Transaction({
              blockhash: bh.blockhash,
              lastValidBlockHeight: bh.lastValidBlockHeight,
              feePayer: deployerPk,
            });
            tx.add(
              SystemProgram.createAccount({
                fromPubkey: deployerPk,
                newAccountPubkey: bufferPubkey,
                space: bufferSpace,
                lamports: bufferRent,
                programId: BPF_LOADER_UPGRADEABLE,
              }),
              createInitializeBufferIx(bufferPubkey, deployerPk),
            );
            tx.sign(bufferKp, deployerKp);
            return { tx, bh };
          });
        };

        // Simulate first to get detailed error info
        try {
          const { tx: simTx } = await buildBufferTx();
          const simulation = await connection.simulateTransaction(simTx);
          if (simulation?.value?.err) {
            log(
              "BUFFER SIMULATION FAILED:",
              JSON.stringify(simulation.value.err),
            );
            log("SIMULATION LOGS:", simulation.value.logs);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Buffer creation would fail: ${JSON.stringify(simulation.value.err)}\nLogs: ${(simulation.value.logs || []).join("\n")}`,
            });
          }
          log("buffer simulation passed");
        } catch (e) {
          if (e instanceof TRPCError) throw e;
          log("simulation exception:", e instanceof Error ? e.message : String(e));
          // Continue anyway - simulation might fail for benign reasons
        }

        await sendAndConfirmTxWithRetries(
          connection,
          async () => {
            const { tx, bh } = await buildBufferTx();
            const serialized = tx.serialize();
            const signature = await connection.sendRawTransaction(serialized, {
              skipPreflight: true,
              preflightCommitment: "confirmed",
            });
            return {
              signature,
              blockhash: bh.blockhash,
              lastValidBlockHeight: bh.lastValidBlockHeight,
            };
          },
          async () => {
            const acc = await connection.getAccountInfo(bufferPubkey);
            return !!acc;
          },
          "Create buffer",
        );

        sendProgress("buffer", "Waiting for buffer to propagate…");
        await tryUntilSuccess(async () => {
          const acc = await connection.getAccountInfo(bufferPubkey);
          if (!acc) throw new Error("Buffer not found yet");
          return acc;
        }, 1000);
        log("buffer created and confirmed on-chain");

        // ─── Step 2: Write chunks sequentially (fire-and-forget, verify at end) ─
        sendProgress("writing", `Writing ${totalChunks} chunks…`, {
          totalChunks,
        });

        // Fire-and-forget: send each chunk, don't wait for individual confirmation.
        // The verify loop at the end catches missing chunks.
        // This matches how `solana program deploy` CLI works.
        const CHUNK_SEND_DELAY_MS = 350;

        const sendChunk = async (chunkIdx: number) => {
          const offset = chunkIdx * CHUNK_SIZE;
          const chunk = binaryBuffer.slice(offset, offset + CHUNK_SIZE);
          const bh = await getLatestBlockhash(connection);
          const tx = new Transaction({
            blockhash: bh.blockhash,
            lastValidBlockHeight: bh.lastValidBlockHeight,
            feePayer: deployerPk,
          });
          tx.add(createWriteIx(bufferPubkey, deployerPk, offset, chunk));
          tx.sign(deployerKp);
          const serialized = tx.serialize();
          // Fire and forget: just send, don't confirm
          await connection.sendRawTransaction(serialized, {
            skipPreflight: true,
            preflightCommitment: "confirmed",
          });
        };

        const allIndices = Array.from({ length: totalChunks }, (_, i) => i);

        // Send all chunks sequentially with delays to avoid rate limits
        for (let i = 0; i < allIndices.length; i++) {
          const chunkIdx = allIndices[i];
          try {
            await sendChunk(chunkIdx);
            if (i % 20 === 0) {
              log(`writing chunk ${i}/${totalChunks}…`);
              sendProgress("writing", `Writing chunk ${i}/${totalChunks}…`, {
                written: i,
                totalChunks,
              });
            }
          } catch (e: any) {
            const msg = e?.message ?? String(e);
            if (msg.includes("429")) {
              // Rate limited - wait longer and retry this chunk
              log(`chunk ${chunkIdx} rate limited, waiting 2s…`);
              await new Promise((r) => setTimeout(r, 2000));
              try {
                await sendChunk(chunkIdx);
              } catch (e2: any) {
                log(`chunk ${chunkIdx} failed after retry: ${e2.message}`);
              }
            } else {
              log(`chunk ${chunkIdx} send error: ${msg.slice(0, 200)}`);
            }
          }
          // Delay between sends to stay under rate limit
          if (i < allIndices.length - 1) {
            await new Promise((r) => setTimeout(r, CHUNK_SEND_DELAY_MS));
          }
        }

        log("all chunks sent, waiting for finalization…");
        // Give the network a moment to finalize all transactions
        await new Promise((r) => setTimeout(r, 3000));

        // ─── Verify all chunks on-chain ──────────────────────────────────
        let verifyPass = 0;
        while (true) {
          verifyPass++;
          const bufferAccount = await tryUntilSuccess(async () => {
            const acc = await connection.getAccountInfo(bufferPubkey);
            if (!acc) throw new Error("Buffer account not found");
            return acc;
          }, 1000);

          const onChainData = bufferAccount.data.slice(
            BUFFER_ACCOUNT_METADATA_SIZE,
            BUFFER_ACCOUNT_METADATA_SIZE + binaryBuffer.length,
          );

          if (onChainData.equals(binaryBuffer)) {
            log("buffer verification passed — all bytes match");
            break;
          }

          const missingIndices = allIndices.filter((i) => {
            const start = i * CHUNK_SIZE;
            const end = start + CHUNK_SIZE;
            const expected = binaryBuffer.slice(start, end);
            const actual = onChainData.slice(start, end);
            return !expected.equals(actual);
          });

          log(
            `verify pass ${verifyPass}: ${missingIndices.length} missing chunks, rewriting…`,
          );
          sendProgress(
            "writing",
            `Verifying… ${missingIndices.length} chunks need rewrite (pass ${verifyPass})`,
            {
              missingChunks: missingIndices.length,
              verifyPass,
              totalChunks,
            },
          );

          // Re-send missing chunks sequentially with delay
          for (let j = 0; j < missingIndices.length; j++) {
            const chunkIdx = missingIndices[j];
            try {
              await sendChunk(chunkIdx);
            } catch (e: any) {
              log(`retry chunk ${chunkIdx} failed: ${(e?.message ?? String(e)).slice(0, 200)}`);
            }
            if (j < missingIndices.length - 1) {
              await new Promise((r) => setTimeout(r, CHUNK_SEND_DELAY_MS));
            }
          }
          // Wait for re-sent chunks to finalize
          await new Promise((r) => setTimeout(r, 3000));
        }

        log("all chunks written and verified successfully");

        // ─── Step 3: Deploy / Upgrade from buffer ──────────────────────────
        sendProgress(
          "deploying",
          isUpgrade ? "Upgrading program…" : "Deploying program…",
        );

        const deployTxSig = await sendAndConfirmTxWithRetries(
          connection,
          async () => {
            const bh = await getLatestBlockhash(connection);
            const tx = new Transaction({
              blockhash: bh.blockhash,
              lastValidBlockHeight: bh.lastValidBlockHeight,
              feePayer: deployerPk,
            });
            if (isUpgrade) {
              tx.add(
                createUpgradeIx(
                  programDataAddress,
                  programId,
                  bufferPubkey,
                  deployerPk,
                  deployerPk,
                ),
              );
              tx.sign(deployerKp);
            } else {
              tx.add(
                SystemProgram.createAccount({
                  fromPubkey: deployerPk,
                  newAccountPubkey: programId,
                  space: 36,
                  lamports: programRent,
                  programId: BPF_LOADER_UPGRADEABLE,
                }),
                createDeployWithMaxProgramLenIx(
                  programDataAddress,
                  programId,
                  bufferPubkey,
                  deployerPk,
                  deployerPk,
                  binaryBuffer.length,
                ),
              );
              tx.sign(programKp, deployerKp);
            }
            const serialized = tx.serialize();
            const signature = await connection.sendRawTransaction(serialized, {
              skipPreflight: true,
              preflightCommitment: "confirmed",
            });
            return { signature, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight };
          },
          async () => {
            if (isUpgrade) {
              const acc = await connection.getAccountInfo(programDataAddress);
              if (!acc) return false;
              const slot = acc.data.readBigUInt64LE(8);
              return slot > BigInt(0);
            }
            const acc = await connection.getAccountInfo(programId);
            return !!acc && acc.executable;
          },
          "Deploy/Upgrade",
        );
        log("deployed! tx:", deployTxSig);

        // ─── Step 4: Close buffer (reclaim SOL) ───────────────────────────
        sendProgress("cleanup", "Reclaiming buffer SOL…");
        try {
          await sendAndConfirmTxWithRetries(
            connection,
            async () => {
              const bh = await getLatestBlockhash(connection);
              const tx = new Transaction({
                blockhash: bh.blockhash,
                lastValidBlockHeight: bh.lastValidBlockHeight,
                feePayer: deployerPk,
              });
              tx.add(createCloseIx(bufferPubkey, deployerPk, deployerPk));
              tx.sign(deployerKp);
              const serialized = tx.serialize();
              const signature = await connection.sendRawTransaction(serialized, {
                skipPreflight: true,
                preflightCommitment: "confirmed",
              });
              return { signature, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight };
            },
            async () => {
              const acc = await connection.getAccountInfo(bufferPubkey);
              return !acc;
            },
            "Close buffer",
          );
          log("buffer closed, SOL reclaimed to deployer");
        } catch (e) {
          log("buffer close failed (non-critical):", e);
        }

        // ─── Finalize ──────────────────────────────────────────────────────
        const explorerUrl = buildExplorerUrl(
          input.network,
          programId.toBase58(),
        );
        const txExplorerUrl = buildTxExplorerUrl(input.network, deployTxSig);

        await ctx.prisma.deployment.update({
          where: { id: deploymentId },
          data: {
            status: "CONFIRMED",
            txSignature: deployTxSig,
            explorerUrl: explorerUrl ?? undefined,
          },
        });

        await ctx.prisma.project.update({
          where: { id: input.projectId },
          data: { status: "DEPLOYED" },
        });

        log("=== DEPLOY COMPLETE ===");
        log("program:", programId.toBase58());
        log("tx:", deployTxSig);
        log("explorer:", explorerUrl);

        sendProgress("complete", "Deployment complete!", {
          programId: programId.toBase58(),
          txSignature: deployTxSig,
          explorerUrl,
          txExplorerUrl,
        });

        return {
          deploymentId,
          programId: programId.toBase58(),
          deployerAddress: deployerPk.toBase58(),
          txSignature: deployTxSig,
          explorerUrl,
          txExplorerUrl,
          isUpgrade,
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log("=== DEPLOY FAILED ===");
        log("error:", errMsg);

        // Attempt buffer cleanup
        try {
          await sendAndConfirmTxWithRetries(
            connection,
            async () => {
              const bh = await getLatestBlockhash(connection);
              const tx = new Transaction({
                blockhash: bh.blockhash,
                lastValidBlockHeight: bh.lastValidBlockHeight,
                feePayer: deployerPk,
              });
              tx.add(createCloseIx(bufferPubkey, deployerPk, deployerPk));
              tx.sign(deployerKp);
              const serialized = tx.serialize();
              const signature = await connection.sendRawTransaction(serialized, {
                skipPreflight: true,
                preflightCommitment: "confirmed",
              });
              return { signature, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight };
            },
            async () => {
              const acc = await connection.getAccountInfo(bufferPubkey);
              return !acc;
            },
            "Cleanup buffer",
          );
        } catch {
          log("buffer cleanup after failure also failed");
        }

        await ctx.prisma.deployment
          .update({
            where: { id: deploymentId },
            data: { status: "FAILED", txSignature: "failed" },
          })
          .catch(() => {});

        sendProgress("error", `Deployment failed: ${errMsg}`);

        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: errMsg,
        });
      }
    }),

  status: protectedProcedure
    .input(z.object({ deploymentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const deployment = await ctx.prisma.deployment.findFirst({
        where: {
          id: input.deploymentId,
          userId: ctx.session.user.id!,
        },
      });
      if (!deployment) throw new TRPCError({ code: "NOT_FOUND" });
      return deployment;
    }),

  history: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.deployment.findMany({
        where: { projectId: input.projectId },
        orderBy: { deployedAt: "desc" },
        take: 20,
      });
    }),
});
