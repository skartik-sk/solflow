// Run rustc.wasm (wasm32-wasip1, single-threaded) over an in-memory filesystem.
// Shared by the browser worker and the Node/bun test runner.
import { ConsoleStdout, Directory, File, OpenFile, PreopenDirectory, WASI, WASIProcExit } from "@bjorn3/browser_wasi_shim";

/** Absolute path (e.g. "/sysroot/lib/x.rlib") → file bytes. */
export type FileMap = Map<string, Uint8Array>;

export interface RustcRun {
  exitCode: number;
  stderr: string;
  /** Files that rustc created or changed under the given output directories. */
  outputs: FileMap;
}

function buildTree(files: FileMap): Directory {
  const root = new Directory(new Map());
  for (const [path, data] of files) {
    const parts = path.replace(/^\/+/, "").split("/");
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      let next = dir.contents.get(part);
      if (!next) {
        next = new Directory(new Map());
        dir.contents.set(part, next);
      }
      dir = next as Directory;
    }
    // Inputs are shared between runs, so rustc may only read them.
    dir.contents.set(parts.at(-1)!, new File(data, { readonly: true }));
  }
  return root;
}

function collect(dir: Directory, prefix: string, out: FileMap) {
  for (const [name, entry] of dir.contents) {
    const path = `${prefix}/${name}`;
    if (entry instanceof Directory) collect(entry, path, out);
    else if (entry instanceof File && !entry.readonly) out.set(path, entry.data);
  }
}

export async function runRustc(
  rustc: WebAssembly.Module,
  files: FileMap,
  args: string[],
  outputDirs: string[] = ["/out"],
): Promise<RustcRun> {
  const files2 = new Map(files);
  // Make sure output directories exist (as writable, empty dirs).
  const root = buildTree(files2);
  for (const dir of outputDirs) {
    let d = root;
    for (const part of dir.replace(/^\/+/, "").split("/")) {
      let next = d.contents.get(part) as Directory | undefined;
      if (!next) {
        next = new Directory(new Map());
        d.contents.set(part, next);
      }
      d = next;
    }
  }

  let stderr = "";
  const decoder = new TextDecoder();
  const fds = [
    new OpenFile(new File([])),
    ConsoleStdout.lineBuffered((line) => (stderr += `${line}\n`)),
    new ConsoleStdout((bytes) => (stderr += decoder.decode(bytes, { stream: true }))),
    new PreopenDirectory("/", root.contents),
  ];
  const wasi = new WASI(["rustc", ...args], ["RUST_BACKTRACE=0", "RUSTC_BOOTSTRAP=1"], fds, { debug: false });
  const instance = await WebAssembly.instantiate(rustc, { wasi_snapshot_preview1: wasi.wasiImport });

  let exitCode = 0;
  try {
    exitCode = wasi.start(instance as unknown as { exports: { memory: WebAssembly.Memory; _start: () => unknown } });
  } catch (err) {
    if (err instanceof WASIProcExit) exitCode = err.code;
    else {
      stderr += `\nrustc crashed: ${String(err)}`;
      exitCode = 101;
    }
  }

  const outputs: FileMap = new Map();
  for (const dir of outputDirs) {
    let d: Directory | undefined = (fds[3] as PreopenDirectory).dir;
    for (const part of dir.replace(/^\/+/, "").split("/")) d = d?.contents.get(part) as Directory | undefined;
    if (d) collect(d, dir.replace(/\/$/, ""), outputs);
  }
  return { exitCode, stderr, outputs };
}
