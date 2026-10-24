// Vendor quasar-derive as an ordinary library for the in-browser macro expander.
// The only changes: `proc_macro` (which only works inside rustc) becomes `proc_macro2` through an
// `extern crate … as proc_macro` alias, and syn's `parse_macro_input!` gets a proc_macro2 twin. The macro logic
// itself is untouched, so expansions match what rustc would produce.
// Usage: bun toolchain/quasar-expand/vendor.ts [path to quasar-derive-<version>]
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const VERSION = "0.0.0";
const registry = join(homedir(), ".cargo/registry/src");
const source =
  process.argv[2] ??
  readdirSync(registry)
    .map((r) => join(registry, r, `quasar-derive-${VERSION}`))
    .find((p) => existsSync(p));
if (!source) throw new Error(`quasar-derive ${VERSION} not found; run \`cargo fetch\` on a Quasar project first`);

const dest = join(import.meta.dir, "vendor/quasar-derive");
rmSync(dest, { recursive: true, force: true });
cpSync(join(source, "src"), join(dest, "src"), { recursive: true });

writeFileSync(
  join(dest, "Cargo.toml"),
  `[package]
name = "quasar-derive"
version = "${VERSION}"
edition = "2021"
license = "MIT"
description = "quasar-derive ${VERSION}, vendored as a plain library for the in-browser expander"

[lib]
name = "quasar_derive"
path = "src/lib.rs"

[dependencies]
proc-macro2 = "1"
quote = "1"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
syn = { version = "2", features = ["full", "extra-traits", "visit-mut"] }
`,
);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

for (const file of walk(join(dest, "src")).filter((f) => f.endsWith(".rs"))) {
  let src = readFileSync(file, "utf8");
  // syn's parse_macro_input! only accepts rustc's TokenStream; use the crate-local twin.
  src = src.replace(/\bparse_macro_input\s*,\s*/g, "").replace(/,\s*parse_macro_input\b/g, "");
  if (file.endsWith("lib.rs")) {
    // Not a proc-macro crate any more: the entry points are plain pub functions.
    src = src.replace(/^#\[proc_macro(_derive|_attribute)?\b.*\]\s*$/gm, "");
    src = src.replace(
      /^use proc_macro::TokenStream;$/m,
      `// \`proc_macro\` only works inside rustc; proc_macro2 is the same API anywhere.
extern crate proc_macro2 as proc_macro;

use proc_macro::TokenStream;

/// syn::parse_macro_input! for proc_macro2 token streams.
macro_rules! parse_macro_input {
    ($tokens:ident as $ty:ty) => {
        match syn::parse2::<$ty>($tokens) {
            Ok(value) => value,
            Err(err) => return err.to_compile_error(),
        }
    };
}`,
    );
  }
  writeFileSync(file, src);
}
writeFileSync(
  join(dest, "NOTICE"),
  `quasar-derive ${VERSION} from crates.io (https://github.com/blueshift-gg/quasar), MIT licensed.
Vendored by ../../vendor.ts as a plain library for the in-browser macro expander; the only
changes are the proc_macro -> proc_macro2 alias and a crate-local parse_macro_input! (see vendor.ts).
`,
);
console.log(`vendored quasar-derive ${VERSION} from ${source}`);
