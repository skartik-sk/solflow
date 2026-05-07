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

  it("injects Anchor Metaplex metadata CPI code", () => {
    const ir = baseIr("mint-nft");
    ir.integrations[0] = {
      ...ir.integrations[0],
      pluginId: "metaplex",
      integrationId: "mint-nft",
      config: {
        name: "Demo",
        symbol: "DMO",
        uri: "https://example.com/demo.json",
        sellerFeeBasisPoints: 500,
      },
    };

    const result = generateCode(ir, "anchor");
    const cargo = result.files.find((file) => file.path.endsWith("Cargo.toml"));
    const ix = result.files.find((file) =>
      file.path.endsWith("src/instructions/execute.rs"),
    );

    expect(result.warnings.some((warning) =>
      warning.message.includes("does not have Anchor codegen yet"),
    )).toBe(false);
    expect(cargo?.content).toContain('anchor-spl = "0.32.1"');
    expect(cargo?.content).toContain('mpl-token-metadata = "4.1"');
    expect(ix?.content).toContain("CreateMetadataAccountV3CpiBuilder");
    expect(ix?.content).toContain('name: "Demo".to_string()');
    expect(ix?.content).toContain("pub metadata: UncheckedAccount<'info>,");
  });

  it("injects Pinocchio SPL Token transfer code and accounts", () => {
    const result = generateCode(baseIr(), "pinocchio");
    const cargo = result.files.find((file) => file.path.endsWith("Cargo.toml"));
    const ix = result.files.find((file) =>
      file.path.endsWith("src/instructions/execute.rs"),
    );

    expect(result.errors).toEqual([]);
    expect(result.warnings.some((warning) =>
      warning.message.includes("not generated for Pinocchio yet"),
    )).toBe(false);
    expect(cargo?.content).toContain('pinocchio-token = "0.6"');
    expect(ix?.content).toContain("TokenTransfer");
    expect(ix?.content).toContain("let [source, destination, authority, token_program");
    expect(ix?.content).toContain("amount: 42");
  });

  it("injects Quasar SPL Token transfer code and accounts", () => {
    const result = generateCode(baseIr(), "quasar");
    const cargo = result.files.find((file) => file.path.endsWith("Cargo.toml"));
    const libRs = result.files.find((file) => file.path.endsWith("src/lib.rs"));
    const ix = result.files.find((file) =>
      file.path.endsWith("src/instructions/execute.rs"),
    );

    expect(result.errors).toEqual([]);
    expect(result.warnings.some((warning) =>
      warning.message.includes("not generated for Quasar yet"),
    )).toBe(false);
    expect(cargo?.content).toContain('quasar-spl = "0.0"');
    expect(libRs?.content).toContain(".transfer(ctx.accounts.source");
    expect(ix?.content).toContain("pub token_program: &'info Program<Token>,");
  });

  it("injects Pinocchio Pyth price read code", () => {
    const ir = baseIr("read-price");
    ir.integrations[0] = {
      ...ir.integrations[0],
      pluginId: "pyth",
      integrationId: "read-price",
      config: { maxAge: 60, outputVar: "sol_price" },
    };

    const result = generateCode(ir, "pinocchio");
    const cargo = result.files.find((file) => file.path.endsWith("Cargo.toml"));
    const ix = result.files.find((file) =>
      file.path.endsWith("src/instructions/execute.rs"),
    );

    expect(result.warnings.some((warning) =>
      warning.message.includes("not generated for Pinocchio yet"),
    )).toBe(false);
    expect(cargo?.content).toContain('pyth-sdk-solana = "0.10"');
    expect(ix?.content).toContain("let sol_price_data = price_feed.try_borrow()?");
    expect(ix?.content).toContain("let sol_price = i64::from_le_bytes");
  });

  it("injects Quasar Pyth price read code", () => {
    const ir = baseIr("read-price");
    ir.integrations[0] = {
      ...ir.integrations[0],
      pluginId: "pyth",
      integrationId: "read-price",
      config: { maxAge: 60, outputVar: "sol_price" },
    };

    const result = generateCode(ir, "quasar");
    const libRs = result.files.find((file) => file.path.endsWith("src/lib.rs"));
    const ix = result.files.find((file) =>
      file.path.endsWith("src/instructions/execute.rs"),
    );

    expect(result.warnings.some((warning) =>
      warning.message.includes("not generated for Quasar yet"),
    )).toBe(false);
    expect(libRs?.content).toContain("let sol_price_data = ctx.accounts.price_feed.try_borrow_data()?");
    expect(ix?.content).toContain("pub price_feed: &'info AccountView");
  });

  it("injects Pinocchio Metaplex metadata CPI code", () => {
    const ir = baseIr("mint-nft");
    ir.integrations[0] = {
      ...ir.integrations[0],
      pluginId: "metaplex",
      integrationId: "mint-nft",
      config: { name: "Demo", symbol: "DMO", uri: "https://example.com/demo.json", sellerFeeBasisPoints: 500 },
    };

    const result = generateCode(ir, "pinocchio");
    const cargo = result.files.find((file) => file.path.endsWith("Cargo.toml"));
    const ix = result.files.find((file) =>
      file.path.endsWith("src/instructions/execute.rs"),
    );

    expect(result.warnings.some((warning) =>
      warning.message.includes("not generated for Pinocchio yet"),
    )).toBe(false);
    expect(cargo?.content).toContain('mpl-token-metadata = "4.1"');
    expect(ix?.content).toContain("CreateMetadataAccountV3CpiBuilder");
    expect(ix?.content).toContain('name: "Demo".to_string()');
  });

  it("injects Quasar Metaplex metadata CPI code", () => {
    const ir = baseIr("mint-nft");
    ir.integrations[0] = {
      ...ir.integrations[0],
      pluginId: "metaplex",
      integrationId: "mint-nft",
      config: { name: "Demo", symbol: "DMO", uri: "https://example.com/demo.json", sellerFeeBasisPoints: 500 },
    };

    const result = generateCode(ir, "quasar");
    const cargo = result.files.find((file) => file.path.endsWith("Cargo.toml"));
    const libRs = result.files.find((file) => file.path.endsWith("src/lib.rs"));

    expect(result.warnings.some((warning) =>
      warning.message.includes("not generated for Quasar yet"),
    )).toBe(false);
    expect(cargo?.content).toContain('mpl-token-metadata = "4.1"');
    expect(libRs?.content).toContain("CreateMetadataAccountV3CpiBuilder");
    expect(libRs?.content).toContain('name: "Demo".to_string()');
  });

  it("injects Metaplex collection creation details for all frameworks", () => {
    const frameworks = ["anchor", "pinocchio", "quasar"] as const;

    for (const framework of frameworks) {
      const ir = baseIr("create-collection");
      ir.integrations[0] = {
        ...ir.integrations[0],
        pluginId: "metaplex",
        integrationId: "create-collection",
        config: {
          name: "Demo Collection",
          symbol: "DMC",
          uri: "https://example.com/collection.json",
        },
      };

      const result = generateCode(ir, framework);
      const content = result.files.map((file) => file.content).join("\n");

      expect(result.warnings.some((warning) =>
        warning.message.includes("does not have"),
      )).toBe(false);
      expect(content).toContain("CollectionDetails::V1");
      expect(content).toContain('name: "Demo Collection".to_string()');
    }
  });
});
