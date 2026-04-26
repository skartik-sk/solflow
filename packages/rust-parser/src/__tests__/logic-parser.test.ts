import { describe, it, expect } from "vitest";
import { parseLogic, parseLogicWithContext } from "../parsers/logic-parser";
import { parsedProgramToFlow } from "../converters/to-flow";

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

describe("parser-only logic groups", () => {
  it("uses parser-group for delegated handlers instead of synthetic if-else", () => {
    const source = `
      impl Initialize {
        pub fn apply(&mut self) -> Result<()> {
          require!(amount > 0, ErrorCode::InvalidAmount);
          counter.value = amount;
          Ok(())
        }
      }
    `;
    const ops = parseLogicWithContext("ctx.accounts.apply()?;", source, "Initialize");

    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("parser-group");
    if (ops[0].type === "parser-group") {
      expect(ops[0].label).toBe("call apply()");
      expect(ops[0].body.map((op) => op.type)).toEqual(["require", "set-field"]);
    }
  });

  it("keeps real if-else as branch logic", () => {
    const ops = parseLogic(`
      if amount > 0 {
        emit!(Deposited { amount });
      } else {
        return err!(ErrorCode::InvalidAmount);
      }
    `);

    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("if-else");
    if (ops[0].type === "if-else") {
      expect(ops[0].condition).toBe("amount > 0");
      expect(ops[0].thenBody[0].type).toBe("emit-event");
      expect(ops[0].elseBody?.[0].type).toBe("return-error");
    }
  });

  it("flattens parser groups into sequential visual logic nodes", () => {
    const flow = parsedProgramToFlow({
      name: "group_test",
      version: "0.1.0",
      instructions: [
        {
          name: "initialize",
          args: [],
          accountsStructName: "Initialize",
          logicOps: [
            {
              type: "parser-group",
              label: "call apply()",
              body: [
                { type: "require", condition: "amount > 0", errorCode: "ErrorCode::InvalidAmount" },
                { type: "set-field", account: "counter", field: "value", value: "amount" },
              ],
            },
            {
              type: "if-else",
              condition: "amount > 100",
              thenBody: [{ type: "emit-event", event: "LargeDeposit", fields: {} }],
            },
          ],
          accessControl: "none",
        },
      ],
      accounts: { Initialize: [] },
      states: [],
      errors: [],
      events: [],
      constants: [],
    });

    const logicTypes = flow.nodes
      .filter((node) => node.type === "logic")
      .map((node) => node.data.logicType);

    expect(logicTypes).toEqual(["require", "set-field", "if-else"]);
    expect(flow.stats.logicOps).toBe(3);
  });
});
