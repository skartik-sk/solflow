import { describe, expect, it } from "vitest";
import { firstObject, untar } from "../archive";
import { prepareCrate, UnsupportedCrateError, type CompilerManifest } from "../crate";

const manifest: CompilerManifest = {
  version: "v1",
  rustcVersion: "rustc test",
  rustc: "rustc.wasm.br",
  linker: "sbpf_link_bg.wasm",
  target: "bpfel-solana",
  flags: ["-C", "lto=fat"],
  packs: {
    pinocchio: {
      file: "pinocchio.tar.br",
      externs: {
        pinocchio: "/deps/libpinocchio-aa.rlib",
        "solana-address": "/deps/libsolana_address-bb.rlib",
        "solana-compiler-builtins": "/deps/libsolana_compiler_builtins-cc.rlib",
      },
    },
  },
};

const cargo = (deps: string) => ({
  path: "programs/vault/Cargo.toml",
  content: `[package]\nname = "vault"\nedition = "2021"\n\n[lib]\ncrate-type = ["cdylib"]\nname = "vault"\n\n[dependencies]\n${deps}\n\n[profile.release]\nlto = "fat"\n`,
});

describe("prepareCrate", () => {
  it("mounts src/ at /src, links the builtins and passes rlib + rmeta externs", () => {
    const crate = prepareCrate(
      [
        cargo('pinocchio = "0.11"\nsolana-address = { version = "2.0" }'),
        { path: "programs/vault/src/lib.rs", content: "#![no_std]\n" },
        { path: "programs/vault/src/state/mod.rs", content: "pub mod x;" },
      ],
      manifest,
      "pinocchio",
    );
    expect(crate.name).toBe("vault");
    expect([...crate.files.keys()]).toEqual(["/src/lib.rs", "/src/state/mod.rs"]);
    expect(new TextDecoder().decode(crate.files.get("/src/lib.rs"))).toContain("use solana_compiler_builtins as _;");
    expect(crate.args).toContain("solana_address=/deps/libsolana_address-bb.rlib");
    expect(crate.args).toContain("solana_address=/deps/libsolana_address-bb.rmeta");
    expect(crate.args).toContain("solana_compiler_builtins=/deps/libsolana_compiler_builtins-cc.rlib");
    expect(crate.args).toContain("/bpfel-solana.json");
    expect(crate.output).toBe("/out/libvault.a");
  });

  it("rejects dependencies the browser pack doesn't ship", () => {
    expect(() =>
      prepareCrate(
        [cargo('pinocchio = "0.11"\npyth-sdk-solana = "0.10"'), { path: "programs/vault/src/lib.rs", content: "" }],
        manifest,
        "pinocchio",
      ),
    ).toThrow(UnsupportedCrateError);
  });
});

describe("archives", () => {
  it("reads the object out of a GNU ar archive with a long-name table", () => {
    const enc = new TextEncoder();
    const header = (name: string, size: number) => enc.encode(`${name.padEnd(16)}${"0".padEnd(12)}${"0".padEnd(6)}${"0".padEnd(6)}${"644".padEnd(8)}${String(size).padEnd(10)}\`\n`);
    const longName = enc.encode("libvault.vault.cgu.0.rcgu.o/\n");
    const obj = enc.encode("ELFDATA!");
    const ar = new Uint8Array([
      ...enc.encode("!<arch>\n"),
      ...header("//", longName.length),
      ...longName,
      ...(longName.length % 2 ? [10] : []),
      ...header("/0", obj.length),
      ...obj,
    ]);
    expect(new TextDecoder().decode(firstObject(ar))).toBe("ELFDATA!");
  });

  it("reads files out of a ustar archive", () => {
    const block = new Uint8Array(512);
    const enc = new TextEncoder();
    block.set(enc.encode("./deps/a.rlib"), 0);
    block.set(enc.encode("0000003\0"), 124);
    block.set(enc.encode("0"), 156);
    const body = new Uint8Array(512);
    body.set([1, 2, 3]);
    const files = untar(new Uint8Array([...block, ...body, ...new Uint8Array(1024)]));
    expect([...files.keys()]).toEqual(["/deps/a.rlib"]);
    expect([...files.get("/deps/a.rlib")!]).toEqual([1, 2, 3]);
  });
});
