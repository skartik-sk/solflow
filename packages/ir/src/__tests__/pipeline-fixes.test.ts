import { describe, it, expect, vi } from "vitest";
import { flowToIR } from "../transformer";

let e = 0;
const N = (id: string, type: string, data: Record<string, unknown>) => ({ id, type, position: { x: 0, y: 0 }, data });
const E = (s: string, t: string, h?: string) => ({ id: `e${e++}`, source: s, target: t, ...(h ? { sourceHandle: h } : {}) });

function base() {
  const nodes: any[] = [
    N("prog", "program", { name: "probe" }),
    N("ix", "instruction", { name: "do_it", instructionData: [{ name: "amount", type: "u64" }] }),
    N("vault", "account", { name: "vault", accountType: "account", isMut: true }),
    N("auth", "account", { name: "authority", accountType: "signer", isSigner: true }),
    N("admin", "account", { name: "admin", accountType: "signer", isSigner: true }),
  ];
  const edges: any[] = [E("prog", "ix"), E("ix", "vault"), E("ix", "auth"), E("ix", "admin")];
  return { nodes, edges };
}
const ir = (g: ReturnType<typeof base>) => flowToIR(g.nodes, g.edges).instructions[0];
const acc = (ix: ReturnType<typeof ir>, name: string) => ix.accounts.find((a) => a.name === name)!;

describe("constraint merge", () => {
  it("keeps every has_one / custom / owner constraint node", () => {
    const g = base();
    g.nodes.push(
      N("c1", "constraint", { constraintType: "has-one", hasOneField: "authority", hasOneTarget: "authority" }),
      N("c2", "constraint", { constraintType: "has-one", hasOneField: "admin", hasOneTarget: "admin" }),
      N("c3", "constraint", { constraintType: "custom", expression: "vault.total > 0" }),
      N("c4", "constraint", { constraintType: "custom", expression: "vault.total < 99" }),
    );
    g.edges.push(E("c1", "vault"), E("c2", "vault"), E("c3", "vault"), E("c4", "vault"));
    const cs = acc(ir(g), "vault").constraints;
    expect(cs.filter((c) => c.type === "has-one").map((c: any) => c.field)).toEqual(["authority", "admin"]);
    expect(cs.filter((c) => c.type === "custom")).toHaveLength(2);
  });

  it("an explicit node still overrides the flag-derived constraint of its type", () => {
    const g = base();
    g.nodes.find((n) => n.id === "vault").data.isClose = true;
    g.nodes.find((n) => n.id === "vault").data.closeTarget = "admin";
    g.nodes.push(N("c1", "constraint", { constraintType: "close", closeTarget: "authority" }));
    g.edges.push(E("c1", "vault"));
    expect(acc(ir(g), "vault").constraints.filter((c) => c.type === "close")).toEqual([{ type: "close", target: "authority" }]);
  });

  it("an unknown constraintType is ignored instead of becoming `signer`", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const g = base();
    g.nodes.push(N("c1", "constraint", { constraintType: "zero-copy" }));
    g.edges.push(E("c1", "vault"));
    expect(acc(ir(g), "vault").constraints.map((c) => c.type)).toEqual(["mut"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("if-else branches", () => {
  it("walks each child once and maps then/else handles to the branches", () => {
    const g = base();
    g.nodes.push(
      N("if", "logic", { logicType: "if-else", ifCondition: "amount > 10" }),
      N("t1", "logic", { logicType: "set-field", setAccount: "vault", setField: "total", setValue: "amount" }),
      N("t2", "logic", { logicType: "set-field", setAccount: "vault", setField: "total", setValue: "1" }),
      N("f", "logic", { logicType: "return-error", returnErrorCode: "E" }),
    );
    g.edges.push(E("ix", "if"), E("if", "t1", "then-out"), E("t1", "t2"), E("if", "f", "else-out"));
    const body = ir(g).body;
    expect(body.map((o) => o.type)).toEqual(["if-else"]);
    const op = body[0] as any;
    expect(op.thenBody.map((o: any) => o.value)).toEqual(["amount", "1"]);
    expect(op.elseBody.map((o: any) => o.type)).toEqual(["return-error"]);
  });

  it("a node both branches lead to runs after the if-else", () => {
    const g = base();
    g.nodes.push(
      N("if", "logic", { logicType: "if-else", ifCondition: "amount > 10" }),
      N("t", "logic", { logicType: "set-field", setAccount: "vault", setField: "total", setValue: "0" }),
      N("f", "logic", { logicType: "set-field", setAccount: "vault", setField: "total", setValue: "1" }),
      N("j", "logic", { logicType: "emit-event", emitEvent: "Done", emitFields: {} }),
    );
    g.edges.push(E("ix", "if"), E("if", "t", "then-out"), E("if", "f", "else-out"), E("t", "j"), E("f", "j"));
    const body = ir(g).body as any[];
    expect(body.map((o) => o.type)).toEqual(["if-else", "emit-event"]);
    expect(body[0].thenBody).toHaveLength(1);
    expect(body[0].elseBody).toHaveLength(1);
  });

  it("legacy single-handle children are the then branch (and not duplicated at top level)", () => {
    const g = base();
    g.nodes.push(
      N("if", "logic", { logicType: "if-else", ifCondition: "c" }),
      N("t", "logic", { logicType: "return-error", returnErrorCode: "E" }),
    );
    g.edges.push(E("ix", "if"), E("if", "t", "logic-out"));
    const body = ir(g).body as any[];
    expect(body).toHaveLength(1);
    expect(body[0].thenBody).toHaveLength(1);
  });

  it("imported if-else nodes keep their embedded branches and chain on to the next statement", () => {
    const g = base();
    g.nodes.push(
      N("if", "logic", { logicType: "if-else", ifCondition: "c", thenBody: [{ type: "return-error", errorCode: "E" }] }),
      N("next", "logic", { logicType: "set-field", setAccount: "vault", setField: "total", setValue: "0" }),
    );
    g.edges.push(E("ix", "if"), E("if", "next", "logic-out"));
    const body = ir(g).body as any[];
    expect(body.map((o) => o.type)).toEqual(["if-else", "set-field"]);
    expect(body[0].thenBody).toEqual([{ type: "return-error", errorCode: "E" }]);
  });
});

describe("palette nodes and logic ops", () => {
  it("maps the Rust Code Block node (code/inputs/outputs)", () => {
    const g = base();
    g.nodes.push(N("cc", "custom-code", { code: "let x = 1;", inputs: ["vault"], outputs: ["x"] }));
    g.edges.push(E("ix", "cc"));
    expect(ir(g).body).toEqual([{ type: "custom-code", code: "let x = 1;", inputs: ["vault"], outputs: ["x"], sourceNodeId: "cc" }]);
  });

  it("maps the close-account logic op and makes its accounts writable", () => {
    const g = base();
    g.nodes.find((n) => n.id === "vault").data.isMut = false;
    g.nodes.push(N("l", "logic", { logicType: "close-account", closeAccount: "vault", closeDestination: "authority", closeAuthority: "authority" }));
    g.edges.push(E("ix", "l"));
    const ix = ir(g);
    expect(ix.body[0]).toMatchObject({ type: "close-account", account: "vault", destination: "authority", authority: "authority" });
    expect(acc(ix, "vault").constraints.map((c) => c.type)).toContain("mut");
    expect(acc(ix, "authority").constraints.map((c) => c.type)).toContain("mut");
  });

  it("adds `mut` to transfer-sol from/to accounts", () => {
    const g = base();
    g.nodes.find((n) => n.id === "vault").data.isMut = false;
    g.nodes.push(N("l", "logic", { logicType: "transfer-sol", transferFrom: "authority", transferTo: "vault", transferAmount: "amount" }));
    g.edges.push(E("ix", "l"));
    const ix = ir(g);
    expect(acc(ix, "authority").constraints.map((c) => c.type)).toEqual(["signer", "mut"]);
    expect(acc(ix, "vault").constraints.map((c) => c.type)).toEqual(["mut"]);
    expect(acc(ix, "admin").constraints.map((c) => c.type)).toEqual(["signer"]);
  });

  it("drops signer seeds when 'sign with PDA seeds' is unticked", () => {
    const g = base();
    const seeds = [{ type: "literal", value: "vault" }];
    g.nodes.push(
      N("a", "logic", { logicType: "transfer-token", transferFrom: "vault", transferTo: "authority", transferAuthority: "vault", transferAmount: "1", useSignerSeeds: false, signerSeeds: seeds }),
      N("b", "logic", { logicType: "mint-to", mintTo: "vault", transferTo: "authority", mintAuthority: "vault", transferAmount: "1", useSignerSeeds: true, signerSeeds: seeds }),
    );
    g.edges.push(E("ix", "a"), E("a", "b"));
    const [a, b] = ir(g).body as any[];
    expect(a.signerSeeds).toBeUndefined();
    expect(b.signerSeeds).toEqual(seeds);
  });
});
