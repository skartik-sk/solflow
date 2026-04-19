import { describe, it, expect } from "vitest";
import { generateCode } from "../../index";
import type { ProgramIR } from "@solflow/ir";

const DAO_VOTING_IR: ProgramIR = {
  version: "1.0.0",
  program: { name: "dao_voting", description: "On-chain DAO with token-weighted voting", version: "0.1.0" },
  instructions: [
    {
      id: "a5-001", name: "create_proposal", accessControl: "none", args: [{ name: "description", type: "String" }, { name: "deadline", type: "i64" }],
      accounts: [
        { id: "a5-010", name: "proposal", accountType: "account", stateType: "ProposalState", constraints: [{ type: "init", payer: "proposer", space: "auto" }, { type: "seeds", seeds: [{ type: "literal", value: "proposal" }, { type: "account-field", value: "proposer" }], bump: "proposal.bump" }] },
        { id: "a5-011", name: "proposer", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a5-012", name: "system_program", accountType: "system-program", constraints: [] },
      ],
      body: [
        { type: "set-field", account: "proposal", field: "proposer", value: "*ctx.accounts.proposer.key" },
        { type: "set-field", account: "proposal", field: "description", value: "description" },
        { type: "set-field", account: "proposal", field: "votes_for", value: "0" },
        { type: "set-field", account: "proposal", field: "votes_against", value: "0" },
        { type: "set-field", account: "proposal", field: "deadline", value: "deadline" },
        { type: "set-field", account: "proposal", field: "executed", value: "false" },
        { type: "set-field", account: "proposal", field: "bump", value: "ctx.bumps.proposal" },
      ],
    },
    {
      id: "a5-002", name: "cast_vote", accessControl: "none", args: [{ name: "support", type: "bool" }],
      accounts: [
        { id: "a5-020", name: "proposal", accountType: "account", stateType: "ProposalState", constraints: [{ type: "mut" }] },
        { id: "a5-021", name: "vote_record", accountType: "account", stateType: "VoteRecord", constraints: [{ type: "init", payer: "voter", space: "auto" }] },
        { id: "a5-022", name: "voter", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a5-023", name: "system_program", accountType: "system-program", constraints: [] },
      ],
      body: [
        { type: "require", condition: "Clock::get()?.unix_timestamp < proposal.deadline", errorCode: "VotingEnded" },
        { type: "require", condition: "proposal.executed == false", errorCode: "AlreadyExecuted" },
        { type: "set-field", account: "vote_record", field: "voter", value: "*ctx.accounts.voter.key" },
        { type: "set-field", account: "vote_record", field: "support", value: "support" },
      ],
    },
    {
      id: "a5-003", name: "execute_proposal", accessControl: "none", args: [],
      accounts: [
        { id: "a5-030", name: "proposal", accountType: "account", stateType: "ProposalState", constraints: [{ type: "mut" }] },
        { id: "a5-031", name: "executor", accountType: "signer", constraints: [{ type: "signer" }] },
      ],
      body: [
        { type: "require", condition: "proposal.executed == false", errorCode: "AlreadyExecuted" },
        { type: "require", condition: "proposal.votes_for > proposal.votes_against", errorCode: "ProposalRejected" },
        { type: "set-field", account: "proposal", field: "executed", value: "true" },
      ],
    },
  ],
  states: [
    { id: "b5-001", name: "ProposalState", fields: [{ name: "proposer", type: "Pubkey" }, { name: "description", type: "String" }, { name: "votes_for", type: "u64" }, { name: "votes_against", type: "u64" }, { name: "deadline", type: "i64" }, { name: "executed", type: "bool" }, { name: "bump", type: "u8" }], isZeroCopy: false },
    { id: "b5-002", name: "VoteRecord", fields: [{ name: "voter", type: "Pubkey" }, { name: "proposal", type: "Pubkey" }, { name: "support", type: "bool" }, { name: "weight", type: "u64" }], isZeroCopy: false },
  ],
  errors: [
    { id: "c5-001", name: "VotingEnded", code: 6000, message: "Voting period has ended" },
    { id: "c5-002", name: "AlreadyExecuted", code: 6001, message: "Proposal already executed" },
    { id: "c5-003", name: "ProposalRejected", code: 6002, message: "Proposal did not pass" },
  ],
  events: [],
  integrations: [],
  constants: [{ name: "QUORUM", type: "u64", value: "10" }],
  metadata: { createdAt: "2026-04-17T00:00:00Z", updatedAt: "2026-04-17T00:00:00Z", flowHash: "dao-voting", generatorVersion: "0.1.0" },
};

const frameworks = ["anchor", "pinocchio", "quasar"] as const;

describe("DAO Voting template — all 3 frameworks", () => {
  for (const fw of frameworks) {
    describe(`${fw}`, () => {
      it("generates files without errors", () => {
        const result = generateCode(DAO_VOTING_IR, fw);
        expect(result.errors).toHaveLength(0);
        expect(result.files.length).toBeGreaterThan(0);
      });

      it("generates lib.rs", () => {
        const result = generateCode(DAO_VOTING_IR, fw);
        const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
        expect(libRs).toBeDefined();
        if (fw === "pinocchio") {
          expect(libRs!.content).toContain("process_instruction");
        } else {
          expect(libRs!.content).toContain("dao_voting");
        }
      });

      it("generates both state structs", () => {
        const result = generateCode(DAO_VOTING_IR, fw);
        const proposalState = result.files.find((f) => f.path.includes("proposal_state"));
        const voteRecord = result.files.find((f) => f.path.includes("vote_record"));
        expect(proposalState).toBeDefined();
        expect(voteRecord).toBeDefined();
        expect(proposalState!.content).toContain("ProposalState");
        expect(voteRecord!.content).toContain("VoteRecord");
      });

      it("generates error file with all 3 errors", () => {
        const result = generateCode(DAO_VOTING_IR, fw);
        const errFile = result.files.find((f) => f.path.endsWith("errors.rs"));
        expect(errFile).toBeDefined();
        expect(errFile!.content).toContain("VotingEnded");
        expect(errFile!.content).toContain("AlreadyExecuted");
        expect(errFile!.content).toContain("ProposalRejected");
      });

      it("generates all 3 instructions", () => {
        const result = generateCode(DAO_VOTING_IR, fw);
        const ixFiles = result.files.filter((f) => f.path.includes("instructions/") && f.path.endsWith(".rs") && !f.path.endsWith("mod.rs"));
        expect(ixFiles.length).toBe(3);
      });

      it("generates create_proposal with PDA seeds", () => {
        const result = generateCode(DAO_VOTING_IR, fw);
        const createFile = result.files.find((f) => f.path.includes("create_proposal"));
        expect(createFile).toBeDefined();
      });

      it("generates cast_vote instruction", () => {
        const result = generateCode(DAO_VOTING_IR, fw);
        const voteFile = result.files.find((f) => f.path.includes("cast_vote"));
        expect(voteFile).toBeDefined();
      });

      it("generates execute_proposal instruction", () => {
        const result = generateCode(DAO_VOTING_IR, fw);
        const execFile = result.files.find((f) => f.path.includes("execute_proposal"));
        expect(execFile).toBeDefined();
      });

      it("generates Cargo.toml", () => {
        const result = generateCode(DAO_VOTING_IR, fw);
        const cargo = result.files.find((f) => f.path.endsWith("Cargo.toml"));
        expect(cargo).toBeDefined();
      });

      it("generates constants file", () => {
        const result = generateCode(DAO_VOTING_IR, fw);
        const constants = result.files.find((f) => f.path.endsWith("constants.rs"));
        expect(constants).toBeDefined();
        expect(constants!.content).toContain("QUORUM");
      });
    });
  }

  describe("anchor-specific DAO patterns", () => {
    it("generates seeds constraint in create_proposal", () => {
      const result = generateCode(DAO_VOTING_IR, "anchor");
      const create = result.files.find((f) => f.path.includes("create_proposal"));
      expect(create!.content).toContain("seeds");
    });

    it("generates init constraint with payer for vote_record", () => {
      const result = generateCode(DAO_VOTING_IR, "anchor");
      const vote = result.files.find((f) => f.path.includes("cast_vote"));
      expect(vote!.content).toContain("init");
    });

    it("generates require! for voting checks", () => {
      const result = generateCode(DAO_VOTING_IR, "anchor");
      const vote = result.files.find((f) => f.path.includes("cast_vote"));
      expect(vote!.content).toContain("require");
    });
  });

  describe("pinocchio-specific DAO patterns", () => {
    it("generates #![no_std] entrypoint", () => {
      const result = generateCode(DAO_VOTING_IR, "pinocchio");
      const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
      expect(libRs!.content).toContain("#![no_std]");
      expect(libRs!.content).toContain("process_instruction");
    });

    it("generates state with discriminators", () => {
      const result = generateCode(DAO_VOTING_IR, "pinocchio");
      const stateFile = result.files.find((f) => f.path.includes("proposal_state"));
      expect(stateFile!.content).toContain("DISCRIMINATOR");
    });
  });

  describe("quasar-specific DAO patterns", () => {
    it("uses Pod types in state structs", () => {
      const result = generateCode(DAO_VOTING_IR, "quasar");
      const stateFile = result.files.find((f) => f.path.includes("proposal_state"));
      expect(stateFile!.content).toContain("PodU64");
      expect(stateFile!.content).toContain("Address");
    });

    it("uses Ctx type and instruction discriminators", () => {
      const result = generateCode(DAO_VOTING_IR, "quasar");
      const libRs = result.files.find((f) => f.path.endsWith("src/lib.rs"));
      expect(libRs!.content).toContain("Ctx<");
      expect(libRs!.content).toContain("#[instruction(discriminator");
    });
  });
});
