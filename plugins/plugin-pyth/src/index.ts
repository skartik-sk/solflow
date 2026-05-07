// plugins/plugin-pyth/src/index.ts
// Pyth Network oracle plugin for SolFlow — Read Price Feed node.

import React from "react";
import type { SolFlowPlugin } from "@solflow/plugin-sdk";
import type { NodeProps } from "@xyflow/react";

// ─── Node component ───────────────────────────────────────────────────────────

function PythReadPriceNode(props: NodeProps) {
  const data = props.data as Record<string, unknown>;
  return React.createElement(
    "div",
    {
      style: {
        background: "#e97c2222",
        border: "1px solid #e97c22",
        borderRadius: 8,
        padding: "8px 12px",
        minWidth: 160,
        fontSize: 12,
        color: "#fff",
      },
    },
    React.createElement(
      "div",
      { style: { fontWeight: 600, marginBottom: 4, color: "#e97c22" } },
      "Read Price Feed",
    ),
    data.outputVar
      ? React.createElement(
          "div",
          { style: { opacity: 0.7 } },
          `→ ${String(data.outputVar)}`,
        )
      : null,
  );
}

// ─── Plugin definition ────────────────────────────────────────────────────────

export const pythPlugin: SolFlowPlugin = {
  id: "pyth",
  name: "Pyth Network",
  version: "0.1.0",
  description: "Read real-time price feeds from Pyth Network oracle",
  author: "SolFlow",
  icon: "/plugins/pyth-logo.svg",
  website: "https://pyth.network",
  security: {
    trustLevel: "first-party",
    publisher: "SolFlow",
    verified: true,
    audited: true,
  },

  nodes: [
    {
      type: "pyth:read-price",
      label: "Read Price Feed",
      category: "Oracles",
      description: "Read current price from a Pyth price feed",
      component: PythReadPriceNode,
      properties: [
        {
          key: "feedId",
          label: "Price Feed",
          type: "select",
          required: true,
          options: [
            {
              label: "SOL/USD",
              value: "J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix",
            },
            {
              label: "BTC/USD",
              value: "GVXRSBjFk6e6J3NbVPXohDJwcHlsDWkVBj7XTxKHrh5K",
            },
            {
              label: "ETH/USD",
              value: "JBu1AL4obBcCMqKBBxhpWCNUt136ijcuMZLFvTP7iWdB",
            },
            {
              label: "USDC/USD",
              value: "Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD",
            },
          ],
        },
        {
          key: "maxAge",
          label: "Max Staleness (s)",
          type: "number",
          required: false,
          default: 30,
        },
        {
          key: "outputVar",
          label: "Store in Variable",
          type: "text",
          required: true,
          default: "price",
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
        {
          id: "data-out",
          type: "data-out",
          position: "right",
          label: "Price Data",
        },
      ],
      defaultData: { feedId: "", maxAge: 30, outputVar: "price" },
      toIR: (data) => ({
        type: "integration",
        pluginId: "pyth",
        integrationId: "read-price",
        config: data,
      }),
    },
  ],

  cargoDependencies: [
    { name: "pyth-solana-receiver-sdk", version: "0.3", framework: "anchor" },
    { name: "pyth-sdk-solana", version: "0.10", framework: "pinocchio" },
  ],

  imports: [],

  codegen: {
    anchor: (nodeData, _context) => ({
      bodyCode: `
        let price_feed = &ctx.accounts.price_feed;
        let current_price = price_feed.get_price_no_older_than(
            &Clock::get()?,
            ${nodeData.maxAge ?? 30},
        ).ok_or(ErrorCode::StalePriceFeed)?;
        let ${nodeData.outputVar ?? "price"} = current_price.price;
        let ${nodeData.outputVar ?? "price"}_conf = current_price.conf;
        let ${nodeData.outputVar ?? "price"}_expo = current_price.expo;
      `,
      accounts: [
        {
          name: "price_feed",
          type: "account",
          customType: "PriceUpdateV2",
          address: nodeData.feedId,
        },
      ],
      imports: ["use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;"],
    }),

    pinocchio: (nodeData, _context) => {
      const outputVar = typeof nodeData.outputVar === "string" && /^[a-z_][a-z0-9_]*$/.test(nodeData.outputVar)
        ? nodeData.outputVar
        : "price";
      return {
        bodyCode: `
          let ${outputVar}_data = price_feed.try_borrow()?;
          if ${outputVar}_data.len() < 240 {
              return Err(ProgramError::InvalidAccountData);
          }
          let ${outputVar} = i64::from_le_bytes(
              ${outputVar}_data[208..216].try_into().map_err(|_| ProgramError::InvalidAccountData)?
          );
          let ${outputVar}_conf = u64::from_le_bytes(
              ${outputVar}_data[216..224].try_into().map_err(|_| ProgramError::InvalidAccountData)?
          );
          let ${outputVar}_expo = i32::from_le_bytes(
              ${outputVar}_data[224..228].try_into().map_err(|_| ProgramError::InvalidAccountData)?
          );
        `,
        accounts: [{ name: "price_feed", type: "unchecked-account" }],
        imports: [],
      };
    },

    quasar: (nodeData, _context) => {
      const outputVar = typeof nodeData.outputVar === "string" && /^[a-z_][a-z0-9_]*$/.test(nodeData.outputVar)
        ? nodeData.outputVar
        : "price";
      return {
        bodyCode: `
          let ${outputVar}_data = ctx.accounts.price_feed.try_borrow_data()?;
          if ${outputVar}_data.len() < 240 {
              return Err(ProgramError::InvalidAccountData);
          }
          let ${outputVar} = i64::from_le_bytes(${outputVar}_data[208..216].try_into().map_err(|_| ProgramError::InvalidAccountData)?);
          let ${outputVar}_conf = u64::from_le_bytes(${outputVar}_data[216..224].try_into().map_err(|_| ProgramError::InvalidAccountData)?);
          let ${outputVar}_expo = i32::from_le_bytes(${outputVar}_data[224..228].try_into().map_err(|_| ProgramError::InvalidAccountData)?);
        `,
        accounts: [{ name: "price_feed", type: "unchecked-account" }],
        imports: [],
      };
    },
  },
};

export default pythPlugin;
