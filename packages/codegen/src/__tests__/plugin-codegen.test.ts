import { describe, expect, it } from "vitest";
import type { ProgramIR } from "@solflow/ir";
import { generateCode } from "../index";

const IX_ID = "00000000-0000-4000-8000-000000000001";

function baseIr(integrationId = "transfer"): ProgramIR {
  return {
    version: "1.0.0",
    program: {
      name: "plugin_program",
      version: "0.1.0",
      license: "MIT",
    },
    instructions: [
      {
        id: IX_ID,
        name: "execute",
        args: [],
        accounts: [],
        body: [],
        accessControl: "none",
      },
    ],
    states: [],
    errors: [],
    events: [],
    integrations: [
      {
        id: "00000000-0000-4000-8000-000000000002",
        pluginId: "spl-token",
        integrationId,
        config: { amount: 42 },
        attachedTo: {
          instructionId: IX_ID,
          position: "before-body",
        },
      },
    ],
    constants: [],
    metadata: {
      createdAt: "2026-04-26T00:00:00.000Z",
      updatedAt: "2026-04-26T00:00:00.000Z",
      generatorVersion: "test",
      flowHash: "test",
    },
  };
}

describe("plugin codegen", () => {
  it("injects Anchor SPL Token transfer code and accounts", () => {
    const result = generateCode(baseIr(), "anchor");
    const cargo = result.files.find((file) => file.path.endsWith("Cargo.toml"));
    const ix = result.files.find((file) =>
      file.path.endsWith("src/instructions/execute.rs"),
    );

    expect(result.errors).toEqual([]);
    expect(cargo?.content).toContain('anchor-spl = "0.32.1"');
    expect(ix?.content).toContain(
      "use anchor_spl::token::{self, Token, TokenAccount, Transfer};",
    );
    expect(ix?.content).toContain("token::transfer(");
    expect(ix?.content).toContain("42");
    expect(ix?.content).toContain(
      "pub source: Account<'info, TokenAccount>,",
    );
    expect(ix?.content).toContain("pub token_program: Program<'info, Token>,");
  });

  it("injects Anchor Pyth price read code and dependency", () => {
    const ir = baseIr("read-price");
    ir.integrations[0] = {
      ...ir.integrations[0],
      pluginId: "pyth",
      integrationId: "read-price",
      config: { maxAge: 60, outputVar: "sol_price" },
    };

    const result = generateCode(ir, "anchor");
    const cargo = result.files.find((file) => file.path.endsWith("Cargo.toml"));
    const ix = result.files.find((file) =>
      file.path.endsWith("src/instructions/execute.rs"),
    );

    expect(cargo?.content).toContain('pyth-solana-receiver-sdk = "0.3"');
    expect(ix?.content).toContain(
      "use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;",
    );
    expect(ix?.content).toContain("get_price_no_older_than");
    expect(ix?.content).toContain("let sol_price = current_price.price;");
    expect(ix?.content).toContain(
      "pub price_feed: Account<'info, PriceUpdateV2>,",
    );
  });

  it("warns when plugin integrations are not generated for Pinocchio yet", () => {
    const result = generateCode(baseIr(), "pinocchio");

    expect(result.warnings.some((warning) =>
      warning.message.includes("not generated for Pinocchio yet"),
    )).toBe(true);
  });

  it("warns when plugin integrations are not generated for Quasar yet", () => {
    const result = generateCode(baseIr(), "quasar");

    expect(result.warnings.some((warning) =>
      warning.message.includes("not generated for Quasar yet"),
    )).toBe(true);
  });
});
