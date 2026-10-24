// Turn a generated program (Cargo.toml + src/**) into a rustc invocation against the
// prebuilt dependency pack. No cargo in the browser: the dependency graph is fixed by the pack.

/** Describes one prebuilt dependency pack (written by toolchain/build-pack.ts). */
export interface PackManifest {
  file: string;
  /** Dependency name as written in Cargo.toml → absolute .rlib path inside the pack. */
  externs: Record<string, string>;
  /** Macro expander to run over the sources before rustc (rustc.wasm can't run proc macros). */
  expand?: string;
}

export interface CompilerManifest {
  version: string;
  rustcVersion: string;
  rustc: string;
  linker: string;
  /** Expander name → wasm asset. */
  expanders?: Record<string, string>;
  target: string;
  /** rustc flags shared by every build (codegen, LLVM BPF options, cfgs). */
  flags: string[];
  packs: Record<string, PackManifest>;
}

export interface SourceFile {
  path: string;
  content: string;
}

export interface PreparedCrate {
  name: string;
  /** Absolute VFS paths → file bytes (the crate's src/ tree mounted at /src). */
  files: Map<string, Uint8Array>;
  args: string[];
  output: string;
}

export class UnsupportedCrateError extends Error {}

/** Dependency features the prebuilt packs were not built with (the server compiles these). */
const UNPACKED_FEATURES: Record<string, string[]> = { "quasar-spl": ["metadata"] };

const encoder = new TextEncoder();

function tomlSection(toml: string, section: string): string {
  const match = toml.match(new RegExp(`^\\[${section.replace(".", "\\.")}\\]\\s*$([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))`, "m"));
  return match?.[1] ?? "";
}

function tomlString(section: string, key: string): string | undefined {
  return section.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"))?.[1];
}

export function prepareCrate(sources: SourceFile[], manifest: CompilerManifest, packName: string): PreparedCrate {
  const pack = manifest.packs[packName];
  if (!pack) throw new UnsupportedCrateError(`No browser dependency pack for ${packName}`);

  const cargo = sources.find((f) => f.path.endsWith("Cargo.toml") && f.content.includes("[package]"));
  if (!cargo) throw new UnsupportedCrateError("No Cargo.toml in the generated program");
  const root = cargo.path.slice(0, -"Cargo.toml".length);

  const pkg = tomlSection(cargo.content, "package");
  const lib = tomlSection(cargo.content, "lib");
  const name = (tomlString(lib, "name") ?? tomlString(pkg, "name") ?? "program").replace(/-/g, "_");
  const edition = tomlString(pkg, "edition") ?? "2021";

  const deps = tomlSection(cargo.content, "dependencies")
    .split("\n")
    .map((line) => line.match(/^([A-Za-z0-9_-]+)\s*=/)?.[1])
    .filter((dep): dep is string => !!dep);
  const missing = deps.filter((dep) => !pack.externs[dep]);
  if (missing.length) {
    throw new UnsupportedCrateError(`Not in the browser pack: ${missing.join(", ")}`);
  }
  for (const line of tomlSection(cargo.content, "dependencies").split("\n")) {
    const dep = line.match(/^([A-Za-z0-9_-]+)\s*=/)?.[1];
    const wanted = [...(line.match(/features\s*=\s*\[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const unpacked = wanted.filter((f) => dep && UNPACKED_FEATURES[dep]?.includes(f));
    if (unpacked.length) throw new UnsupportedCrateError(`${dep} feature ${unpacked.join(", ")} isn't in the browser pack`);
  }

  // Cargo enables the default features; rustc only sees them as cfgs.
  const featureMap = new Map<string, string[]>();
  for (const line of tomlSection(cargo.content, "features").split("\n")) {
    const m = line.match(/^"?([\w-]+)"?\s*=\s*\[([^\]]*)\]/);
    if (m) featureMap.set(m[1], [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  }
  const features = new Set<string>();
  const enable = (feature: string) => {
    // "dep:x" and "crate/feature" configure dependencies, which the pack fixes already.
    if (features.has(feature) || feature.includes("/") || feature.startsWith("dep:")) return;
    features.add(feature);
    (featureMap.get(feature) ?? []).forEach(enable);
  };
  (featureMap.get("default") ?? []).forEach(enable);

  const files = new Map<string, Uint8Array>();
  for (const file of sources) {
    if (!file.path.startsWith(`${root}src/`)) continue;
    let content = file.content;
    if (file.path === `${root}src/lib.rs` && !content.includes("solana_compiler_builtins")) {
      // Upstream LLVM needs Solana's memcpy/float builtins linked into the program.
      content += "\nuse solana_compiler_builtins as _;\n";
    }
    files.set(`/src/${file.path.slice(`${root}src/`.length)}`, encoder.encode(content));
  }
  if (!files.has("/src/lib.rs")) throw new UnsupportedCrateError("No src/lib.rs in the generated program");

  const externs = new Set([...deps, "solana-compiler-builtins"]);
  const output = `/out/lib${name}.a`;
  const args = [
    "/src/lib.rs",
    "--crate-name",
    name,
    `--edition=${edition}`,
    "--crate-type",
    "staticlib",
    "--emit=link",
    "-o",
    output,
    "--target",
    `/${manifest.target}.json`,
    "--sysroot",
    "/sysroot",
    "-L",
    "dependency=/deps",
    ...[...externs].flatMap((dep) => {
      const rlib = pack.externs[dep];
      if (!rlib) throw new UnsupportedCrateError(`Not in the browser pack: ${dep}`);
      const crate = dep.replace(/-/g, "_");
      return ["--extern", `${crate}=${rlib}`, "--extern", `${crate}=${rlib.replace(/\.rlib$/, ".rmeta")}`];
    }),
    "--remap-path-prefix=/src=src",
    ...[...features].flatMap((f) => ["--cfg", `feature="${f}"`]),
    ...manifest.flags,
  ];
  return { name, files, args, output };
}
