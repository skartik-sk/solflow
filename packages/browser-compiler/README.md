# @solflow/browser-compiler

Compiles Solana programs **inside the browser**: no server, no Docker, no cloud build. A
generated Pinocchio program compiles in about a second (after a one-time ~30 MB download) and
produces an sBPF v3 `.so` that deploys and runs on devnet.

```
generated crate (Rust)
   └─ rustc.wasm  ── rustc 1.101.0-nightly (48f4b0553) + LLVM 23 BPF backend, wasm32-wasip1, single-threaded
        │            fat LTO over the crate + prebuilt pack → ONE eBPF object (no external linker)
        └─ sbpf-link.wasm ── relinks that object into an sBPF v3 program (static syscalls)
```

## How it works

- **Upstream toolchain.** Solana programs normally need Anza's forked Rust/LLVM. Since
  sbpf-linker 0.2.3, upstream nightly Rust + LLVM can build them. We go one step further: a custom
  target (`toolchain/bpfel-solana.json` = `bpfel-unknown-none` with `obj-is-bitcode: false`) plus
  `--crate-type staticlib -C lto=fat` makes **rustc itself** do the link-time work, so the only
  thing left is sbpf-linker's pure-Rust ELF rewrite (`toolchain/sbpf-link`, no LLVM).
- **rustc in WebAssembly.** `toolchain/rustc-wasm-bpf.patch` lets rustc run as a single-threaded
  `wasm32-wasip1` program: codegen coordinator runs deferred on the main thread, no jobserver
  helper, sysroot at `/sysroot`, dylib loading stubbed (with a static registry hook for
  proc-macros), LLVM built without threads. No SharedArrayBuffer, so no COOP/COEP headers.
- **Dependency packs.** `toolchain/build-pack.ts` prebuilds `core`/`alloc` and the framework crates
  (e.g. pinocchio, pinocchio-system, pinocchio-token, solana-address) with native nightly at the same
  commit, so their metadata loads in rustc.wasm. The browser compiles only the user's crate.
- **Runtime.** `src/worker.ts` runs rustc.wasm over an in-memory filesystem
  (`@bjorn3/browser_wasi_shim`), caches assets in Cache Storage, and reports progress. Programs
  with dependencies outside the pack fall back to the server compile.

Verified: generated vault behaves identically to `cargo build-sbf` output in Mollusk (3–17%
fewer CUs, about half the size), and browser-built programs deploy and run on devnet.

## Rebuilding the assets

Needs Linux or macOS, ~30 GB disk, nightly Rust at `48f4b0553`, `wasm-tools`, `brotli`.

1. `wasi-sdk` 34 in `$TOOLCHAIN/wasi-sdk`.
2. rust-lang/llvm-project at the commit rust pins (`f738f3b0`), apply `llvm-wasi-23.patch`
   (YoWASP's WASI port, rebased to LLVM 23); build native `llvm-tblgen`/`llvm-config` with
   `-DLLVM_TARGETS_TO_BUILD=BPF`, then the libraries with `-DCMAKE_TOOLCHAIN_FILE=wasi.cmake
   -DLLVM_ENABLE_THREADS=OFF -DLLVM_TARGETS_TO_BUILD=BPF`, install to `$TOOLCHAIN/llvm-wasm-install`
   and copy the native `llvm-config` into its `bin/`.
3. rust-lang/rust at `48f4b0553` (+ `library/backtrace` submodule), apply
   `rustc-wasm-bpf.patch`, use `bootstrap.toml` (replace `$TOOLCHAIN`), then
   `WASI_SDK_PATH=… WASI_SYSROOT=… ./x.py build --stage 2 compiler/rustc` →
   `build/wasm32-wasip1/stage2/bin/rustc.wasm`.
4. `toolchain/sbpf-link`: `cargo build --release --target wasm32-unknown-unknown --lib`
   (with `CC_wasm32_unknown_unknown` = wasi-sdk clang), then `wasm-bindgen --target web`.
5. `bun run build-pack --rustc <rustc.wasm> --linker <sbpf_link_bg.wasm>` → `dist-assets/v1/`.
6. Upload `dist-assets/v1/*` to the `browser-compiler-v1` GitHub release and update
   `apps/web/browser-compiler.lock.json`; `apps/web` downloads and verifies them at build time.

`bun run smoke` compiles the vault fixture with the built assets.

## Credits

- [sbpf-linker](https://github.com/blueshift-gg/sbpf-linker) / sbpf-assembler by Blueshift (MIT):
  the ELF relinker in `toolchain/sbpf-link`.
- bjorn3's [rustc-for-WASI work](https://github.com/bjorn3/rust/tree/compile_rustc_for_wasm20)
  and oligamiq's LLVM-on-WASI bootstrap changes, which the rustc patch builds on.
- [YoWASP llvm-project](https://github.com/YoWASP/llvm-project) WASI patches.
- [@bjorn3/browser_wasi_shim](https://github.com/bjorn3/browser_wasi_shim) (MIT/Apache-2.0).
