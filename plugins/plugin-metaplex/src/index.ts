// plugins/plugin-metaplex/src/index.ts
// Metaplex plugin for SolFlow — Mint NFT + Create Collection nodes.

import React from "react";
import type { SolFlowPlugin } from "@solflow/plugin-sdk";
import type { NodeProps } from "@xyflow/react";

// ─── Node components ──────────────────────────────────────────────────────────

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
    data.name
      ? React.createElement(
          "div",
          { style: { opacity: 0.7 } },
          String(data.name),
        )
      : null,
  );
}

function MintNFTNode(props: NodeProps) {
  return GenericPluginNode({
    data: props.data as Record<string, unknown>,
    label: "Mint NFT",
    color: "#7c3aed",
  });
}

function CreateCollectionNode(props: NodeProps) {
  return GenericPluginNode({
    data: props.data as Record<string, unknown>,
    label: "Create Collection",
    color: "#7c3aed",
  });
}

// ─── Plugin definition ────────────────────────────────────────────────────────

export const metaplexPlugin: SolFlowPlugin = {
  id: "metaplex",
  name: "Metaplex",
  version: "0.1.0",
  description: "Integration with Metaplex Token Metadata program for NFTs",
  author: "SolFlow",
  icon: "/plugins/metaplex-logo.svg",
  website: "https://metaplex.com",

  nodes: [
    {
      type: "metaplex:mint-nft",
      label: "Mint NFT",
      category: "NFTs (Metaplex)",
      description: "Mint a new NFT with metadata",
      component: MintNFTNode,
      properties: [
        { key: "name", label: "NFT Name", type: "text", required: true },
        { key: "symbol", label: "Symbol", type: "text", required: true },
        { key: "uri", label: "Metadata URI", type: "text", required: true },
        {
          key: "sellerFeeBasisPoints",
          label: "Royalty (basis pts)",
          type: "number",
          required: true,
          default: 500,
        },
        {
          key: "isMutable",
          label: "Is Mutable",
          type: "boolean",
          required: false,
          default: true,
        },
        {
          key: "collection",
          label: "Collection",
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
      defaultData: {
        name: "",
        symbol: "",
        uri: "",
        sellerFeeBasisPoints: 500,
        isMutable: true,
      },
      toIR: (data) => ({
        type: "integration",
        pluginId: "metaplex",
        integrationId: "mint-nft",
        config: data,
      }),
    },
    {
      type: "metaplex:create-collection",
      label: "Create Collection",
      category: "NFTs (Metaplex)",
      description: "Create a new NFT collection",
      component: CreateCollectionNode,
      properties: [
        { key: "name", label: "Collection Name", type: "text", required: true },
        { key: "symbol", label: "Symbol", type: "text", required: true },
        { key: "uri", label: "Metadata URI", type: "text", required: true },
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
      defaultData: { name: "", symbol: "", uri: "" },
      toIR: (data) => ({
        type: "integration",
        pluginId: "metaplex",
        integrationId: "create-collection",
        config: data,
      }),
    },
  ],

  cargoDependencies: [
    { name: "mpl-token-metadata", version: "4.1", framework: "both" },
  ],

  imports: [
    {
      path: "mpl_token_metadata",
      items: ["instructions", "types"],
      framework: "both",
    },
  ],

  codegen: {
    anchor: (nodeData, _context) => {
      if (nodeData.integrationId === "mint-nft") {
        return {
          bodyCode: `
            let metadata_accounts = CreateMetadataAccountsV3 {
                metadata: ctx.accounts.metadata.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                mint_authority: ctx.accounts.authority.to_account_info(),
                payer: ctx.accounts.payer.to_account_info(),
                update_authority: ctx.accounts.authority.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            };
            let data = DataV2 {
                name: "${nodeData.name}".to_string(),
                symbol: "${nodeData.symbol}".to_string(),
                uri: "${nodeData.uri}".to_string(),
                seller_fee_basis_points: ${nodeData.sellerFeeBasisPoints},
                creators: Some(vec![Creator {
                    address: ctx.accounts.authority.key(),
                    verified: true,
                    share: 100,
                }]),
                collection: None,
                uses: None,
            };
            create_metadata_accounts_v3(
                CpiContext::new(ctx.accounts.metadata_program.to_account_info(), metadata_accounts),
                data,
                ${nodeData.isMutable},
                true,
                None,
            )?;
          `,
          accounts: [
            {
              name: "metadata",
              type: "unchecked-account",
              isMut: true,
              isSigner: false,
            },
            {
              name: "mint",
              type: "account",
              customType: "Mint",
              isMut: true,
              isSigner: true,
            },
            { name: "authority", type: "signer", isMut: false, isSigner: true },
            { name: "payer", type: "signer", isMut: true, isSigner: true },
            {
              name: "metadata_program",
              type: "program",
              address: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
            },
            { name: "system_program", type: "program" },
            { name: "rent", type: "sysvar" },
          ],
          imports: [
            "use mpl_token_metadata::instructions::CreateMetadataAccountsV3;",
            "use mpl_token_metadata::types::{DataV2, Creator};",
          ],
        };
      }
      if (nodeData.integrationId === "create-collection") {
        return {
          bodyCode: `
            // Create collection NFT — uses same metadata CPI as mint-nft
            // with is_collection = true in DataV2
          `,
          accounts: [
            {
              name: "metadata",
              type: "unchecked-account",
              isMut: true,
              isSigner: false,
            },
            {
              name: "mint",
              type: "account",
              customType: "Mint",
              isMut: true,
              isSigner: true,
            },
            {
              name: "metadata_program",
              type: "program",
              address: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
            },
          ],
          imports: [
            "use mpl_token_metadata::instructions::CreateMetadataAccountsV3;",
            "use mpl_token_metadata::types::DataV2;",
          ],
        };
      }
      return { bodyCode: "", accounts: [], imports: [] };
    },
    pinocchio: (_nodeData, _context) => {
      // Pinocchio uses raw CPI patterns
      return {
        bodyCode: "// TODO: pinocchio Metaplex CPI",
        accounts: [],
        imports: [],
      };
    },
  },
};

export default metaplexPlugin;
