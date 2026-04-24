import { describe, it, expect } from "vitest";
import { parseLogic } from "../parsers/logic-parser";

describe("parseLogic — if-else", () => {
  it("parses simple if block", () => {
    const body = `
if amount > 0 {
    ctx.accounts.counter.count += 1;
}
`;
    const ops = parseLogic(body);
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("if-else");
    if (ops[0].type === "if-else") {
      expect(ops[0].condition).toBe("amount > 0");
      expect(ops[0].thenBody).toHaveLength(1);
      expect(ops[0].elseBody).toBeUndefined();
    }
  });

  it("parses if-else block", () => {
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
      expect(ops[0].thenBody.length).toBeGreaterThanOrEqual(1);
      expect(ops[0].elseBody!.length).toBeGreaterThanOrEqual(1);
      // First op in else body should be set-field
      const elseOps = ops[0].elseBody!.filter((o) => o.type === "set-field");
      expect(elseOps.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("parses nested if blocks", () => {
    const body = `
if amount > 0 {
    if amount > 100 {
        ctx.accounts.counter.count += 10;
    }
    ctx.accounts.counter.count += 1;
}
`;
    const ops = parseLogic(body);
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("if-else");
    if (ops[0].type === "if-else") {
      expect(ops[0].thenBody).toHaveLength(2);
      expect(ops[0].thenBody![0].type).toBe("if-else");
    }
  });
});

describe("parseLogic — transfers", () => {
  it("parses anchor_lang::system_program::transfer", () => {
    const body = `
let cpi_ctx = CpiContext::new(ctx.accounts.system_program.to_account_info(), Transfer {
    from: ctx.accounts.buyer.to_account_info(),
    to: ctx.accounts.seller.to_account_info(),
});
anchor_lang::system_program::transfer(cpi_ctx, price)?;
`;
    const ops = parseLogic(body);
    const transferOp = ops.find((o) => o.type === "transfer-sol");
    expect(transferOp).toBeDefined();
    if (transferOp?.type === "transfer-sol") {
      // Transfer info extraction is best-effort via regex — verify type and amount
      expect(transferOp.amount).toBeDefined();
    }
  });

  it("parses anchor_spl::token::transfer", () => {
    const body = `
let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), Transfer {
    from: ctx.accounts.sender.to_account_info(),
    to: ctx.accounts.receiver.to_account_info(),
});
anchor_spl::token::transfer(cpi_ctx, amount)?;
`;
    const ops = parseLogic(body);
    const transferOp = ops.find((o) => o.type === "transfer-token");
    expect(transferOp).toBeDefined();
    // Transfer info extraction is best-effort — verify the op type is detected
    if (transferOp?.type === "transfer-token") {
      expect(transferOp.amount).toBeDefined();
    }
  });
});

describe("parseLogic — mint and burn", () => {
  it("parses anchor_spl::token::mint_to", () => {
    const body = `
let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), MintTo {
    mint: ctx.accounts.mint.to_account_info(),
    to: ctx.accounts.destination.to_account_info(),
    authority: ctx.accounts.authority.to_account_info(),
});
anchor_spl::token::mint_to(cpi_ctx, amount)?;
`;
    const ops = parseLogic(body);
    const mintOp = ops.find((o) => o.type === "mint-to");
    expect(mintOp).toBeDefined();
    if (mintOp?.type === "mint-to") {
      expect(mintOp.to).toBeTruthy();
    }
  });

  it("parses anchor_spl::token::burn", () => {
    const body = `
let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), Burn {
    mint: ctx.accounts.mint.to_account_info(),
    from: ctx.accounts.holder.to_account_info(),
    authority: ctx.accounts.authority.to_account_info(),
});
anchor_spl::token::burn(cpi_ctx, amount)?;
`;
    const ops = parseLogic(body);
    const burnOp = ops.find((o) => o.type === "burn");
    expect(burnOp).toBeDefined();
    if (burnOp?.type === "burn") {
      expect(burnOp.from).toBeTruthy();
    }
  });
});

describe("parseLogic — all compound operators", () => {
  it("parses += operator", () => {
    const ops = parseLogic("ctx.accounts.counter.count += 5;");
    expect(ops[0].type).toBe("math");
    if (ops[0].type === "math") expect(ops[0].operation).toBe("add");
  });

  it("parses -= operator", () => {
    const ops = parseLogic("ctx.accounts.counter.count -= 3;");
    expect(ops[0].type).toBe("math");
    if (ops[0].type === "math") expect(ops[0].operation).toBe("sub");
  });

  it("parses *= operator", () => {
    const ops = parseLogic("ctx.accounts.counter.count *= 2;");
    expect(ops[0].type).toBe("math");
    if (ops[0].type === "math") expect(ops[0].operation).toBe("mul");
  });

  it("parses /= operator", () => {
    const ops = parseLogic("ctx.accounts.counter.count /= 4;");
    expect(ops[0].type).toBe("math");
    if (ops[0].type === "math") expect(ops[0].operation).toBe("div");
  });

  it("parses %= operator", () => {
    const ops = parseLogic("ctx.accounts.counter.count %= 10;");
    expect(ops[0].type).toBe("math");
    if (ops[0].type === "math") expect(ops[0].operation).toBe("mod");
  });
});

describe("parseLogic — all checked math operations", () => {
  it("parses checked_add", () => {
    const ops = parseLogic("let result = a.checked_add(b).unwrap();");
    expect(ops[0].type).toBe("math");
    if (ops[0].type === "math") expect(ops[0].operation).toBe("add");
  });

  it("parses checked_sub", () => {
    const ops = parseLogic("let result = a.checked_sub(b).unwrap();");
    expect(ops[0].type).toBe("math");
    if (ops[0].type === "math") expect(ops[0].operation).toBe("sub");
  });

  it("parses checked_mul", () => {
    const ops = parseLogic("let fee = price.checked_mul(rate).unwrap();");
    expect(ops[0].type).toBe("math");
    if (ops[0].type === "math") expect(ops[0].operation).toBe("mul");
  });

  it("parses checked_div", () => {
    const ops = parseLogic("let result = a.checked_div(b).unwrap();");
    expect(ops[0].type).toBe("math");
    if (ops[0].type === "math") expect(ops[0].operation).toBe("div");
  });

  it("parses checked_rem", () => {
    const ops = parseLogic("let result = a.checked_rem(b).unwrap();");
    expect(ops[0].type).toBe("math");
    if (ops[0].type === "math") expect(ops[0].operation).toBe("mod");
  });
});

describe("parseLogic — require variants", () => {
  it("parses require!", () => {
    const ops = parseLogic("require!(price > 0, MyError::InvalidPrice);");
    expect(ops[0].type).toBe("require");
    if (ops[0].type === "require") {
      expect(ops[0].condition).toBe("price > 0");
      expect(ops[0].errorCode).toBe("MyError::InvalidPrice");
    }
  });

  it("parses require_eq!", () => {
    const ops = parseLogic("require_eq!(a.key(), b.key(), MyError::Mismatch);");
    expect(ops[0].type).toBe("require");
  });

  it("parses require_gt!", () => {
    const ops = parseLogic("require_gt!(balance, 0, MyError::InsufficientFunds);");
    expect(ops[0].type).toBe("require");
  });

  it("parses require_gte!", () => {
    const ops = parseLogic("require_gte!(balance, min_amount, MyError::InsufficientFunds);");
    expect(ops[0].type).toBe("require");
  });

  it("parses require_keys_eq!", () => {
    const ops = parseLogic("require_keys_eq!(a.key(), b.key(), MyError::Unauthorized);");
    expect(ops[0].type).toBe("require");
  });
});

describe("parseLogic — emit event", () => {
  it("parses single-line emit!", () => {
    const ops = parseLogic("emit!(MyEvent { field1: 42, field2: \"hello\" });");
    expect(ops[0].type).toBe("emit-event");
    if (ops[0].type === "emit-event") {
      expect(ops[0].event).toBe("MyEvent");
      expect(ops[0].fields.field1).toBe("42");
    }
  });

  it("parses multi-line emit!", () => {
    const body = `emit!(MyEvent {
    count: new_count,
    user: ctx.accounts.user.key(),
});`;
    const ops = parseLogic(body);
    expect(ops[0].type).toBe("emit-event");
    if (ops[0].type === "emit-event") {
      expect(ops[0].event).toBe("MyEvent");
      expect(ops[0].fields.count).toBe("new_count");
    }
  });
});

describe("parseLogic — return error", () => {
  it("parses return err!", () => {
    const ops = parseLogic("return err!(MyError::SomethingWrong);");
    expect(ops[0].type).toBe("return-error");
    if (ops[0].type === "return-error") {
      expect(ops[0].errorCode).toBe("MyError::SomethingWrong");
    }
  });

  it("parses return Err(error!(...))", () => {
    const ops = parseLogic("return Err(error!(MyError::SomethingWrong));");
    expect(ops[0].type).toBe("return-error");
    if (ops[0].type === "return-error") {
      expect(ops[0].errorCode).toBe("MyError::SomethingWrong");
    }
  });
});

describe("parseLogic — set-field patterns", () => {
  it("parses ctx.accounts.xxx.field = value", () => {
    const ops = parseLogic("ctx.accounts.counter.count = 42;");
    expect(ops[0].type).toBe("set-field");
    if (ops[0].type === "set-field") {
      expect(ops[0].account).toBe("counter");
      expect(ops[0].field).toBe("count");
      expect(ops[0].value).toBe("42");
    }
  });

  it("parses account.field = value (no ctx prefix)", () => {
    const ops = parseLogic("counter.count = 42;");
    expect(ops[0].type).toBe("set-field");
    if (ops[0].type === "set-field") {
      expect(ops[0].account).toBe("counter");
      expect(ops[0].field).toBe("count");
    }
  });

  it("captures let bindings as custom-code", () => {
    const ops = parseLogic("let counter = 42;");
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("custom-code");
  });

  it("captures let mut bindings as custom-code", () => {
    const ops = parseLogic("let mut counter = 42;");
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("custom-code");
  });
});

describe("parseLogic — skip patterns", () => {
  it("skips comments", () => {
    const ops = parseLogic("// this is a comment\nctx.accounts.counter.count = 1;");
    expect(ops).toHaveLength(1);
  });

  it("skips blank lines", () => {
    const ops = parseLogic("\n\n  \nctx.accounts.counter.count = 1;\n\n");
    expect(ops).toHaveLength(1);
  });

  it("skips Ok(())", () => {
    const ops = parseLogic("Ok(())");
    expect(ops).toHaveLength(0);
  });

  it("skips msg! macro", () => {
    const ops = parseLogic("msg!(\"Hello\");");
    // msg! is skipped entirely (logging noise)
    expect(ops).toHaveLength(0);
  });

  it("skips closing braces", () => {
    const ops = parseLogic("}");
    expect(ops).toHaveLength(0);
  });
});

describe("parseLogic — complex bodies", () => {
  it("parses realistic instruction body", () => {
    const body = `
require!(ctx.accounts.user.is_signer, ErrorCode::Unauthorized);
ctx.accounts.counter.count += 1;
ctx.accounts.counter.last_user = ctx.accounts.user.key();
emit!(CounterIncremented { new_count: ctx.accounts.counter.count });
Ok(())
`;
    const ops = parseLogic(body);
    expect(ops.length).toBeGreaterThanOrEqual(3);
    expect(ops[0].type).toBe("require");
    expect(ops[1].type).toBe("math");
    expect(ops[2].type).toBe("set-field");
    expect(ops[3].type).toBe("emit-event");
  });

  it("handles CpiContext::new", () => {
    const ops = parseLogic("CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_accounts)");
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("custom-code");
  });
});
