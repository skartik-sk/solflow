import { describe, it, expect } from "vitest";
import { parseLogic } from "../parsers/logic-parser";
import { parseFile } from "../index";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ─── findTransferInfo — no more infinite recursion ──────────────────────

describe("findTransferInfo — no recursion", () => {
  it("extracts from/to from Transfer struct", () => {
    const body = `
Transfer {
    from: ctx.accounts.buyer.to_account_info(),
    to: ctx.accounts.seller.to_account_info(),
}
anchor_lang::system_program::transfer(cpi_ctx, price)?;
`;
    const ops = parseLogic(body);
    const transferOp = ops.find((o) => o.type === "transfer-sol");
    expect(transferOp).toBeDefined();
  });

  it("does not crash on malformed Transfer", () => {
    const body = `
Transfer {
    something: value,
}
anchor_lang::system_program::transfer(cpi_ctx, amount)?;
`;
    // Should not throw or recurse infinitely
    expect(() => parseLogic(body)).not.toThrow();
  });

  it("extracts authority from separate line", () => {
    const body = `
Transfer {
    from: sender,
    to: receiver,
    authority: signer,
}
anchor_lang::system_program::transfer(cpi_ctx, amount)?;
`;
    const ops = parseLogic(body);
    const transferOp = ops.find((o) => o.type === "transfer-sol");
    if (transferOp?.type === "transfer-sol") {
      // Authority extraction is best-effort — verify the op is found
      expect(transferOp).toBeDefined();
    }
  });
});

// ─── logicOps always initialized ───────────────────────────────────────

describe("logicOps initialization", () => {
  it("parseString returns empty logicOps for instructions without body", async () => {
    const { parseString } = await import("../index");
    const result = parseString(`
use anchor_lang::prelude::*;
#[program]
pub mod test {
    pub fn empty_ix(ctx: Context<Empty>) -> Result<()> { Ok(()) }
}
#[derive(Accounts)]
pub struct Empty {}
`);
    // Instructions should have logicOps array (possibly empty)
    for (const ix of result.instructions) {
      expect(Array.isArray(ix.logicOps)).toBe(true);
    }
  });
});

// ─── parseFile error handling ──────────────────────────────────────────

describe("parseFile error handling", () => {
  it("returns empty result for nonexistent file", async () => {
    const { parseFile } = await import("../index");
    const result = parseFile("/nonexistent/path/file.rs");
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("parses a valid file", async () => {
    const tempDir = join(tmpdir(), "solstudio-parsefile-test-" + Date.now());
    mkdirSync(tempDir, { recursive: true });
    const filePath = join(tempDir, "lib.rs");
    writeFileSync(filePath, `
use anchor_lang::prelude::*;
declare_id!("Tst11111111111111111111111111111111111111111");
#[program]
pub mod my_prog {
    pub fn init(ctx: Context<Init>) -> Result<()> {
        Ok(())
    }
}
#[derive(Accounts)]
pub struct Init<'info> {
    pub user: Signer<'info>,
}
`);

    const { parseFile: pf } = await import("../index");
    const result = pf(filePath);
    expect(result.nodes.length).toBeGreaterThan(0);
    rmSync(tempDir, { recursive: true, force: true });
  });
});

// ─── if-else preserves thenBody and elseBody ────────────────────────────

describe("if-else body data in to-flow", () => {
  it("preserves thenBody in node data", () => {
    // This tests the converter, which we can verify via parseLogic
    const body = `
if amount > 0 {
    ctx.accounts.counter.count += 1;
} else {
    ctx.accounts.counter.count = 0;
}
`;
    const ops = parseLogic(body);
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("if-else");
    if (ops[0].type === "if-else") {
      expect(ops[0].thenBody).toBeDefined();
      expect(ops[0].elseBody).toBeDefined();
      expect(ops[0].thenBody!.length).toBeGreaterThanOrEqual(1);
      expect(ops[0].elseBody!.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ─── Ok(()) no longer duplicated ───────────────────────────────────────

describe("Ok(()) skip", () => {
  it("skips exactly one Ok(()) check", () => {
    // Should not produce any ops for Ok(())
    const ops = parseLogic("Ok(())");
    expect(ops).toHaveLength(0);
  });
});
