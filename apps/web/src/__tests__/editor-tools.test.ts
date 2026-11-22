import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getRuleById, runInstantAudit, type AuditRule } from "@solflow/audit";
import { pluginRegistry, type PluginRegistry } from "@solflow/plugin-sdk";
import type { State } from "@solflow/ir";
import { encodeArg, encodeInstructionData } from "../components/editor/tx-encoding";
import { parseAccountData } from "../components/editor/account-decode";
import { fixableRuleIds } from "../components/editor/audit-fix";
import { normalizeNetwork, resolveRpcUrl } from "../store/project-store";
import { codeViewOptions } from "../store/settings-store";
import { syncPluginAuditRules } from "../store/plugin-store";
import { resolveEditorShortcut } from "../hooks/editor-shortcuts";
import { normalizeEditorNodeType } from "../lib/plugins/editor-nodes";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

describe("transaction builder encoding", () => {
  it("uses each framework's real discriminator", () => {
    // Anchor: sha256("global:deposit")[..8] (same vector as @solflow/sdk-gen).
    expect(hex(encodeInstructionData("anchor", "deposit", 1, [], {}))).toBe("f223c68952e1f2b6");
    // Pinocchio: 8-byte little-endian index.
    expect([...encodeInstructionData("pinocchio", "deposit", 258, [], {})]).toEqual([2, 1, 0, 0, 0, 0, 0, 0]);
    // Quasar: a single byte.
    expect([...encodeInstructionData("quasar", "deposit", 3, [], {})]).toEqual([3]);
  });

  it("Borsh-encodes Pubkey, String, i16, i64, u128 and bool args", () => {
    const key = Keypair.generate().publicKey;
    expect(encodeArg("Pubkey", key.toBase58())).toEqual(key.toBytes());
    expect([...encodeArg("String", "hé")]).toEqual([3, 0, 0, 0, 0x68, 0xc3, 0xa9]);
    expect([...encodeArg("i16", "-2")]).toEqual([0xfe, 0xff]);
    expect([...encodeArg("i64", "-1")]).toEqual(Array(8).fill(0xff));
    const u128 = encodeArg("u128", (BigInt(1) << BigInt(64)).toString());
    expect(u128).toHaveLength(16);
    expect(u128[8]).toBe(1);
    expect([...encodeArg("bool", "true")]).toEqual([1]);
    expect([...encodeArg("bool", "false")]).toEqual([0]);
  });

  it("encodes option, vec and fixed arrays", () => {
    expect([...encodeArg({ option: "u8" }, "")]).toEqual([0]);
    expect([...encodeArg({ option: "u8" }, "7")]).toEqual([1, 7]);
    expect([...encodeArg({ vec: "u16" }, "[1, 2]")]).toEqual([2, 0, 0, 0, 1, 0, 2, 0]);
    expect([...encodeArg({ array: ["u8", 3] }, "1,2,3")]).toEqual([1, 2, 3]);
  });

  it("rejects bad input instead of silently writing zeros", () => {
    expect(() => encodeArg("Pubkey", "not-a-key")).toThrow(/public key/);
    expect(() => encodeArg("u8", "256")).toThrow(/out of range/);
    expect(() => encodeArg("i64", "abc")).toThrow(/not a valid/);
    expect(() => encodeArg({ defined: "Foo" }, "x")).toThrow(/isn't supported/);
    expect(() =>
      encodeInstructionData("anchor", "ix", 0, [{ name: "amount", type: "u64" }], { amount: "-1" }),
    ).toThrow(/Argument "amount"/);
  });

  it("appends args after the discriminator", () => {
    const data = encodeInstructionData("quasar", "set", 2, [{ name: "v", type: "u32" }], { v: "5" });
    expect([...data]).toEqual([2, 5, 0, 0, 0]);
  });
});

describe("network mapping", () => {
  it("maps mainnet (and legacy mainnet-beta) to the mainnet RPC", () => {
    expect(normalizeNetwork("mainnet")).toBe("mainnet");
    expect(normalizeNetwork("mainnet-beta")).toBe("mainnet");
    expect(resolveRpcUrl(normalizeNetwork("mainnet-beta"), [])).toBe("https://api.mainnet-beta.solana.com");
    expect(normalizeNetwork("localnet")).toBe("localnet");
    expect(normalizeNetwork("whatever")).toBe("devnet");
  });
});

describe("account inspector decoding", () => {
  const state: State = {
    id: "s",
    name: "Vault",
    fields: [
      { name: "label", type: "String" },
      { name: "owner", type: "Pubkey" },
      { name: "amount", type: "u64" },
    ],
  } as unknown as State;

  function borsh(order: "declared" | "fixed-first", discLen = 8) {
    const owner = Keypair.generate().publicKey;
    const label = Buffer.concat([Buffer.from([3, 0, 0, 0]), Buffer.from("hé", "utf8")]);
    const amount = Buffer.alloc(8);
    amount.writeBigUInt64LE(BigInt(42));
    const parts = order === "declared" ? [label, owner.toBuffer(), amount] : [owner.toBuffer(), amount, label];
    return { owner, bytes: new Uint8Array(Buffer.concat([Buffer.alloc(discLen, 9), ...parts])) };
  }

  it("shows Pubkeys as base58 and Strings as UTF-8", () => {
    const { owner, bytes } = borsh("declared");
    const fields = parseAccountData(bytes, state, [state], "anchor");
    expect(fields.find((f) => f.name === "owner")?.value).toBe(owner.toBase58());
    expect(fields.find((f) => f.name === "label")?.value).toBe("hé");
    expect(fields.find((f) => f.name === "amount")?.value).toBe("42");
  });

  it("follows Quasar's fixed-before-dynamic field layout", () => {
    const { owner, bytes } = borsh("fixed-first");
    const fields = parseAccountData(bytes, state, [state], "quasar");
    expect(fields.map((f) => f.name)).toEqual(["owner", "amount", "label"]);
    expect(fields[0].value).toBe(new PublicKey(owner).toBase58());
    expect(fields[1].value).toBe("42");
    expect(fields[2].value).toBe("hé");
  });
});

describe("audit panel", () => {
  it("offers Apply Fix only for findings whose rule has an autoFix", () => {
    const ids = fixableRuleIds(
      [{ ruleId: "SOL-001" }, { ruleId: "SOL-003" }, { ruleId: "NOPE" }],
      getRuleById,
    );
    expect(ids.has("SOL-001")).toBe(true); // SOL-001 ships an autoFix
    expect(ids.has("SOL-003")).toBe(false); // SOL-003 has no autoFix
    expect(ids.has("NOPE")).toBe(false);
  });

  it("plugin audit rules register for enabled plugins and unregister when disabled", () => {
    const rule: AuditRule = {
      id: "TEST-PLUGIN-001",
      name: "test",
      description: "test",
      severity: "low",
      category: "account-validation",
      check: () => [],
    } as unknown as AuditRule;
    const registry = {
      getAllPlugins: () => [{ id: "demo", nodes: [], auditRules: [rule] }],
    } as unknown as PluginRegistry;

    syncPluginAuditRules(["demo"], registry);
    expect(getRuleById("TEST-PLUGIN-001")).toBeDefined();
    syncPluginAuditRules([], registry);
    expect(getRuleById("TEST-PLUGIN-001")).toBeUndefined();
    // Built-in rules are untouched.
    expect(getRuleById("SOL-003")).toBeDefined();
    expect(() => runInstantAudit({ instructions: [], states: [], errors: [], events: [] } as never)).not.toThrow();
  });
});

describe("keyboard shortcuts", () => {
  const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
    ({ key: k, ctrlKey: true, metaKey: false, shiftKey: false, ...mods }) as KeyboardEvent;

  it("maps undo/redo for Ctrl and Cmd", () => {
    expect(resolveEditorShortcut(key("z"), false)).toBe("undo");
    expect(resolveEditorShortcut(key("Z", { shiftKey: true }), false)).toBe("redo");
    expect(resolveEditorShortcut(key("y"), false)).toBe("redo");
    expect(resolveEditorShortcut(key("z", { ctrlKey: false, metaKey: true }), false)).toBe("undo");
    expect(resolveEditorShortcut(key("z", { ctrlKey: false }), false)).toBeNull();
  });

  it("leaves text shortcuts to the focused input", () => {
    expect(resolveEditorShortcut(key("a"), true)).toBeNull(); // Ctrl+A selects text
    expect(resolveEditorShortcut(key("z"), true)).toBeNull();
    expect(resolveEditorShortcut(key("a"), false)).toBe("selectAll");
    expect(resolveEditorShortcut(key("s"), true)).toBe("save"); // save still works from a field
  });
});

describe("settings", () => {
  it("code views follow font size, word wrap, line numbers and minimap", () => {
    expect(
      codeViewOptions({ fontSize: 16, wordWrap: true, showLineNumbers: false, minimapEnabled: true }),
    ).toEqual({ fontSize: 16, wordWrap: "on", lineNumbers: "off", minimap: { enabled: true } });
  });
});

describe("plugin node types", () => {
  it("every built-in plugin node edits with the integration form", () => {
    let count = 0;
    for (const plugin of pluginRegistry.getAllPlugins()) {
      for (const node of plugin.nodes) {
        const type = node.type.includes(":") ? node.type : `${plugin.id}:${node.type}`;
        expect(normalizeEditorNodeType(type)).toBe("integration");
        count++;
      }
    }
    expect(count).toBeGreaterThan(0);
    expect(normalizeEditorNodeType("account")).toBe("account");
  });
});

import {
  RESET_DEPLOYER_PHRASE,
  bufferBalanceSol,
  deployRpcUrl,
  isResetDeployerConfirmed,
  reclaimPrompt,
} from "../components/editor/deploy-actions";

describe("deploy maintenance actions", () => {
  it("resetting the deployer wallet needs the exact typed phrase", () => {
    expect(isResetDeployerConfirmed("")).toBe(false);
    expect(isResetDeployerConfirmed("reset my deployer wallet")).toBe(false);
    expect(isResetDeployerConfirmed(` ${RESET_DEPLOYER_PHRASE} `)).toBe(true);
  });

  it("reads the buffer balance from the deploy's own network and shows the amount", async () => {
    expect(deployRpcUrl("MAINNET")).toBe("https://api.mainnet-beta.solana.com");
    expect(deployRpcUrl("DEVNET")).toBe("https://api.devnet.solana.com");
    const calls: string[] = [];
    const sol = await bufferBalanceSol("MAINNET", "Buf1", async (url, addr) => {
      calls.push(`${url} ${addr}`);
      return 1_500_000_000;
    });
    expect(calls).toEqual(["https://api.mainnet-beta.solana.com Buf1"]);
    expect(sol).toBe(1.5);
    expect(reclaimPrompt(sol, "Prog1111111")).toContain("about 1.5000 SOL");
    expect(await bufferBalanceSol("DEVNET", null, async () => 1)).toBeNull();
    expect(await bufferBalanceSol("DEVNET", "x", async () => { throw new Error("rpc down"); })).toBeNull();
    expect(reclaimPrompt(null, "Prog1111111")).toContain("return the SOL");
  });
});
