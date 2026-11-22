import { beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@solana/web3.js";

// ── module mocks (no DB, no network, no next-auth) ─────────────────────────
const authMock = vi.fn();
vi.mock("@solflow/auth", () => ({ auth: () => authMock() }));
vi.mock("@solflow/db", () => ({ prisma: prismaProxy() }));

const getParsedTransaction = vi.fn();
vi.mock("@solana/web3.js", async (orig) => {
  const actual = await orig<typeof import("@solana/web3.js")>();
  class Connection {
    getParsedTransaction = getParsedTransaction;
  }
  return { ...actual, Connection };
});

// Shared mutable prisma fake; each test fills in what it needs.
let db: any;
function prismaProxy() {
  return new Proxy({}, { get: (_t, model) => db?.[model as string] });
}

import { marketplaceRouter, decideListingStatus, isAdminEmail } from "../server/trpc/routers/marketplace";
import { projectRouter } from "../server/trpc/routers/project";
import { shareRouter } from "../server/trpc/routers/share";
import { GET as downloadGET } from "../app/api/download/marketplace/[id]/route";

const BUYER_WALLET = Keypair.generate().publicKey.toBase58();
const TREASURY = Keypair.generate().publicKey.toBase58();
const SIG = "5".repeat(88);

function caller<T extends { createCaller: (ctx: any) => any }>(r: T, userId: string | null, email?: string) {
  return r.createCaller({
    session: userId ? { user: { id: userId, email } } : null,
    prisma: db,
    headers: new Headers(),
  });
}

function paidListing(overrides: Record<string, unknown> = {}) {
  return {
    id: "l1",
    title: "Vault",
    authorId: "author",
    pricingModel: "PAID",
    priceSOL: 1,
    status: "PUBLISHED",
    templateFlowData: { nodes: [{ id: "p", type: "program", data: { name: "vault" } }], edges: [] },
    templateIR: { program: { name: "vault", version: "0.1.0" }, instructions: [] },
    project: { framework: "PINOCCHIO" },
    ...overrides,
  };
}

beforeEach(() => {
  process.env.ENCRYPTION_MASTER_KEY = "test-master-key";
  process.env.SOLFLOW_TREASURY_WALLET = TREASURY;
  delete process.env.SOLFLOW_PAYMENT_CLUSTER;
  getParsedTransaction.mockReset();
  authMock.mockReset();
  db = {
    marketplaceListing: {
      findFirst: vi.fn(async () => paidListing()),
      findUnique: vi.fn(async () => paidListing()),
      update: vi.fn(async () => ({ id: "l1", status: "PUBLISHED" })),
    },
    marketplacePurchase: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "pur" })),
    },
    user: { findUnique: vi.fn(async () => ({ walletAddress: BUYER_WALLET })) },
    project: {
      create: vi.fn(async ({ data }: any) => ({ id: "new", ...data })),
      findFirst: vi.fn(),
      delete: vi.fn(async () => ({})),
    },
    projectShare: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: any) => ({ slug: data.slug })),
      update: vi.fn(async () => ({ slug: "existing" })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
});

describe("marketplace.get", () => {
  it("strips template contents of a paid listing for non-buyers", async () => {
    const res = await caller(marketplaceRouter, "stranger").get({ id: "l1" });
    expect(res.locked).toBe(true);
    expect(res.templateFlowData).toBeNull();
    expect(res.templateIR).toBeNull();
  });

  it("returns contents to a buyer", async () => {
    db.marketplacePurchase.findUnique.mockResolvedValue({ id: "pur" });
    const res = await caller(marketplaceRouter, "buyer").get({ id: "l1" });
    expect(res.locked).toBe(false);
    expect(res.templateIR).toEqual({ program: { name: "vault", version: "0.1.0" }, instructions: [] });
  });
});

describe("marketplace.fork", () => {
  it("refuses a paid template without a purchase", async () => {
    await expect(caller(marketplaceRouter, "stranger").fork({ listingId: "l1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(db.project.create).not.toHaveBeenCalled();
  });

  it("only copies PUBLISHED listings", async () => {
    await caller(marketplaceRouter, "author").fork({ listingId: "l1" });
    expect(db.marketplaceListing.findFirst.mock.calls[0][0].where).toMatchObject({ status: "PUBLISHED" });
  });

  it("copies the source framework and assigns a fresh program id to flow and IR", async () => {
    db.marketplacePurchase.findUnique.mockResolvedValue({ id: "pur" });
    await caller(marketplaceRouter, "buyer").fork({ listingId: "l1" });
    const data = db.project.create.mock.calls[0][0].data;
    expect(data.framework).toBe("PINOCCHIO");
    expect(data.programKeypair).toMatch(/^enc:v1:/);
    const programId = data.flowData.nodes[0].data.programId;
    expect(programId).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(data.irData.program.programId).toBe(programId);
    expect(data.forkedFrom).toBe("l1");
  });
});

describe("marketplace.verifyPayment", () => {
  const pay = (lamports: number, source = BUYER_WALLET) =>
    getParsedTransaction.mockResolvedValue({
      meta: { err: null },
      transaction: {
        message: {
          instructions: [{ program: "system", parsed: { type: "transfer", info: { source, destination: TREASURY, lamports } } }],
        },
      },
    });

  it("fails closed when the treasury is not configured", async () => {
    delete process.env.SOLFLOW_TREASURY_WALLET;
    pay(1e9);
    await expect(
      caller(marketplaceRouter, "buyer").verifyPayment({ listingId: "l1", txSignature: SIG }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(db.marketplacePurchase.create).not.toHaveBeenCalled();
  });

  it("requires a linked wallet", async () => {
    db.user.findUnique.mockResolvedValue({ walletAddress: null });
    pay(1e9);
    await expect(
      caller(marketplaceRouter, "buyer").verifyPayment({ listingId: "l1", txSignature: SIG }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a signature that already unlocked a purchase", async () => {
    db.marketplacePurchase.findUnique.mockImplementation(async ({ where }: any) =>
      where.txSignature ? { id: "other" } : null,
    );
    pay(1e9);
    await expect(
      caller(marketplaceRouter, "buyer").verifyPayment({ listingId: "l1", txSignature: SIG }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects someone else's payment and underpayment", async () => {
    pay(1e9, Keypair.generate().publicKey.toBase58());
    await expect(
      caller(marketplaceRouter, "buyer").verifyPayment({ listingId: "l1", txSignature: SIG }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    pay(1e9 - 1);
    await expect(
      caller(marketplaceRouter, "buyer").verifyPayment({ listingId: "l1", txSignature: SIG }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.marketplacePurchase.create).not.toHaveBeenCalled();
  });

  it("maps a unique-constraint race on txSignature to BAD_REQUEST", async () => {
    pay(1e9);
    db.marketplacePurchase.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    await expect(
      caller(marketplaceRouter, "buyer").verifyPayment({ listingId: "l1", txSignature: SIG }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("records a valid payment", async () => {
    pay(1e9);
    await expect(
      caller(marketplaceRouter, "buyer").verifyPayment({ listingId: "l1", txSignature: SIG }),
    ).resolves.toEqual({ success: true });
    expect(db.marketplacePurchase.create.mock.calls[0][0].data).toMatchObject({
      buyerId: "buyer",
      txSignature: SIG,
      amount: 1,
    });
  });
});

describe("listing publication", () => {
  const check = (id: string, ok: boolean) => ({ id, label: id, ok, value: ok ? "OK" : "FAIL" });

  it("publishes when compile and audit pass, otherwise holds with a reason", () => {
    expect(decideListingStatus([check("compile", true), check("audit", true), check("tests", false)])).toEqual({
      status: "PUBLISHED",
      reviewNote: null,
    });
    const held = decideListingStatus([check("compile", false), check("audit", true)]);
    expect(held.status).toBe("PENDING_REVIEW");
    expect(held.reviewNote).toContain("compile");
  });

  it("approve is limited to ADMIN_EMAILS", async () => {
    expect(isAdminEmail("Admin@x.io", "admin@x.io, other@y.io")).toBe(true);
    expect(isAdminEmail("user@x.io", "admin@x.io")).toBe(false);
    expect(isAdminEmail("admin@x.io", undefined)).toBe(false);

    process.env.ADMIN_EMAILS = "admin@x.io";
    await expect(
      caller(marketplaceRouter, "u", "user@x.io").approve({ listingId: "l1", decision: "PUBLISHED" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await caller(marketplaceRouter, "a", "admin@x.io").approve({ listingId: "l1", decision: "PUBLISHED" });
    expect(db.marketplaceListing.update.mock.calls[0][0].data).toMatchObject({ status: "PUBLISHED", reviewNote: null });
  });
});

describe("project.create from template", () => {
  it("refuses unpublished or paid-without-purchase templates", async () => {
    db.marketplaceListing.findFirst.mockResolvedValue(null);
    await expect(
      caller(projectRouter, "u").create({ name: "x", framework: "ANCHOR", templateId: "l1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.marketplaceListing.findFirst.mock.calls[0][0].where).toMatchObject({ status: "PUBLISHED" });

    db.marketplaceListing.findFirst.mockResolvedValue(paidListing());
    await expect(
      caller(projectRouter, "u").create({ name: "x", framework: "ANCHOR", templateId: "l1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.project.create).not.toHaveBeenCalled();
  });

  it("copies framework, flow and IR with the project's own program id", async () => {
    db.marketplaceListing.findFirst.mockResolvedValue(paidListing({ pricingModel: "FREE" }));
    await caller(projectRouter, "u").create({ name: "x", framework: "ANCHOR", templateId: "l1" });
    const data = db.project.create.mock.calls[0][0].data;
    expect(data.framework).toBe("PINOCCHIO");
    expect(data.irData.program.programId).toBe(data.flowData.nodes[0].data.programId);
  });
});

describe("project.delete", () => {
  it("refuses to delete a project whose listing has purchases", async () => {
    db.project.findFirst.mockResolvedValue({ id: "p", listing: { _count: { purchases: 2 } } });
    await expect(caller(projectRouter, "u").delete({ id: "p" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    db.project.findFirst.mockResolvedValue({ id: "p", listing: null });
    await expect(caller(projectRouter, "u").delete({ id: "p" })).resolves.toEqual({ success: true });
  });
});

describe("share links", () => {
  beforeEach(() => {
    db.project.findFirst.mockResolvedValue({
      id: "p",
      name: "Proj",
      description: null,
      flowData: { nodes: [], edges: [] },
      irData: null,
      auditReports: [],
    });
  });

  it("reuses the active link instead of creating one per click", async () => {
    db.projectShare.findFirst.mockResolvedValue({ id: "s1" });
    const res = await caller(shareRouter, "u").create({ projectId: "p" });
    expect(res.slug).toBe("existing");
    expect(res.reused).toBe(true);
    expect(db.projectShare.create).not.toHaveBeenCalled();
  });

  it("creates a link when none is active", async () => {
    const res = await caller(shareRouter, "u").create({ projectId: "p" });
    expect(res.reused).toBe(false);
    expect(db.projectShare.create).toHaveBeenCalledOnce();
  });

  it("revoke sets revokedAt on the owner's live links only", async () => {
    await caller(shareRouter, "u").revoke({ projectId: "p" });
    const args = db.projectShare.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ projectId: "p", userId: "u", revokedAt: null });
    expect(args.data.revokedAt).toBeInstanceOf(Date);
  });
});

describe("GET /api/download/marketplace/:id", () => {
  const call = () =>
    downloadGET(new Request("http://x/api/download/marketplace/l1?framework=anchor"), {
      params: Promise.resolve({ id: "l1" }),
    });

  it("401s anonymous and 403s non-buyers on paid templates", async () => {
    authMock.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    authMock.mockResolvedValue({ user: { id: "stranger" } });
    expect((await call()).status).toBe(403);
  });
});

vi.mock("@/components/marketplace/ListingDetail", () => ({ ListingDetailView: () => null }));

describe("/marketplace/[id] page", () => {
  it("redacts the flow for non-buyers and unlocks it for the author", async () => {
    (globalThis as any).React = await import("react"); // page uses the classic JSX runtime under vitest
    const { default: Page } = await import("../app/marketplace/[id]/page");
    db.marketplaceListing.findFirst.mockResolvedValue(
      paidListing({ author: { id: "author", name: "A", image: null } }),
    );
    const render = async () =>
      (await Page({ params: Promise.resolve({ id: "l1" }) })) as any;

    authMock.mockResolvedValue({ user: { id: "stranger" } });
    let el = await render();
    expect(el.props.listing.templateFlowData).toBeNull();
    expect(el.props.listing.templateIR).toBeNull();
    expect(el.props.alreadyPurchased).toBe(false);

    authMock.mockResolvedValue({ user: { id: "author" } });
    el = await render();
    expect(el.props.listing.templateFlowData).not.toBeNull();
    expect(el.props.alreadyPurchased).toBe(true);
  });
});

describe("project.save IR guard", () => {
  const fixturesDir = new URL("../../../../packages/codegen/fixtures/templates/", import.meta.url);

  beforeEach(() => {
    db.project.findFirst.mockResolvedValue({ id: "p" });
    db.project.update = vi.fn(async () => ({}));
  });

  it("saves every bundled template flow (normal autosave still passes)", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const files = readdirSync(fixturesDir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const flow = JSON.parse(readFileSync(new URL(file, fixturesDir), "utf8"));
      const res = await caller(projectRouter, "u").save({
        id: "p",
        flowData: { nodes: flow.nodes, edges: flow.edges },
      });
      expect(res, file).toMatchObject({ success: true, irError: null });
    }
    expect(db.project.update).toHaveBeenCalledTimes(files.length);
  });

  it("saves the flow but stores no IR when the version carries a Cargo.toml injection", async () => {
    const { readFileSync } = await import("node:fs");
    const flow = JSON.parse(readFileSync(new URL("escrow.json", fixturesDir), "utf8"));
    const program = flow.nodes.find((n: any) => n.type === "program");
    program.data.version = '0.1.0"\n[build-dependencies]\nevil = "1"';
    const res = await caller(projectRouter, "u").save({
      id: "p",
      flowData: { nodes: flow.nodes, edges: flow.edges },
    });
    expect(res.success).toBe(true);
    expect(res.irError).toContain("program.version");
    const data = (db.project.update as any).mock.calls[0][0].data;
    expect(data.flowData.nodes).toEqual(flow.nodes);
    expect(data.irData).toBeNull();
  });
});

describe("project.create IR guard", () => {
  it("refuses a template whose IR would inject into Cargo.toml", async () => {
    db.marketplaceListing.findFirst.mockResolvedValue(
      paidListing({ pricingModel: "FREE", templateIR: { program: { name: "vault", version: '1"\n[x]' }, instructions: [] } }),
    );
    await expect(
      caller(projectRouter, "u").create({ name: "x", framework: "ANCHOR", templateId: "l1" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.project.create).not.toHaveBeenCalled();
  });
});
