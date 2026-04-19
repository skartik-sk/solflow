import { describe, it, expect } from "vitest";
import { generateCode } from "../../index";
import type { ProgramIR } from "@solflow/ir";

const NFT_COLLECTION_IR: ProgramIR = {
  version: "1.0.0",
  program: { name: "nft_collection", description: "NFT collection with mint and verify", version: "0.1.0" },
  instructions: [
    {
      id: "a3-001", name: "create_collection", description: "Create a new NFT collection",
      args: [{ name: "name", type: "String" }, { name: "symbol", type: "String" }],
      accounts: [
        { id: "a3-010", name: "collection", accountType: "account", stateType: "CollectionState", constraints: [{ type: "init", payer: "authority", space: "auto" }] },
        { id: "a3-011", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a3-012", name: "system_program", accountType: "system-program", constraints: [] },
      ],
      body: [
        { type: "set-field", account: "collection", field: "authority", value: "*ctx.accounts.authority.key" },
        { type: "set-field", account: "collection", field: "mint_count", value: "0" },
        { type: "set-field", account: "collection", field: "name", value: "name" },
        { type: "set-field", account: "collection", field: "symbol", value: "symbol" },
      ],
    },
    {
      id: "a3-002", name: "mint_nft", description: "Mint a new NFT into the collection",
      args: [{ name: "uri", type: "String" }],
      accounts: [
        { id: "a3-020", name: "collection", accountType: "account", stateType: "CollectionState", constraints: [{ type: "mut" }] },
        { id: "a3-021", name: "mint", accountType: "mint", constraints: [{ type: "init", payer: "payer", space: 82 }] },
        { id: "a3-022", name: "payer", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a3-023", name: "system_program", accountType: "system-program", constraints: [] },
      ],
      body: [
        { type: "math", operation: "add", left: "collection.mint_count", right: "1", result: "new_count", checked: true },
        { type: "set-field", account: "collection", field: "mint_count", value: "new_count" },
        { type: "emit-event", event: "NFTMintedEvent", fields: { mint: "*ctx.accounts.mint.key", uri: "uri" } },
      ],
    },
    {
      id: "a3-003", name: "verify_collection", description: "Verify an NFT belongs to this collection",
      args: [],
      accounts: [
        { id: "a3-030", name: "collection", accountType: "account", stateType: "CollectionState", constraints: [] },
        { id: "a3-031", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
      ],
      body: [
        { type: "require", condition: "collection.authority == *ctx.accounts.authority.key", errorCode: "Unauthorized" },
      ],
    },
  ],
  states: [
    { id: "b3-001", name: "CollectionState", fields: [{ name: "authority", type: "Pubkey", description: "Collection authority" }, { name: "mint_count", type: "u64", description: "Total NFTs minted" }, { name: "name", type: "String", description: "Collection name" }, { name: "symbol", type: "String", description: "Collection symbol" }], isZeroCopy: false },
  ],
  errors: [{ id: "c3-001", name: "Unauthorized", code: 6000, message: "Not authorized" }],
  events: [{ id: "d3-001", name: "NFTMintedEvent", fields: [{ name: "mint", type: "Pubkey" }, { name: "uri", type: "String" }] }],
  integrations: [],
  constants: [{ name: "MAX_SUPPLY", type: "u64", value: "10000" }],
  metadata: { createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z", flowHash: "nft-collection", generatorVersion: "0.1.0" },
};

const frameworks = ["anchor", "pinocchio", "quasar"] as const;

describe("NFT Collection template — all 3 frameworks", () => {
  for (const fw of frameworks) {
    describe(`${fw}`, () => {
      it("generates files without errors", () => {
        const result = generateCode(NFT_COLLECTION_IR, fw);
        expect(result.errors).toHaveLength(0);
        expect(result.files.length).toBeGreaterThan(0);
      });

      it("generates lib.rs", () => {
        const result = generateCode(NFT_COLLECTION_IR, fw);
        const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
        expect(libRs).toBeDefined();
        if (fw === "pinocchio") {
          expect(libRs!.content).toContain("process_instruction");
        } else {
          expect(libRs!.content).toContain("nft_collection");
        }
      });

      it("generates CollectionState with all fields", () => {
        const result = generateCode(NFT_COLLECTION_IR, fw);
        const stateFile = result.files.find((f) => f.path.includes("collection_state"));
        expect(stateFile).toBeDefined();
        expect(stateFile!.content).toContain("CollectionState");
      });

      it("generates error file", () => {
        const result = generateCode(NFT_COLLECTION_IR, fw);
        const errFile = result.files.find((f) => f.path.endsWith("errors.rs"));
        expect(errFile).toBeDefined();
        expect(errFile!.content).toContain("Unauthorized");
      });

      it("generates event file with NFTMintedEvent", () => {
        const result = generateCode(NFT_COLLECTION_IR, fw);
        const evtFile = result.files.find((f) => f.path.endsWith("events.rs"));
        expect(evtFile).toBeDefined();
        expect(evtFile!.content).toContain("NFTMintedEvent");
      });

      it("generates all 3 instructions", () => {
        const result = generateCode(NFT_COLLECTION_IR, fw);
        const ixFiles = result.files.filter((f) => f.path.includes("instructions/") && f.path.endsWith(".rs") && !f.path.endsWith("mod.rs"));
        expect(ixFiles.length).toBe(3);
      });

      it("generates create_collection instruction", () => {
        const result = generateCode(NFT_COLLECTION_IR, fw);
        const file = result.files.find((f) => f.path.includes("create_collection"));
        expect(file).toBeDefined();
      });

      it("generates mint_nft instruction", () => {
        const result = generateCode(NFT_COLLECTION_IR, fw);
        const file = result.files.find((f) => f.path.includes("mint_nft"));
        expect(file).toBeDefined();
      });

      it("generates verify_collection instruction", () => {
        const result = generateCode(NFT_COLLECTION_IR, fw);
        const file = result.files.find((f) => f.path.includes("verify_collection"));
        expect(file).toBeDefined();
      });

      it("generates Cargo.toml", () => {
        const result = generateCode(NFT_COLLECTION_IR, fw);
        const cargo = result.files.find((f) => f.path.endsWith("Cargo.toml"));
        expect(cargo).toBeDefined();
      });

      it("generates constants file with MAX_SUPPLY", () => {
        const result = generateCode(NFT_COLLECTION_IR, fw);
        const constants = result.files.find((f) => f.path.endsWith("constants.rs"));
        expect(constants).toBeDefined();
        expect(constants!.content).toContain("MAX_SUPPLY");
      });
    });
  }

  describe("anchor-specific NFT patterns", () => {
    it("generates init constraint for collection account", () => {
      const result = generateCode(NFT_COLLECTION_IR, "anchor");
      const create = result.files.find((f) => f.path.includes("create_collection"));
      expect(create!.content).toContain("init");
    });

    it("generates require! for authorization check", () => {
      const result = generateCode(NFT_COLLECTION_IR, "anchor");
      const verify = result.files.find((f) => f.path.includes("verify_collection"));
      expect(verify!.content).toContain("require");
    });
  });

  describe("pinocchio-specific NFT patterns", () => {
    it("generates #![no_std] entrypoint", () => {
      const result = generateCode(NFT_COLLECTION_IR, "pinocchio");
      const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
      expect(libRs!.content).toContain("#![no_std]");
      expect(libRs!.content).toContain("process_instruction");
    });

    it("generates state with discriminator", () => {
      const result = generateCode(NFT_COLLECTION_IR, "pinocchio");
      const stateFile = result.files.find((f) => f.path.includes("collection_state"));
      expect(stateFile!.content).toContain("DISCRIMINATOR");
    });
  });

  describe("quasar-specific NFT patterns", () => {
    it("uses Pod types in CollectionState", () => {
      const result = generateCode(NFT_COLLECTION_IR, "quasar");
      const stateFile = result.files.find((f) => f.path.includes("collection_state"));
      expect(stateFile!.content).toContain("PodU64");
      expect(stateFile!.content).toContain("Address");
    });

    it("uses Ctx type and instruction discriminators", () => {
      const result = generateCode(NFT_COLLECTION_IR, "quasar");
      const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
      expect(libRs!.content).toContain("Ctx<");
      expect(libRs!.content).toContain("#[instruction(discriminator");
    });
  });
});
