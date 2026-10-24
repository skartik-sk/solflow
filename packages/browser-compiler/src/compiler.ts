// In-browser Solana compiler: rustc.wasm (upstream LLVM, BPF backend) does fat LTO into one eBPF
// object, then sbpf-link (wasm) relinks it into an sBPF v3 program. Runs anywhere with
// WebAssembly; the caller supplies the assets.
import { firstObject, untar } from "./archive";
import { prepareCrate, type CompilerManifest, type SourceFile } from "./crate";
import { runRustc, type FileMap } from "./run-rustc";
import initLinker, { decompressBrotli, linkProgram } from "./sbpf-link/sbpf_link.js";

export type LoadAsset = (name: string, onProgress?: (loaded: number, total: number) => void) => Promise<Uint8Array>;

export interface CompileOutput {
  program: Uint8Array;
  /** rustc diagnostics (warnings even on success). */
  stderr: string;
  timings: { rustcMs: number; linkMs: number };
}

export class CompileError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
  }
}

export class BrowserCompiler {
  private rustc: WebAssembly.Module | null = null;
  private packs = new Map<string, FileMap>();

  private constructor(readonly manifest: CompilerManifest, private readonly load: LoadAsset) {}

  static async create(manifest: CompilerManifest, load: LoadAsset): Promise<BrowserCompiler> {
    await initLinker({ module_or_path: await load(manifest.linker) });
    return new BrowserCompiler(manifest, load);
  }

  /** Download and prepare the compiler and a dependency pack (cached by the loader). */
  async prepare(packName: string, onProgress?: (step: string, loaded?: number, total?: number) => void) {
    if (!this.rustc) {
      const bytes = await this.load(this.manifest.rustc, (l, t) => onProgress?.("Downloading compiler", l, t));
      onProgress?.("Preparing compiler");
      this.rustc = await WebAssembly.compile(this.unpack(this.manifest.rustc, bytes) as BufferSource);
    }
    if (!this.packs.has(packName)) {
      const pack = this.manifest.packs[packName];
      if (!pack) throw new CompileError(`No browser dependency pack for ${packName}`, "");
      const bytes = await this.load(pack.file, (l, t) => onProgress?.("Downloading libraries", l, t));
      this.packs.set(packName, untar(this.unpack(pack.file, bytes)));
    }
  }

  async compile(sources: SourceFile[], packName: string): Promise<CompileOutput> {
    await this.prepare(packName);
    const crate = prepareCrate(sources, this.manifest, packName);
    const files: FileMap = new Map([...this.packs.get(packName)!, ...crate.files]);

    const t0 = performance.now();
    const run = await runRustc(this.rustc!, files, crate.args);
    const t1 = performance.now();
    if (run.exitCode !== 0) throw new CompileError("Rust compilation failed", run.stderr);

    const archive = run.outputs.get(crate.output);
    if (!archive) throw new CompileError("The compiler produced no output", run.stderr);
    let program: Uint8Array;
    try {
      program = linkProgram(firstObject(archive));
    } catch (err) {
      throw new CompileError(`Linking failed: ${String(err)}`, run.stderr);
    }
    return { program, stderr: run.stderr, timings: { rustcMs: t1 - t0, linkMs: performance.now() - t1 } };
  }

  private unpack(name: string, bytes: Uint8Array): Uint8Array {
    return name.endsWith(".br") ? decompressBrotli(bytes) : bytes;
  }
}
