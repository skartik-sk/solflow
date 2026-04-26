// plugins/plugin-spl-token/src/index.ts
// SPL Token plugin for SolFlow — provides Create Mint, Mint Tokens, Transfer nodes.

import React from "react";
import type { SolFlowPlugin } from "@solflow/plugin-sdk";
import type { NodeProps } from "@xyflow/react";

// ─── Minimal generic node component ──────────────────────────────────────────

function GenericPluginNode({
  data,
  label,
  color,
}: {
  data: Record<string, unknown>;
  label: string;
  color: string;
}) {
  return React.createElement(
    "div",
    {
      style: {
        background: `${color}22`,
        border: `1px solid ${color}`,
        borderRadius: 8,
        padding: "8px 12px",
        minWidth: 140,
        fontSize: 12,
        color: "#fff",
      },
    },
    React.createElement(
      "div",
      { style: { fontWeight: 600, marginBottom: 4, color } },
      label,
    ),
    data.label
      ? React.createElement(
          "div",
          { style: { opacity: 0.7 } },
          String(data.label),
        )
      : null,
  );
}

function CreateMintNode(props: NodeProps) {
  return GenericPluginNode({
    data: props.data as Record<string, unknown>,
    label: "Create Mint",
    color: "#16a34a",
  });
}

function MintTokensNode(props: NodeProps) {
  return GenericPluginNode({
    data: props.data as Record<string, unknown>,
    label: "Mint Tokens",
    color: "#16a34a",
  });
}

function TransferTokensNode(props: NodeProps) {
  return GenericPluginNode({
    data: props.data as Record<string, unknown>,
    label: "Transfer Tokens",
    color: "#16a34a",
  });
}

// ─── Plugin definition ────────────────────────────────────────────────────────

export const splTokenPlugin: SolFlowPlugin = {
  id: "spl-token",
  name: "SPL Token",
  version: "0.1.0",
  description:
    "Integration with the Solana SPL Token program for fungible tokens",
  author: "SolFlow",
  icon: "/plugins/spl-token-logo.svg",
  website: "https://spl.solana.com/token",
  security: {
    trustLevel: "first-party",
    publisher: "SolFlow",
    verified: true,
    audited: true,
  },

  nodes: [
    {
      type: "spl-token:create-mint",
      label: "Create Mint",
      category: "Tokens (SPL)",
      description: "Initialise a new SPL token mint",
      component: CreateMintNode,
      properties: [
        {
          key: "decimals",
          label: "Decimals",
          type: "number",
          required: true,
          default: 9,
        },
        {
          key: "mintAuthority",
          label: "Mint Authority",
          type: "pubkey",
          required: true,
        },
        {
          key: "freezeAuthority",
          label: "Freeze Authority",
          type: "pubkey",
          required: false,
        },
      ],
      handles: [
        { id: "logic-in", type: "logic-in", position: "top", label: "Input" },
        {
          id: "logic-out",
          type: "logic-out",
          position: "bottom",
          label: "Output",
        },
      ],
      defaultData: { decimals: 9, mintAuthority: "", freezeAuthority: "" },
      toIR: (data) => ({
        type: "integration",
        pluginId: "spl-token",
        integrationId: "create-mint",
        config: data,
      }),
    },
    {
      type: "spl-token:mint-tokens",
      label: "Mint Tokens",
      category: "Tokens (SPL)",
      description: "Mint tokens to a token account",
      component: MintTokensNode,
      properties: [
        {
          key: "amount",
          label: "Amount (raw)",
          type: "number",
          required: true,
          default: 1000000000,
        },
        {
          key: "destination",
          label: "Destination ATA",
          type: "pubkey",
          required: true,
        },
      ],
      handles: [
        { id: "logic-in", type: "logic-in", position: "top", label: "Input" },
        {
          id: "logic-out",
          type: "logic-out",
          position: "bottom",
          label: "Output",
        },
      ],
      defaultData: { amount: 1000000000, destination: "" },
      toIR: (data) => ({
        type: "integration",
        pluginId: "spl-token",
        integrationId: "mint-tokens",
        config: data,
      }),
    },
    {
      type: "spl-token:transfer",
      label: "Transfer Tokens",
      category: "Tokens (SPL)",
      description: "Transfer tokens between token accounts",
      component: TransferTokensNode,
      properties: [
        {
          key: "amount",
          label: "Amount (raw)",
          type: "number",
          required: true,
        },
        { key: "source", label: "Source ATA", type: "pubkey", required: true },
        {
          key: "destination",
          label: "Destination ATA",
          type: "pubkey",
          required: true,
        },
      ],
      handles: [
        { id: "logic-in", type: "logic-in", position: "top", label: "Input" },
        {
          id: "logic-out",
          type: "logic-out",
          position: "bottom",
          label: "Output",
        },
      ],
      defaultData: { amount: 0, source: "", destination: "" },
      toIR: (data) => ({
        type: "integration",
        pluginId: "spl-token",
        integrationId: "transfer",
        config: data,
      }),
    },
  ],

  cargoDependencies: [
    {
      name: "spl-token",
      version: "4.0",
      features: ["no-entrypoint"],
      framework: "both",
    },
    {
      name: "anchor-spl",
      version: "0.30",
      framework: "anchor",
    },
  ],

  imports: [
    {
      path: "anchor_spl::token",
      items: ["Token", "TokenAccount", "Mint", "MintTo", "Transfer"],
      framework: "anchor",
    },
    {
      path: "spl_token::instruction",
      items: ["mint_to", "transfer"],
      framework: "pinocchio",
    },
  ],

  codegen: {
    anchor: (nodeData, _context) => {
      if (nodeData.integrationId === "create-mint") {
        return {
          bodyCode: `
            // Mint initialised via init constraint on the mint account
          `,
          accounts: [
            {
              name: "mint",
              type: "account",
              customType: "Mint",
              isMut: true,
              isSigner: true,
            },
            { name: "payer", type: "signer", isMut: true, isSigner: true },
            {
              name: "token_program",
              type: "program",
              address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            },
            { name: "system_program", type: "program" },
            { name: "rent", type: "sysvar" },
          ],
          imports: ["use anchor_spl::token::{Mint, Token};"],
        };
      }
      if (nodeData.integrationId === "mint-tokens") {
        return {
          bodyCode: `
            token::mint_to(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    token::MintTo {
                        mint: ctx.accounts.mint.to_account_info(),
                        to: ctx.accounts.destination.to_account_info(),
                        authority: ctx.accounts.authority.to_account_info(),
                    },
                ),
                ${nodeData.amount},
            )?;
          `,
          accounts: [
            {
              name: "mint",
              type: "account",
              customType: "Mint",
              isMut: true,
              isSigner: false,
            },
            {
              name: "destination",
              type: "account",
              customType: "TokenAccount",
              isMut: true,
              isSigner: false,
            },
            { name: "authority", type: "signer", isMut: false, isSigner: true },
            {
              name: "token_program",
              type: "program",
              address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            },
          ],
          imports: [
            "use anchor_spl::token::{self, Mint, Token, TokenAccount, MintTo};",
          ],
        };
      }
      if (nodeData.integrationId === "transfer") {
        return {
          bodyCode: `
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    token::Transfer {
                        from: ctx.accounts.source.to_account_info(),
                        to: ctx.accounts.destination.to_account_info(),
                        authority: ctx.accounts.authority.to_account_info(),
                    },
                ),
                ${nodeData.amount},
            )?;
          `,
          accounts: [
            {
              name: "source",
              type: "account",
              customType: "TokenAccount",
              isMut: true,
              isSigner: false,
            },
            {
              name: "destination",
              type: "account",
              customType: "TokenAccount",
              isMut: true,
              isSigner: false,
            },
            { name: "authority", type: "signer", isMut: false, isSigner: true },
            {
              name: "token_program",
              type: "program",
              address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            },
          ],
          imports: [
            "use anchor_spl::token::{self, Token, TokenAccount, Transfer};",
          ],
        };
      }
      return { bodyCode: "", accounts: [], imports: [] };
    },

    pinocchio: (_nodeData, _context) => {
      // Pinocchio version uses raw CPI calls
      return {
        bodyCode: "// TODO: pinocchio SPL Token CPI",
        accounts: [],
        imports: [],
      };
    },
  },
};

export default splTokenPlugin;
