// packages/sdk-gen/src/generate-sdk.ts
// Generates a TypeScript client SDK from a SolFlow ProgramIR using Codama.

import type { ProgramIR } from "@solflow/ir";
import { createFromRoot } from "codama";
import { getRenderMapVisitor } from "@codama/renderers-js";
import { irToCodamaIDL } from "./ir-to-codama";
import type { GeneratedSDKFile, SDKGenerationResult } from "./types";

/**
 * Generate a TypeScript SDK from a ProgramIR.
 *
 * Uses `@codama/renderers-js` to produce Solana Kit–compatible client code.
 * All file content is returned as strings — nothing is written to disk here.
 */
export async function generateSDK(ir: ProgramIR): Promise<SDKGenerationResult> {
  // 1. Build Codama root node from IR
  const root = irToCodamaIDL(ir);

  // 2. Create a Codama instance from the root
  const codamaInstance = createFromRoot(root);

  // 3. Get IDL JSON for export / reimport
  const idlJson = codamaInstance.getJson();

  // 4. Run the JS renderer to produce a RenderMap (path → { content })
  const renderMap = codamaInstance.accept(getRenderMapVisitor());

  // 5. Convert RenderMap entries to GeneratedSDKFile[]
  const files: GeneratedSDKFile[] = [];
  for (const [filePath, fragment] of renderMap) {
    files.push({ path: filePath, content: fragment.content });
  }

  // 6. Add a hand-crafted package.json for the generated SDK
  const programName = ir.program.name;
  const packageName = `@generated/${toKebabCase(programName)}-sdk`;

  files.push({
    path: "package.json",
    content: JSON.stringify(
      {
        name: packageName,
        version: ir.program.version,
        description: `Generated TypeScript SDK for ${programName}`,
        main: "./src/index.ts",
        types: "./src/index.ts",
        scripts: { typecheck: "tsc --noEmit" },
        dependencies: {
          "@solana/kit": "^2.0.0",
        },
        devDependencies: {
          typescript: "^5.0.0",
        },
      },
      null,
      2,
    ),
  });

  // 7. Add a minimal tsconfig.json
  files.push({
    path: "tsconfig.json",
    content: JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          skipLibCheck: true,
          declaration: true,
          outDir: "dist",
        },
        include: ["src"],
      },
      null,
      2,
    ),
  });

  return { files, packageName, idlJson };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function toKebabCase(s: string): string {
  return s
    .replace(/_/g, "-")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();
}
