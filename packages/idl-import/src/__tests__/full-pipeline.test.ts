import { describe, it, expect, beforeAll } from "vitest";
import { idlToFlow, detectFormat } from "../index";
import { flowToIR } from "@solflow/ir";
import { generateCode } from "@solflow/codegen";
import type { ProgramIR } from "@solflow/ir";

// ─── NFT Marketplace IDL — realistic Anchor program ─────────────────────────
// Covers: multiple instructions, multiple state accounts, errors, events,
// signer/writable/system account types, u8/u16/u64/bool/pubkey/Vec/Option types

const NFT_MARKETPLACE_IDL = {
  version: "0.1.0",
  name: "nft_marketplace",
  instructions: [
    {
      name: "initialize_marketplace",
      accounts: [
        { name: "marketplace", isMut: true, isSigner: false },
        { name: "authority", isMut: false, isSigner: true },
        { name: "fee_recipient", isMut: false, isSigner: false },
        { name: "system_program", isMut: false, isSigner: false },
      ],
      args: [{ name: "fee_basis_points", type: "u16" }],
    },
    {
      name: "list_nft",
      accounts: [
        { name: "seller", isMut: false, isSigner: true },
        { name: "listing", isMut: true, isSigner: false },
        { name: "nft_mint", isMut: false, isSigner: false },
        { name: "seller_token_account", isMut: true, isSigner: false },
        { name: "vault_token_account", isMut: true, isSigner: false },
        { name: "token_program", isMut: false, isSigner: false },
        { name: "system_program", isMut: false, isSigner: false },
      ],
      args: [{ name: "price", type: "u64" }],
    },
    {
      name: "buy_nft",
      accounts: [
        { name: "buyer", isMut: true, isSigner: true },
        { name: "seller", isMut: true, isSigner: false },
        { name: "listing", isMut: true, isSigner: false },
        { name: "vault_token_account", isMut: true, isSigner: false },
        { name: "buyer_token_account", isMut: true, isSigner: false },
        { name: "fee_recipient", isMut: true, isSigner: false },
        { name: "token_program", isMut: false, isSigner: false },
        { name: "system_program", isMut: false, isSigner: false },
      ],
      args: [{ name: "expected_price", type: "u64" }],
    },
    {
      name: "cancel_listing",
      accounts: [
        { name: "seller", isMut: false, isSigner: true },
        { name: "listing", isMut: true, isSigner: false },
        { name: "vault_token_account", isMut: true, isSigner: false },
        { name: "seller_token_account", isMut: true, isSigner: false },
        { name: "token_program", isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: "update_fee",
      accounts: [
        { name: "marketplace", isMut: true, isSigner: false },
        { name: "authority", isMut: false, isSigner: true },
      ],
      args: [{ name: "new_fee_basis_points", type: "u16" }],
    },
    {
      name: "close_marketplace",
      accounts: [
        { name: "marketplace", isMut: true, isSigner: false },
        { name: "authority", isMut: true, isSigner: true },
        { name: "fee_recipient", isMut: false, isSigner: false },
      ],
      args: [],
    },
  ],
  accounts: [
    {
      name: "Marketplace",
      type: {
        kind: "struct",
        fields: [
          { name: "authority", type: "publicKey" },
          { name: "fee_recipient", type: "publicKey" },
          { name: "fee_basis_points", type: "u16" },
          { name: "bump", type: "u8" },
          { name: "total_listings", type: "u64" },
        ],
      },
    },
    {
      name: "Listing",
      type: {
        kind: "struct",
        fields: [
          { name: "seller", type: "publicKey" },
          { name: "nft_mint", type: "publicKey" },
          { name: "price", type: "u64" },
          { name: "bump", type: "u8" },
          { name: "active", type: "bool" },
        ],
      },
    },
  ],
  errors: [
    { code: 6000, name: "Unauthorized", msg: "Only the marketplace authority can perform this action" },
    { code: 6001, name: "InvalidPrice", msg: "Price must be greater than zero" },
    { code: 6002, name: "PriceMismatch", msg: "Expected price does not match listing price" },
    { code: 6003, name: "ListingNotActive", msg: "This listing is no longer active" },
    { code: 6004, name: "InvalidFeeBasisPoints", msg: "Fee basis points must be between 0 and 10000" },
    { code: 6005, name: "NotSeller", msg: "Only the original seller can cancel this listing" },
  ],
  events: [
    {
      name: "NFTListed",
      fields: [
        { name: "seller", type: "publicKey", index: false },
        { name: "nft_mint", type: "publicKey", index: false },
        { name: "price", type: "u64", index: false },
      ],
    },
    {
      name: "NFTSold",
      fields: [
        { name: "buyer", type: "publicKey", index: false },
        { name: "seller", type: "publicKey", index: false },
        { name: "nft_mint", type: "publicKey", index: false },
        { name: "price", type: "u64", index: false },
        { name: "fee", type: "u64", index: false },
      ],
    },
    {
      name: "ListingCancelled",
      fields: [
        { name: "seller", type: "publicKey", index: false },
        { name: "nft_mint", type: "publicKey", index: false },
      ],
    },
    {
      name: "FeeUpdated",
      fields: [
        { name: "old_fee", type: "u16", index: false },
        { name: "new_fee", type: "u16", index: false },
      ],
    },
  ],
  metadata: {
    address: "NFTmktPLace11111111111111111111111111111111",
  },
};

// ─── Full Pipeline Tests ─────────────────────────────────────────────────────

describe("Full pipeline: IDL → Flow → IR → Codegen", () => {
  // Stage 1: IDL format detection
  describe("Stage 1: IDL format detection", () => {
    it("detects NFT Marketplace as Anchor", () => {
      expect(detectFormat(NFT_MARKETPLACE_IDL)).toBe("anchor");
    });
  });

  // Stage 2: IDL → Flow nodes/edges
  describe("Stage 2: IDL → Flow nodes", () => {
    let flowResult: ReturnType<typeof idlToFlow>;

    beforeAll(() => {
      flowResult = idlToFlow(NFT_MARKETPLACE_IDL);
    });

    it("reports correct stats", () => {
      expect(flowResult.format).toBe("anchor");
      expect(flowResult.stats.instructions).toBe(6);
      expect(flowResult.stats.accounts).toBe(2); // Marketplace + Listing state accounts
      expect(flowResult.stats.errors).toBe(6);
      expect(flowResult.stats.events).toBe(4);
    });

    it("creates a program node with correct metadata", () => {
      const programNode = flowResult.nodes.find((n) => n.type === "program");
      expect(programNode).toBeDefined();
      expect(programNode!.data.name).toBe("nft_marketplace");
      expect(programNode!.data.version).toBe("0.1.0");
      expect(programNode!.data.programId).toBe(
        "NFTmktPLace11111111111111111111111111111111",
      );
    });

    it("creates 6 instruction nodes", () => {
      const ixNodes = flowResult.nodes.filter((n) => n.type === "instruction");
      expect(ixNodes.length).toBe(6);
      const names = ixNodes.map((n) => n.data.name).sort();
      expect(names).toEqual([
        "buy_nft",
        "cancel_listing",
        "close_marketplace",
        "initialize_marketplace",
        "list_nft",
        "update_fee",
      ]);
    });

    it("preserves instruction args with types", () => {
      const ixNodes = flowResult.nodes.filter((n) => n.type === "instruction");
      const listNft = ixNodes.find((n) => n.data.name === "list_nft");
      expect(listNft).toBeDefined();
      const data = listNft!.data as Record<string, unknown>;
      expect(data.instructionData).toHaveLength(1);
      expect((data.instructionData as Array<{ name: string; type: unknown }>)[0].name).toBe("price");
    });

    it("creates account nodes with correct types", () => {
      const accNodes = flowResult.nodes.filter((n) => n.type === "account");
      // 4+7+8+5+2+3 = 29 account references across all instructions
      expect(accNodes.length).toBe(29);

      // system_program accounts should be typed as system-program
      const systemProgs = accNodes.filter(
        (n) => n.data.name === "system_program",
      );
      for (const sp of systemProgs) {
        expect(sp.data.accountType).toBe("system-program");
      }

      // Signer accounts that are not writable should be typed as signer
      const pureSigners = accNodes.filter((n) => n.data.isSigner && !n.data.isMut);
      expect(pureSigners.length).toBeGreaterThan(0);
      for (const s of pureSigners) {
        expect(s.data.accountType).toBe("signer");
      }
    });

    it("creates 2 state nodes", () => {
      const stateNodes = flowResult.nodes.filter((n) => n.type === "state");
      expect(stateNodes.length).toBe(2);
      const names = stateNodes.map((n) => n.data.name).sort();
      expect(names).toEqual(["Listing", "Marketplace"]);
    });

    it("creates 6 error nodes", () => {
      const errorNodes = flowResult.nodes.filter((n) => n.type === "error");
      expect(errorNodes.length).toBe(6);
      const names = errorNodes.map((n) => n.data.name).sort();
      expect(names).toEqual([
        "InvalidFeeBasisPoints",
        "InvalidPrice",
        "ListingNotActive",
        "NotSeller",
        "PriceMismatch",
        "Unauthorized",
      ]);
    });

    it("creates 4 event nodes", () => {
      const eventNodes = flowResult.nodes.filter((n) => n.type === "event");
      expect(eventNodes.length).toBe(4);
    });

    it("creates edges connecting program to instructions", () => {
      const programNode = flowResult.nodes.find((n) => n.type === "program");
      const ixNodes = flowResult.nodes.filter((n) => n.type === "instruction");
      const progToIx = flowResult.edges.filter(
        (e) =>
          e.source === programNode!.id &&
          ixNodes.some((ix) => ix.id === e.target),
      );
      expect(progToIx.length).toBe(6);
    });

    it("creates edges connecting instructions to accounts", () => {
      const ixNodes = flowResult.nodes.filter((n) => n.type === "instruction");
      const accNodes = flowResult.nodes.filter((n) => n.type === "account");
      const ixIds = new Set(ixNodes.map((n) => n.id));
      const accIds = new Set(accNodes.map((n) => n.id));
      const ixToAcc = flowResult.edges.filter(
        (e) => ixIds.has(e.source) && accIds.has(e.target),
      );
      expect(ixToAcc.length).toBe(29); // one per account reference
    });

    it("applies layout positions to all nodes", () => {
      for (const node of flowResult.nodes) {
        expect(typeof node.position.x).toBe("number");
        expect(typeof node.position.y).toBe("number");
      }
    });
  });

  // Stage 3: Flow → IR
  describe("Stage 3: Flow → IR transformation", () => {
    let flowResult: ReturnType<typeof idlToFlow>;
    let ir: ProgramIR;

    beforeAll(() => {
      flowResult = idlToFlow(NFT_MARKETPLACE_IDL);
      ir = flowToIR(flowResult.nodes, flowResult.edges);
    });

    it("produces a valid ProgramIR with correct program metadata", () => {
      expect(ir.version).toBe("1.0.0");
      expect(ir.program.name).toBe("nft_marketplace");
      expect(ir.program.version).toBe("0.1.0");
      expect(ir.program.programId).toBe(
        "NFTmktPLace11111111111111111111111111111111",
      );
    });

    it("has 6 instructions in the IR", () => {
      expect(ir.instructions.length).toBe(6);
    });

    it("preserves instruction args and their types", () => {
      const listNft = ir.instructions.find((ix) => ix.name === "list_nft");
      expect(listNft).toBeDefined();
      expect(listNft!.args).toHaveLength(1);
      expect(listNft!.args[0].name).toBe("price");
      expect(listNft!.args[0].type).toBe("u64");
    });

    it("preserves accounts per instruction", () => {
      const initMp = ir.instructions.find(
        (ix) => ix.name === "initialize_marketplace",
      );
      expect(initMp).toBeDefined();
      expect(initMp!.accounts.length).toBe(4); // marketplace, authority, fee_recipient, system_program

      // Authority should be a signer
      const authority = initMp!.accounts.find((a) => a.name === "authority");
      expect(authority).toBeDefined();
      expect(authority!.constraints.some((c) => c.type === "signer")).toBe(true);
    });

    it("has 2 state definitions", () => {
      expect(ir.states.length).toBe(2);
      const marketplace = ir.states.find((s) => s.name === "Marketplace");
      expect(marketplace).toBeDefined();
      expect(marketplace!.fields.length).toBe(5);
      const fieldNames = marketplace!.fields.map((f) => f.name);
      expect(fieldNames).toContain("authority");
      expect(fieldNames).toContain("fee_recipient");
      expect(fieldNames).toContain("fee_basis_points");
      expect(fieldNames).toContain("bump");
      expect(fieldNames).toContain("total_listings");
    });

    it("has 6 error variants", () => {
      expect(ir.errors.length).toBe(6);
      const unauthorized = ir.errors.find((e) => e.name === "Unauthorized");
      expect(unauthorized).toBeDefined();
      expect(unauthorized!.code).toBe(6000);
      expect(unauthorized!.message).toBe(
        "Only the marketplace authority can perform this action",
      );
    });

    it("has 4 event definitions", () => {
      expect(ir.events.length).toBe(4);
      const nftSold = ir.events.find((e) => e.name === "NFTSold");
      expect(nftSold).toBeDefined();
      expect(nftSold!.fields.length).toBe(5);
    });

    it("includes metadata with flowHash", () => {
      expect(ir.metadata).toBeDefined();
      expect(ir.metadata.flowHash).toBeDefined();
      expect(typeof ir.metadata.flowHash).toBe("string");
      expect(ir.metadata.flowHash.length).toBeGreaterThan(0);
    });
  });

  // Stage 4: IR → Code Generation
  describe("Stage 4: IR → Code Generation (all frameworks)", () => {
    let ir: ProgramIR;
    const frameworks = ["anchor", "pinocchio", "quasar"] as const;

    beforeAll(() => {
      const flowResult = idlToFlow(NFT_MARKETPLACE_IDL);
      ir = flowToIR(flowResult.nodes, flowResult.edges);
    });

    for (const fw of frameworks) {
      describe(`Framework: ${fw}`, () => {
        it("generates files without errors", () => {
          const result = generateCode(ir, fw);
          expect(result.errors).toHaveLength(0);
          expect(result.files.length).toBeGreaterThan(0);
        });

        it("generates a lib.rs with program entry", () => {
          const result = generateCode(ir, fw);
          const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
          expect(libRs).toBeDefined();
          // Anchor uses program name string, Pinocchio/Quasar use declare_id! with programId
          const content = libRs!.content;
          const hasProgramRef =
            content.includes("nft_marketplace") ||
            content.includes("NFTmktPLace11111111111111111111111111111111") ||
            content.includes("process_instruction");
          expect(hasProgramRef).toBe(true);
        });

        it("generates state files for Marketplace and Listing", () => {
          const result = generateCode(ir, fw);
          const stateFiles = result.files.filter(
            (f) =>
              f.path.includes("state/") &&
              f.path.endsWith(".rs") &&
              !f.path.endsWith("mod.rs"),
          );
          expect(stateFiles.length).toBeGreaterThanOrEqual(2);
          const allContent = stateFiles.map((f) => f.content).join("\n");
          expect(allContent).toContain("Marketplace");
          expect(allContent).toContain("Listing");
        });

        it("generates instruction files for all 6 instructions", () => {
          const result = generateCode(ir, fw);
          const ixFiles = result.files.filter(
            (f) =>
              f.path.includes("instructions/") &&
              f.path.endsWith(".rs") &&
              !f.path.endsWith("mod.rs"),
          );
          expect(ixFiles.length).toBe(6);
        });

        it("generates error file with custom errors", () => {
          const result = generateCode(ir, fw);
          const errFile = result.files.find((f) =>
            f.path.endsWith("errors.rs"),
          );
          expect(errFile).toBeDefined();
          expect(errFile!.content).toContain("Unauthorized");
          expect(errFile!.content).toContain("InvalidPrice");
          expect(errFile!.content).toContain("NotSeller");
        });

        it("generates events file", () => {
          const result = generateCode(ir, fw);
          const evtFile = result.files.find((f) =>
            f.path.endsWith("events.rs"),
          );
          expect(evtFile).toBeDefined();
          expect(evtFile!.content).toContain("NFTListed");
          expect(evtFile!.content).toContain("NFTSold");
          expect(evtFile!.content).toContain("ListingCancelled");
          expect(evtFile!.content).toContain("FeeUpdated");
        });

        it("generates Cargo.toml", () => {
          const result = generateCode(ir, fw);
          const cargoToml = result.files.find((f) =>
            f.path.endsWith("Cargo.toml"),
          );
          expect(cargoToml).toBeDefined();
          expect(cargoToml!.content).toContain("nft_marketplace");
        });

        it("includes framework metadata", () => {
          const result = generateCode(ir, fw);
          expect(result.framework).toBe(fw);
          expect(result.metadata.generatedAt).toBeDefined();
          expect(result.metadata.irHash).toBeDefined();
        });
      });
    }

    // Framework-specific assertions
    describe("Anchor-specific checks", () => {
      it("uses Anchor macros and attributes", () => {
        const result = generateCode(ir, "anchor");
        const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
        expect(libRs).toBeDefined();
        expect(libRs!.content).toContain("#[program]");
      });

      it("generates correct account space with discriminator", () => {
        const result = generateCode(ir, "anchor");
        const stateFiles = result.files.filter(
          (f) =>
            f.path.includes("state/") &&
            f.path.endsWith(".rs") &&
            !f.path.endsWith("mod.rs"),
        );
        const allContent = stateFiles.map((f) => f.content).join("\n");
        // Anchor accounts should have #[account] attribute
        expect(allContent).toContain("#[account]");
      });
    });

    describe("Pinocchio-specific checks", () => {
      it("uses Pinocchio imports and patterns", () => {
        const result = generateCode(ir, "pinocchio");
        const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
        expect(libRs).toBeDefined();
        expect(libRs!.content).toMatch(/pinocchio/);
      });
    });

    describe("Quasar-specific checks", () => {
      it("uses Quasar patterns", () => {
        const result = generateCode(ir, "quasar");
        const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
        expect(libRs).toBeDefined();
        expect(libRs!.content).toMatch(/quasar/);
      });
    });
  });

  // Determinism: same IDL → same output
  describe("Pipeline determinism", () => {
    it("produces identical IR on repeated runs", () => {
      const flow1 = idlToFlow(NFT_MARKETPLACE_IDL);
      const ir1 = flowToIR(flow1.nodes, flow1.edges);

      const flow2 = idlToFlow(NFT_MARKETPLACE_IDL);
      const ir2 = flowToIR(flow2.nodes, flow2.edges);

      // Same structural properties
      expect(ir1.instructions.length).toBe(ir2.instructions.length);
      expect(ir1.states.length).toBe(ir2.states.length);
      expect(ir1.errors.length).toBe(ir2.errors.length);
      expect(ir1.events.length).toBe(ir2.events.length);
      expect(ir1.metadata.flowHash).toBe(ir2.metadata.flowHash);
    });

    it("produces identical codegen on repeated runs", () => {
      const flow = idlToFlow(NFT_MARKETPLACE_IDL);
      const ir = flowToIR(flow.nodes, flow.edges);

      const result1 = generateCode(ir, "anchor");
      const result2 = generateCode(ir, "anchor");

      expect(result1.metadata.irHash).toBe(result2.metadata.irHash);
      expect(result1.files.map((f) => f.path).sort()).toEqual(
        result2.files.map((f) => f.path).sort(),
      );
    });
  });
});
