// Build the in-browser compiler's assets: dependency packs (prebuilt rlibs for the custom BPF
// target), plus the compressed rustc.wasm and sbpf-link wasm, and a manifest.
//
// Usage: bun toolchain/build-pack.ts --rustc <rustc.wasm> --linker <sbpf_link_bg.wasm>
//          --expander <quasar_expand_bg.wasm> [--out <dir>]
// Requires `cargo +nightly` at RUSTC_COMMIT (the same commit rustc.wasm was built from, so its
// crate metadata is loadable) and `brotli` on PATH.
import { execFileSync } from "child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { basename, join } from "path";
import { parseArgs } from "util";

const VERSION = "v1";
const RUSTC_COMMIT = "48f4b05538b8eca412137042d9647a61e692c6b3";
const TARGET = "bpfel-solana";

// Flags shared by every build: what sbpf-linker would pass to LLVM, applied by rustc's own fat LTO.
const CODEGEN = [
  "opt-level=2",
  "codegen-units=1",
  "overflow-checks=on",
  "panic=abort",
  "relocation-model=static",
  "target-cpu=v4",
  "target-feature=+allows-misaligned-mem-access",
];
const FLAGS = [...CODEGEN, "lto=fat"].flatMap((f) => ["-C", f]);
const LLVM_ARGS = [
  "--bpf-stack-size=4096",
  "--bpf-max-stores-per-memfunc=5",
  "--disable-gotox",
  "--disable-ldsx",
  "--disable-movsx",
  "--bpf-allows-libcalls",
  "--cold-callsite-rel-freq=0",
  "--bpf-disable-trap-unreachable",
].flatMap((a) => ["-C", `llvm-args=${a}`]);
const CFGS = ["--cfg", 'target_os="solana"', "--cfg", 'target_feature="static-syscalls"'];
const ALLOW = ["-A", "explicit_builtin_cfgs_in_flags", "-A", "unexpected_cfgs", "-A", "unused", "-Z", "unstable-options"];

/** Dependency packs: everything the matching code generator can put in Cargo.toml. */
const PACKS: Record<string, { deps: Record<string, string>; expand?: string }> = {
  pinocchio: {
    deps: {
      pinocchio: '{ version = "0.11", features = ["cpi"] }',
      "solana-address": '{ version = "2.0", features = ["decode"] }',
      "pinocchio-system": '"0.6"',
      "pinocchio-token": '"0.6"',
      "solana-compiler-builtins": '"0.1.0"',
    },
  },
  // Quasar programs are macro-heavy: the browser expands them with quasar-expand first.
  quasar: {
    deps: {
      "quasar-lang": '"0.0"',
      "quasar-spl": '"0.0"',
      "solana-compiler-builtins": '"0.1.0"',
    },
    expand: "quasar",
  },
};

const { values } = parseArgs({
  options: {
    rustc: { type: "string" },
    linker: { type: "string" },
    expander: { type: "string" },
    out: { type: "string" },
  },
});
if (!values.rustc || !values.linker || !values.expander) {
  throw new Error("--rustc, --linker and --expander (quasar_expand_bg.wasm) are required");
}
const out = values.out ?? join(import.meta.dir, "..", "dist-assets", VERSION);
mkdirSync(out, { recursive: true });

const sh = (cmd: string, args: string[], cwd?: string, env?: Record<string, string>) =>
  execFileSync(cmd, args, { cwd, env: { ...process.env, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

const version = sh("rustc", ["+nightly", "-vV"]);
if (!version.includes(RUSTC_COMMIT)) {
  throw new Error(`cargo +nightly must be at ${RUSTC_COMMIT} (rustc.wasm's commit); got:\n${version}`);
}
const rustcVersion = version.split("\n")[0];
const sysrootSrc = join(sh("rustc", ["+nightly", "--print", "sysroot"]).trim(), "lib/rustlib/src/rust");
const registry = join(homedir(), ".cargo/registry/src");

const packs: Record<string, { file: string; externs: Record<string, string>; expand?: string }> = {};
for (const [name, { deps, expand }] of Object.entries(PACKS)) {
  const work = mkdtempSync(join(tmpdir(), `pack-${name}-`));
  mkdirSync(join(work, "src"));
  mkdirSync(join(work, ".cargo"));
  cpSync(join(import.meta.dir, `${TARGET}.json`), join(work, `${TARGET}.json`));
  writeFileSync(join(work, "src/lib.rs"), "#![no_std]\n");
  writeFileSync(
    join(work, "Cargo.toml"),
    `[package]\nname = "pack"\nversion = "0.0.0"\nedition = "2021"\n\n[dependencies]\n${Object.entries(deps)
      .map(([d, v]) => `${d} = ${v}`)
      .join("\n")}\n\n[profile.release]\nopt-level = 2\noverflow-checks = true\nlto = "fat"\ncodegen-units = 1\n`,
  );
  // Strip local paths (home dir, toolchain dir) from panic messages and metadata.
  // (cargo applies lto from the profile; rustc.wasm adds it for the final crate)
  const rustflags = [
    ...CODEGEN.flatMap((f) => ["-C", f]),
    ...LLVM_ARGS,
    ...CFGS,
    "-A",
    "explicit_builtin_cfgs_in_flags",
    ...readdirSync(registry).map((r) => `--remap-path-prefix=${join(registry, r)}=/crates`),
    `--remap-path-prefix=${sysrootSrc}=/rustc`,
  ];
  writeFileSync(
    join(work, ".cargo/config.toml"),
    `[unstable]\nbuild-std = ["core", "alloc"]\njson-target-spec = true\n\n[target.${TARGET}]\nrustflags = ${JSON.stringify(rustflags)}\n`,
  );
  sh("cargo", ["+nightly", "build", "--release", "--target", `./${TARGET}.json`], work);

  // Lay out the pack as the browser VFS sees it.
  const root = join(work, "vfs");
  const sysLib = join(root, `sysroot/lib/rustlib/${TARGET}/lib`);
  mkdirSync(sysLib, { recursive: true });
  mkdirSync(join(root, "deps"));
  cpSync(join(work, `${TARGET}.json`), join(root, `${TARGET}.json`));
  const built = sh("find", [join(work, "target", TARGET), "-name", "lib*-*.r*"]).trim().split("\n");
  const externs: Record<string, string> = {};
  for (const path of built) {
    const file = basename(path);
    if (!/\.(rlib|rmeta)$/.test(file) || file.startsWith("libpack-")) continue;
    const isStd = /^lib(core|alloc|compiler_builtins)-/.test(file);
    cpSync(path, join(isStd ? sysLib : join(root, "deps"), file));
    const crate = file.match(/^lib(.+)-[0-9a-f]+\.rlib$/)?.[1];
    if (crate && !isStd) {
      const dep = Object.keys(deps).find((d) => d.replace(/-/g, "_") === crate);
      if (dep) externs[dep] = `/deps/${file}`;
    }
  }
  const missing = Object.keys(deps).filter((d) => !externs[d]);
  if (missing.length) throw new Error(`Pack ${name}: no rlib for ${missing.join(", ")}`);

  // Proc-macro crates the libraries depend on: rustc.wasm only reads their metadata (programs
  // arrive macro-expanded), under the name a wasm host looks for: `<crate>-<hash>.wasm`.
  const macros = sh("find", [join(work, "target", "release"), "-name", "lib*-*.dylib", "-o", "-name", "lib*-*.so"])
    .trim()
    .split("\n")
    .filter(Boolean);
  for (const path of macros) {
    const file = basename(path).replace(/^lib/, "").replace(/\.(dylib|so)$/, ".wasm");
    cpSync(path, join(root, "deps", file));
  }

  const tar = join(work, `${name}.tar`);
  sh("tar", ["--format=ustar", "-cf", tar, "-C", root, "."]);
  sh("brotli", ["-f", "-q", "11", "-o", join(out, `${name}.tar.br`), tar]);
  packs[name] = { file: `${name}.tar.br`, externs, ...(expand ? { expand } : {}) };
  rmSync(work, { recursive: true, force: true });
  console.log(`pack ${name}: ${Object.keys(externs).join(", ")}`);
}

// rustc.wasm: strip debug names (the code is unchanged), then brotli.
const stripped = join(out, "rustc.wasm");
sh("wasm-tools", ["strip", "-a", values.rustc, "-o", stripped]);
sh("brotli", ["-f", "-q", "11", "-o", `${stripped}.br`, stripped]);
rmSync(stripped);
cpSync(values.linker, join(out, "sbpf_link_bg.wasm"));
cpSync(values.expander, join(out, "quasar_expand_bg.wasm"));

const manifest = {
  version: VERSION,
  rustcVersion,
  rustc: "rustc.wasm.br",
  linker: "sbpf_link_bg.wasm",
  expanders: { quasar: "quasar_expand_bg.wasm" },
  target: TARGET,
  flags: [...FLAGS, ...LLVM_ARGS, ...CFGS, ...ALLOW],
  packs,
};
writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`assets in ${out}:`, readdirSync(out).join(", "));
