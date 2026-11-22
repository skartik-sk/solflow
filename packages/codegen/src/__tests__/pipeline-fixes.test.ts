// Regression tests for the program-pipeline fixes: each case was a compile error, a
// silently dropped node or an injection path. The generated crates were also checked
// with host `cargo check` while fixing them; these tests pin the shapes.
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { flowToIR, type ProgramIR } from "@solflow/ir";
import { generateCode } from "../index";
import { sha256 } from "../utils/logic";
import { rustByteStringContent, validateIrForCodegen } from "../utils/escape";

type Fw = "anchor" | "pinocchio" | "quasar";
const FWS: Fw[] = ["anchor", "pinocchio", "quasar"];

let e = 0;
const N = (id: string, type: string, data: Record<string, unknown>) => ({ id, type, position: { x: 0, y: 0 }, data });
const E = (s: string, t: string, h?: string) => ({ id: `e${e++}`, source: s, target: t, ...(h ? { sourceHandle: h } : {}) });

function base() {
  const nodes: any[] = [
    N("prog", "program", { name: "probe" }),
    N("ix", "instruction", { name: "do_it", instructionData: [{ name: "amount", type: "u64" }] }),
    N("st", "state", { name: "Vault", fields: [{ name: "authority", type: "pubkey" }, { name: "total", type: "u64" }, { name: "bump", type: "u8" }] }),
    N("vault", "account", { name: "vault", accountType: "account", isMut: true, seeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }], bump: "" }),
    N("auth", "account", { name: "authority", accountType: "signer", isSigner: true, isMut: true }),
    N("sys", "account", { name: "system_program", accountType: "system-program" }),
    N("err", "error", { name: "Unauthorized", code: 6000, message: "no" }),
    N("ev", "event", { name: "Done", fields: [{ name: "amount", type: "u64" }, { name: "who", type: "Pubkey" }] }),
  ];
  const edges: any[] = [E("prog", "ix"), E("ix", "vault"), E("ix", "auth"), E("ix", "sys"), E("st", "vault"), E("ix", "err"), E("ix", "ev")];
  return { nodes, edges };
}

function build(edit: (g: ReturnType<typeof base>) => void): ProgramIR {
  const g = base();
  edit(g);
  return flowToIR(g.nodes, g.edges);
}

function ixFile(ir: ProgramIR, fw: Fw): string {
  const out = generateCode(ir, fw);
  expect(out.errors).toEqual([]);
  const f = out.files.find((x) => (fw === "quasar" ? x.path.endsWith("src/lib.rs") : x.path.endsWith("instructions/do_it.rs")));
  return f!.content;
}

function file(ir: ProgramIR, fw: Fw, suffix: string): string {
  return generateCode(ir, fw).files.find((x) => x.path.endsWith(suffix))!.content;
}

describe("generic CPI", () => {
  const ir = build((g) => {
    g.nodes.push(
      N("tp", "account", { name: "target_program", accountType: "program" }),
      N("l", "logic", {
        logicType: "cpi", cpiProgram: "target_program", cpiInstruction: "do_thing",
        cpiAccounts: [{ from: "vault", to: "vault" }, { from: "authority", to: "authority" }],
        cpiData: [{ name: "amount", value: "amount" }],
        useSignerSeeds: true, signerSeeds: [{ type: "literal", value: "vault" }, { type: "account-field", value: "authority" }],
      }),
    );
    g.edges.push(E("ix", "tp"), E("ix", "l"));
  });
  const disc = [...createHash("sha256").update("global:do_thing").digest().subarray(0, 8)].join(", ");

  it("anchor builds a raw instruction instead of an undefined <Ix>Cpi struct", () => {
    const code = ixFile(ir, "anchor");
    expect(code).not.toMatch(/DoThingCpi|do_thing\(cpi_ctx/);
    expect(code).toContain(`vec![${disc}]`);
    expect(code).toContain("program::invoke_signed(&cpi_ix");
    expect(code).toContain("AccountMeta::new(ctx.accounts.vault.key(), true)");
  });

  it("pinocchio invokes the CPI (it used to be only a comment)", () => {
    const code = ixFile(ir, "pinocchio");
    expect(code).toContain("pinocchio::cpi::invoke_signed(&cpi_ix");
    expect(code).toContain(`copy_from_slice(&[${disc}])`);
    expect(code).toContain("InstructionAccount::new(vault.address(), true, true)");
  });

  it("quasar builds a CpiCall instead of calling a method that doesn't exist", () => {
    const code = ixFile(ir, "quasar");
    expect(code).not.toMatch(/DoThingCpi|\.do_thing\(/);
    expect(code).toContain("quasar_lang::cpi::CpiCall::new(");
    expect(code).toContain(".invoke_signed(&seeds)?;");
  });

  it("a System Program transfer CPI uses the typed transfer in every framework", () => {
    const sys = build((g) => {
      g.nodes.push(N("l", "logic", { logicType: "cpi", cpiProgram: "system_program", cpiInstruction: "transfer", cpiAccounts: [{ from: "authority", to: "from" }, { from: "vault", to: "to" }], cpiData: [{ name: "lamports", value: "amount" }] }));
      g.edges.push(E("ix", "l"));
    });
    expect(ixFile(sys, "anchor")).toContain("anchor_lang::system_program::transfer(cpi_ctx, amount)?;");
    expect(ixFile(sys, "pinocchio")).toContain("pinocchio_system::instructions::Transfer { from: authority, to: vault, lamports: amount }");
    expect(ixFile(sys, "quasar")).toContain("ctx.accounts.system_program.transfer(ctx.accounts.authority, ctx.accounts.vault, amount).invoke()?;");
  });
});

describe("math results and account reads", () => {
  it("a field result assigns the field instead of `let vault.total = …`", () => {
    const ir = build((g) => {
      g.nodes.push(N("m", "logic", { logicType: "math", mathOperation: "add", mathLeft: "vault.total", mathRight: "amount", mathResult: "vault.total", mathChecked: true }));
      g.edges.push(E("ix", "m"));
    });
    for (const fw of FWS) expect(ixFile(ir, fw)).not.toMatch(/let \w+\.\w+ =/);
    expect(ixFile(ir, "anchor")).toContain("vault.total = vault.total.checked_add(amount)");
    expect(ixFile(ir, "pinocchio")).toContain("Vault::set_total(data, value);");
    expect(ixFile(ir, "quasar")).toMatch(/vault\.total = PodU64::from\(/);
  });

  it("anchor reads an unbound account through ctx.accounts", () => {
    const ir = build((g) => {
      g.nodes.push(N("m", "logic", { logicType: "math", mathOperation: "add", mathLeft: "vault.total", mathRight: "amount", mathResult: "new_total", mathChecked: true }));
      g.edges.push(E("ix", "m"));
    });
    expect(ixFile(ir, "anchor")).toContain("let new_total = ctx.accounts.vault.total.checked_add(amount)");
  });
});

describe("zero-copy state (anchor)", () => {
  const ir = build((g) => {
    g.nodes.find((n: any) => n.id === "st").data.isZeroCopy = true;
    g.nodes.push(N("l", "logic", { logicType: "set-field", setAccount: "vault", setField: "total", setValue: "amount" }));
    g.edges.push(E("ix", "l"));
  });

  it("uses AccountLoader, a single #[account(zero_copy)] and explicit padding", () => {
    const code = ixFile(ir, "anchor");
    expect(code).toContain("pub vault: AccountLoader<'info, Vault>,");
    expect(code).toContain("let mut vault = ctx.accounts.vault.load_mut()?;");
    const state = file(ir, "anchor", "state/vault.rs");
    expect(state).toContain("#[account(zero_copy)]");
    expect(state).not.toContain("derive(ZeroCopy)");
    expect(state).toContain("pub _padding0: [u8; 7],");
    expect(file(ir, "anchor", "Cargo.toml")).toContain("bytemuck");
  });

  it("rejects non-POD fields with a clear error", () => {
    const bad = build((g) => {
      const st = g.nodes.find((n: any) => n.id === "st");
      st.data.isZeroCopy = true;
      st.data.fields.push({ name: "active", type: "bool" });
    });
    expect(generateCode(bad, "anchor").errors.map((x) => x.message).join()).toMatch(/not plain-old-data/);
  });
});

describe("pinocchio", () => {
  it("emit-event serializes the fields and calls sol_log_data", () => {
    const ir = build((g) => {
      g.nodes.push(N("em", "logic", { logicType: "emit-event", emitEvent: "Done", emitFields: { amount: "amount", who: "authority.key()" } }));
      g.edges.push(E("ix", "em"));
    });
    const code = ixFile(ir, "pinocchio");
    const disc = [...createHash("sha256").update("event:Done").digest().subarray(0, 8)].join(", ");
    expect(code).toContain(`let disc: [u8; 8] = [${disc}];`);
    expect(code).toContain("let mut event_data = [0u8; 48];");
    expect(code).toContain("pinocchio::syscalls::sol_log_data(");
  });

  it("realloc resizes the account (account-resize feature) and pays rent", () => {
    const ir = build((g) => {
      g.nodes.push(N("c", "constraint", { constraintType: "realloc", reallocSpace: 200, reallocPayer: "authority" }));
      g.edges.push(E("c", "vault"));
    });
    const code = ixFile(ir, "pinocchio");
    expect(code).toContain("vault.resize(new_len)?;");
    expect(code).not.toContain("data.resize(");
    expect(file(ir, "pinocchio", "Cargo.toml")).toContain('"account-resize"');
  });

  it("an owner check against the program compares with program_id", () => {
    const ir = build((g) => {
      g.nodes.push(N("c", "constraint", { constraintType: "owner", owner: "crate::ID" }));
      g.edges.push(E("c", "vault"));
    });
    const code = ixFile(ir, "pinocchio");
    expect(code).toContain("if vault.owner() != program_id {");
    expect(code).not.toContain("crate::ID.address()");
  });

  it("a new mint is owned by the Token Program and initialized with the decimals arg", () => {
    const ir = build((g) => {
      g.nodes.find((n: any) => n.id === "ix").data.instructionData.push({ name: "decimals", type: "u8" });
      g.nodes.push(
        N("mint", "account", { name: "mint", accountType: "mint", isInit: true, isMut: true, payer: "authority", mintAuthority: "authority", mintDecimals: 9 }),
        N("set", "logic", { logicType: "set-field", setAccount: "mint", setField: "decimals", setValue: "decimals" }),
      );
      g.edges.push(E("ix", "mint"), E("ix", "set"));
    });
    const code = ixFile(ir, "pinocchio");
    expect(code).toContain("CreateAccount::with_minimum_balance(authority, mint, 82 as u64, &pinocchio_token::ID, None)?");
    expect(code).toContain("pinocchio_token::instructions::InitializeMint2 {");
    expect(code).toContain("decimals: decimals,");
    // The Token Program is required (appended like Anchor's generator does).
    expect(code).toMatch(/let \[[^\]]*token_program, _remaining @ \.\.\]/);
    expect(file(ir, "anchor", "instructions/do_it.rs")).toContain("mint::decimals = decimals");
  });
});

describe("close-account logic op", () => {
  const ir = build((g) => {
    g.nodes.push(N("l", "logic", { logicType: "close-account", closeAccount: "vault", closeDestination: "authority", closeAuthority: "authority" }));
    g.edges.push(E("ix", "l"));
  });
  it("is generated in every framework (it was dropped, or a token CPI on a program account)", () => {
    expect(ixFile(ir, "anchor")).toContain("ctx.accounts.vault.close(ctx.accounts.authority.to_account_info())?;");
    expect(ixFile(ir, "pinocchio")).toContain("vault.set_lamports(0);");
    expect(ixFile(ir, "quasar")).toContain("ctx.accounts.vault.close(ctx.accounts.authority.to_account_view())?;");
  });
});

describe("quasar attributes", () => {
  it("realloc has no realloc::zero and owner becomes a constraint", () => {
    const ir = build((g) => {
      g.nodes.push(
        N("c1", "constraint", { constraintType: "realloc", reallocSpace: 200, reallocPayer: "authority", reallocZeroInit: true }),
        N("c2", "constraint", { constraintType: "owner", owner: "crate::ID" }),
      );
      g.edges.push(E("c1", "vault"), E("c2", "vault"));
    });
    const accounts = file(ir, "quasar", "instructions/do_it.rs");
    expect(accounts).toContain("realloc = 200, realloc::payer = authority");
    expect(accounts).not.toContain("realloc::zero");
    expect(accounts).toContain("constraint = vault.to_account_view().owner() == &crate::ID");
  });
});

describe("custom code and branches", () => {
  it("the palette's Rust Code Block reaches every framework", () => {
    const ir = build((g) => {
      g.nodes.push(N("cc", "custom-code", { code: "let probe_custom = amount + 1;", inputs: [], outputs: [] }));
      g.edges.push(E("ix", "cc"));
    });
    for (const fw of FWS) expect(ixFile(ir, fw)).toContain("let probe_custom = amount + 1;");
  });

  it("anchor imports an event emitted inside a branch", () => {
    const ir = build((g) => {
      g.nodes.push(
        N("if", "logic", { logicType: "if-else", ifCondition: "amount > 10" }),
        N("t", "logic", { logicType: "emit-event", emitEvent: "Done", emitFields: { amount: "amount", who: "ctx.accounts.authority.key()" } }),
      );
      g.edges.push(E("ix", "if"), E("if", "t", "then-out"));
    });
    expect(ixFile(ir, "anchor")).toContain("use crate::events::Done;");
  });
});

describe("custom discriminators", () => {
  const ir = build(() => {});
  ir.instructions[0].discriminator = [1, 2, 3, 4, 5, 6, 7, 8];
  ir.states[0].customDiscriminator = [9, 9, 9, 9, 9, 9, 9, 9];
  it("anchor uses #[instruction(discriminator)] and one #[account(discriminator)]", () => {
    expect(file(ir, "anchor", "src/lib.rs")).toContain("#[instruction(discriminator = [1, 2, 3, 4, 5, 6, 7, 8])]");
    const state = file(ir, "anchor", "state/vault.rs");
    expect(state).toContain("#[account(discriminator = [9, 9, 9, 9, 9, 9, 9, 9])]");
    expect(state.match(/#\[account/g)).toHaveLength(1);
  });
  it("pinocchio dispatches on the custom bytes", () => {
    expect(file(ir, "pinocchio", "src/lib.rs")).toContain("[1, 2, 3, 4, 5, 6, 7, 8] =>");
  });
});

describe("injection defence", () => {
  it("refuses a version that would break out of Cargo.toml", () => {
    const ir = build(() => {});
    ir.program.version = '0.1.0"\n[build-dependencies]\nevil = { git = "https://example.invalid/evil" }\n#';
    for (const fw of FWS) {
      const out = generateCode(ir, fw);
      expect(out.files).toHaveLength(0);
      expect(out.errors[0].message).toMatch(/semver/);
    }
  });

  it("refuses names that aren't Rust identifiers", () => {
    const ir = build(() => {});
    ir.program.name = 'probe"]\nevil';
    ir.instructions[0].accounts[0].name = "vault; drop";
    const problems = validateIrForCodegen(ir);
    expect(problems.some((p) => p.includes("Program name"))).toBe(true);
    expect(problems.some((p) => p.includes("Account in do_it"))).toBe(true);
  });

  it("escapes error messages, comments and literal seeds", () => {
    const ir = build((g) => {
      g.nodes.find((n: any) => n.id === "err").data.message = 'bad"); evil!("';
      g.nodes.find((n: any) => n.id === "st").data.fields[0].description = "line\nfn evil() {}";
      g.nodes.find((n: any) => n.id === "vault").data.seeds[0].value = 'va"ult\\';
    });
    const out = generateCode(ir, "anchor");
    expect(out.errors).toEqual([]);
    const all = out.files.map((f) => f.content).join("\n");
    expect(all).toContain('#[msg("bad\\"); evil!(\\"")]');
    expect(all).not.toMatch(/^fn evil/m);
    expect(all).toContain('b"va\\"ult\\\\"');
  });

  it("writes non-ASCII seed bytes as \\x escapes", () => {
    expect(rustByteStringContent("é")).toBe("\\xc3\\xa9");
  });
});

describe("sha256", () => {
  it("matches node:crypto", () => {
    for (const s of ["", "abc", "global:initialize", "x".repeat(200)]) {
      expect(Buffer.from(sha256(s)).toString("hex")).toBe(createHash("sha256").update(s).digest("hex"));
    }
  });
});
