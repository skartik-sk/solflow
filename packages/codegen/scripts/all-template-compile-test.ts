/**
 * End-to-end compilation test for ALL 7 marketplace templates.
 * Simple Vault, Token Mint, Escrow, DAO Voting, NFT Collection, Staking Pool, AMM Basic.
 *
 * Usage: bun run scripts/all-template-compile-test.ts
 */

import { generateCode } from "../src/index";
import type { ProgramIR } from "@solflow/ir";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { request } from "https";

const execFileAsync = promisify(execFile);

const META = {
  createdAt: "2026-04-17T00:00:00.000Z", updatedAt: "2026-04-17T00:00:00.000Z",
  flowHash: "seed-v3", generatorVersion: "0.1.0",
};

const TEMPLATES: Record<string, ProgramIR> = {

  "Simple Vault": {
    version: "1.0.0",
    program: { name: "vault", description: "SOL vault with PDA, deposits, withdrawals, and events", version: "0.1.0", programId: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS" },
    instructions: [
      { id: "a0000000-0000-0000-0000-000000000001", name: "initialize", args: [], accounts: [
        { id: "a0000000-0000-0000-0000-000000000010", name: "vault", accountType: "account", stateType: "VaultState", constraints: [
          { type: "init", payer: "authority", space: "auto" },
          { type: "seeds", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" },
        ] },
        { id: "a0000000-0000-0000-0000-000000000011", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a0000000-0000-0000-0000-000000000012", name: "system_program", accountType: "system-program", constraints: [] },
      ], body: [
        { type: "set-field", account: "vault", field: "authority", value: "*ctx.accounts.authority.key" },
        { type: "set-field", account: "vault", field: "balance", value: "0" },
        { type: "set-field", account: "vault", field: "bump", value: "ctx.bumps.vault" },
      ] },
      { id: "a0000000-0000-0000-0000-000000000002", name: "deposit", args: [{ name: "amount", type: "u64" }], accounts: [
        { id: "a0000000-0000-0000-0000-000000000020", name: "vault", accountType: "account", stateType: "VaultState", constraints: [
          { type: "mut" },
          { type: "seeds", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" },
        ] },
        { id: "a0000000-0000-0000-0000-000000000021", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a0000000-0000-0000-0000-000000000022", name: "system_program", accountType: "system-program", constraints: [] },
      ], body: [
        { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
        { type: "transfer-sol", from: "authority", to: "vault", amount: "amount" },
        { type: "math", operation: "add", left: "vault.balance", right: "amount", result: "new_balance", checked: true },
        { type: "set-field", account: "vault", field: "balance", value: "new_balance" },
        { type: "emit-event", event: "DepositEvent", fields: { authority: "*ctx.accounts.authority.key", amount: "amount", new_balance: "new_balance" } },
      ] },
      { id: "a0000000-0000-0000-0000-000000000003", name: "withdraw", args: [{ name: "amount", type: "u64" }], accounts: [
        { id: "a0000000-0000-0000-0000-000000000030", name: "vault", accountType: "account", stateType: "VaultState", constraints: [
          { type: "mut" },
          { type: "seeds", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" },
        ] },
        { id: "a0000000-0000-0000-0000-000000000031", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a0000000-0000-0000-0000-000000000032", name: "system_program", accountType: "system-program", constraints: [] },
      ], body: [
        { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
        { type: "require", condition: "vault.balance >= amount", errorCode: "InsufficientFunds" },
        { type: "if-else", condition: "amount == vault.balance", thenBody: [
          { type: "set-field", account: "vault", field: "balance", value: "0" },
        ], elseBody: [
          { type: "math", operation: "sub", left: "vault.balance", right: "amount", result: "remaining", checked: true },
          { type: "set-field", account: "vault", field: "balance", value: "remaining" },
        ] },
        { type: "emit-event", event: "WithdrawEvent", fields: { authority: "*ctx.accounts.authority.key", amount: "amount" } },
      ] },
      { id: "a0000000-0000-0000-0000-000000000004", name: "close_vault", args: [], accounts: [
        { id: "a0000000-0000-0000-0000-000000000040", name: "vault", accountType: "account", stateType: "VaultState", constraints: [
          { type: "mut" },
          { type: "close", target: "authority" },
          { type: "seeds", seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "vault.bump" },
        ] },
        { id: "a0000000-0000-0000-0000-000000000041", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a0000000-0000-0000-0000-000000000042", name: "system_program", accountType: "system-program", constraints: [] },
      ], body: [] },
    ],
    states: [{ id: "b0000000-0000-0000-0000-000000000001", name: "VaultState", isZeroCopy: false, fields: [
      { name: "authority", type: "Pubkey" },
      { name: "balance", type: "u64" },
      { name: "bump", type: "u8" },
    ] }],
    errors: [
      { id: "c0000000-0000-0000-0000-000000000001", name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" },
      { id: "c0000000-0000-0000-0000-000000000002", name: "InsufficientFunds", code: 6001, message: "Insufficient funds in vault" },
    ],
    events: [
      { id: "d0000000-0000-0000-0000-000000000001", name: "DepositEvent", fields: [{ name: "authority", type: "Pubkey" }, { name: "amount", type: "u64" }, { name: "new_balance", type: "u64" }] },
      { id: "d0000000-0000-0000-0000-000000000002", name: "WithdrawEvent", fields: [{ name: "authority", type: "Pubkey" }, { name: "amount", type: "u64" }] },
    ],
    integrations: [], constants: [{ name: "MAX_DEPOSIT", type: "u64", value: "1_000_000_000_000" }], metadata: META,
  },

  "Token Mint": {
    version: "1.0.0",
    program: { name: "token_mint", description: "SPL token with mint authority and supply control", version: "0.1.0" },
    instructions: [
      { id: "a1000000-0000-0000-0000-000000000001", name: "initialize_mint", args: [{ name: "decimals", type: "u8" }], accounts: [
        { id: "a1000000-0000-0000-0000-000000000010", name: "mint", accountType: "mint", constraints: [{ type: "init", payer: "authority", space: 82 }, { type: "mint-authority", authority: "authority" }, { type: "mint-decimals", decimals: 9 }] },
        { id: "a1000000-0000-0000-0000-000000000011", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a1000000-0000-0000-0000-000000000012", name: "system_program", accountType: "system-program", constraints: [] },
        { id: "a1000000-0000-0000-0000-000000000013", name: "rent", accountType: "rent", constraints: [] },
      ], body: [
        { type: "set-field", account: "mint", field: "decimals", value: "decimals" },
        { type: "set-field", account: "mint", field: "authority", value: "*ctx.accounts.authority.key" },
      ] },
      { id: "a1000000-0000-0000-0000-000000000002", name: "mint_to", args: [{ name: "amount", type: "u64" }], accounts: [
        { id: "a1000000-0000-0000-0000-000000000020", name: "mint", accountType: "mint", constraints: [{ type: "mut" }, { type: "mint-authority", authority: "authority" }] },
        { id: "a1000000-0000-0000-0000-000000000021", name: "destination", accountType: "token-account", constraints: [{ type: "mut" }] },
        { id: "a1000000-0000-0000-0000-000000000022", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a1000000-0000-0000-0000-000000000023", name: "token_program", accountType: "token-program", constraints: [] },
      ], body: [
        { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
        { type: "mint-to", mint: "mint", to: "destination", authority: "authority", amount: "amount" },
        { type: "emit-event", event: "MintEvent", fields: { amount: "amount", destination: "*ctx.accounts.destination.key" } },
      ] },
      { id: "a1000000-0000-0000-0000-000000000003", name: "burn", args: [{ name: "amount", type: "u64" }], accounts: [
        { id: "a1000000-0000-0000-0000-000000000030", name: "source", accountType: "token-account", constraints: [{ type: "mut" }] },
        { id: "a1000000-0000-0000-0000-000000000031", name: "mint", accountType: "mint", constraints: [{ type: "mut" }] },
        { id: "a1000000-0000-0000-0000-000000000032", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a1000000-0000-0000-0000-000000000033", name: "token_program", accountType: "token-program", constraints: [] },
      ], body: [
        { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
        { type: "burn", mint: "mint", from: "source", authority: "authority", amount: "amount" },
        { type: "emit-event", event: "BurnEvent", fields: { amount: "amount", source: "*ctx.accounts.source.key" } },
      ] },
    ],
    states: [],
    errors: [{ id: "c1000000-0000-0000-0000-000000000001", name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" }],
    events: [
      { id: "d1000000-0000-0000-0000-000000000001", name: "MintEvent", fields: [{ name: "amount", type: "u64" }, { name: "destination", type: "Pubkey" }] },
      { id: "d1000000-0000-0000-0000-000000000002", name: "BurnEvent", fields: [{ name: "amount", type: "u64" }, { name: "source", type: "Pubkey" }] },
    ],
    integrations: [], constants: [], metadata: META,
  },

  "Escrow": {
    version: "1.0.0",
    program: { name: "escrow", description: "Two-party token escrow with timelock", version: "0.1.0", programId: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS" },
    instructions: [
      { id: "a2000000-0000-0000-0000-000000000001", name: "initialize_escrow", args: [{ name: "amount", type: "u64" }, { name: "deadline", type: "i64" }], accounts: [
        { id: "a2000000-0000-0000-0000-000000000010", name: "escrow", accountType: "account", stateType: "EscrowState", constraints: [{ type: "init", payer: "maker", space: "auto" }, { type: "seeds", seeds: [{ type: "literal", value: "escrow" }, { type: "account-field", value: "maker" }], bump: "escrow.bump" }] },
        { id: "a2000000-0000-0000-0000-000000000011", name: "maker", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a2000000-0000-0000-0000-000000000012", name: "system_program", accountType: "system-program", constraints: [] },
      ], body: [
        { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
        { type: "set-field", account: "escrow", field: "maker", value: "*ctx.accounts.maker.key" },
        { type: "set-field", account: "escrow", field: "amount", value: "amount" },
        { type: "set-field", account: "escrow", field: "deadline", value: "deadline" },
        { type: "set-field", account: "escrow", field: "bump", value: "ctx.bumps.escrow" },
      ] },
      { id: "a2000000-0000-0000-0000-000000000002", name: "exchange", args: [], accounts: [
        { id: "a2000000-0000-0000-0000-000000000020", name: "escrow", accountType: "account", stateType: "EscrowState", constraints: [{ type: "mut" }, { type: "seeds", seeds: [{ type: "literal", value: "escrow" }, { type: "account-field", value: "maker" }], bump: "escrow.bump" }] },
        { id: "a2000000-0000-0000-0000-000000000023", name: "maker", accountType: "system-account", constraints: [] },
        { id: "a2000000-0000-0000-0000-000000000021", name: "taker", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a2000000-0000-0000-0000-000000000022", name: "system_program", accountType: "system-program", constraints: [] },
      ], body: [
        { type: "require", condition: "Clock::get()?.unix_timestamp < escrow.deadline", errorCode: "EscrowExpired" },
        { type: "set-field", account: "escrow", field: "taker", value: "*ctx.accounts.taker.key" },
        { type: "emit-event", event: "ExchangeEvent", fields: { maker: "escrow.maker", taker: "*ctx.accounts.taker.key", amount: "escrow.amount" } },
      ] },
      { id: "a2000000-0000-0000-0000-000000000003", name: "cancel", args: [], accounts: [
        { id: "a2000000-0000-0000-0000-000000000030", name: "escrow", accountType: "account", stateType: "EscrowState", constraints: [{ type: "mut" }, { type: "close", target: "maker" }, { type: "seeds", seeds: [{ type: "literal", value: "escrow" }, { type: "account-field", value: "maker" }], bump: "escrow.bump" }] },
        { id: "a2000000-0000-0000-0000-000000000031", name: "maker", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a2000000-0000-0000-0000-000000000032", name: "system_program", accountType: "system-program", constraints: [] },
      ], body: [
        { type: "emit-event", event: "CancelEvent", fields: { maker: "*ctx.accounts.maker.key" } },
      ] },
    ],
    states: [{ id: "b2000000-0000-0000-0000-000000000001", name: "EscrowState", isZeroCopy: false, fields: [
      { name: "maker", type: "Pubkey" }, { name: "taker", type: "Pubkey" }, { name: "amount", type: "u64" }, { name: "deadline", type: "i64" }, { name: "bump", type: "u8" },
    ] }],
    errors: [
      { id: "c2000000-0000-0000-0000-000000000001", name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" },
      { id: "c2000000-0000-0000-0000-000000000002", name: "EscrowExpired", code: 6001, message: "Escrow deadline has passed" },
    ],
    events: [
      { id: "d2000000-0000-0000-0000-000000000001", name: "ExchangeEvent", fields: [{ name: "maker", type: "Pubkey" }, { name: "taker", type: "Pubkey" }, { name: "amount", type: "u64" }] },
      { id: "d2000000-0000-0000-0000-000000000002", name: "CancelEvent", fields: [{ name: "maker", type: "Pubkey" }] },
    ],
    integrations: [], constants: [], metadata: META,
  },

  "DAO Voting": {
    version: "1.0.0",
    program: { name: "dao_voting", description: "On-chain DAO with token-weighted voting", version: "0.1.0" },
    instructions: [
      { id: "a5-001", name: "create_proposal", args: [{ name: "description", type: "String" }, { name: "deadline", type: "i64" }], accounts: [
        { id: "a5-010", name: "proposal", accountType: "account", stateType: "ProposalState", constraints: [{ type: "init", payer: "proposer", space: "auto" }, { type: "seeds", seeds: [{ type: "literal", value: "proposal" }, { type: "account-field", value: "proposer" }], bump: "proposal.bump" }] },
        { id: "a5-011", name: "proposer", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a5-012", name: "system_program", accountType: "system-program", constraints: [] },
      ], body: [
        { type: "set-field", account: "proposal", field: "proposer", value: "*ctx.accounts.proposer.key" },
        { type: "set-field", account: "proposal", field: "description", value: "description" },
        { type: "set-field", account: "proposal", field: "votes_for", value: "0" },
        { type: "set-field", account: "proposal", field: "votes_against", value: "0" },
        { type: "set-field", account: "proposal", field: "deadline", value: "deadline" },
        { type: "set-field", account: "proposal", field: "executed", value: "false" },
        { type: "set-field", account: "proposal", field: "bump", value: "ctx.bumps.proposal" },
      ] },
      { id: "a5-002", name: "cast_vote", args: [{ name: "support", type: "bool" }], accounts: [
        { id: "a5-020", name: "proposal", accountType: "account", stateType: "ProposalState", constraints: [{ type: "mut" }] },
        { id: "a5-021", name: "vote_record", accountType: "account", stateType: "VoteRecord", constraints: [{ type: "init", payer: "voter", space: "auto" }] },
        { id: "a5-022", name: "voter", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a5-023", name: "system_program", accountType: "system-program", constraints: [] },
      ], body: [
        { type: "require", condition: "Clock::get()?.unix_timestamp < proposal.deadline", errorCode: "VotingEnded" },
        { type: "require", condition: "proposal.executed == false", errorCode: "AlreadyExecuted" },
        { type: "set-field", account: "vote_record", field: "voter", value: "*ctx.accounts.voter.key" },
        { type: "set-field", account: "vote_record", field: "support", value: "support" },
      ] },
      { id: "a5-003", name: "execute_proposal", args: [], accounts: [
        { id: "a5-030", name: "proposal", accountType: "account", stateType: "ProposalState", constraints: [{ type: "mut" }] },
        { id: "a5-031", name: "executor", accountType: "signer", constraints: [{ type: "signer" }] },
      ], body: [
        { type: "require", condition: "proposal.executed == false", errorCode: "AlreadyExecuted" },
        { type: "require", condition: "proposal.votes_for > proposal.votes_against", errorCode: "ProposalRejected" },
        { type: "set-field", account: "proposal", field: "executed", value: "true" },
      ] },
    ],
    states: [
      { id: "b5-001", name: "ProposalState", fields: [{ name: "proposer", type: "Pubkey" }, { name: "description", type: "String" }, { name: "votes_for", type: "u64" }, { name: "votes_against", type: "u64" }, { name: "deadline", type: "i64" }, { name: "executed", type: "bool" }, { name: "bump", type: "u8" }], isZeroCopy: false },
      { id: "b5-002", name: "VoteRecord", fields: [{ name: "voter", type: "Pubkey" }, { name: "proposal", type: "Pubkey" }, { name: "support", type: "bool" }, { name: "weight", type: "u64" }], isZeroCopy: false },
    ],
    errors: [{ id: "c5-001", name: "VotingEnded", code: 6000, message: "Voting period has ended" }, { id: "c5-002", name: "AlreadyExecuted", code: 6001, message: "Proposal already executed" }, { id: "c5-003", name: "ProposalRejected", code: 6002, message: "Proposal did not pass" }],
    events: [], integrations: [], constants: [{ name: "QUORUM", type: "u64", value: "10" }], metadata: META,
  },

  "NFT Collection": {
    version: "1.0.0",
    program: { name: "nft_collection", description: "NFT collection with mint and verify", version: "0.1.0" },
    instructions: [
      { id: "a3-001", name: "create_collection", args: [{ name: "name", type: "String" }, { name: "symbol", type: "String" }], accounts: [
        { id: "a3-010", name: "collection", accountType: "account", stateType: "CollectionState", constraints: [{ type: "init", payer: "authority", space: "auto" }] },
        { id: "a3-011", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a3-012", name: "system_program", accountType: "system-program", constraints: [] },
      ], body: [
        { type: "set-field", account: "collection", field: "authority", value: "*ctx.accounts.authority.key" },
        { type: "set-field", account: "collection", field: "mint_count", value: "0" },
        { type: "set-field", account: "collection", field: "name", value: "name" },
        { type: "set-field", account: "collection", field: "symbol", value: "symbol" },
      ] },
      { id: "a3-002", name: "mint_nft", args: [{ name: "uri", type: "String" }], accounts: [
        { id: "a3-020", name: "collection", accountType: "account", stateType: "CollectionState", constraints: [{ type: "mut" }] },
        { id: "a3-021", name: "mint", accountType: "mint", constraints: [{ type: "init", payer: "payer", space: 82 }] },
        { id: "a3-022", name: "payer", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a3-023", name: "system_program", accountType: "system-program", constraints: [] },
      ], body: [
        { type: "math", operation: "add", left: "collection.mint_count", right: "1", result: "new_count", checked: true },
        { type: "set-field", account: "collection", field: "mint_count", value: "new_count" },
        { type: "emit-event", event: "NFTMintedEvent", fields: { mint: "*ctx.accounts.mint.key", uri: "uri" } },
      ] },
      { id: "a3-003", name: "verify_collection", args: [], accounts: [
        { id: "a3-030", name: "collection", accountType: "account", stateType: "CollectionState", constraints: [] },
        { id: "a3-031", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
      ], body: [
        { type: "require", condition: "collection.authority == *ctx.accounts.authority.key", errorCode: "Unauthorized" },
      ] },
    ],
    states: [{ id: "b3-001", name: "CollectionState", fields: [{ name: "authority", type: "Pubkey" }, { name: "mint_count", type: "u64" }, { name: "name", type: "String" }, { name: "symbol", type: "String" }], isZeroCopy: false }],
    errors: [{ id: "c3-001", name: "Unauthorized", code: 6000, message: "Not authorized" }],
    events: [{ id: "d3-001", name: "NFTMintedEvent", fields: [{ name: "mint", type: "Pubkey" }, { name: "uri", type: "String" }] }],
    integrations: [], constants: [{ name: "MAX_SUPPLY", type: "u64", value: "10000" }], metadata: META,
  },

  "Staking Pool": {
    version: "1.0.0",
    program: { name: "staking_pool", description: "Token staking with time-weighted rewards", version: "0.1.0" },
    instructions: [
      { id: "a4-001", name: "initialize_pool", args: [{ name: "reward_rate", type: "u64" }], accounts: [
        { id: "a4-010", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "init", payer: "authority", space: "auto" }, { type: "seeds", seeds: [{ type: "literal", value: "pool" }], bump: "pool.bump" }] },
        { id: "a4-011", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a4-012", name: "system_program", accountType: "system-program", constraints: [] },
      ], body: [
        { type: "set-field", account: "pool", field: "authority", value: "*ctx.accounts.authority.key" },
        { type: "set-field", account: "pool", field: "total_staked", value: "0" },
        { type: "set-field", account: "pool", field: "reward_rate", value: "reward_rate" },
        { type: "set-field", account: "pool", field: "bump", value: "ctx.bumps.pool" },
      ] },
      { id: "a4-002", name: "stake", args: [{ name: "amount", type: "u64" }], accounts: [
        { id: "a4-020", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "mut" }] },
        { id: "a4-021", name: "staker_account", accountType: "account", stateType: "StakerState", constraints: [{ type: "init-if-needed", payer: "staker", space: "auto" }] },
        { id: "a4-022", name: "staker", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a4-023", name: "system_program", accountType: "system-program", constraints: [] },
      ], body: [
        { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
        { type: "math", operation: "add", left: "staker_account.staked_amount", right: "amount", result: "new_staked", checked: true },
        { type: "set-field", account: "staker_account", field: "staked_amount", value: "new_staked" },
        { type: "math", operation: "add", left: "pool.total_staked", right: "amount", result: "new_total", checked: true },
        { type: "set-field", account: "pool", field: "total_staked", value: "new_total" },
      ] },
      { id: "a4-003", name: "unstake", args: [{ name: "amount", type: "u64" }], accounts: [
        { id: "a4-030", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "mut" }] },
        { id: "a4-031", name: "staker_account", accountType: "account", stateType: "StakerState", constraints: [{ type: "mut" }] },
        { id: "a4-032", name: "staker", accountType: "signer", constraints: [{ type: "signer" }] },
      ], body: [
        { type: "require", condition: "amount > 0", errorCode: "InvalidAmount" },
        { type: "require", condition: "staker_account.staked_amount >= amount", errorCode: "InsufficientStake" },
        { type: "math", operation: "sub", left: "staker_account.staked_amount", right: "amount", result: "remaining", checked: true },
        { type: "set-field", account: "staker_account", field: "staked_amount", value: "remaining" },
        { type: "math", operation: "sub", left: "pool.total_staked", right: "amount", result: "new_total", checked: true },
        { type: "set-field", account: "pool", field: "total_staked", value: "new_total" },
      ] },
      { id: "a4-004", name: "claim_rewards", args: [], accounts: [
        { id: "a4-040", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "mut" }] },
        { id: "a4-041", name: "staker_account", accountType: "account", stateType: "StakerState", constraints: [{ type: "mut" }] },
        { id: "a4-042", name: "staker", accountType: "signer", constraints: [{ type: "signer" }] },
      ], body: [
        { type: "set-field", account: "staker_account", field: "pending_rewards", value: "0" },
      ] },
    ],
    states: [
      { id: "b4-001", name: "PoolState", fields: [{ name: "authority", type: "Pubkey" }, { name: "total_staked", type: "u64" }, { name: "reward_rate", type: "u64" }, { name: "bump", type: "u8" }], isZeroCopy: false },
      { id: "b4-002", name: "StakerState", fields: [{ name: "staker", type: "Pubkey" }, { name: "staked_amount", type: "u64" }, { name: "pending_rewards", type: "u64" }], isZeroCopy: false },
    ],
    errors: [{ id: "c4-001", name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" }, { id: "c4-002", name: "InsufficientStake", code: 6001, message: "Insufficient staked amount" }],
    events: [], integrations: [], constants: [{ name: "MIN_STAKE", type: "u64", value: "1_000_000" }], metadata: META,
  },

  "AMM Basic": {
    version: "1.0.0",
    program: { name: "amm", description: "Constant-product AMM with liquidity and swap", version: "0.1.0" },
    instructions: [
      { id: "a6-001", name: "initialize_pool", args: [], accounts: [
        { id: "a6-010", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "init", payer: "authority", space: "auto" }, { type: "seeds", seeds: [{ type: "literal", value: "pool" }, { type: "account-field", value: "authority" }], bump: "pool.bump" }] },
        { id: "a6-011", name: "authority", accountType: "signer", constraints: [{ type: "signer" }] },
        { id: "a6-012", name: "system_program", accountType: "system-program", constraints: [] },
      ], body: [
        { type: "set-field", account: "pool", field: "authority", value: "*ctx.accounts.authority.key" },
        { type: "set-field", account: "pool", field: "token_a_vault", value: "*ctx.accounts.authority.key" },
        { type: "set-field", account: "pool", field: "token_b_vault", value: "*ctx.accounts.authority.key" },
        { type: "set-field", account: "pool", field: "lp_mint", value: "*ctx.accounts.authority.key" },
        { type: "set-field", account: "pool", field: "total_lp", value: "0" },
        { type: "set-field", account: "pool", field: "bump", value: "ctx.bumps.pool" },
      ] },
      { id: "a6-002", name: "add_liquidity", args: [{ name: "token_a_amount", type: "u64" }, { name: "token_b_amount", type: "u64" }], accounts: [
        { id: "a6-020", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "mut" }] },
        { id: "a6-021", name: "provider", accountType: "signer", constraints: [{ type: "signer" }] },
      ], body: [
        { type: "require", condition: "token_a_amount > 0", errorCode: "InvalidAmount" },
        { type: "require", condition: "token_b_amount > 0", errorCode: "InvalidAmount" },
        { type: "math", operation: "add", left: "pool.total_lp", right: "token_a_amount", result: "new_lp", checked: true },
        { type: "set-field", account: "pool", field: "total_lp", value: "new_lp" },
      ] },
      { id: "a6-003", name: "remove_liquidity", args: [{ name: "lp_amount", type: "u64" }], accounts: [
        { id: "a6-030", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "mut" }] },
        { id: "a6-031", name: "provider", accountType: "signer", constraints: [{ type: "signer" }] },
      ], body: [
        { type: "require", condition: "lp_amount > 0", errorCode: "InvalidAmount" },
        { type: "require", condition: "pool.total_lp >= lp_amount", errorCode: "SlippageExceeded" },
        { type: "math", operation: "sub", left: "pool.total_lp", right: "lp_amount", result: "new_total", checked: true },
        { type: "set-field", account: "pool", field: "total_lp", value: "new_total" },
      ] },
      { id: "a6-004", name: "swap", args: [{ name: "amount_in", type: "u64" }, { name: "min_amount_out", type: "u64" }], accounts: [
        { id: "a6-040", name: "pool", accountType: "account", stateType: "PoolState", constraints: [{ type: "mut" }] },
        { id: "a6-041", name: "trader", accountType: "signer", constraints: [{ type: "signer" }] },
      ], body: [
        { type: "require", condition: "amount_in > 0", errorCode: "InvalidAmount" },
        { type: "require", condition: "amount_in >= min_amount_out", errorCode: "SlippageExceeded" },
      ] },
    ],
    states: [{ id: "b6-001", name: "PoolState", fields: [{ name: "authority", type: "Pubkey" }, { name: "token_a_vault", type: "Pubkey" }, { name: "token_b_vault", type: "Pubkey" }, { name: "lp_mint", type: "Pubkey" }, { name: "total_lp", type: "u64" }, { name: "bump", type: "u8" }], isZeroCopy: false }],
    errors: [{ id: "c6-001", name: "InvalidAmount", code: 6000, message: "Amount must be greater than 0" }, { id: "c6-002", name: "SlippageExceeded", code: 6001, message: "Slippage tolerance exceeded" }],
    events: [], integrations: [], constants: [{ name: "FEE_BPS", type: "u64", value: "30" }], metadata: META,
  },
};

// ─── Flatten for Solana Playground ─────────────────────────────────────────────

function flattenForCloudBuild(files: { path: string; content: string }[]): [string, string][] {
  const fileMap = new Map<string, string>();
  for (const f of files) {
    if (f.path.endsWith("Cargo.toml")) continue;
    const srcIdx = f.path.indexOf("/src/");
    if (srcIdx !== -1) fileMap.set(f.path.substring(srcIdx + 5), f.content);
  }
  const libRs = fileMap.get("lib.rs") ?? "";
  if (!libRs) return [["/src/lib.rs", "// No source"]];
  const instructions: string[] = [], states: string[] = [], errors: string[] = [], events: string[] = [], constants: string[] = [];
  for (const [p, content] of fileMap) {
    if (p === "lib.rs" || p.endsWith("mod.rs")) continue;
    if (p.startsWith("instructions/")) instructions.push(content);
    else if (p.startsWith("state/")) states.push(content);
    else if (p.startsWith("errors")) errors.push(content);
    else if (p.startsWith("events")) events.push(content);
    else if (p.startsWith("constants")) constants.push(content);
  }
  const stripImports = (code: string) => code.replace(/^use\s+anchor_lang::prelude::\*;\s*$/gm, "").replace(/^use\s+crate::\w+::\w+;\s*$/gm, "").trim();
  const declareId = libRs.match(/declare_id!\("[^"]*"\);/)?.[0] ?? 'declare_id!("11111111111111111111111111111111");';
  const programModuleMatch = libRs.match(/#\[program\]\s*pub mod \w+ \{([\s\S]*?)\n\}/);
  let programBody = programModuleMatch ? programModuleMatch[1].trim() : "";
  const handlerBodies = new Map<string, { body: string; args: string; ctxName: string }>();
  const accountStructs: string[] = [];
  for (const instrContent of instructions) {
    const stripped = stripImports(instrContent);
    const handlerMatch = stripped.match(/pub fn handler\(ctx: Context<(\w+)>([^)]*)\)\s*(?:->\s*Result<\(\)>\s*)?\{([\s\S]*?)\n\}/);
    if (handlerMatch) handlerBodies.set(handlerMatch[1], { body: handlerMatch[3].trim(), args: handlerMatch[2].trim(), ctxName: handlerMatch[1] });
    const accountsMatches = [...stripped.matchAll(/#\[derive\(Accounts\)\]\s*(?:#\[instruction\([^)]*\)\]\s*)?pub struct \w+[^{]*\{[\s\S]*?\n\}/g)];
    for (const m of accountsMatches) accountStructs.push(m[0]);
  }
  const stateStructs: string[] = [];
  for (const s of states) { const stripped = stripImports(s); const matches = [...stripped.matchAll(/#\[account[^\n]*\](?:\s*#\[derive[^\n]*\])*\s*pub struct \w+[^{]*\{[\s\S]*?\n\}/g)]; for (const m of matches) stateStructs.push(m[0]); }
  const programNameMatch = libRs.match(/pub mod (\w+)\s*\{/);
  const programName = programNameMatch ? programNameMatch[1] : "my_program";
  const instrFns: string[] = [];
  for (const [ctxName, info] of handlerBodies) {
    const fnNameMatch = programBody.match(new RegExp(`pub fn (\\w+)\\(ctx: Context<${ctxName}>`));
    const fnName = fnNameMatch ? fnNameMatch[1] : ctxName.toLowerCase();
    const extraArgs = info.args ? ` ${info.args}` : "";
    instrFns.push(`    pub fn ${fnName}(ctx: Context<${ctxName}>${extraArgs}) -> Result<()> {\n` + info.body.split("\n").map((l: string) => (l ? `        ${l}` : "")).join("\n") + `\n    }`);
  }
  const parts: string[] = ["use anchor_lang::prelude::*;\n", `${declareId}\n`, "#[program]", `pub mod ${programName} {`, "    use super::*;", "", instrFns.join("\n\n"), "}\n"];
  if (stateStructs.length) parts.push(stateStructs.join("\n\n") + "\n");
  if (accountStructs.length) parts.push(accountStructs.join("\n\n") + "\n");
  if (errors.length) { for (const e of errors) { const stripped = stripImports(e); const m = stripped.match(/#\[error_code\]\s*pub enum \w+[^{]*\{[\s\S]*?\n\}/); if (m) parts.push(m[0] + "\n"); } }
  if (events.length) { for (const e of events) { const stripped = stripImports(e); const matches = [...stripped.matchAll(/#\[event\]\s*pub struct \w+[^{]*\{[\s\S]*?\n\}/g)]; for (const m of matches) parts.push(m[0] + "\n"); } }
  if (constants.length) { for (const c of constants) { parts.push(c + "\n"); } }
  return [["/src/lib.rs", parts.join("\n")]];
}

function solpgBuild(files: [string, string][]): Promise<{ success: boolean; stderr: string }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ files: files.map(([p, c]) => [p, c]), flags: {} });
    const req = request({ hostname: "api.solpg.io", path: "/build", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, timeout: 120_000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => { try { const parsed = JSON.parse(data); const stderr = parsed.stderr || ""; resolve({ success: !stderr.includes("error: could not compile") && !stderr.includes("error[E"), stderr }); } catch { resolve({ success: false, stderr: data }); } });
    });
    req.on("error", (err) => reject(err));
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(body); req.end();
  });
}

// ─── Runner ─────────────────────────────────────────────────────────────────

const TMP_BASE = "/tmp/solflow-all-templates";

async function testTemplate(name: string, ir: ProgramIR): Promise<{ pass: number; fail: number }> {
  let pass = 0, fail = 0;

  for (const fw of ["anchor", "pinocchio", "quasar"] as const) {
    const result = generateCode(ir, fw as any);
    if (result.errors.length > 0) { fail++; continue; }

    const slug = name.toLowerCase().replace(/\s/g, "-");
    const projectDir = `${TMP_BASE}/${slug}-${fw}`;
    fs.rmSync(projectDir, { recursive: true, force: true });
    for (const file of result.files) {
      const fullPath = path.join(projectDir, file.path);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, file.content);
    }

    try {
      if (fw === "anchor") {
        const flatFiles = flattenForCloudBuild(result.files);
        const buildResult = await solpgBuild(flatFiles);
        if (buildResult.success) { pass++; } else {
          const errs = buildResult.stderr.split("\n").filter((l: string) => l.includes("error")).slice(0, 5);
          console.error(`  [${fw}] FAIL (SolPG): ${errs.join(" | ")}`);
          fs.writeFileSync(`${projectDir}/compile-output.log`, buildResult.stderr);
          fail++;
        }
      } else {
        const cargoDir = path.join(projectDir, `programs/${ir.program.name}`);
        await execFileAsync("cargo-build-sbf", ["--sbf-out-dir", "dist"], { cwd: cargoDir, timeout: 300_000 });
        pass++;
      }
      console.log(`  [${fw}] PASS`);
    } catch (err: any) {
      const output = (err.stdout?.toString() || "") + (err.stderr?.toString() || "");
      const errs = output.split("\n").filter((l: string) => l.includes("error")).slice(0, 5);
      console.error(`  [${fw}] FAIL: ${errs.join(" | ")}`);
      fs.writeFileSync(`${projectDir}/compile-output.log`, output);
      fail++;
    }
  }
  return { pass, fail };
}

async function main() {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  ALL TEMPLATE COMPILATION TEST");
  console.log("══════════════════════════════════════════════════════════════\n");

  let totalPass = 0, totalFail = 0;

  for (const [name, ir] of Object.entries(TEMPLATES)) {
    console.log(`\n>>> ${name}`);
    const { pass, fail } = await testTemplate(name, ir);
    totalPass += pass;
    totalFail += fail;
    console.log(`    Result: ${pass} pass, ${fail} fail`);
  }

  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`  TOTAL: ${totalPass} passed, ${totalFail} failed`);
  console.log("══════════════════════════════════════════════════════════════\n");

  process.exit(totalFail > 0 ? 1 : 0);
}

main();
