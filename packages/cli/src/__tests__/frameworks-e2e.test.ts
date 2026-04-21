import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { parseProgram, parseFile } from "@solflow/rust-parser";
import { flowToIR } from "@solflow/ir";
import { generateCode } from "@solflow/codegen";
import { idlToFlow } from "@solflow/idl-import";
import { detectProjectType } from "../utils/detect";
import { writeConfig, readConfig, getConfigDir, getProjectPath } from "../utils/config";

// ─── Helper: create temp project dir ─────────────────────────────────

function createTempProject(setup: (dir: string) => void): string {
  const dir = mkdtempSync(join(tmpdir(), "solstudio-e2e-"));
  setup(dir);
  return dir;
}

// ─── ANCHOR: Full pipeline ───────────────────────────────────────────

describe("Anchor: full e2e pipeline", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject((dir) => {
      writeFileSync(join(dir, "Anchor.toml"), `[features]\nseeds = false\n\n[programs.localnet]\nmy_anchor = "Addr11111111111111111111111111111111111111111"\n`);
      const srcDir = join(dir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "lib.rs"), `
use anchor_lang::prelude::*;

declare_id!("Anc111111111111111111111111111111111111111111");

#[program]
pub mod my_anchor {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count = 0;
        counter.authority = ctx.accounts.authority.key();
        Ok(())
    }

    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count += 1;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + 8 + 32)]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Increment<'info> {
    #[account(mut)]
    pub counter: Account<'info, Counter>,
    pub authority: Signer<'info>,
}

#[account]
pub struct Counter {
    pub count: u64,
    pub authority: Pubkey,
}

#[error_code]
pub enum CounterError {
    #[msg("Counter overflow")]
    Overflow,
}
      `);
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("detects as anchor project", () => {
    expect(detectProjectType(tempDir)).toBe("anchor");
  });

  it("parses .rs files into nodes and edges", () => {
    const result = parseProgram(tempDir);
    expect(result.stats.instructions).toBe(2);
    expect(result.stats.states).toBe(1);
    expect(result.stats.errors).toBe(1);
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.edges.length).toBeGreaterThan(0);

    const programNodes = result.nodes.filter((n) => n.type === "program");
    expect(programNodes).toHaveLength(1);
    expect(programNodes[0].data.name).toBe("my_anchor");

    const ixNodes = result.nodes.filter((n) => n.type === "instruction");
    const ixNames = ixNodes.map((n) => n.data.name);
    expect(ixNames).toContain("initialize");
    expect(ixNames).toContain("increment");

    const stateNodes = result.nodes.filter((n) => n.type === "state");
    expect(stateNodes).toHaveLength(1);
    expect(stateNodes[0].data.name).toBe("Counter");
  });

  it("converts flow to IR", () => {
    const result = parseProgram(tempDir);
    const ir = flowToIR(result.nodes, result.edges);
    expect(ir.program.name).toBe("my_anchor");
    expect(ir.instructions.length).toBe(2);
    expect(ir.states.length).toBe(1);
  });

  it("generates anchor code from IR", () => {
    const result = parseProgram(tempDir);
    const ir = flowToIR(result.nodes, result.edges);
    const generated = generateCode(ir, "anchor");
    expect(generated.framework).toBe("anchor");
    expect(generated.files.length).toBeGreaterThan(0);
    expect(generated.errors).toHaveLength(0);

    const libRs = generated.files.find((f) => f.path.includes("lib.rs"));
    expect(libRs).toBeDefined();
    expect(libRs!.content).toContain("anchor_lang");
  });

  it("generates correct Cargo.toml for anchor", () => {
    const result = parseProgram(tempDir);
    const ir = flowToIR(result.nodes, result.edges);
    const generated = generateCode(ir, "anchor");
    const cargoToml = generated.files.find((f) => f.path.endsWith("Cargo.toml"));
    expect(cargoToml).toBeDefined();
    expect(cargoToml!.content).toContain("anchor-lang");
  });

  it("saves and reloads project data", () => {
    const result = parseProgram(tempDir);
    writeConfig(tempDir, { name: "my_anchor", framework: "anchor", mode: "rust", port: 6139 });

    const projectJsonPath = getProjectPath(tempDir);
    mkdirSync(getConfigDir(tempDir), { recursive: true });
    writeFileSync(projectJsonPath, JSON.stringify({
      nodes: result.nodes,
      edges: result.edges,
      stats: result.stats,
    }, null, 2));

    const loaded = JSON.parse(readFileSync(projectJsonPath, "utf-8"));
    expect(loaded.stats.instructions).toBe(2);
    expect(loaded.nodes.length).toBe(result.nodes.length);
  });

  it("generates anchor code via server endpoint", async () => {
    const { startServer } = await import("../server/index");
    const PORT = 16350;

    writeConfig(tempDir, { name: "my_anchor", framework: "anchor", mode: "rust", port: PORT });

    const handle = await startServer({ port: PORT, projectPath: tempDir, watch: false });
    try {
      // Parse first
      const parseRes = await fetch(`http://localhost:${PORT}/api/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(parseRes.status).toBe(200);
      const parseData = await parseRes.json() as Record<string, any>;
      expect(parseData.stats.instructions).toBe(2);

      // Now codegen
      const codegenRes = await fetch(`http://localhost:${PORT}/api/codegen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: parseData.nodes, edges: parseData.edges }),
      });
      expect(codegenRes.status).toBe(200);
      const codegenData = await codegenRes.json() as Record<string, any>;
      expect(codegenData.files.length).toBeGreaterThan(0);
      const libFile = codegenData.files.find((f: Record<string, any>) => f.path.includes("lib.rs"));
      expect(libFile).toBeDefined();
      expect(libFile.content).toContain("anchor_lang");
    } finally {
      await handle.close();
    }
  });
});

// ─── PINOCCHIO: Full pipeline ────────────────────────────────────────

describe("Pinocchio: full e2e pipeline", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject((dir) => {
      const srcDir = join(dir, "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, "lib.rs"), `
use pinocchio::program::account_info::AccountInfo;

#[pinocchio::entrypoint]
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    Ok(())
}
      `);
      // Root Cargo.toml with pinocchio
      writeFileSync(join(dir, "Cargo.toml"), `
[package]
name = "my-pinocchio"
version = "0.1.0"

[dependencies]
pinocchio = "0.2"
      `);
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("detects as pinocchio project", () => {
    expect(detectProjectType(tempDir)).toBe("pinocchio");
  });

  it("config stores pinocchio framework", () => {
    writeConfig(tempDir, { name: "my-pinocchio", framework: "pinocchio", mode: "rust", port: 6139 });
    expect(readConfig(tempDir).framework).toBe("pinocchio");
  });

  it("generates pinocchio code from IR", () => {
    // Use IDL to create a flow since pinocchio doesn't use anchor macros
    const idl = {
      version: "1.0.0",
      name: "pinocchio_prog",
      instructions: [
        { name: "process", accounts: [{ name: "authority", isMut: false, isSigner: true }], args: [] },
      ],
      accounts: [{ name: "Data", type: { fields: [{ name: "value", type: "u64" }] } }],
    };
    const flow = idlToFlow(idl);
    const ir = flowToIR(flow.nodes, flow.edges);
    const generated = generateCode(ir, "pinocchio");
    expect(generated.framework).toBe("pinocchio");
    expect(generated.files.length).toBeGreaterThan(0);
  });

  it("generates pinocchio code via server endpoint", async () => {
    const { startServer } = await import("../server/index");
    const PORT = 16351;

    writeConfig(tempDir, { name: "my-pinocchio", framework: "pinocchio", mode: "rust", port: PORT });

    const handle = await startServer({ port: PORT, projectPath: tempDir, watch: false });
    try {
      // Use IDL-based flow data for codegen
      const idl = {
        version: "1.0.0",
        name: "pinocchio_prog",
        instructions: [
          { name: "process", accounts: [{ name: "authority", isMut: false, isSigner: true }], args: [] },
        ],
      };
      const flow = idlToFlow(idl);

      const codegenRes = await fetch(`http://localhost:${PORT}/api/codegen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: flow.nodes, edges: flow.edges }),
      });
      expect(codegenRes.status).toBe(200);
      const codegenData = await codegenRes.json() as Record<string, any>;
      expect(codegenData.files.length).toBeGreaterThan(0);
    } finally {
      await handle.close();
    }
  });
});

// ─── QUASAR: Full pipeline ───────────────────────────────────────────

describe("Quasar: full e2e pipeline", () => {
  it("config accepts quasar framework", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-quasar-"));
    try {
      writeConfig(tempDir, { name: "my-quasar", framework: "quasar", mode: "rust", port: 6139 });
      expect(readConfig(tempDir).framework).toBe("quasar");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("generates quasar code from IR", () => {
    const idl = {
      version: "1.0.0",
      name: "quasar_prog",
      instructions: [
        {
          name: "initialize",
          accounts: [
            { name: "counter", isMut: true, isSigner: false },
            { name: "authority", isMut: false, isSigner: true },
          ],
          args: [],
        },
        {
          name: "increment",
          accounts: [
            { name: "counter", isMut: true, isSigner: false },
            { name: "authority", isMut: false, isSigner: true },
          ],
          args: [],
        },
      ],
      accounts: [
        { name: "Counter", type: { fields: [{ name: "count", type: "u64" }, { name: "authority", type: "publicKey" }] } },
      ],
      errors: [{ code: 6000, name: "Overflow", msg: "Counter overflowed" }],
      events: [{ name: "CounterIncremented", fields: [{ name: "new_count", type: "u64", index: false }] }],
    };

    const flow = idlToFlow(idl);
    const ir = flowToIR(flow.nodes, flow.edges);
    const generated = generateCode(ir, "quasar");

    expect(generated.framework).toBe("quasar");
    expect(generated.files.length).toBeGreaterThan(0);
    expect(generated.errors).toHaveLength(0);

    const libRs = generated.files.find((f) => f.path.includes("lib.rs"));
    expect(libRs).toBeDefined();
    expect(libRs!.content).toContain("quasar_lang");

    const cargoToml = generated.files.find((f) => f.path.endsWith("Cargo.toml"));
    expect(cargoToml).toBeDefined();
    expect(cargoToml!.content).toContain("quasar-lang");
  });

  it("quasar code has no_std attribute", () => {
    const idl = {
      version: "1.0.0",
      name: "quasar_prog",
      instructions: [{ name: "init", accounts: [{ name: "data", isMut: true, isSigner: false }], args: [] }],
    };
    const flow = idlToFlow(idl);
    const ir = flowToIR(flow.nodes, flow.edges);
    const generated = generateCode(ir, "quasar");

    const libRs = generated.files.find((f) => f.path.includes("lib.rs"));
    expect(libRs!.content).toContain("no_std");
  });

  it("quasar code uses Pod types in state", () => {
    const idl = {
      version: "1.0.0",
      name: "quasar_prog",
      instructions: [{ name: "init", accounts: [{ name: "state", isMut: true, isSigner: false }], args: [] }],
      accounts: [{ name: "MyState", type: { fields: [{ name: "count", type: "u64" }] } }],
    };
    const flow = idlToFlow(idl);
    const ir = flowToIR(flow.nodes, flow.edges);
    const generated = generateCode(ir, "quasar");

    const stateFiles = generated.files.filter((f) => f.path.includes("state"));
    const stateContent = stateFiles.map((f) => f.content).join("\n");
    expect(stateContent).toContain("PodU64");
  });

  it("generates quasar code via server endpoint", async () => {
    const { startServer } = await import("../server/index");
    const tempDir = mkdtempSync(join(tmpdir(), "solstudio-quasar-srv-"));
    const PORT = 16352;

    try {
      writeConfig(tempDir, { name: "my-quasar", framework: "quasar", mode: "rust", port: PORT });

      const handle = await startServer({ port: PORT, projectPath: tempDir, watch: false });
      try {
        const idl = {
          version: "1.0.0",
          name: "quasar_prog",
          instructions: [{ name: "init", accounts: [{ name: "data", isMut: true, isSigner: false }], args: [] }],
        };
        const flow = idlToFlow(idl);

        const codegenRes = await fetch(`http://localhost:${PORT}/api/codegen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodes: flow.nodes, edges: flow.edges }),
        });
        expect(codegenRes.status).toBe(200);
        const codegenData = await codegenRes.json() as Record<string, any>;
        expect(codegenData.files.length).toBeGreaterThan(0);
        const libFile = codegenData.files.find((f: Record<string, any>) => f.path.includes("lib.rs"));
        expect(libFile).toBeDefined();
        expect(libFile.content).toContain("quasar_lang");
      } finally {
        await handle.close();
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ─── Cross-framework: same IR generates different code ───────────────

describe("cross-framework: same flow, different output", () => {
  it("anchor vs quasar produce different lib.rs", () => {
    const idl = {
      version: "1.0.0",
      name: "cross_prog",
      instructions: [{ name: "init", accounts: [{ name: "data", isMut: true, isSigner: false }], args: [] }],
      accounts: [{ name: "Data", type: { fields: [{ name: "value", type: "u64" }] } }],
    };

    const flow = idlToFlow(idl);
    const ir = flowToIR(flow.nodes, flow.edges);

    const anchorCode = generateCode(ir, "anchor");
    const quasarCode = generateCode(ir, "quasar");

    const anchorLib = anchorCode.files.find((f) => f.path.includes("lib.rs"))!.content;
    const quasarLib = quasarCode.files.find((f) => f.path.includes("lib.rs"))!.content;

    expect(anchorLib).toContain("anchor_lang");
    expect(anchorLib).not.toContain("quasar_lang");
    expect(quasarLib).toContain("quasar_lang");
    expect(quasarLib).not.toContain("anchor_lang");
  });
});
