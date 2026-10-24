/// <reference lib="webworker" />
// Web Worker hosting the in-browser compiler, so compiles never block the editor.
import { BrowserCompiler, CompileError, type LoadAsset } from "./compiler";
import { UnsupportedCrateError, type CompilerManifest } from "./crate";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;
let compiler: Promise<BrowserCompiler> | null = null;

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => scope.postMessage(msg, transfer);

/** Fetch an asset, from Cache Storage when we've downloaded this version before. */
function loader(baseUrl: string, version: string): LoadAsset {
  return async (name, onProgress) => {
    const url = `${baseUrl}/${name}`;
    const cache = await caches.open(`solstudio-compiler-${version}`).catch(() => null);
    const cached = await cache?.match(url);
    if (cached) return new Uint8Array(await cached.arrayBuffer());

    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`Couldn't download ${name} (${res.status})`);
    const total = Number(res.headers.get("content-length") ?? 0);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      onProgress?.(loaded, total);
    }
    const bytes = new Uint8Array(loaded);
    let off = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, off);
      off += chunk.length;
    }
    await cache?.put(url, new Response(bytes)).catch(() => undefined);
    return bytes;
  };
}

async function getCompiler(baseUrl: string): Promise<BrowserCompiler> {
  compiler ??= (async () => {
    const manifest = (await (await fetch(`${baseUrl}/manifest.json`, { cache: "no-cache" })).json()) as CompilerManifest;
    return BrowserCompiler.create(manifest, loader(baseUrl, manifest.version));
  })();
  try {
    return await compiler;
  } catch (err) {
    compiler = null; // let the next request retry
    throw err;
  }
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    const c = await getCompiler(req.baseUrl);
    await c.prepare(req.pack, (step, loaded, total) => post({ type: "progress", id: req.id, step, loaded, total }));
    if (req.type === "prepare") {
      post({ type: "ready", id: req.id });
      return;
    }
    post({ type: "progress", id: req.id, step: "Compiling" });
    const out = await c.compile(req.sources, req.pack);
    post(
      { type: "done", id: req.id, program: out.program, stderr: out.stderr, timings: out.timings },
      [out.program.buffer],
    );
  } catch (err) {
    post({
      type: "error",
      id: req.id,
      message: err instanceof Error ? err.message : String(err),
      stderr: err instanceof CompileError ? err.stderr : "",
      unsupported: err instanceof UnsupportedCrateError,
    });
  }
};
