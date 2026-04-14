import { describe, it, expect } from "vitest";
import { idlToFlow, detectFormat } from "../index";
import { flowToIR } from "@solflow/ir";

// ─── Sample Anchor IDL ───────────────────────────────────────────────────

const SAMPLE_ANCHOR_IDL = {
  version: "0.1.0",
  name: "my_token_program",
  instructions: [
    {
      name: "initialize",
      accounts: [
        { name: "authority", isMut: false, isSigner: true },
        { name: "token_mint", isMut: true, isSigner: false },
        { name: "system_program", isMut: false, isSigner: false },
      ],
      args: [{ name: "decimals", type: "u8" }],
    },
    {
      name: "mint_tokens",
      accounts: [
        { name: "authority", isMut: false, isSigner: true },
        { name: "mint", isMut: true, isSigner: false },
        { name: "destination", isMut: true, isSigner: false },
      ],
      args: [
        { name: "amount", type: "u64" },
        { name: "memo", type: { option: "String" } },
      ],
    },
  ],
  accounts: [
    {
      name: "MintAccount",
      type: {
        kind: "struct",
        fields: [
          { name: "supply", type: "u64" },
          { name: "decimals", type: "u8" },
          { name: "authority", type: "publicKey" },
        ],
      },
    },
  ],
  errors: [
    { code: 6000, name: "Unauthorized", msg: "You are not authorized" },
    { code: 6001, name: "InsufficientSupply", msg: "Not enough tokens" },
  ],
  events: [
    {
      name: "MintEvent",
      fields: [
        { name: "amount", type: "u64", index: false },
        { name: "recipient", type: "publicKey", index: false },
      ],
    },
  ],
  metadata: {
    address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────

describe("detectFormat", () => {
  it("detects Anchor IDL", () => {
    expect(detectFormat(SAMPLE_ANCHOR_IDL)).toBe("anchor");
  });

  it("detects Shank IDL", () => {
    const shankIdl = {
      ...SAMPLE_ANCHOR_IDL,
      metadata: { origin: "shank", address: "abc" },
    };
    expect(detectFormat(shankIdl)).toBe("shank");
  });

  it("returns unknown for garbage", () => {
    expect(detectFormat(null)).toBe("unknown");
    expect(detectFormat({})).toBe("unknown");
    expect(detectFormat("hello")).toBe("unknown");
  });
});

describe("idlToFlow", () => {
  it("converts a complete Anchor IDL to nodes and edges", () => {
    const result = idlToFlow(SAMPLE_ANCHOR_IDL);

    // Should have stats
    expect(result.stats.instructions).toBe(2);
    expect(result.stats.accounts).toBe(1); // MintAccount state
    expect(result.stats.errors).toBe(2);
    expect(result.stats.events).toBe(1);
    expect(result.format).toBe("anchor");

    // Should have nodes: 1 program + 2 instructions + 6 accounts + 1 state + 2 errors + 1 event = 13
    expect(result.nodes.length).toBe(13);

    // Check program node
    const programNode = result.nodes.find((n) => n.type === "program");
    expect(programNode).toBeDefined();
    expect(programNode!.data.name).toBe("my_token_program");
    expect(programNode!.data.version).toBe("0.1.0");
    expect(programNode!.data.programId).toBe(
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    );

    // Check instruction nodes
    const ixNodes = result.nodes.filter((n) => n.type === "instruction");
    expect(ixNodes.length).toBe(2);
    expect(ixNodes[0].data.name).toBe("initialize");
    expect(ixNodes[1].data.name).toBe("mint_tokens");
    expect((ixNodes[1].data as Record<string, unknown>).instructionData).toHaveLength(2);

    // Check account nodes
    const accNodes = result.nodes.filter((n) => n.type === "account");
    expect(accNodes.length).toBe(6); // 3 per instruction

    // Check account type detection
    const signerAcc = accNodes.find(
      (n) => n.data.name === "authority" && n.data.isSigner,
    );
    expect(signerAcc).toBeDefined();
    expect(signerAcc!.data.accountType).toBe("signer");

    const systemProg = accNodes.find((n) => n.data.name === "system_program");
    expect(systemProg).toBeDefined();
    expect(systemProg!.data.accountType).toBe("system-program");

    // Check state node
    const stateNode = result.nodes.find((n) => n.type === "state");
    expect(stateNode).toBeDefined();
    expect(stateNode!.data.name).toBe("MintAccount");
    expect((stateNode!.data as Record<string, unknown>).fields).toHaveLength(3);

    // Check error nodes
    const errorNodes = result.nodes.filter((n) => n.type === "error");
    expect(errorNodes.length).toBe(2);

    // Check event nodes
    const eventNodes = result.nodes.filter((n) => n.type === "event");
    expect(eventNodes.length).toBe(1);
    expect(eventNodes[0].data.name).toBe("MintEvent");

    // Check edges
    expect(result.edges.length).toBeGreaterThan(0);

    // Program → Instructions
    const programId = programNode!.id;
    const ixIds = ixNodes.map((n) => n.id);
    const progToIx = result.edges.filter(
      (e) => e.source === programId && ixIds.includes(e.target),
    );
    expect(progToIx.length).toBe(2);

    // Instruction → Account edges
    const accIds = accNodes.map((n) => n.id);
    const ixToAcc = result.edges.filter(
      (e) => ixIds.includes(e.source) && accIds.includes(e.target),
    );
    expect(ixToAcc.length).toBe(6);

    // State → Account edge (if name matches)
    const stateId = stateNode!.id;
    const stateToAcc = result.edges.filter(
      (e) => e.source === stateId && accIds.includes(e.target),
    );
    // "mint" account in mint_tokens doesn't fuzzy-match "MintAccount" (different normalized form)
    // So no state→account edge for this case — expected behavior

    // Error edges
    const errorIds = errorNodes.map((n) => n.id);
    const errorEdges = result.edges.filter(
      (e) => ixIds.includes(e.source) && errorIds.includes(e.target),
    );
    expect(errorEdges.length).toBe(2);

    // Event edges
    const eventIds = eventNodes.map((n) => n.id);
    const eventEdges = result.edges.filter(
      (e) => ixIds.includes(e.source) && eventIds.includes(e.target),
    );
    expect(eventEdges.length).toBe(1);

    // All nodes should have positions (layout applied)
    for (const node of result.nodes) {
      expect(node.position.x).toBeDefined();
      expect(node.position.y).toBeDefined();
    }
  });

  it("handles minimal IDL with just name + instructions", () => {
    const minimal = {
      version: "0.1.0",
      name: "minimal",
      instructions: [
        {
          name: "ping",
          accounts: [{ name: "signer", isMut: false, isSigner: true }],
          args: [],
        },
      ],
    };

    const result = idlToFlow(minimal);
    expect(result.stats.instructions).toBe(1);
    expect(result.stats.errors).toBe(0);
    expect(result.stats.events).toBe(0);
    expect(result.nodes.length).toBe(3); // program + instruction + account
  });

  it("throws on invalid IDL", () => {
    expect(() => idlToFlow({})).toThrow();
    expect(() => idlToFlow({ name: "no_instructions" })).toThrow();
  });

  it("handles IDL with complex types", () => {
    const complex = {
      version: "0.1.0",
      name: "complex",
      instructions: [
        {
          name: "create",
          accounts: [],
          args: [
            { name: "data", type: { vec: "u8" } },
            { name: "metadata", type: { option: "String" } },
            { name: "ids", type: { array: ["u64", 10] } },
            { name: "custom", type: { defined: "MyStruct" } },
          ],
        },
      ],
    };

    const result = idlToFlow(complex);
    const ixNode = result.nodes.find((n) => n.type === "instruction");
    expect(ixNode).toBeDefined();
    expect((ixNode!.data as Record<string, unknown>).instructionData).toHaveLength(4);
  });

  it("handles Shank IDL format", () => {
    const shankIdl = {
      version: "0.1.0",
      name: "metaplex_program",
      metadata: { origin: "shank", address: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s" },
      instructions: [
        {
          name: "create_metadata",
          accounts: [
            { name: "authority", isMut: false, isSigner: true },
            { name: "metadata_account", isMut: true, isSigner: false },
          ],
          args: [{ name: "name", type: "string" }],
        },
      ],
    };

    const result = idlToFlow(shankIdl);
    expect(result.format).toBe("shank");
    expect(result.stats.instructions).toBe(1);
  });

  it("links state nodes to matching accounts with fuzzy name matching", () => {
    // State name "MintAccount" should match account name "mint_account"
    const idl = {
      version: "0.1.0",
      name: "test",
      instructions: [
        {
          name: "create",
          accounts: [{ name: "mint_account", isMut: true, isSigner: false }],
          args: [],
        },
      ],
      accounts: [
        {
          name: "MintAccount",
          type: {
            kind: "struct",
            fields: [{ name: "supply", type: "u64" }],
          },
        },
      ],
    };

    const result = idlToFlow(idl);

    // Should have a state→account edge
    const stateNode = result.nodes.find((n) => n.type === "state");
    const accNode = result.nodes.find((n) => n.type === "account");
    expect(stateNode).toBeDefined();
    expect(accNode).toBeDefined();

    const stateToAcc = result.edges.filter(
      (e) => e.source === stateNode!.id && e.target === accNode!.id,
    );
    expect(stateToAcc.length).toBe(1);
    expect(stateToAcc[0].sourceHandle).toBe("data-out");
    expect(stateToAcc[0].targetHandle).toBe("data-in");
  });

  it("round-trip: imported nodes pass flowToIR() without error", () => {
    const idl = {
      version: "0.1.0",
      name: "round_trip_test",
      instructions: [
        {
          name: "create",
          accounts: [
            { name: "authority", isMut: false, isSigner: true },
            { name: "data_account", isMut: true, isSigner: false },
          ],
          args: [
            { name: "amount", type: "u64" },
            { name: "memo", type: { option: "String" } },
            { name: "tags", type: { vec: "u8" } },
          ],
        },
      ],
      accounts: [
        {
          name: "DataAccount",
          type: {
            kind: "struct",
            fields: [
              { name: "authority", type: "publicKey" },
              { name: "balance", type: "u64" },
              { name: "nickname", type: "String" },
            ],
          },
        },
      ],
    };

    const result = idlToFlow(idl);

    // This is the critical test: imported nodes must be compatible with flowToIR
    const ir = flowToIR(result.nodes, result.edges);
    expect(ir.program.name).toBe("round_trip_test");
    expect(ir.instructions.length).toBe(1);
    expect(ir.instructions[0].args.length).toBe(3);
    expect(ir.instructions[0].accounts.length).toBe(2);
    expect(ir.states.length).toBe(1);
  });
});
