import { describe, expect, it } from "vitest";
import {
  BUFFER_ACCOUNT_METADATA_SIZE,
  CHUNK_SIZE,
  DEPLOY_STALE_MS,
  MAX_VERIFY_PASSES,
  afterVerify,
  afterWrite,
  bufferProgramBytes,
  chunkCount,
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
} from "../server/deploy/plan";

const session = (binaryLength: number, overrides: Partial<DeploySession> = {}): DeploySession => ({
  ...newSession({
    compilationId: "c1",
    binaryLength,
    buffer: "Buf111",
    bufferSecret: "enc:v1:x",
    isUpgrade: false,
    now: 1_000,
  }),
  ...overrides,
});

describe("deploy plan: chunk offsets", () => {
  it("splits a binary into CHUNK_SIZE pieces with a short tail", () => {
    const len = CHUNK_SIZE * 3 + 10;
    expect(chunkCount(len)).toBe(4);
    expect(chunkRange(0, len)).toEqual({ offset: 0, end: CHUNK_SIZE });
    expect(chunkRange(2, len)).toEqual({ offset: 2 * CHUNK_SIZE, end: 3 * CHUNK_SIZE });
    expect(chunkRange(3, len)).toEqual({ offset: 3 * CHUNK_SIZE, end: len });
  });

  it("handles exact multiples and tiny programs", () => {
    expect(chunkCount(CHUNK_SIZE * 2)).toBe(2);
    expect(chunkRange(1, CHUNK_SIZE * 2)).toEqual({ offset: CHUNK_SIZE, end: CHUNK_SIZE * 2 });
    expect(chunkCount(1)).toBe(1);
    expect(chunkCount(0)).toBe(0);
  });

  it("rejects out-of-range chunks", () => {
    expect(() => chunkRange(4, CHUNK_SIZE * 4)).toThrow(RangeError);
    expect(() => chunkRange(-1, 100)).toThrow(RangeError);
  });

  it("covers every byte exactly once", () => {
    const len = 200_123;
    let covered = 0;
    let prevEnd = 0;
    for (let i = 0; i < chunkCount(len); i++) {
      const { offset, end } = chunkRange(i, len);
      expect(offset).toBe(prevEnd);
      covered += end - offset;
      prevEnd = end;
    }
    expect(covered).toBe(len);
  });
});

describe("deploy plan: write batches and resume", () => {
  it("starts in create, with fresh-deploy headroom", () => {
    const s = session(5000);
    expect(s.phase).toBe("create");
    expect(s.maxProgramLen).toBe(10_000);
    const up = newSession({ compilationId: "c", binaryLength: 5000, buffer: "b", bufferSecret: "s", isUpgrade: true, preUpgradeSlot: BigInt(42) });
    expect(up.maxProgramLen).toBe(5000);
    expect(up.preUpgradeSlot).toBe("42");
  });

  it("plans batches from the cursor and stops at the end", () => {
    const s = session(CHUNK_SIZE * 10, { phase: "write" });
    expect(planWriteBatch(s, 4)).toEqual([0, 1, 2, 3]);
    expect(planWriteBatch({ ...s, nextChunk: 8 }, 4)).toEqual([8, 9]);
    expect(planWriteBatch({ ...s, nextChunk: 10 }, 4)).toEqual([]);
  });

  it("a large program needs several steps; each resumes from the persisted cursor", () => {
    let s = session(CHUNK_SIZE * 250 + 7, { phase: "write" });
    const seen: number[] = [];
    let steps = 0;
    while (s.phase === "write") {
      // Simulate a reload between steps: the session round-trips through storage.
      s = decodeSession(encodeSession(s))!;
      const batch = planWriteBatch(s, 120);
      seen.push(...batch);
      s = afterWrite(s, batch[batch.length - 1] + 1, 2_000);
      steps++;
    }
    expect(steps).toBe(3);
    expect(s.phase).toBe("verify");
    expect(seen).toEqual(Array.from({ length: 251 }, (_, i) => i));
  });

  it("a step cut short by its time budget advances only past what it sent", () => {
    const s = session(CHUNK_SIZE * 10, { phase: "write", nextChunk: 3 });
    const next = afterWrite(s, 6);
    expect(next.nextChunk).toBe(6);
    expect(next.phase).toBe("write");
    expect(planWriteBatch(next, 100)[0]).toBe(6);
    // Nothing sent (deadline hit immediately) never moves the cursor backwards.
    expect(afterWrite(next, 0).nextChunk).toBe(6);
  });
});

describe("deploy plan: verify and completion", () => {
  const binary = Uint8Array.from({ length: CHUNK_SIZE * 3 + 5 }, (_, i) => (i * 7) % 251);

  it("finds no missing chunks when the buffer matches", () => {
    const account = new Uint8Array(BUFFER_ACCOUNT_METADATA_SIZE + binary.length);
    account.set(binary, BUFFER_ACCOUNT_METADATA_SIZE);
    expect(findMissingChunks(binary, bufferProgramBytes(account, binary.length))).toEqual([]);
  });

  it("finds exactly the chunks that differ (including a short tail)", () => {
    const onChain = binary.slice();
    onChain[CHUNK_SIZE + 3] ^= 0xff; // chunk 1
    onChain[binary.length - 1] ^= 0xff; // tail chunk 3
    expect(findMissingChunks(binary, onChain)).toEqual([1, 3]);
  });

  it("treats a zeroed (never written) buffer as all missing", () => {
    expect(findMissingChunks(binary, new Uint8Array(binary.length))).toEqual([0, 1, 2, 3]);
  });

  it("moves to finalize when nothing is missing", () => {
    const s = afterVerify(session(CHUNK_SIZE + 1, { phase: "verify" }), 0);
    expect(s.phase).toBe("finalize");
    expect(progressOf(s)).toEqual({ current: 2, total: 2 });
  });

  it("keeps verifying while chunks are missing, then fails after the pass limit", () => {
    let s = session(CHUNK_SIZE * 4, { phase: "verify" });
    for (let i = 0; i < MAX_VERIFY_PASSES; i++) {
      s = afterVerify(s, 2);
      expect(s.phase).toBe("verify");
    }
    expect(progressOf(s)).toEqual({ current: 2, total: 4 });
    s = afterVerify(s, 2);
    expect(s.phase).toBe("failed");
    expect(s.error).toMatch(/still missing/);
  });

  it("reports write progress from the cursor", () => {
    expect(progressOf(session(CHUNK_SIZE * 4))).toEqual({ current: 0, total: 4 });
    expect(progressOf(session(CHUNK_SIZE * 4, { phase: "write", nextChunk: 3 }))).toEqual({ current: 3, total: 4 });
  });
});

describe("deploy plan: session storage, staleness, reclaim", () => {
  it("round-trips through the stored marker and rejects garbage", () => {
    const s = session(1234, { phase: "write", nextChunk: 1 });
    const stored = encodeSession(s);
    expect(stored.startsWith("session:")).toBe(true);
    expect(decodeSession(stored)).toEqual(s);
    expect(decodeSession("pending")).toBeNull();
    expect(decodeSession("session:not-json")).toBeNull();
    expect(decodeSession(null)).toBeNull();
  });

  it("detects stale sessions and active leases", () => {
    const s = session(10, { updatedAt: 0 });
    expect(isStale(s, DEPLOY_STALE_MS + 1)).toBe(true);
    expect(isStale(s, DEPLOY_STALE_MS - 1)).toBe(false);
    expect(isLocked({ ...s, lockedUntil: 100 }, 50)).toBe(true);
    expect(isLocked({ ...s, lockedUntil: 100 }, 150)).toBe(false);
  });

  it("a failed deploy keeps its buffer reclaimable until closed", () => {
    const failed = session(10, { phase: "failed" });
    expect(hasReclaimableBuffer(failed)).toBe(true);
    expect(hasReclaimableBuffer({ ...failed, bufferClosed: true })).toBe(false);
    expect(hasReclaimableBuffer({ ...failed, phase: "done" })).toBe(false);
    expect(hasReclaimableBuffer(null)).toBe(false);
  });

  it("estimates cost: upgrades skip ProgramData and program account rent", () => {
    const args = { binaryLength: CHUNK_SIZE * 2, bufferRent: 1000, programDataRent: 2000, programAccountRent: 300 };
    expect(estimateDeployCost({ ...args, isUpgrade: false })).toBe(6 * 5000 + 1000 + 2000 + 300);
    expect(estimateDeployCost({ ...args, isUpgrade: true })).toBe(6 * 5000 + 1000);
  });
});
