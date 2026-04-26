import { chmod, mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";

const root = process.cwd();
const distDir = join(root, "dist");
const entry = join(root, "src", "index.ts");
const outFile = join(distDir, "index.js");

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

const result = await Bun.build({
  entrypoints: [entry],
  outdir: distDir,
  target: "node",
  packages: "bundle",
  sourcemap: "none",
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

const bundled = await readFile(outFile, "utf8");
const executable = bundled.replace(/^#!\/usr\/bin\/env bun/, "#!/usr/bin/env node");
await writeFile(outFile, executable, "utf8");
await chmod(outFile, 0o755);

console.log(`Built ${outFile}`);
