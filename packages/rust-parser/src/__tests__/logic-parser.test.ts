import { describe, it, expect } from "vitest";
import { parseLogic } from "../parsers/logic-parser";

describe("parseLogic — basic operations", () => {
  it("parses set-field", () => {
    const ops = parseLogic("ctx.accounts.counter.count = 0;");
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("set-field");
    if (ops[0].type === "set-field") {
      expect(ops[0].account).toBe("counter");
      expect(ops[0].field).toBe("count");
      expect(ops[0].value).toBe("0");
    }
  });

  it("parses require!", () => {
    const ops = parseLogic("require!(price > 0, MarketplaceError::InvalidPrice);");
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("require");
    if (ops[0].type === "require") {
      expect(ops[0].condition).toContain("price > 0");
    }
  });

  it("parses += arithmetic", () => {
    const ops = parseLogic("ctx.accounts.counter.count += 1;");
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("math");
    if (ops[0].type === "math") {
      expect(ops[0].operation).toBe("add");
      expect(ops[0].checked).toBe(false);
    }
  });

  it("parses emit!", () => {
    const ops = parseLogic("emit!(CounterIncremented { new_count: 5 });");
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("emit-event");
    if (ops[0].type === "emit-event") {
      expect(ops[0].event).toBe("CounterIncremented");
    }
  });

  it("parses return err!", () => {
    const ops = parseLogic("return err!(Overflow);");
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("return-error");
    if (ops[0].type === "return-error") {
      expect(ops[0].errorCode).toBe("Overflow");
    }
  });

  it("parses checked math", () => {
    const ops = parseLogic("let fee_amount = price.checked_mul(ctx.accounts.marketplace.fee).unwrap();");
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("math");
    if (ops[0].type === "math") {
      expect(ops[0].operation).toBe("mul");
      expect(ops[0].checked).toBe(true);
    }
  });

  it("handles multi-line body", () => {
    const body = `
      ctx.accounts.counter.count = 0;
      ctx.accounts.counter.count += 1;
    `;
    const ops = parseLogic(body);
    expect(ops).toHaveLength(2);
    expect(ops[0].type).toBe("set-field");
    expect(ops[1].type).toBe("math");
  });
});
