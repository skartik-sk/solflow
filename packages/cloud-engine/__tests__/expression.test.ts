import { describe, it, expect } from "vitest";
import { resolveExpressions } from "../src/expression";

describe("resolveExpressions", () => {
  const inputs = [
    [
      { json: { price: 150.5, symbol: "SOL", volume: 1000000 } },
      { json: { price: 151.0, symbol: "SOL", volume: 1005000 } },
    ],
    [
      { json: { route: { outAmount: 149 }, ok: true } },
    ],
  ];

  it("resolves $json.field from first item of first input", () => {
    const result = resolveExpressions("Price is {{ $json.price }}", inputs);
    expect(result).toBe("Price is 150.5");
  });

  it("resolves nested field paths", () => {
    const nestedInputs = [
      [{ json: { data: { nested: { value: 42 } } } }],
    ];
    const result = resolveExpressions("{{ $json.data.nested.value }}", nestedInputs);
    expect(result).toBe(42);
  });

  it("returns empty string for missing fields", () => {
    const result = resolveExpressions("{{ $json.missing }}", inputs);
    expect(result).toBe("");
  });

  it("resolves multiple expressions in one string", () => {
    const result = resolveExpressions("{{ $json.symbol }} at {{ $json.price }}", inputs);
    expect(result).toBe("SOL at 150.5");
  });

  it("handles strings without expressions", () => {
    const result = resolveExpressions("no expressions here", inputs);
    expect(result).toBe("no expressions here");
  });

  it("resolves non-string params (numbers, booleans) as-is", () => {
    expect(resolveExpressions(42, inputs)).toBe(42);
    expect(resolveExpressions(true, inputs)).toBe(true);
  });

  it("resolves expressions in object values recursively", () => {
    const params = { amount: "{{ $json.price }}", label: "static" };
    const result = resolveExpressions(params, inputs);
    expect(result).toEqual({ amount: 150.5, label: "static" });
  });

  it("resolves expressions in array values", () => {
    const params = ["{{ $json.symbol }}", "static"];
    const result = resolveExpressions(params, inputs);
    expect(result).toEqual(["SOL", "static"]);
  });

  it("preserves the original type for whole-value expressions", () => {
    expect(resolveExpressions("{{ $json.price }}", inputs)).toBe(150.5);
    expect(resolveExpressions("{{ $input[1].json.ok }}", inputs)).toBe(true);
  });

  it("resolves explicit input indexes", () => {
    const result = resolveExpressions("{{ $input[1].json.route.outAmount }}", inputs);
    expect(result).toBe(149);
  });

  it("supports full json object expressions", () => {
    const result = resolveExpressions("{{ $input[1].json }}", inputs);
    expect(result).toEqual({ route: { outAmount: 149 }, ok: true });
  });

  it("supports $now", () => {
    const result = resolveExpressions("{{ $now }}", inputs);
    expect(typeof result).toBe("string");
    expect(Number.isNaN(Date.parse(result as string))).toBe(false);
  });
});
