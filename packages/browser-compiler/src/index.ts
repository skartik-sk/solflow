// Client API for the in-browser Solana compiler. One shared worker per page.
import type { SourceFile } from "./crate";
import type { WorkerRequest, WorkerResponse } from "./protocol";

export type { SourceFile } from "./crate";

export interface BrowserBuild {
  program: Uint8Array;
  stderr: string;
  timings: { rustcMs: number; linkMs: number };
}

export class BrowserCompileError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
    /** True when the program needs something the browser compiler doesn't ship. */
    readonly unsupported: boolean,
  ) {
    super(message);
  }
}

export type Progress = (step: string, loaded?: number, total?: number) => void;

const BASE_URL = "/browser-compiler/v1";
/** Frameworks the browser compiler can build, mapped to their dependency pack. */
const PACKS: Record<string, string> = { PINOCCHIO: "pinocchio", QUASAR: "quasar" };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: WorkerResponse) => void; onProgress?: Progress }>();

export function browserCompileSupported(framework: string): boolean {
  return typeof Worker !== "undefined" && typeof WebAssembly !== "undefined" && framework in PACKS;
}

// Omit applied to each member of the request union.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type RequestBody = DistributiveOmit<WorkerRequest, "id" | "baseUrl">;

function request(msg: RequestBody, onProgress?: Progress): Promise<WorkerResponse> {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const res = event.data;
      const entry = pending.get(res.id);
      if (!entry) return;
      if (res.type === "progress") {
        entry.onProgress?.(res.step, res.loaded, res.total);
        return;
      }
      pending.delete(res.id);
      entry.resolve(res);
    };
    // If the worker itself can't start or crashes, fail every request so callers fall back
    // to the server instead of waiting forever.
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault();
      const message = `Browser compiler crashed${event.message ? `: ${event.message}` : ""}`;
      for (const [id, entry] of pending) entry.resolve({ type: "error", id, message, stderr: "", unsupported: false });
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, { resolve, onProgress });
    worker!.postMessage({ ...msg, id, baseUrl: BASE_URL } as WorkerRequest);
  });
}

/** Download the compiler ahead of time (e.g. when the editor opens), so the first compile is quick. */
export async function warmUpBrowserCompiler(framework: string, onProgress?: Progress): Promise<void> {
  const pack = PACKS[framework];
  if (!pack) return;
  const res = await request({ type: "prepare", pack }, onProgress);
  if (res.type === "error") throw new BrowserCompileError(res.message, res.stderr, res.unsupported);
}

export async function compileInBrowser(
  framework: string,
  sources: SourceFile[],
  onProgress?: Progress,
): Promise<BrowserBuild> {
  const pack = PACKS[framework];
  if (!pack) throw new BrowserCompileError(`${framework} isn't supported in the browser yet`, "", true);
  const res = await request({ type: "compile", pack, sources }, onProgress);
  if (res.type === "error") throw new BrowserCompileError(res.message, res.stderr, res.unsupported);
  if (res.type !== "done") throw new BrowserCompileError("Unexpected compiler response", "", false);
  return { program: res.program, stderr: res.stderr, timings: res.timings };
}
