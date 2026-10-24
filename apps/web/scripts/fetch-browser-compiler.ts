// Put the in-browser compiler's assets in public/browser-compiler/<version>/ before `next build`.
// They live in a GitHub release (too big for git) and are pinned by SHA-256 in
// browser-compiler.lock.json, so a tampered or corrupted download fails the build.
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const REPO = "skartik-sk/solflow";
const root = join(import.meta.dirname, "..");
const lock = JSON.parse(readFileSync(join(root, "browser-compiler.lock.json"), "utf8")) as {
  release: string;
  files: Record<string, { sha256: string; size: number }>;
};
const version = lock.release.replace(/^browser-compiler-/, "");
const outDir = join(root, "public", "browser-compiler", version);
mkdirSync(outDir, { recursive: true });

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

for (const [name, { sha256: expected, size }] of Object.entries(lock.files)) {
  const path = join(outDir, name);
  if (existsSync(path) && sha256(readFileSync(path)) === expected) continue;

  const url = `https://github.com/${REPO}/releases/download/${lock.release}/${name}`;
  const res = await fetch(url);
  if (!res.ok) {
    // Unavailable assets shouldn't block a deploy: without a manifest the editor compiles on the
    // server instead. (A corrupted download, below, is still fatal.)
    console.warn(`browser compiler: couldn't download ${url} (${res.status}); compiling on the server only`);
    rmSync(join(outDir, "manifest.json"), { force: true });
    break;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length !== size || sha256(bytes) !== expected) {
    throw new Error(`${name} doesn't match browser-compiler.lock.json — refusing to ship it`);
  }
  writeFileSync(path, bytes);
  console.log(`browser compiler: ${name} (${(size / 1e6).toFixed(1)} MB)`);
}
