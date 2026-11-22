import { beforeEach, describe, expect, it, vi } from "vitest";

// End-to-end exercise of the resumable deploy protocol against a fake chain:
// start → step (create, write, verify) → finalize, with reloads, dropped
// chunks, a failure that must keep/return buffer SOL, and key-decrypt failures.

vi.mock("@solflow/auth", () => ({ auth: async () => null }));
vi.mock("@solflow/db", () => ({ prisma: new Proxy({}, { get: (_t, m) => (db as any)?.[m as string] }) }));

const chain = vi.hoisted(() => ({
  accounts: new Map<string, { lamports: number; data: Buffer; owner: string; executable: boolean }>(),
  sigs: new Map<string, { err: unknown }>(),
  dropWrites: 0,
  failNextDeploy: false,
  sends: 0,
}));

vi.mock("@solana/web3.js", async (orig) => {
  const actual = await orig<typeof import("@solana/web3.js")>();
  const LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
  const SYSTEM = actual.SystemProgram.programId.toBase58();
  const bs58 = (await import("bs58")).default;
  class Connection {
    rpcEndpoint = "fake";
    async getAccountInfo(pk: InstanceType<typeof actual.PublicKey>) {
      const a = chain.accounts.get(pk.toBase58());
      return a ? { ...a, owner: new actual.PublicKey(a.owner) } : null;
    }
    async getBalance() {
      return 100 * 1e9;
    }
    async getMinimumBalanceForRentExemption(n: number) {
      return n * 10;
    }
    async getLatestBlockhash() {
      return { blockhash: actual.Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 1000 };
    }
    async getBlockHeight() {
      return 0;
    }
    async simulateTransaction() {
      return { value: { err: null, logs: [] } };
    }
    async getSignatureStatuses(sigs: string[]) {
      return {
        value: sigs.map((s) => {
          const st = chain.sigs.get(s);
          return st ? { err: st.err, confirmationStatus: "confirmed" } : null;
        }),
      };
    }
    async sendRawTransaction(raw: Uint8Array) {
      chain.sends++;
      const tx = actual.Transaction.from(raw);
      const sig = bs58.encode(tx.signature!);
      let err: unknown = null;
      for (const ix of tx.instructions) {
        const pid = ix.programId.toBase58();
        const k = ix.keys.map((x) => x.pubkey.toBase58());
        if (pid === SYSTEM) {
          const space = Number(ix.data.readBigUInt64LE(12));
          const lamports = Number(ix.data.readBigUInt64LE(4));
          chain.accounts.set(k[1], {
            lamports,
            data: Buffer.alloc(space),
            owner: new actual.PublicKey(ix.data.subarray(20, 52)).toBase58(),
            executable: false,
          });
        } else if (pid === LOADER) {
          const tag = ix.data.readUInt32LE(0);
          if (tag === 0) {
            const acc = chain.accounts.get(k[0])!;
            acc.data.writeUInt32LE(1, 0);
            acc.data[4] = 1;
            ix.keys[1].pubkey.toBuffer().copy(acc.data, 5);
          } else if (tag === 1) {
            if (chain.dropWrites > 0) {
              chain.dropWrites--;
              continue; // the RPC "dropped" this chunk
            }
            const offset = ix.data.readUInt32LE(4);
            const len = Number(ix.data.readBigUInt64LE(8));
            ix.data.subarray(16, 16 + len).copy(chain.accounts.get(k[0])!.data, 37 + offset);
          } else if (tag === 2) {
            if (chain.failNextDeploy) {
              chain.failNextDeploy = false;
              err = { InstructionError: [1, "Custom"] };
              chain.accounts.delete(k[2]); // tx reverted: program account creation rolls back
              break;
            }
            const pd = Buffer.alloc(45 + Number(ix.data.readBigUInt64LE(4)));
            pd.writeUInt32LE(3, 0);
            pd.writeBigUInt64LE(BigInt(500), 4);
            chain.accounts.set(k[1], { lamports: 1, data: pd, owner: LOADER, executable: false });
            chain.accounts.get(k[2])!.executable = true;
            chain.accounts.delete(k[3]); // buffer consumed
          } else if (tag === 5) {
            chain.accounts.delete(k[0]);
          }
        }
      }
      chain.sigs.set(sig, { err });
      return sig;
    }
  }
  return { ...actual, Connection };
});

let db: any;

import { Keypair } from "@solana/web3.js";
import { deployRouter } from "../server/trpc/routers/deploy";
import { encodeSecretKey } from "../server/secret-key-crypto";
import { CHUNK_SIZE, decodeSession } from "../server/deploy/plan";
import { resetRateLimitStoreForTests } from "../lib/rate-limit";

function makeDb(binary: Buffer) {
  const programKp = Keypair.generate();
  const state = {
    user: { id: "u1", deployerKeypair: null as string | null },
    project: { id: "p1", userId: "u1", programKeypair: encodeSecretKey(programKp.secretKey), irData: null, flowData: null, status: "COMPILED" },
    compilation: { id: "c1", projectId: "p1", status: "SUCCESS", binaryUrl: "browser:c1.so", binaryBytes: new Uint8Array(binary), irHash: "h", completedAt: new Date() },
    deployments: [] as any[],
  };
  const matches = (row: any, where: any) =>
    Object.entries(where).every(([k, v]) => (v && typeof v === "object" && !(v instanceof Date) ? true : row[k] === v));
  db = {
    user: {
      findUnique: async () => state.user,
      updateMany: async ({ where, data }: any) => {
        if ("deployerKeypair" in where && where.deployerKeypair !== state.user.deployerKeypair) return { count: 0 };
        Object.assign(state.user, data);
        return { count: 1 };
      },
    },
    project: {
      findFirst: async ({ where }: any) => (matches(state.project, where) ? state.project : null),
      findUnique: async () => state.project,
      update: async ({ data }: any) => Object.assign(state.project, data),
      updateMany: async ({ data }: any) => (Object.assign(state.project, data), { count: 1 }),
    },
    compilation: {
      findFirst: async () => state.compilation,
    },
    deployment: {
      create: async ({ data }: any) => {
        const row = { id: `d${state.deployments.length + 1}`, deployedAt: new Date(), explorerUrl: null, ...data };
        state.deployments.push(row);
        return { ...row };
      },
      findFirst: async ({ where }: any) => {
        const rows = state.deployments.filter((r) => matches(r, where)).reverse();
        return rows[0] ? { ...rows[0] } : null;
      },
      findMany: async ({ where }: any) => state.deployments.filter((r) => matches(r, where)).map((r) => ({ ...r })),
      updateMany: async ({ where, data }: any) => {
        const row = state.deployments.find((r) => matches(r, where));
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
  return { state, programKp };
}

const caller = () =>
  deployRouter.createCaller({ session: { user: { id: "u1" } }, prisma: db, headers: new Headers() } as any);

async function runToCompletion(deploymentId: string, maxCalls = 40) {
  const c = caller();
  let snap: any = await c.step({ deploymentId });
  const phases = [snap.phase];
  for (let i = 0; i < maxCalls && snap.phase !== "finalize"; i++) {
    snap = await c.step({ deploymentId });
    phases.push(snap.phase);
  }
  for (let i = 0; i < 5 && snap.phase !== "done"; i++) snap = await c.finalize({ deploymentId });
  return { snap, phases };
}

beforeEach(() => {
  process.env.ENCRYPTION_MASTER_KEY = "test-master-key";
  resetRateLimitStoreForTests();
  chain.accounts.clear();
  chain.sigs.clear();
  chain.dropWrites = 0;
  chain.failNextDeploy = false;
  chain.sends = 0;
});

describe("deploy protocol (fake chain)", () => {
  const binary = Buffer.from(Array.from({ length: CHUNK_SIZE * 3 + 17 }, (_, i) => (i * 31) % 256));

  it("deploys a small program through start/step/finalize and writes every byte", async () => {
    const { state, programKp } = makeDb(binary);
    const start = await caller().start({ projectId: "p1", network: "DEVNET" });
    expect(start).toMatchObject({ phase: "create", resumed: false, progress: { current: 0, total: 4 } });

    // The buffer keypair is persisted encrypted (never plaintext) with the plan.
    const stored = state.deployments[0].txSignature as string;
    const session = decodeSession(stored)!;
    expect(session.bufferSecret.startsWith("enc:v1:")).toBe(true);
    expect(JSON.stringify(start)).not.toContain(session.bufferSecret);

    const { snap, phases } = await runToCompletion(start.deploymentId);
    expect(phases).toContain("write");
    expect(phases).toContain("verify");
    expect(snap.phase).toBe("done");
    expect(state.deployments[0].status).toBe("CONFIRMED");
    expect(state.deployments[0].txSignature).not.toMatch(/^session:/);
    expect(chain.accounts.get(programKp.publicKey.toBase58())?.executable).toBe(true);
    expect(chain.accounts.has(session.buffer)).toBe(false); // consumed by the deploy
    expect(state.project.status).toBe("DEPLOYED");
  }, 30_000);

  it("rewrites dropped chunks in the verify phase", async () => {
    makeDb(binary);
    const start = await caller().start({ projectId: "p1", network: "DEVNET" });
    chain.dropWrites = 2;
    const { snap } = await runToCompletion(start.deploymentId);
    expect(snap.phase).toBe("done");
  }, 30_000);

  it("resumes after a reload: start returns the in-flight deploy instead of a new one", async () => {
    const { state } = makeDb(binary);
    const first = await caller().start({ projectId: "p1", network: "DEVNET" });
    await caller().step({ deploymentId: first.deploymentId }); // create
    await caller().step({ deploymentId: first.deploymentId }); // write
    // "reload": a fresh client asks again
    const active = await caller().active({ projectId: "p1" });
    expect(active.pending?.deploymentId).toBe(first.deploymentId);
    const again = await caller().start({ projectId: "p1", network: "DEVNET" });
    expect(again).toMatchObject({ deploymentId: first.deploymentId, resumed: true });
    expect(state.deployments).toHaveLength(1);
    const { snap } = await runToCompletion(first.deploymentId);
    expect(snap.phase).toBe("done");
  }, 30_000);

  it("a second tab gets busy instead of double-writing", async () => {
    const { state } = makeDb(binary);
    const start = await caller().start({ projectId: "p1", network: "DEVNET" });
    const s = decodeSession(state.deployments[0].txSignature)!;
    const { encodeSession } = await import("../server/deploy/plan");
    state.deployments[0].txSignature = encodeSession({ ...s, lockedUntil: Date.now() + 30_000 });
    const res = await caller().step({ deploymentId: start.deploymentId });
    expect(res.busy).toBe(true);
    expect(chain.sends).toBe(0);
  });

  it("a failed deploy tx marks FAILED and returns the buffer SOL", async () => {
    const { state } = makeDb(binary);
    const start = await caller().start({ projectId: "p1", network: "DEVNET" });
    chain.failNextDeploy = true;
    await expect(runToCompletion(start.deploymentId)).rejects.toThrow(/Deploy transaction failed/);
    const row = state.deployments[0];
    expect(row.status).toBe("FAILED");
    const s = decodeSession(row.txSignature)!;
    expect(s.bufferClosed).toBe(true);
    expect(chain.accounts.has(s.buffer)).toBe(false);
  }, 30_000);

  it("an abandoned deploy's buffer can be reclaimed later", async () => {
    const { state } = makeDb(binary);
    const start = await caller().start({ projectId: "p1", network: "DEVNET" });
    await caller().step({ deploymentId: start.deploymentId }); // buffer created on chain
    const buffer = decodeSession(state.deployments[0].txSignature)!.buffer;
    expect(chain.accounts.has(buffer)).toBe(true);

    // Nobody came back for 16 minutes: the sweep fails it, the buffer stays reclaimable.
    const { encodeSession } = await import("../server/deploy/plan");
    const s = decodeSession(state.deployments[0].txSignature)!;
    state.deployments[0].txSignature = encodeSession({ ...s, updatedAt: Date.now() - 16 * 60_000 });
    const history = await caller().active({ projectId: "p1" });
    expect(history.pending).toBeNull();
    expect(history.reclaimable.map((r: any) => r.deploymentId)).toEqual([start.deploymentId]);

    const res = await caller().reclaimBuffer({ deploymentId: start.deploymentId });
    expect(res.closed).toBe(true);
    expect(res.lamports).toBeGreaterThan(0);
    expect(chain.accounts.has(buffer)).toBe(false);
    expect((await caller().active({ projectId: "p1" })).reclaimable).toHaveLength(0);
  }, 30_000);

  it("never replaces an unreadable deployer wallet", async () => {
    const { state } = makeDb(binary);
    state.user.deployerKeypair = "enc:v1:" + Buffer.from(JSON.stringify({ encrypted: "AA", iv: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", salt: "AA" })).toString("base64url");
    const before = state.user.deployerKeypair;
    await expect(caller().checkBalance({ projectId: "p1", network: "DEVNET" })).rejects.toThrow(/NOT replaced/);
    expect(state.user.deployerKeypair).toBe(before);
  });

  it("never replaces an unreadable program keypair", async () => {
    const { state } = makeDb(binary);
    process.env.ENCRYPTION_MASTER_KEY = "a-different-key";
    process.env.AUTH_SECRET = "also-different";
    const before = state.project.programKeypair;
    await expect(caller().start({ projectId: "p1", network: "DEVNET" })).rejects.toThrow(/NOT replaced/);
    expect(state.project.programKeypair).toBe(before);
    delete process.env.AUTH_SECRET;
  });

  it("checkBalance refuses another user's project", async () => {
    const { state } = makeDb(binary);
    state.project.userId = "someone-else";
    await expect(caller().checkBalance({ projectId: "p1", network: "DEVNET" })).rejects.toThrow(/NOT_FOUND/);
  });
});
