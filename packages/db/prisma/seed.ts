// packages/db/prisma/seed.ts
// Seed the database with pre-built starter templates from the SolFlow team.
// Run with: bun run db:seed (from monorepo root) or `bun prisma/seed.ts` from packages/db
//
// Per 13-marketplace.md: 7 curated starter templates are seeded automatically.
// These are given a synthetic "system" author user.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── System author ─────────────────────────────────────────────────────────
const SYSTEM_USER_ID = "system-solflow-templates";

// ─── Minimal valid flow / IR stubs for each template ──────────────────────
// Real flows would be designed in the editor; here we provide enough structure
// for the detail page to display something meaningful.

function makeFlow(nodes: object[], edges: object[]) {
  return { nodes, edges, viewport: { x: 0, y: 0, zoom: 0.8 } };
}

function makeIR(
  programName: string,
  instructions: string[],
  accounts: string[],
): object {
  return {
    program: {
      name: programName,
      programId: undefined,
    },
    instructions: instructions.map((name) => ({
      name,
      params: [],
      accounts: accounts.map((a) => ({
        name: a,
        isMut: true,
        isSigner: false,
        constraints: [],
      })),
    })),
    accounts: [],
    errors: [],
    events: [],
    metadata: {
      generatorVersion: "1.0.0",
    },
  };
}

// ─── Template definitions ─────────────────────────────────────────────────

const TEMPLATES = [
  {
    title: "Token Mint",
    description:
      "SPL token creation with configurable mint authority, decimals, and supply control.",
    longDescription:
      "A complete SPL token program built with Anchor. Includes initialize_mint, mint_to, burn, and freeze_authority instructions. Great starting point for fungible token projects.",
    category: "TOKEN",
    tags: ["spl-token", "mint", "fungible", "anchor"],
    pricingModel: "FREE" as const,
    templateFlowData: makeFlow(
      [
        {
          id: "program",
          type: "program",
          position: { x: 100, y: 80 },
          data: { name: "token_mint", programId: undefined },
        },
        {
          id: "ix-init",
          type: "instruction",
          position: { x: 350, y: 80 },
          data: { name: "initialize_mint" },
        },
        {
          id: "ix-mint",
          type: "instruction",
          position: { x: 350, y: 200 },
          data: { name: "mint_to" },
        },
        {
          id: "ix-burn",
          type: "instruction",
          position: { x: 350, y: 320 },
          data: { name: "burn" },
        },
        {
          id: "acc-mint",
          type: "account",
          position: { x: 600, y: 80 },
          data: { name: "mint_account", accountType: "mint", isMut: true },
        },
        {
          id: "acc-authority",
          type: "account",
          position: { x: 600, y: 200 },
          data: { name: "authority", accountType: "signer", isSigner: true },
        },
      ],
      [
        { id: "e1", source: "program", target: "ix-init" },
        { id: "e2", source: "program", target: "ix-mint" },
        { id: "e3", source: "program", target: "ix-burn" },
        { id: "e4", source: "ix-init", target: "acc-mint" },
        { id: "e5", source: "ix-mint", target: "acc-authority" },
      ],
    ),
    templateIR: makeIR(
      "token_mint",
      ["initialize_mint", "mint_to", "burn"],
      ["mint_account", "authority", "token_account"],
    ),
  },

  {
    title: "NFT Collection",
    description:
      "Metaplex-compatible NFT collection with mint, verify collection, and update metadata.",
    longDescription:
      "A full NFT minting program using Anchor + Metaplex. Covers collection creation, NFT minting with metadata, collection verification, and royalty configuration.",
    category: "NFT",
    tags: ["nft", "metaplex", "collection", "metadata"],
    pricingModel: "FREE" as const,
    templateFlowData: makeFlow(
      [
        {
          id: "program",
          type: "program",
          position: { x: 100, y: 120 },
          data: { name: "nft_collection" },
        },
        {
          id: "ix-create",
          type: "instruction",
          position: { x: 350, y: 80 },
          data: { name: "create_collection" },
        },
        {
          id: "ix-mint",
          type: "instruction",
          position: { x: 350, y: 220 },
          data: { name: "mint_nft" },
        },
        {
          id: "ix-verify",
          type: "instruction",
          position: { x: 350, y: 360 },
          data: { name: "verify_collection" },
        },
      ],
      [
        { id: "e1", source: "program", target: "ix-create" },
        { id: "e2", source: "program", target: "ix-mint" },
        { id: "e3", source: "program", target: "ix-verify" },
      ],
    ),
    templateIR: makeIR(
      "nft_collection",
      ["create_collection", "mint_nft", "verify_collection"],
      ["mint", "metadata", "authority", "payer"],
    ),
  },

  {
    title: "Simple Vault",
    description:
      "SOL deposit/withdraw vault with PDA authority — demonstrates PDA derivation and lamport transfers.",
    longDescription:
      "A minimal vault program that accepts SOL deposits and lets the depositor withdraw. Uses a PDA as the vault authority. Perfect for learning PDA derivation, constraints, and lamport accounting.",
    category: "DEFI",
    tags: ["vault", "pda", "defi", "deposit", "withdraw"],
    pricingModel: "FREE" as const,
    templateFlowData: makeFlow(
      [
        {
          id: "program",
          type: "program",
          position: { x: 100, y: 120 },
          data: { name: "simple_vault" },
        },
        {
          id: "ix-init",
          type: "instruction",
          position: { x: 350, y: 60 },
          data: { name: "initialize" },
        },
        {
          id: "ix-deposit",
          type: "instruction",
          position: { x: 350, y: 200 },
          data: { name: "deposit" },
        },
        {
          id: "ix-withdraw",
          type: "instruction",
          position: { x: 350, y: 340 },
          data: { name: "withdraw" },
        },
        {
          id: "acc-vault",
          type: "account",
          position: { x: 620, y: 200 },
          data: { name: "vault", accountType: "pda", isMut: true },
        },
        {
          id: "state-vault",
          type: "state",
          position: { x: 620, y: 340 },
          data: {
            name: "VaultState",
            fields: [
              { name: "owner", fieldType: "pubkey" },
              { name: "bump", fieldType: "u8" },
              { name: "total_deposited", fieldType: "u64" },
            ],
          },
        },
      ],
      [
        { id: "e1", source: "program", target: "ix-init" },
        { id: "e2", source: "program", target: "ix-deposit" },
        { id: "e3", source: "program", target: "ix-withdraw" },
        { id: "e4", source: "ix-deposit", target: "acc-vault" },
        { id: "e5", source: "acc-vault", target: "state-vault" },
      ],
    ),
    templateIR: makeIR(
      "simple_vault",
      ["initialize", "deposit", "withdraw"],
      ["vault", "owner", "system_program"],
    ),
  },

  {
    title: "Escrow",
    description:
      "Two-party token escrow with timelock — Party A deposits, Party B fulfills before deadline.",
    longDescription:
      "A secure escrow program. Party A deposits tokens; Party B has until a deadline to fulfill the trade. Either party can cancel before the deadline. Demonstrates token transfers, time constraints, and authority delegation.",
    category: "DEFI",
    tags: ["escrow", "timelock", "swap", "defi"],
    pricingModel: "FREE" as const,
    templateFlowData: makeFlow(
      [
        {
          id: "program",
          type: "program",
          position: { x: 100, y: 120 },
          data: { name: "escrow" },
        },
        {
          id: "ix-init",
          type: "instruction",
          position: { x: 350, y: 60 },
          data: { name: "initialize_escrow" },
        },
        {
          id: "ix-exchange",
          type: "instruction",
          position: { x: 350, y: 200 },
          data: { name: "exchange" },
        },
        {
          id: "ix-cancel",
          type: "instruction",
          position: { x: 350, y: 340 },
          data: { name: "cancel" },
        },
      ],
      [
        { id: "e1", source: "program", target: "ix-init" },
        { id: "e2", source: "program", target: "ix-exchange" },
        { id: "e3", source: "program", target: "ix-cancel" },
      ],
    ),
    templateIR: makeIR(
      "escrow",
      ["initialize_escrow", "exchange", "cancel"],
      ["escrow_state", "maker", "taker", "token_account"],
    ),
  },

  {
    title: "Staking Pool",
    description:
      "Token staking pool with time-weighted reward distribution and compound support.",
    longDescription:
      "A staking program where users lock tokens and earn proportional rewards over time. Implements stake, unstake, claim_rewards, and compound instructions. Uses a pool state account and per-user staker accounts.",
    category: "DEFI",
    tags: ["staking", "rewards", "defi", "yield"],
    pricingModel: "FREE" as const,
    templateFlowData: makeFlow(
      [
        {
          id: "program",
          type: "program",
          position: { x: 100, y: 160 },
          data: { name: "staking_pool" },
        },
        {
          id: "ix-init",
          type: "instruction",
          position: { x: 350, y: 60 },
          data: { name: "initialize_pool" },
        },
        {
          id: "ix-stake",
          type: "instruction",
          position: { x: 350, y: 180 },
          data: { name: "stake" },
        },
        {
          id: "ix-unstake",
          type: "instruction",
          position: { x: 350, y: 300 },
          data: { name: "unstake" },
        },
        {
          id: "ix-claim",
          type: "instruction",
          position: { x: 350, y: 420 },
          data: { name: "claim_rewards" },
        },
      ],
      [
        { id: "e1", source: "program", target: "ix-init" },
        { id: "e2", source: "program", target: "ix-stake" },
        { id: "e3", source: "program", target: "ix-unstake" },
        { id: "e4", source: "program", target: "ix-claim" },
      ],
    ),
    templateIR: makeIR(
      "staking_pool",
      ["initialize_pool", "stake", "unstake", "claim_rewards"],
      ["pool_state", "staker_account", "stake_vault", "reward_vault"],
    ),
  },

  {
    title: "DAO Voting",
    description:
      "On-chain DAO with proposal creation, token-weighted voting, and execution timelock.",
    longDescription:
      "A minimal DAO program. Members create proposals, cast votes (weighted by token holdings), and execute approved proposals after a timelock. Supports quorum thresholds and simple majority voting.",
    category: "DAO",
    tags: ["dao", "voting", "governance", "proposals"],
    pricingModel: "FREE" as const,
    templateFlowData: makeFlow(
      [
        {
          id: "program",
          type: "program",
          position: { x: 100, y: 160 },
          data: { name: "dao_voting" },
        },
        {
          id: "ix-create",
          type: "instruction",
          position: { x: 350, y: 60 },
          data: { name: "create_proposal" },
        },
        {
          id: "ix-vote",
          type: "instruction",
          position: { x: 350, y: 200 },
          data: { name: "cast_vote" },
        },
        {
          id: "ix-execute",
          type: "instruction",
          position: { x: 350, y: 340 },
          data: { name: "execute_proposal" },
        },
      ],
      [
        { id: "e1", source: "program", target: "ix-create" },
        { id: "e2", source: "program", target: "ix-vote" },
        { id: "e3", source: "program", target: "ix-execute" },
      ],
    ),
    templateIR: makeIR(
      "dao_voting",
      ["create_proposal", "cast_vote", "execute_proposal"],
      ["proposal", "voter", "governance_token", "dao_config"],
    ),
  },

  {
    title: "AMM (Basic)",
    description:
      "Constant-product AMM (x·y=k) with add/remove liquidity and swap instructions.",
    longDescription:
      "A basic automated market maker using the constant product formula. Supports adding liquidity, removing liquidity, and token swaps. Implements LP token minting and a 0.3% swap fee.",
    category: "DEFI",
    tags: ["amm", "swap", "liquidity", "defi", "dex"],
    pricingModel: "FREE" as const,
    templateFlowData: makeFlow(
      [
        {
          id: "program",
          type: "program",
          position: { x: 100, y: 160 },
          data: { name: "amm" },
        },
        {
          id: "ix-init",
          type: "instruction",
          position: { x: 350, y: 60 },
          data: { name: "initialize_pool" },
        },
        {
          id: "ix-add",
          type: "instruction",
          position: { x: 350, y: 200 },
          data: { name: "add_liquidity" },
        },
        {
          id: "ix-remove",
          type: "instruction",
          position: { x: 350, y: 340 },
          data: { name: "remove_liquidity" },
        },
        {
          id: "ix-swap",
          type: "instruction",
          position: { x: 350, y: 480 },
          data: { name: "swap" },
        },
      ],
      [
        { id: "e1", source: "program", target: "ix-init" },
        { id: "e2", source: "program", target: "ix-add" },
        { id: "e3", source: "program", target: "ix-remove" },
        { id: "e4", source: "program", target: "ix-swap" },
      ],
    ),
    templateIR: makeIR(
      "amm",
      ["initialize_pool", "add_liquidity", "remove_liquidity", "swap"],
      ["pool_state", "token_a_vault", "token_b_vault", "lp_mint"],
    ),
  },
] as const;

// ─── Seed function ────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding starter templates...");

  // Upsert system author
  await prisma.user.upsert({
    where: { id: SYSTEM_USER_ID },
    update: {},
    create: {
      id: SYSTEM_USER_ID,
      name: "SolFlow Team",
      email: "templates@solflow.dev",
      authProvider: "EMAIL",
    },
  });

  for (const template of TEMPLATES) {
    // Create a synthetic project to hold the template
    const existingProject = await prisma.project.findFirst({
      where: {
        userId: SYSTEM_USER_ID,
        name: template.title,
      },
    });

    const project =
      existingProject ??
      (await prisma.project.create({
        data: {
          name: template.title,
          description: template.description,
          framework: "ANCHOR",
          userId: SYSTEM_USER_ID,
          flowData: template.templateFlowData as object,
          irData: template.templateIR as object,
        },
      }));

    // Upsert the marketplace listing
    const existing = await prisma.marketplaceListing.findFirst({
      where: { projectId: project.id },
    });

    if (existing) {
      await prisma.marketplaceListing.update({
        where: { id: existing.id },
        data: {
          title: template.title,
          description: template.description,
          longDescription: template.longDescription,
          category: template.category,
          tags: [...template.tags],
          pricingModel: template.pricingModel,
          templateFlowData: template.templateFlowData as object,
          templateIR: template.templateIR as object,
          status: "PUBLISHED",
          featured: true,
          publishedAt: new Date(),
        },
      });
      console.log(`  Updated: ${template.title}`);
    } else {
      await prisma.marketplaceListing.create({
        data: {
          projectId: project.id,
          authorId: SYSTEM_USER_ID,
          title: template.title,
          description: template.description,
          longDescription: template.longDescription,
          category: template.category,
          tags: [...template.tags],
          pricingModel: template.pricingModel,
          templateFlowData: template.templateFlowData as object,
          templateIR: template.templateIR as object,
          status: "PUBLISHED",
          featured: true,
          publishedAt: new Date(),
        },
      });
      console.log(`  Seeded: ${template.title}`);
    }
  }

  console.log("Done — 7 starter templates seeded.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
