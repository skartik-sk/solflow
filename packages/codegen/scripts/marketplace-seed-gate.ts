/**
 * Production gate for marketplace templates seeded from packages/db/prisma/seed.ts.
 *
 * Checks both paths users exercise:
 * - persisted templateIR generates code for all supported frameworks
 * - visual templateFlowData round-trips through flowToIR and then generates code
 */

import { TEMPLATES } from "../../db/prisma/seed";
import { flowToIR } from "../../ir/src/index";
import { generateCode } from "../src/index";

const frameworks = ["anchor", "pinocchio", "quasar"] as const;
const requiredTemplates = ["Token Vault", "Token Escrow"];
const blockedPlaceholders = [
  /\bTODO\b/i,
  /unimplemented logic operation/i,
  /add a handler in codegen/i,
  /placeholder generated code/i,
];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function assertGenerated(
  title: string,
  source: string,
  framework: (typeof frameworks)[number],
  ir: unknown,
) {
  const result = generateCode(ir as Parameters<typeof generateCode>[0], framework);

  if (result.errors.length > 0) {
    fail(`${title} ${source} ${framework} failed codegen: ${JSON.stringify(result.errors, null, 2)}`);
  }
  if (result.warnings.length > 0) {
    fail(`${title} ${source} ${framework} emitted warnings: ${JSON.stringify(result.warnings, null, 2)}`);
  }
  if (result.files.length === 0) {
    fail(`${title} ${source} ${framework} generated no files`);
  }

  const rustFiles = result.files.filter((file) => file.language === "rust");
  if (rustFiles.length === 0) {
    fail(`${title} ${source} ${framework} generated no Rust files`);
  }

  for (const file of rustFiles) {
    for (const pattern of blockedPlaceholders) {
      if (pattern.test(file.content)) {
        fail(`${title} ${source} ${framework}:${file.path} contains blocked placeholder ${pattern}`);
      }
    }
  }
}

const titles = TEMPLATES.map((template) => template.title);
const duplicateTitles = titles.filter((title, index) => titles.indexOf(title) !== index);
if (duplicateTitles.length > 0) {
  fail(`Duplicate marketplace template titles: ${duplicateTitles.join(", ")}`);
}

for (const title of requiredTemplates) {
  if (!titles.includes(title)) {
    fail(`Required marketplace template is missing: ${title}`);
  }
}

for (const template of TEMPLATES) {
  const flow = template.templateFlowData as {
    nodes?: unknown[];
    edges?: unknown[];
  };
  if (!Array.isArray(flow.nodes) || !Array.isArray(flow.edges)) {
    fail(`${template.title} is missing templateFlowData nodes/edges`);
  }

  const flowIR = flowToIR(flow.nodes as Parameters<typeof flowToIR>[0], flow.edges as Parameters<typeof flowToIR>[1]);
  if (flowIR.instructions.length !== template.templateIR.instructions.length) {
    fail(
      `${template.title} flow instruction count ${flowIR.instructions.length} does not match templateIR ${template.templateIR.instructions.length}`,
    );
  }

  for (const framework of frameworks) {
    assertGenerated(template.title, "templateIR", framework, template.templateIR);
    assertGenerated(template.title, "templateFlowData", framework, flowIR);
  }

  console.log(`ok ${template.title}`);
}

console.log(`Marketplace seed gate passed for ${TEMPLATES.length} templates across ${frameworks.length} frameworks.`);
