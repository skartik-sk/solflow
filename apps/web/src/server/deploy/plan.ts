// Pure planning logic for the resumable, client-driven deploy protocol.
//
// A deploy is split into short requests so none runs past the 60 s serverless limit:
//   deploy.start    → validates, creates the Deployment row + a buffer keypair (encrypted) + this session
//   deploy.step     → one bounded batch: create the buffer, write chunks from the cursor, or verify/rewrite
//   deploy.finalize → sends the deploy/upgrade instruction and confirms it (retryable, idempotent)
// The session is persisted on the Deployment row after every request, so a reload resumes
// where the last request stopped, and a failed deploy keeps the buffer address so its SOL
// can be reclaimed.
//
// No I/O here: everything is unit-tested in src/__tests__/deploy-plan.test.ts.

export const PACKET_DATA_SIZE = 1232;
const WRITE_OVERHEAD = 220 + 44 + 40;
/** Bytes of program data per BPF loader Write transaction. */
export const CHUNK_SIZE = PACKET_DATA_SIZE - WRITE_OVERHEAD;
/** Buffer account header (enum tag + Option<authority>) before the program bytes. */
export const BUFFER_ACCOUNT_METADATA_SIZE = 37;
/** ProgramData header before the program bytes. */
export const PROGRAM_DATA_HEADER_SIZE = 45;

/** Max verify/rewrite passes before giving up (each pass is one step request). */
export const MAX_VERIFY_PASSES = 12;
/** Max create-buffer attempts before giving up. */
export const MAX_CREATE_ATTEMPTS = 4;
/** A PENDING deploy whose session wasn't touched for this long is abandoned. */
export const DEPLOY_STALE_MS = 15 * 60_000;
/** A step holds this lease; a second tab gets `busy` instead of double-writing. */
export const STEP_LEASE_MS = 58_000;

export type DeployPhase = "create" | "write" | "verify" | "finalize" | "done" | "failed";

export interface DeploySession {
  v: 1;
  phase: DeployPhase;
  compilationId: string;
  binaryLength: number;
  chunkSize: number;
  totalChunks: number;
  /** Write cursor: chunks [0, nextChunk) have been sent at least once. */
  nextChunk: number;
  /** Chunks known missing after the last verify read (for progress). */
  missingChunks: number;
  verifyPasses: number;
  createAttempts: number;
  buffer: string;
  /** Buffer secret key, encrypted with the server master key (enc:v1:…). */
  bufferSecret: string;
  bufferClosed: boolean;
  isUpgrade: boolean;
  maxProgramLen: number;
  /** ProgramData slot before an upgrade, to detect that the upgrade landed. */
  preUpgradeSlot: string;
  finalizeSig?: string;
  finalizeLastValidBlockHeight?: number;
  error?: string;
  lockedUntil?: number;
  updatedAt: number;
}

const SESSION_PREFIX = "session:";

// The Deployment table has no column for this yet, so the session lives in
// `txSignature` (a placeholder until the deploy confirms). Swap these two
// functions for a dedicated JSON column when the schema gets one.
export function encodeSession(session: DeploySession): string {
  return SESSION_PREFIX + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

export function decodeSession(stored: string | null | undefined): DeploySession | null {
  if (!stored || !stored.startsWith(SESSION_PREFIX)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(stored.slice(SESSION_PREFIX.length), "base64url").toString("utf8"),
    ) as DeploySession;
    return parsed?.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function isSessionMarker(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith(SESSION_PREFIX);
}

export function chunkCount(binaryLength: number, chunkSize = CHUNK_SIZE): number {
  if (binaryLength <= 0) return 0;
  return Math.ceil(binaryLength / chunkSize);
}

/** Byte range of chunk `index` within the program binary. */
export function chunkRange(
  index: number,
  binaryLength: number,
  chunkSize = CHUNK_SIZE,
): { offset: number; end: number } {
  const offset = index * chunkSize;
  if (index < 0 || offset >= binaryLength) {
    throw new RangeError(`chunk ${index} is outside a ${binaryLength}-byte binary`);
  }
  return { offset, end: Math.min(offset + chunkSize, binaryLength) };
}

export function newSession(args: {
  compilationId: string;
  binaryLength: number;
  buffer: string;
  bufferSecret: string;
  isUpgrade: boolean;
  preUpgradeSlot?: bigint;
  now?: number;
}): DeploySession {
  return {
    v: 1,
    phase: "create",
    compilationId: args.compilationId,
    binaryLength: args.binaryLength,
    chunkSize: CHUNK_SIZE,
    totalChunks: chunkCount(args.binaryLength),
    nextChunk: 0,
    missingChunks: chunkCount(args.binaryLength),
    verifyPasses: 0,
    createAttempts: 0,
    buffer: args.buffer,
    bufferSecret: args.bufferSecret,
    bufferClosed: false,
    isUpgrade: args.isUpgrade,
    // Fresh deploys get 2x headroom for later upgrades (as Solana Playground does).
    maxProgramLen: args.isUpgrade ? args.binaryLength : args.binaryLength * 2,
    preUpgradeSlot: (args.preUpgradeSlot ?? BigInt(0)).toString(),
    updatedAt: args.now ?? Date.now(),
  };
}

/**
 * Chunks the write phase should send this step: from the cursor, at most `maxChunks`.
 * Returns [] when every chunk has been sent once.
 */
export function planWriteBatch(session: DeploySession, maxChunks: number): number[] {
  const start = Math.max(0, session.nextChunk);
  const end = Math.min(session.totalChunks, start + Math.max(0, maxChunks));
  const out: number[] = [];
  for (let i = start; i < end; i++) out.push(i);
  return out;
}

/** Advance the write cursor after `sentThrough` (exclusive) chunks were sent. */
export function afterWrite(session: DeploySession, sentThrough: number, now = Date.now()): DeploySession {
  const nextChunk = Math.min(session.totalChunks, Math.max(session.nextChunk, sentThrough));
  return {
    ...session,
    nextChunk,
    phase: nextChunk >= session.totalChunks ? "verify" : "write",
    updatedAt: now,
  };
}

/** Chunk indices whose on-chain bytes differ from the binary. */
export function findMissingChunks(
  binary: Uint8Array,
  onChainProgramBytes: Uint8Array,
  chunkSize = CHUNK_SIZE,
): number[] {
  const missing: number[] = [];
  const total = chunkCount(binary.length, chunkSize);
  for (let i = 0; i < total; i++) {
    const { offset, end } = chunkRange(i, binary.length, chunkSize);
    let same = onChainProgramBytes.length >= end;
    for (let b = offset; same && b < end; b++) {
      if (binary[b] !== onChainProgramBytes[b]) same = false;
    }
    if (!same) missing.push(i);
  }
  return missing;
}

/** Program bytes inside a buffer account's data (after the 37-byte header). */
export function bufferProgramBytes(accountData: Uint8Array, binaryLength: number): Uint8Array {
  return accountData.subarray(
    BUFFER_ACCOUNT_METADATA_SIZE,
    BUFFER_ACCOUNT_METADATA_SIZE + binaryLength,
  );
}

/** Next state after a verify read found `missing` chunks. */
export function afterVerify(session: DeploySession, missing: number, now = Date.now()): DeploySession {
  if (missing === 0) {
    return { ...session, phase: "finalize", missingChunks: 0, updatedAt: now };
  }
  const verifyPasses = session.verifyPasses + 1;
  if (verifyPasses > MAX_VERIFY_PASSES) {
    return {
      ...session,
      phase: "failed",
      missingChunks: missing,
      verifyPasses,
      error: `${missing} chunk(s) still missing after ${MAX_VERIFY_PASSES} rewrite passes. The RPC may be dropping transactions; try again later.`,
      updatedAt: now,
    };
  }
  return { ...session, phase: "verify", missingChunks: missing, verifyPasses, updatedAt: now };
}

/** Progress for the UI: chunks known written out of the total. */
export function progressOf(session: DeploySession): { current: number; total: number } {
  const total = session.totalChunks;
  switch (session.phase) {
    case "create":
      return { current: 0, total };
    case "write":
      return { current: Math.min(session.nextChunk, total), total };
    case "verify":
      return { current: Math.max(0, total - session.missingChunks), total };
    default:
      return { current: total, total };
  }
}

export function isStale(session: DeploySession, now = Date.now()): boolean {
  return now - session.updatedAt > DEPLOY_STALE_MS;
}

export function isLocked(session: DeploySession, now = Date.now()): boolean {
  return !!session.lockedUntil && session.lockedUntil > now;
}

/** True when a failed/abandoned deploy still holds a buffer whose rent can be reclaimed. */
export function hasReclaimableBuffer(session: DeploySession | null): boolean {
  return !!session && !session.bufferClosed && session.phase !== "done";
}

/** Lamports the deployer needs: tx fees + buffer rent (+ ProgramData rent for a fresh deploy). */
export function estimateDeployCost(args: {
  binaryLength: number;
  bufferRent: number;
  programDataRent: number;
  programAccountRent: number;
  isUpgrade: boolean;
}): number {
  const fees = (chunkCount(args.binaryLength) + 4) * 5000;
  return (
    fees +
    args.bufferRent +
    (args.isUpgrade ? 0 : args.programDataRent + args.programAccountRent)
  );
}
