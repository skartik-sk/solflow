import { describe, it, expect } from "vitest";
import { idlToFlow } from "../index";

const IDL = {
  address: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS",
  metadata: { name: "probe_idl", version: "0.1.0", spec: "0.1.0" },
  instructions: [{
    name: "act",
    discriminator: [1, 2, 3, 4, 5, 6, 7, 8],
    accounts: [
      { name: "vault", writable: true, pda: { seeds: [{ kind: "const", value: [1, 200] }, { kind: "const", value: [118, 97, 117, 108, 116] }, { kind: "account", path: "authority" }] }, relations: ["authority"] },
      { name: "authority", signer: true },
      { name: "config", address: "SysvarRent111111111111111111111111111111111" },
      { name: "maybe", optional: true },
      { name: "system_program", address: "11111111111111111111111111111111" },
    ],
    args: [{ name: "payload", type: "bytes" }, { name: "big", type: "u256" }, { name: "kind", type: { defined: { name: "Kind" } } }],
  }],
  accounts: [{ name: "Vault", discriminator: [9, 9, 9, 9, 9, 9, 9, 9] }],
  types: [
    { name: "Vault", type: { kind: "struct", fields: [{ name: "authority", type: "pubkey" }] } },
    { name: "Kind", type: { kind: "enum", variants: [{ name: "A" }] } },
  ],
  errors: [],
};

const r = idlToFlow(IDL);
const node = (name: string) => r.nodes.find((n) => (n.data as any).name === name)!.data as any;

describe("IDL import", () => {
  it("maps bytes to Vec<u8> and u256 to [u8; 32] (with a warning)", () => {
    const args = node("act").instructionData;
    expect(args[0].type).toEqual({ vec: "u8" });
    expect(args[1].type).toEqual({ array: ["u8", 32] });
    expect(r.warnings.some((w) => w.includes("256-bit"))).toBe(true);
  });

  it("warns about custom enums/structs instead of silently emitting broken code", () => {
    expect(r.warnings.some((w) => w.includes('custom enum "Kind"'))).toBe(true);
  });

  it("keeps const seeds as bytes: text as a literal, other bytes as a byte array", () => {
    expect(node("vault").seeds).toEqual([
      { type: "pubkey", value: "[1u8, 200u8].as_ref()" },
      { type: "literal", value: "vault" },
      { type: "account-field", value: "authority" },
    ]);
  });

  it("maps relations to has_one and a fixed address to an address check", () => {
    expect(node("vault").constraints).toEqual([{ type: "has-one", field: "authority", target: "authority" }]);
    expect(node("config").constraints).toEqual([{ type: "address", address: "SysvarRent111111111111111111111111111111111" }]);
    expect(node("system_program").constraints).toBeUndefined();
  });

  it("flags optional accounts", () => {
    expect(node("maybe").description).toContain("optional");
    expect(r.warnings.some((w) => w.includes('"maybe" is optional'))).toBe(true);
  });

  it("keeps custom discriminators", () => {
    expect(node("act").discriminator).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(node("Vault").customDiscriminator).toEqual([9, 9, 9, 9, 9, 9, 9, 9]);
  });
});
