import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { idlToFlow, detectFormat } from "../index";
import { parseAnchorIdl } from "../parsers/anchor";

// Real `anchor build` output (Anchor 0.32): metadata.name, address, writable/signer, byte seeds.
const idl = JSON.parse(readFileSync(join(__dirname, "fixtures/anchor-0.30-vault.json"), "utf8"));

describe("Anchor >= 0.30 IDL spec", () => {
  it("parses program name, id, instructions and account flags", () => {
    const unified = parseAnchorIdl(idl);
    expect(unified.program.name).toBe("vault");
    expect(unified.program.programId).toBe(idl.address);
    expect(unified.instructions.map((ix) => ix.name)).toEqual(["close", "deposit", "init", "withdraw"]);

    const deposit = unified.instructions.find((ix) => ix.name === "deposit")!;
    const signer = deposit.accounts.find((a) => a.name === "signer")!;
    expect(signer).toMatchObject({ isSigner: true, isMut: true });
    const state = deposit.accounts.find((a) => a.name === "vault_state")!;
    expect(state.seeds?.[0]).toEqual({ type: "literal", value: "state" });
    expect(deposit.args[0]).toMatchObject({ name: "amount", type: "u64" });
  });

  it("takes account layouts from types without duplicating them", () => {
    const unified = parseAnchorIdl(idl);
    expect(unified.accounts.map((a) => a.name)).toEqual(["VaultState"]);
    expect(unified.accounts[0].fields.length).toBeGreaterThan(0);
    expect(unified.types.find((t) => t.name === "VaultState")).toBeUndefined();
  });

  it("imports end to end", () => {
    expect(detectFormat(idl)).toBe("anchor");
    const result = idlToFlow(idl);
    expect(result.stats.instructions).toBe(4);
    expect(result.nodes.length).toBeGreaterThan(4);
  });
});
