import type { SourceFile } from "./crate";

export type WorkerRequest =
  | { type: "prepare"; id: number; baseUrl: string; pack: string }
  | { type: "compile"; id: number; baseUrl: string; pack: string; sources: SourceFile[] };

export type WorkerResponse =
  | { type: "progress"; id: number; step: string; loaded?: number; total?: number }
  | { type: "ready"; id: number }
  | {
      type: "done";
      id: number;
      program: Uint8Array;
      stderr: string;
      timings: { rustcMs: number; linkMs: number };
    }
  | { type: "error"; id: number; message: string; stderr: string; unsupported: boolean };
