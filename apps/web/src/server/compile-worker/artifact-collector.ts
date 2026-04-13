// apps/web/src/server/compile-worker/artifact-collector.ts
// Extracts compilation artifacts (.so binary, IDL JSON) from the Docker work dir.
// Per docs/architecture/09-compilation-deployment.md → Compilation Steps 7-8.
//
// SERVER ONLY.

import { readFile, stat, rm } from "fs/promises";
import { readdirSync } from "fs";
import { join } from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompilationArtifacts {
  /** Absolute path to the .so binary inside workDir */
  binaryPath: string;
  binarySize: number;
  /** Parsed IDL JSON (Anchor only; undefined for Pinocchio) */
  idl?: Record<string, unknown>;
  /** Raw binary bytes (for upload / storage) */
  binaryBytes: Buffer;
}

// ─── Collector ────────────────────────────────────────────────────────────────

export async function collectArtifacts(
  workDir: string,
  framework: "ANCHOR" | "PINOCCHIO" | "QUASAR",
): Promise<CompilationArtifacts> {
  try {
    // Find .so binary
    const soFiles: string[] = [];

    // Use readdirSync (works on all Node versions, no glob needed)
    const deployDir = join(workDir, "target", "deploy");
    try {
      const entries = readdirSync(deployDir);
      for (const e of entries) {
        if (e.endsWith(".so")) soFiles.push(join(deployDir, e));
      }
    } catch {
      // deploy dir doesn't exist yet
    }

    if (soFiles.length === 0) {
      throw new Error("No .so binary found after compilation");
    }

    const binaryPath = soFiles[0];
    const binaryBytes = await readFile(binaryPath);
    const binarySize = (await stat(binaryPath)).size;

    // Read IDL (Anchor only)
    let idl: Record<string, unknown> | undefined;
    if (framework === "ANCHOR") {
      const idlDir = join(workDir, "target", "idl");
      const idlFiles: string[] = [];

      try {
        const entries = readdirSync(idlDir);
        for (const e of entries) {
          if (e.endsWith(".json")) idlFiles.push(join(idlDir, e));
        }
      } catch {
        // idl dir doesn't exist
      }

      if (idlFiles.length > 0) {
        try {
          const raw = await readFile(idlFiles[0], "utf8");
          idl = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          // IDL parse failure is non-fatal
        }
      }
    }

    return { binaryPath, binarySize, idl, binaryBytes };
  } finally {
    // Always clean up temp directory, even on partial failure
    await rm(workDir, { recursive: true, force: true }).catch((e) => {
      console.warn(`[artifact-collector] Failed to clean ${workDir}:`, e instanceof Error ? e.message : e);
    });
  }
}
