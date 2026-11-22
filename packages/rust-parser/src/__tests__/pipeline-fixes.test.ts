import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { flowToIR } from "@solflow/ir";
import { parseFile } from "../index";
import { parseLogic } from "../parsers/logic-parser";
import { parseConstraints, mergeConstraints } from "../parsers/constraint-parser";

const SRC = `use anchor_lang::prelude::*;
declare_id!("11111111111111111111111111111111");
#[program]
pub mod p {
    use super::*;
    pub fn go(ctx: Context<Go>) -> Result<()> {
        let c = &mut ctx.accounts.counter;
        if c.n > 5 { return err!(E::Bad); }
        c.n = 1;
        Ok(())
    }
}
#[derive(Accounts)]
pub struct Go<'info> {
    #[account(init_if_needed, payer = user, space = 8 + 8, seeds = [b"c"], bump)]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}
#[account]
pub struct Counter { pub n: u64 }
#[error_code]
pub enum E { Bad }
`;

function parse(src: string) {
  const dir = mkdtempSync(join(tmpdir(), "rp-"));
  try {
    writeFileSync(join(dir, "lib.rs"), src);
    return parseFile(join(dir, "lib.rs"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("init_if_needed", () => {
  it("payer/space merge into init_if_needed instead of making a second (plain) init", () => {
    const cs = mergeConstraints(parseConstraints("init_if_needed, payer = user, space = 16"));
    expect(cs).toEqual([{ type: "init-if-needed", payer: "user", space: 16 }]);
  });

  it("survives parse → flow → IR", () => {
    const r = parse(SRC);
    const node = r.nodes.find((n) => (n.data as any).name === "counter")!;
    expect((node.data as any).isInit).toBe(false);
    expect((node.data as any).isInitIfNeeded).toBe(true);
    const ir = flowToIR(r.nodes, r.edges);
    const cs = ir.instructions[0].accounts.find((a) => a.name === "counter")!.constraints;
    expect(cs.find((c) => c.type === "init-if-needed")).toMatchObject({ payer: "user" });
    expect(cs.some((c) => c.type === "init")).toBe(false);
  });
});

describe("one-line if", () => {
  it("parses `if cond { stmt; }` (it used to hang the parser)", () => {
    expect(parseLogic("if x > 5 { return err!(E::Bad); }")).toEqual([
      { type: "if-else", condition: "x > 5", thenBody: [{ type: "return-error", errorCode: "E::Bad" }], elseBody: undefined },
    ]);
  });

  it("keeps the branch inside the if and the next statement after it in the IR", () => {
    const r = parse(SRC);
    const body = flowToIR(r.nodes, r.edges).instructions[0].body as any[];
    expect(body.map((o) => o.type)).toEqual(["if-else", "set-field"]);
    expect(body[0].thenBody.map((o: any) => o.type)).toEqual(["return-error"]);
  });
});
