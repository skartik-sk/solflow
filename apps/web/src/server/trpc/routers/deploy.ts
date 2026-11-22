import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { deployRateLimit } from "@/lib/rate-limit";
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
import { readFile } from "fs/promises";
import { createHash } from "crypto";
import {
  encodeSecretKey,
  isEncryptedSecretKey,
  keypairFromStoredSecret,
} from "@/server/secret-key-crypto";
import {
  BUFFER_ACCOUNT_METADATA_SIZE,
  PROGRAM_DATA_HEADER_SIZE,
  MAX_CREATE_ATTEMPTS,
  STEP_LEASE_MS,
  afterVerify,
  afterWrite,
  bufferProgramBytes,
  chunkRange,
  decodeSession,
  encodeSession,
  estimateDeployCost,
  findMissingChunks,
  hasReclaimableBuffer,
  isLocked,
  isStale,
  newSession,
  planWriteBatch,
  progressOf,
  type DeploySession,
} from "@/server/deploy/plan";

// ─── Constants ─────────────────────────────────────────────────────────────────

const log = (...args: unknown[]) => console.log("[deploy]", ...args);

const CHUNK_SEND_DELAY_MS = 350;
/** Time a step may spend sending before it returns. Worst case adds one in-flight RPC call (RPC_TIMEOUT_MS) plus a 429 retry, staying under the 60 s limit. */
const STEP_BUDGET_MS = 30_000;
/** Max chunks per step even if the RPC is fast. */
const MAX_CHUNKS_PER_STEP = 120;
/** How long one request waits for a transaction to confirm before handing back to the client. */
const CONFIRM_WAIT_MS = 25_000;
/** Per-RPC-call timeout so one hung request can't eat the whole function budget. */
const RPC_TIMEOUT_MS = 10_000;

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

type Network = keyof typeof NETWORK_CONFIG;

const BPF_LOADER_UPGRADEABLE = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);

function connectionFor(network: Network): Connection {
  return new Connection(NETWORK_CONFIG[network].rpcUrl, {
    commitment: "confirmed",
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(RPC_TIMEOUT_MS) }),
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildExplorerUrl(
  network: Network,
  programId: string,
): string | null {
  const base = NETWORK_CONFIG[network].explorerBase;
  if (!base) return null;
  const suffix =
    network === "MAINNET" ? "" : `?cluster=${network.toLowerCase()}`;
  return `${base}/address/${programId}${suffix}`;
}

function buildTxExplorerUrl(
  network: Network,
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
  // NOTE: Upgrade instruction has exactly 7 accounts — NO SystemProgram
  // (unlike deployWithMaxProgramLen which has 8). See sol-pg reference.
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

// ─── Bounded RPC helpers (every wait has a deadline) ────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type SigState = "confirmed" | "failed" | "pending";

async function waitForSignature(
  connection: Connection,
  signature: string,
  waitMs: number,
): Promise<{ state: SigState; err?: unknown }> {
  const deadline = Date.now() + waitMs;
  while (true) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const st = value[0];
    if (st?.err) return { state: "failed", err: st.err };
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
      return { state: "confirmed" };
    }
    if (Date.now() + 1500 > deadline) return { state: "pending" };
    await sleep(1500);
  }
}

async function sendSigned(connection: Connection, tx: Transaction): Promise<string> {
  return connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
    preflightCommitment: "confirmed",
  });
}

/** Buffer authority stored in a BPF upgradeable Buffer account (null if none / not a buffer). */
function bufferAuthority(data: Uint8Array): PublicKey | null {
  // enum tag u32 LE (1 = Buffer), then Option<Pubkey> (1 byte tag + 32 bytes)
  if (data.length < BUFFER_ACCOUNT_METADATA_SIZE) return null;
  const tag = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);
  if (tag !== 1 || data[4] !== 1) return null;
  return new PublicKey(data.subarray(5, 37));
}

/**
 * Close a buffer and return its rent to the deployer. Returns the lamports
 * reclaimed, 0 if the account is already gone, or null if the close tx is
 * still unconfirmed when `waitMs` runs out.
 */
async function closeBuffer(
  connection: Connection,
  deployerKp: Keypair,
  bufferPk: PublicKey,
  waitMs: number,
): Promise<number | null> {
  const acc = await connection.getAccountInfo(bufferPk);
  if (!acc) return 0;
  if (!acc.owner.equals(BPF_LOADER_UPGRADEABLE)) {
    throw new Error(`${bufferPk.toBase58()} is not a program buffer`);
  }
  const authority = bufferAuthority(acc.data);
  if (!authority || !authority.equals(deployerKp.publicKey)) {
    throw new Error("Buffer authority is not this deployer; it can't be closed from here");
  }
  const bh = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    blockhash: bh.blockhash,
    lastValidBlockHeight: bh.lastValidBlockHeight,
    feePayer: deployerKp.publicKey,
  }).add(createCloseIx(bufferPk, deployerKp.publicKey, deployerKp.publicKey));
  tx.sign(deployerKp);
  const sig = await sendSigned(connection, tx);
  const res = await waitForSignature(connection, sig, waitMs);
  if (res.state === "failed") throw new Error(`Close buffer failed: ${JSON.stringify(res.err)}`);
  return res.state === "confirmed" ? acc.lamports : null;
}

// ─── Keys ───────────────────────────────────────────────────────────────────

const DEPLOYER_UNREADABLE =
  "Your deployer wallet can't be decrypted (ENCRYPTION_MASTER_KEY changed). It was NOT replaced, so its SOL is not lost: restore the previous ENCRYPTION_MASTER_KEY, or use 'Reset deployer wallet' to start over with a new, empty wallet.";

async function readDeployer(ctx: any, userId: string): Promise<{ stored: string | null; keypair: Keypair | null }> {
  const user = await ctx.prisma.user.findUnique({
    where: { id: userId },
    select: { deployerKeypair: true },
  });
  const stored: string | null = user?.deployerKeypair ?? null;
  if (!stored) return { stored: null, keypair: null };
  try {
    return { stored, keypair: keypairFromStoredSecret(stored) };
  } catch {
    // Never regenerate here: that would orphan the SOL in the old wallet.
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: DEPLOYER_UNREADABLE });
  }
}

async function getOrCreateDeployer(ctx: any, userId: string): Promise<Keypair> {
  const { stored, keypair } = await readDeployer(ctx, userId);
  if (stored && keypair) {
    if (!isEncryptedSecretKey(stored)) {
      // Legacy bs58 row: encrypt in place (same key, so the address is unchanged).
      await ctx.prisma.user.updateMany({
        where: { id: userId, deployerKeypair: stored },
        data: { deployerKeypair: encodeSecretKey(keypair.secretKey) },
      });
    }
    return keypair;
  }

  const deployerKp = Keypair.generate();
  // Only write if still empty, so concurrent requests can't overwrite each other.
  const updated = await ctx.prisma.user.updateMany({
    where: { id: userId, deployerKeypair: null },
    data: { deployerKeypair: encodeSecretKey(deployerKp.secretKey) },
  });
  if (updated.count === 0) {
    const again = await readDeployer(ctx, userId);
    if (again.keypair) return again.keypair;
  }
  log("created new deployer keypair:", deployerKp.publicKey.toBase58());
  return deployerKp;
}

async function requireDeployer(ctx: any, userId: string): Promise<Keypair> {
  const { keypair } = await readDeployer(ctx, userId);
  if (!keypair) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No deployer wallet. Start a deploy first." });
  }
  return keypair;
}

const PROGRAM_KEY_UNREADABLE =
  "This project's program keypair can't be decrypted (ENCRYPTION_MASTER_KEY changed). It was NOT replaced. Restore the previous ENCRYPTION_MASTER_KEY, or use 'Reset program keypair' and recompile to deploy under a new program id.";

function readProgramKeypair(stored: string): Keypair {
  try {
    return keypairFromStoredSecret(stored);
  } catch {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: PROGRAM_KEY_UNREADABLE });
  }
}

async function setProgramIdInFlow(ctx: any, projectId: string, programId: string) {
  const fd = await ctx.prisma.project.findUnique({
    where: { id: projectId },
    select: { flowData: true },
  });
  if (!fd?.flowData) return;
  const flow = fd.flowData as { nodes: any[]; edges: any[] };
  const idx = flow.nodes.findIndex((n: any) => n.type === "program");
  if (idx === -1) return;
  flow.nodes[idx] = {
    ...flow.nodes[idx],
    data: { ...(flow.nodes[idx].data as Record<string, unknown>), programId },
  };
  await ctx.prisma.project.update({
    where: { id: projectId },
    data: { flowData: flow as any },
  });
}

// ─── Project + binary ───────────────────────────────────────────────────────

async function loadBinaryAndMeta(ctx: any, projectId: string, userId: string) {
  const project = await ctx.prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true, programKeypair: true, irData: true },
  });
  if (!project) throw new TRPCError({ code: "NOT_FOUND" });

  let programSecretKey: string | null = project.programKeypair;
  if (!programSecretKey) {
    const programKp = Keypair.generate();
    const encoded = encodeSecretKey(programKp.secretKey);
    const res = await ctx.prisma.project.updateMany({
      where: { id: project.id, programKeypair: null },
      data: { programKeypair: encoded },
    });
    if (res.count === 1) {
      programSecretKey = encoded;
      await setProgramIdInFlow(ctx, project.id, programKp.publicKey.toBase58());
    } else {
      const again = await ctx.prisma.project.findUnique({
        where: { id: project.id },
        select: { programKeypair: true },
      });
      programSecretKey = again?.programKeypair ?? null;
    }
    if (!programSecretKey) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not assign a program keypair" });
  }

  const compilation = await ctx.prisma.compilation.findFirst({
    where: { projectId, status: "SUCCESS", binaryUrl: { not: null } },
    orderBy: { completedAt: "desc" },
  });
  if (!compilation?.binaryUrl) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No compiled binary found. Compile first." });
  }

  // Guard against deploying a stale binary from a previous compile
  if (project.irData && compilation.irHash) {
    const currentHash = createHash("sha256")
      .update(JSON.stringify(project.irData))
      .digest("hex")
      .slice(0, 16);
    if (currentHash !== compilation.irHash) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Project has changed since last compile. Please recompile before deploying.",
      });
    }
  }

  const binaryBuffer = await readCompilationBinary(compilation);
  const programKp = readProgramKeypair(programSecretKey);
  if (!isEncryptedSecretKey(programSecretKey)) {
    programSecretKey = encodeSecretKey(programKp.secretKey);
    await ctx.prisma.project.update({
      where: { id: project.id },
      data: { programKeypair: programSecretKey },
    });
  }

  return { programKp, programSecretKey: programSecretKey!, binaryBuffer, compilation };
}

async function readCompilationBinary(compilation: {
  binaryBytes?: Uint8Array | null;
  binaryUrl?: string | null;
}): Promise<Buffer> {
  if (compilation.binaryBytes) return Buffer.from(compilation.binaryBytes);
  if (!compilation.binaryUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Compiled binary is missing. Recompile." });
  try {
    return await readFile(compilation.binaryUrl);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Compiled binary is no longer available. Recompile." });
  }
}

// ─── Session persistence (compare-and-swap on the stored session) ──────────

async function saveSession(
  ctx: any,
  deploymentId: string,
  prevStored: string,
  next: DeploySession,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const stored = encodeSession(next);
  const res = await ctx.prisma.deployment.updateMany({
    where: { id: deploymentId, txSignature: prevStored },
    data: { txSignature: stored, ...extra },
  });
  if (res.count === 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This deploy was updated by another request (another tab?). Reload to resume it.",
    });
  }
  return stored;
}

async function loadOwnedDeployment(ctx: any, deploymentId: string, userId: string) {
  const deployment = await ctx.prisma.deployment.findFirst({
    where: { id: deploymentId, userId },
  });
  if (!deployment) throw new TRPCError({ code: "NOT_FOUND" });
  return { deployment, session: decodeSession(deployment.txSignature) };
}

/** What the client sees. Never includes key material. */
function snapshot(deployment: any, session: DeploySession | null) {
  const status = deployment.status as string;
  const phase =
    status === "CONFIRMED" || status === "UPGRADED"
      ? "done"
      : status === "FAILED" || status === "CLOSED"
        ? "failed"
        : (session?.phase ?? "failed");
  const hasSession = !!session;
  const network = deployment.network as Network;
  const realSig = hasSession || ["pending", "failed"].includes(deployment.txSignature)
    ? null
    : (deployment.txSignature as string);
  return {
    deploymentId: deployment.id as string,
    projectId: deployment.projectId as string,
    network,
    programId: deployment.programId as string,
    status,
    phase,
    progress: session ? progressOf(session) : null,
    isUpgrade: session?.isUpgrade ?? false,
    error: session?.error ?? (phase === "failed" && !session ? "Deploy did not finish" : null),
    buffer: session?.buffer ?? null,
    reclaimable: status !== "PENDING" && hasReclaimableBuffer(session),
    txSignature: realSig,
    explorerUrl: (deployment.explorerUrl as string | null) ?? null,
    txExplorerUrl: realSig ? buildTxExplorerUrl(network, realSig) : null,
    deployedAt: deployment.deployedAt as Date,
  };
}

/** PENDING deploys with no progress for DEPLOY_STALE_MS become FAILED (their buffer stays reclaimable). */
async function sweepStaleDeployments(ctx: any, userId: string) {
  const pending = await ctx.prisma.deployment.findMany({
    where: { userId, status: "PENDING" },
    select: { id: true, txSignature: true, deployedAt: true },
    take: 50,
  });
  const now = Date.now();
  for (const row of pending) {
    const session = decodeSession(row.txSignature);
    if (session) {
      if (!isStale(session, now)) continue;
      const next: DeploySession = {
        ...session,
        phase: "failed",
        lockedUntil: undefined,
        error: "Deploy abandoned (no progress for 15 minutes). Reclaim its buffer SOL from the deploy history.",
        updatedAt: now,
      };
      await ctx.prisma.deployment.updateMany({
        where: { id: row.id, txSignature: row.txSignature },
        data: { status: "FAILED", txSignature: encodeSession(next) },
      });
    } else if (now - new Date(row.deployedAt).getTime() > 15 * 60_000) {
      // Legacy inline deploy killed by the function timeout.
      await ctx.prisma.deployment.updateMany({
        where: { id: row.id, status: "PENDING" },
        data: { status: "FAILED", txSignature: "failed" },
      });
    }
  }
}

/** Mark a deploy FAILED, trying (bounded) to close its buffer first so the SOL comes back. */
async function failDeployment(
  ctx: any,
  deploymentId: string,
  prevStored: string,
  session: DeploySession,
  message: string,
  connection: Connection | null,
  deployerKp: Keypair | null,
): Promise<DeploySession> {
  const next: DeploySession = {
    ...session,
    phase: "failed",
    error: message.slice(0, 2000),
    lockedUntil: undefined,
    updatedAt: Date.now(),
  };
  if (connection && deployerKp && !session.bufferClosed) {
    try {
      const closed = await closeBuffer(connection, deployerKp, new PublicKey(session.buffer), 12_000);
      if (closed !== null) next.bufferClosed = true;
    } catch (e) {
      log("buffer close after failure failed:", e instanceof Error ? e.message : e);
    }
  }
  await ctx.prisma.deployment
    .updateMany({
      where: { id: deploymentId, txSignature: prevStored },
      data: { status: "FAILED", txSignature: encodeSession(next) },
    })
    .catch((e: unknown) => log("failed to persist FAILED status:", e));
  return next;
}

// ─── Step phases ────────────────────────────────────────────────────────────

async function runCreate(
  connection: Connection,
  s: DeploySession,
  deployerKp: Keypair,
): Promise<DeploySession> {
  const bufferPk = new PublicKey(s.buffer);
  if (await connection.getAccountInfo(bufferPk)) {
    return { ...s, phase: "write", updatedAt: Date.now() };
  }
  if (s.createAttempts >= MAX_CREATE_ATTEMPTS) {
    return { ...s, phase: "failed", error: "Could not create the buffer account. Check the deployer balance and try again." };
  }
  const bufferKp = keypairFromStoredSecret(s.bufferSecret);
  if (!bufferKp.publicKey.equals(bufferPk)) throw new Error("Stored buffer keypair does not match the buffer address");

  const space = BUFFER_ACCOUNT_METADATA_SIZE + s.binaryLength;
  const rent = await connection.getMinimumBalanceForRentExemption(space);
  const bh = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    blockhash: bh.blockhash,
    lastValidBlockHeight: bh.lastValidBlockHeight,
    feePayer: deployerKp.publicKey,
  }).add(
    SystemProgram.createAccount({
      fromPubkey: deployerKp.publicKey,
      newAccountPubkey: bufferPk,
      space,
      lamports: rent,
      programId: BPF_LOADER_UPGRADEABLE,
    }),
    createInitializeBufferIx(bufferPk, deployerKp.publicKey),
  );
  tx.sign(bufferKp, deployerKp);

  const sim = await connection.simulateTransaction(tx).catch(() => null);
  if (sim?.value?.err) {
    return {
      ...s,
      phase: "failed",
      error: `Buffer creation would fail: ${JSON.stringify(sim.value.err)}\n${(sim.value.logs ?? []).join("\n")}`,
    };
  }

  const sig = await sendSigned(connection, tx);
  const res = await waitForSignature(connection, sig, CONFIRM_WAIT_MS);
  const attempts = s.createAttempts + 1;
  if (res.state === "confirmed") return { ...s, phase: "write", createAttempts: attempts, updatedAt: Date.now() };
  // Pending or failed: the next step re-checks the account before resending.
  return { ...s, createAttempts: attempts, updatedAt: Date.now() };
}

async function sendChunks(
  connection: Connection,
  s: DeploySession,
  binary: Buffer,
  deployerKp: Keypair,
  indices: number[],
  deadline: number,
): Promise<number> {
  const bufferPk = new PublicKey(s.buffer);
  let bh = await connection.getLatestBlockhash("confirmed");
  let bhAt = Date.now();
  let sentThrough = -1;
  for (const idx of indices) {
    if (Date.now() >= deadline) break;
    if (Date.now() - bhAt > 30_000) {
      bh = await connection.getLatestBlockhash("confirmed");
      bhAt = Date.now();
    }
    const { offset, end } = chunkRange(idx, s.binaryLength, s.chunkSize);
    const tx = new Transaction({
      blockhash: bh.blockhash,
      lastValidBlockHeight: bh.lastValidBlockHeight,
      feePayer: deployerKp.publicKey,
    }).add(createWriteIx(bufferPk, deployerKp.publicKey, offset, binary.subarray(offset, end)));
    tx.sign(deployerKp);
    try {
      await sendSigned(connection, tx);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("429")) {
        await sleep(2000);
        await sendSigned(connection, tx).catch(() => undefined);
      } else {
        // Fire-and-forget: the verify phase rewrites anything that didn't land.
        log(`chunk ${idx} send error: ${msg.slice(0, 200)}`);
      }
    }
    sentThrough = idx;
    await sleep(CHUNK_SEND_DELAY_MS);
  }
  return sentThrough;
}

async function runWrite(
  connection: Connection,
  s: DeploySession,
  binary: Buffer,
  deployerKp: Keypair,
  deadline: number,
): Promise<DeploySession> {
  const batch = planWriteBatch(s, MAX_CHUNKS_PER_STEP);
  const last = await sendChunks(connection, s, binary, deployerKp, batch, deadline);
  return afterWrite(s, last + 1);
}

async function runVerify(
  connection: Connection,
  s: DeploySession,
  binary: Buffer,
  deployerKp: Keypair,
  deadline: number,
): Promise<DeploySession> {
  await sleep(2000); // let the tail of the last batch land before reading
  const acc = await connection.getAccountInfo(new PublicKey(s.buffer));
  if (!acc) return { ...s, phase: "failed", error: "The buffer account disappeared before the deploy finished." };
  const missing = findMissingChunks(binary, bufferProgramBytes(acc.data, s.binaryLength), s.chunkSize);
  const next = afterVerify(s, missing.length);
  if (next.phase === "verify") {
    await sendChunks(connection, s, binary, deployerKp, missing, deadline);
  }
  return next;
}

// ─── Finalize helpers ───────────────────────────────────────────────────────

async function deployLanded(
  connection: Connection,
  s: DeploySession,
  programId: PublicKey,
  programDataAddress: PublicKey,
): Promise<boolean> {
  if (s.isUpgrade) {
    const acc = await connection.getAccountInfo(programDataAddress);
    if (!acc || acc.data.length < 12) return false;
    // ProgramData: u32 enum tag, then the u64 slot of the last deploy/upgrade.
    return acc.data.readBigUInt64LE(4) > BigInt(s.preUpgradeSlot);
  }
  const acc = await connection.getAccountInfo(programId);
  return !!acc && acc.executable;
}

function buildFinalizeTx(
  s: DeploySession,
  bh: { blockhash: string; lastValidBlockHeight: number },
  deployerKp: Keypair,
  programKp: Keypair,
  programDataAddress: PublicKey,
  programRent: number,
): Transaction {
  const deployerPk = deployerKp.publicKey;
  const programId = programKp.publicKey;
  const bufferPk = new PublicKey(s.buffer);
  const tx = new Transaction({
    blockhash: bh.blockhash,
    lastValidBlockHeight: bh.lastValidBlockHeight,
    feePayer: deployerPk,
  });
  if (s.isUpgrade) {
    tx.add(createUpgradeIx(programDataAddress, programId, bufferPk, deployerPk, deployerPk));
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
        bufferPk,
        deployerPk,
        deployerPk,
        s.maxProgramLen,
      ),
    );
    tx.sign(programKp, deployerKp);
  }
  return tx;
}

async function completeDeployment(ctx: any, deployment: any, prevStored: string, s: DeploySession) {
  const network = deployment.network as Network;
  const sig = s.finalizeSig ?? "confirmed-on-chain";
  const explorerUrl = buildExplorerUrl(network, deployment.programId);
  const res = await ctx.prisma.deployment.updateMany({
    where: { id: deployment.id, txSignature: prevStored },
    data: {
      status: "CONFIRMED",
      txSignature: sig,
      explorerUrl: explorerUrl ?? undefined,
      ...(s.isUpgrade ? { upgradedAt: new Date() } : {}),
    },
  });
  if (res.count === 0) {
    throw new TRPCError({ code: "CONFLICT", message: "Deploy was updated by another request. Reload to see its state." });
  }
  await ctx.prisma.project.update({
    where: { id: deployment.projectId },
    data: { status: "DEPLOYED" },
  });
  log("=== DEPLOY COMPLETE ===", deployment.programId, sig);
  return {
    ...snapshot({ ...deployment, status: "CONFIRMED", txSignature: sig, explorerUrl }, null),
    phase: "done" as const,
  };
}

// ─── Router ────────────────────────────────────────────────────────────────────

const networkInput = z.enum(["DEVNET", "MAINNET", "LOCALNET"]).default("DEVNET");

export const deployRouter = router({
  /**
   * Deployer address + balance + the SOL a deploy of the latest build needs, so
   * the UI can ask the user to fund it first.
   */
  checkBalance: protectedProcedure
    .input(z.object({ projectId: z.string(), network: networkInput }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId },
        select: { id: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      const deployerKp = await getOrCreateDeployer(ctx, userId);
      const connection = connectionFor(input.network);
      const balance = await connection.getBalance(deployerKp.publicKey);

      const compilation = await ctx.prisma.compilation.findFirst({
        where: { projectId: project.id, status: "SUCCESS", binaryUrl: { not: null } },
        orderBy: { completedAt: "desc" },
      });

      let needed = 2 * LAMPORTS_PER_SOL;
      if (compilation?.binaryUrl) {
        const len = (await readCompilationBinary(compilation)).length;
        const [bufferRent, programDataRent, programAccountRent] = await Promise.all([
          connection.getMinimumBalanceForRentExemption(BUFFER_ACCOUNT_METADATA_SIZE + len),
          connection.getMinimumBalanceForRentExemption(PROGRAM_DATA_HEADER_SIZE + 2 * len),
          connection.getMinimumBalanceForRentExemption(36),
        ]);
        // Upper bound (fresh deploy) plus a small margin for retries.
        needed =
          estimateDeployCost({ binaryLength: len, bufferRent, programDataRent, programAccountRent, isUpgrade: false }) +
          Math.floor(0.05 * LAMPORTS_PER_SOL);
      }

      return {
        address: deployerKp.publicKey.toBase58(),
        balance,
        needed,
        funded: balance >= needed,
      };
    }),

  /**
   * Start (or resume) a deploy. Validates everything that can fail before SOL
   * is spent, then creates the Deployment row with an encrypted buffer keypair
   * and the chunk plan. The client then calls `step` until phase is
   * "finalize", then `finalize` until phase is "done".
   */
  start: protectedProcedure
    .input(z.object({ projectId: z.string(), network: networkInput }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      await sweepStaleDeployments(ctx, userId);

      const { programKp, programSecretKey, binaryBuffer, compilation } =
        await loadBinaryAndMeta(ctx, input.projectId, userId);

      // Resume an in-flight deploy of the same build instead of starting over.
      const inFlight = await ctx.prisma.deployment.findFirst({
        where: { projectId: input.projectId, userId, network: input.network, status: "PENDING" },
        orderBy: { deployedAt: "desc" },
      });
      const inFlightSession = inFlight ? decodeSession(inFlight.txSignature) : null;
      if (inFlight && inFlightSession) {
        if (inFlightSession.compilationId === compilation.id && inFlight.programId === programKp.publicKey.toBase58()) {
          return { ...snapshot(inFlight, inFlightSession), resumed: true };
        }
        // A newer build supersedes it: fail it and reclaim its buffer (bounded).
        const deployer = await readDeployer(ctx, userId).catch(() => ({ keypair: null }));
        await failDeployment(
          ctx,
          inFlight.id,
          inFlight.txSignature,
          inFlightSession,
          "Superseded by a deploy of a newer build.",
          connectionFor(input.network),
          deployer.keypair,
        );
      }

      const rl = deployRateLimit(userId);
      if (!rl.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Deploy rate limit exceeded. Try again in ${Math.ceil((rl.resetAt - Date.now()) / 1000)}s.`,
        });
      }

      const deployerKp = await getOrCreateDeployer(ctx, userId);
      const deployerPk = deployerKp.publicKey;
      const programId = programKp.publicKey;
      if (deployerPk.equals(programId)) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Deployer and program keypairs are identical. Reset the program keypair, recompile, and deploy again.",
        });
      }

      const connection = connectionFor(input.network);
      const [programDataAddress] = PublicKey.findProgramAddressSync(
        [programId.toBuffer()],
        BPF_LOADER_UPGRADEABLE,
      );
      const existingProgramData = await connection.getAccountInfo(programDataAddress);
      const isUpgrade = existingProgramData !== null;
      let preUpgradeSlot = BigInt(0);
      if (existingProgramData) {
        const space = existingProgramData.data.length - PROGRAM_DATA_HEADER_SIZE;
        if (binaryBuffer.length > space) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Program binary (${binaryBuffer.length} bytes) is larger than the allocated ProgramData space (${space} bytes). Reset the program keypair to deploy a fresh program (new deploys allocate 2x the binary size).`,
          });
        }
        preUpgradeSlot = existingProgramData.data.readBigUInt64LE(4);
      }

      const [bufferRent, programDataRent, programAccountRent, balance] = await Promise.all([
        connection.getMinimumBalanceForRentExemption(BUFFER_ACCOUNT_METADATA_SIZE + binaryBuffer.length),
        connection.getMinimumBalanceForRentExemption(PROGRAM_DATA_HEADER_SIZE + 2 * binaryBuffer.length),
        connection.getMinimumBalanceForRentExemption(36),
        connection.getBalance(deployerPk),
      ]);
      const estimatedCost = estimateDeployCost({
        binaryLength: binaryBuffer.length,
        bufferRent,
        programDataRent,
        programAccountRent,
        isUpgrade,
      });
      if (balance < estimatedCost) {
        const deficit = (estimatedCost - balance) / LAMPORTS_PER_SOL;
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Deployer needs ~${(estimatedCost / LAMPORTS_PER_SOL).toFixed(2)} SOL but has ${(balance / LAMPORTS_PER_SOL).toFixed(2)} SOL. Send at least ${deficit.toFixed(2)} SOL to:\n\n${deployerPk.toBase58()}`,
        });
      }

      const bufferKp = Keypair.generate();
      const session = newSession({
        compilationId: compilation.id,
        binaryLength: binaryBuffer.length,
        buffer: bufferKp.publicKey.toBase58(),
        bufferSecret: encodeSecretKey(bufferKp.secretKey),
        isUpgrade,
        preUpgradeSlot,
      });
      const binaryHash = createHash("sha256").update(binaryBuffer).digest("hex").slice(0, 16);
      const deployment = await ctx.prisma.deployment.create({
        data: {
          projectId: input.projectId,
          userId,
          network: input.network,
          programId: programId.toBase58(),
          txSignature: encodeSession(session),
          irHash: compilation.irHash ?? binaryHash,
          binaryHash,
          status: "PENDING",
          programKeypair: programSecretKey,
        },
      });
      log("start", deployment.id, "program", programId.toBase58(), "buffer", session.buffer, "chunks", session.totalChunks, "upgrade", isUpgrade);
      return { ...snapshot(deployment, session), resumed: false };
    }),

  /** One bounded unit of work (≤ ~40 s): create the buffer, write chunks, or verify/rewrite. */
  step: protectedProcedure
    .input(z.object({ deploymentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      const { deployment, session } = await loadOwnedDeployment(ctx, input.deploymentId, userId);
      if (deployment.status !== "PENDING" || !session) {
        const snap = snapshot(deployment, session);
        if (snap.phase === "failed") throw new TRPCError({ code: "BAD_REQUEST", message: snap.error ?? "Deploy failed" });
        return { ...snap, busy: false };
      }
      if (session.phase === "finalize" || session.phase === "done" || session.phase === "failed") {
        return { ...snapshot(deployment, session), busy: false };
      }
      if (isLocked(session)) return { ...snapshot(deployment, session), busy: true };

      const started = Date.now();
      const deadline = started + STEP_BUDGET_MS;
      let s: DeploySession = { ...session, lockedUntil: started + STEP_LEASE_MS };
      let stored = await saveSession(ctx, deployment.id, deployment.txSignature, s);

      const connection = connectionFor(deployment.network as Network);
      let deployerKp: Keypair | null = null;
      try {
        deployerKp = await requireDeployer(ctx, userId);
        const compilation = await ctx.prisma.compilation.findFirst({
          where: { id: s.compilationId, projectId: deployment.projectId },
          select: { binaryBytes: true, binaryUrl: true },
        });
        if (!compilation) throw new Error("The build this deploy uses was deleted. Recompile and deploy again.");
        const binary = await readCompilationBinary(compilation);
        if (binary.length !== s.binaryLength) throw new Error("The stored binary changed during the deploy. Recompile and deploy again.");

        if (s.phase === "create") s = await runCreate(connection, s, deployerKp);
        else if (s.phase === "write") s = await runWrite(connection, s, binary, deployerKp, deadline);
        else if (s.phase === "verify") s = await runVerify(connection, s, binary, deployerKp, deadline);
      } catch (err) {
        if (err instanceof TRPCError && err.code === "PRECONDITION_FAILED") {
          // Key problem: keep the deploy resumable once the key is restored.
          await saveSession(ctx, deployment.id, stored, { ...session, lockedUntil: undefined }).catch(() => undefined);
          throw err;
        }
        // Transient RPC trouble: release the lease and let the client retry this step.
        const msg = err instanceof Error ? err.message : String(err);
        log("step error (retryable):", msg.slice(0, 300));
        await saveSession(ctx, deployment.id, stored, { ...s, lockedUntil: undefined, updatedAt: Date.now() }).catch(() => undefined);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Deploy step failed (it will resume): ${msg.slice(0, 300)}` });
      }

      if (s.phase === "failed") {
        const failed = await failDeployment(ctx, deployment.id, stored, s, s.error ?? "Deploy failed", connection, deployerKp);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: failed.bufferClosed
            ? `${failed.error} The buffer was closed and its SOL returned.`
            : `${failed.error} Reclaim the buffer's SOL from the deploy history.`,
        });
      }

      s = { ...s, lockedUntil: undefined, updatedAt: Date.now() };
      stored = await saveSession(ctx, deployment.id, stored, s);
      return { ...snapshot({ ...deployment, txSignature: stored }, s), busy: false };
    }),

  /**
   * Send the deploy/upgrade instruction and wait (bounded) for it. Idempotent:
   * if a previous call's transaction landed, it just records the result. Returns
   * phase "finalize" while still unconfirmed; the client calls again.
   */
  finalize: protectedProcedure
    .input(z.object({ deploymentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      const { deployment, session } = await loadOwnedDeployment(ctx, input.deploymentId, userId);
      if (deployment.status === "CONFIRMED" || deployment.status === "UPGRADED") {
        return { ...snapshot(deployment, null), phase: "done" as const, busy: false };
      }
      if (deployment.status !== "PENDING" || !session) {
        throw new TRPCError({ code: "BAD_REQUEST", message: session?.error ?? "Deploy failed" });
      }
      if (session.phase !== "finalize") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Deploy is not ready to finalize (phase: ${session.phase}).` });
      }
      if (isLocked(session)) return { ...snapshot(deployment, session), busy: true };

      let s: DeploySession = { ...session, lockedUntil: Date.now() + STEP_LEASE_MS };
      let stored = await saveSession(ctx, deployment.id, deployment.txSignature, s);
      const release = async (next: DeploySession) => {
        stored = await saveSession(ctx, deployment.id, stored, { ...next, lockedUntil: undefined, updatedAt: Date.now() });
      };

      const connection = connectionFor(deployment.network as Network);
      let deployerKp: Keypair | null = null;
      try {
        deployerKp = await requireDeployer(ctx, userId);
        if (!deployment.programKeypair) throw new Error("Deployment has no program keypair");
        const programKp = readProgramKeypair(deployment.programKeypair);
        const programId = programKp.publicKey;
        const [programDataAddress] = PublicKey.findProgramAddressSync([programId.toBuffer()], BPF_LOADER_UPGRADEABLE);

        if (await deployLanded(connection, s, programId, programDataAddress)) {
          return { ...(await completeDeployment(ctx, deployment, stored, s)), busy: false };
        }

        // A transaction from an earlier call may still be in flight.
        if (s.finalizeSig) {
          const res = await waitForSignature(connection, s.finalizeSig, 3000);
          if (res.state === "confirmed") return { ...(await completeDeployment(ctx, deployment, stored, s)), busy: false };
          if (res.state === "failed") {
            const failed = await failDeployment(ctx, deployment.id, stored, s, `Deploy transaction failed: ${JSON.stringify(res.err)}`, connection, deployerKp);
            throw new TRPCError({ code: "BAD_REQUEST", message: failed.error! });
          }
          const height = await connection.getBlockHeight("confirmed");
          if (s.finalizeLastValidBlockHeight && height <= s.finalizeLastValidBlockHeight) {
            const again = await waitForSignature(connection, s.finalizeSig, CONFIRM_WAIT_MS);
            if (again.state === "confirmed") return { ...(await completeDeployment(ctx, deployment, stored, s)), busy: false };
            if (again.state === "pending") {
              await release(s);
              return { ...snapshot({ ...deployment, txSignature: stored }, s), busy: false };
            }
            const failed = await failDeployment(ctx, deployment.id, stored, s, `Deploy transaction failed: ${JSON.stringify(again.err)}`, connection, deployerKp);
            throw new TRPCError({ code: "BAD_REQUEST", message: failed.error! });
          }
          // Blockhash expired without landing: safe to send a fresh one.
        }

        const programRent = await connection.getMinimumBalanceForRentExemption(36);
        const bh = await connection.getLatestBlockhash("confirmed");
        const tx = buildFinalizeTx(s, bh, deployerKp, programKp, programDataAddress, programRent);
        const sig = await sendSigned(connection, tx);
        // Persist the signature before waiting so a timeout can't lose track of it.
        s = { ...s, finalizeSig: sig, finalizeLastValidBlockHeight: bh.lastValidBlockHeight, updatedAt: Date.now() };
        stored = await saveSession(ctx, deployment.id, stored, s);

        const res = await waitForSignature(connection, sig, CONFIRM_WAIT_MS);
        if (res.state === "confirmed") return { ...(await completeDeployment(ctx, deployment, stored, s)), busy: false };
        if (res.state === "failed") {
          const failed = await failDeployment(ctx, deployment.id, stored, s, `Deploy transaction failed: ${JSON.stringify(res.err)}`, connection, deployerKp);
          throw new TRPCError({ code: "BAD_REQUEST", message: `${failed.error}${failed.bufferClosed ? " The buffer was closed and its SOL returned." : ""}` });
        }
        await release(s);
        return { ...snapshot({ ...deployment, txSignature: stored }, s), busy: false };
      } catch (err) {
        if (err instanceof TRPCError && err.code === "BAD_REQUEST") throw err;
        const msg = err instanceof Error ? err.message : String(err);
        await release(s).catch(() => undefined);
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Finalize failed (it will retry): ${msg.slice(0, 300)}` });
      }
    }),

  /**
   * Close a failed/abandoned deploy's buffer and return its SOL to the deployer.
   * On a still-PENDING deploy this cancels it first.
   */
  reclaimBuffer: protectedProcedure
    .input(z.object({ deploymentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      const { deployment, session } = await loadOwnedDeployment(ctx, input.deploymentId, userId);
      if (!session || !hasReclaimableBuffer(session)) {
        return { closed: true, lamports: 0, message: "Nothing to reclaim." };
      }
      if (deployment.status === "PENDING" && isLocked(session)) {
        throw new TRPCError({ code: "CONFLICT", message: "This deploy is running right now. Try again in a minute." });
      }
      if (deployment.status === "PENDING" && session.phase === "finalize" && session.finalizeSig) {
        throw new TRPCError({ code: "CONFLICT", message: "The deploy transaction was already sent. Resume the deploy instead." });
      }
      const deployerKp = await requireDeployer(ctx, userId);
      const connection = connectionFor(deployment.network as Network);
      const lamports = await closeBuffer(connection, deployerKp, new PublicKey(session.buffer), CONFIRM_WAIT_MS);
      if (lamports === null) {
        return { closed: false, lamports: 0, message: "Close transaction sent but not confirmed yet. Try again shortly." };
      }
      const next: DeploySession = {
        ...session,
        phase: "failed",
        bufferClosed: true,
        lockedUntil: undefined,
        error: session.error ?? "Cancelled; buffer closed.",
        updatedAt: Date.now(),
      };
      await ctx.prisma.deployment.updateMany({
        where: { id: deployment.id, txSignature: deployment.txSignature },
        data: { status: "FAILED", txSignature: encodeSession(next) },
      });
      return {
        closed: true,
        lamports,
        message: lamports > 0 ? `Reclaimed ${(lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL.` : "Buffer was already closed.",
      };
    }),

  /** The latest deploy of a project (for resuming after a reload) plus failed deploys holding SOL. */
  active: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      await sweepStaleDeployments(ctx, userId);
      const rows = await ctx.prisma.deployment.findMany({
        where: { projectId: input.projectId, userId },
        orderBy: { deployedAt: "desc" },
        take: 20,
      });
      const snaps = rows.map((r: any) => snapshot(r, decodeSession(r.txSignature)));
      return {
        pending: snaps.find((s: ReturnType<typeof snapshot>) => s.status === "PENDING") ?? null,
        reclaimable: snaps.filter((s: ReturnType<typeof snapshot>) => s.reclaimable),
      };
    }),

  status: protectedProcedure
    .input(z.object({ deploymentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { deployment, session } = await loadOwnedDeployment(ctx, input.deploymentId, ctx.session.user.id!);
      return snapshot(deployment, session);
    }),

  history: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId },
        select: { id: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      await sweepStaleDeployments(ctx, userId);

      const deployments = await ctx.prisma.deployment.findMany({
        where: { projectId: input.projectId },
        orderBy: { deployedAt: "desc" },
        take: 20,
      });
      return deployments.map(({ programKeypair: _programKeypair, ...deployment }: any) => {
        const session = decodeSession(deployment.txSignature);
        const snap = snapshot(deployment, session);
        return {
          ...deployment,
          txSignature: snap.txSignature ?? (deployment.status === "PENDING" ? "pending" : "failed"),
          phase: snap.phase,
          progress: snap.progress,
          error: snap.error,
          reclaimable: snap.reclaimable,
        };
      });
    }),

  /**
   * Reset the program keypair for a project. Generates a new keypair so the
   * next deploy creates a fresh program (with 2x allocation for upgrades).
   * Returns the new program ID.
   */
  resetProgramKeypair: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id!;
      const project = await ctx.prisma.project.findFirst({
        where: { id: input.projectId, userId },
        select: { id: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      const newKp = Keypair.generate();
      const newProgramId = newKp.publicKey.toBase58();
      await ctx.prisma.project.update({
        where: { id: project.id },
        data: { programKeypair: encodeSecretKey(newKp.secretKey) },
      });
      await setProgramIdInFlow(ctx, project.id, newProgramId);

      log("reset program keypair:", newProgramId);
      return { programId: newProgramId };
    }),

  /**
   * Explicitly replace a deployer wallet that can no longer be decrypted.
   * Refuses while the current one is readable, so funds are never orphaned silently.
   */
  resetDeployerWallet: protectedProcedure
    .input(z.object({ confirm: z.literal(true) }))
    .mutation(async ({ ctx }) => {
      const userId = ctx.session.user.id!;
      const user = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: { deployerKeypair: true },
      });
      if (user?.deployerKeypair) {
        let readable = true;
        try {
          keypairFromStoredSecret(user.deployerKeypair);
        } catch {
          readable = false;
        }
        if (readable) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Your deployer wallet is readable; it won't be replaced." });
        }
      }
      const kp = Keypair.generate();
      await ctx.prisma.user.updateMany({
        where: { id: userId, deployerKeypair: user?.deployerKeypair ?? null },
        data: { deployerKeypair: encodeSecretKey(kp.secretKey) },
      });
      return { address: kp.publicKey.toBase58() };
    }),
});
