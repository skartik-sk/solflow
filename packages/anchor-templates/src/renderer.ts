// Template renderer for @solflow/anchor-templates.
// Loads Handlebars templates from the templates/ directory and renders them
// with the provided context data.

import Handlebars from "handlebars";
import * as fs from "fs";
import * as path from "path";

// ─── Template names ───────────────────────────────────────────────────────────

export type AnchorTemplateName =
  | "lib.rs"
  | "instruction.rs"
  | "state.rs"
  | "errors.rs"
  | "events.rs"
  | "mod.rs"
  | "Cargo.toml";

// ─── Template cache ───────────────────────────────────────────────────────────

const TEMPLATE_DIR = path.join(__dirname, "templates");
const cache = new Map<AnchorTemplateName, HandlebarsTemplateDelegate>();

function getTemplate(name: AnchorTemplateName): HandlebarsTemplateDelegate {
  if (cache.has(name)) return cache.get(name)!;

  const filePath = path.join(TEMPLATE_DIR, `${name}.hbs`);
  const source = fs.readFileSync(filePath, "utf-8");
  const compiled = Handlebars.compile(source, { noEscape: true });
  cache.set(name, compiled);
  return compiled;
}

// ─── Public render function ───────────────────────────────────────────────────

/** Render a named Anchor template with the given context data. */
export function renderAnchorTemplate(
  name: AnchorTemplateName,
  context: Record<string, unknown>
): string {
  const template = getTemplate(name);
  return template(context).trim() + "\n";
}

// ─── Context types (what callers must provide) ────────────────────────────────

export interface LibRsContext {
  programName: string;          // snake_case
  programId?: string;           // base58 public key or undefined for placeholder
  modules: string[];            // ["instructions", "state", "errors", "events"]
  instructions: Array<{
    name: string;               // snake_case fn name
    contextStruct: string;      // PascalCase Accounts struct
    args: Array<{ name: string; type: string }>;
  }>;
}

export interface InstructionContext {
  contextStruct: string;
  args: Array<{ name: string; type: string }>;
  stateImports: string[];       // State struct names this instruction uses
  errorEnum?: string;           // e.g., "VaultError"
  hasErrors: boolean;
  eventImports: string[];
  body: string;                 // Pre-rendered instruction body Rust code
  accounts: Array<{
    name: string;
    rustType: string;           // e.g., "Signer<'info>", "Account<'info, Vault>"
    attributes: string[];       // e.g., ["#[account(mut)]", "#[account(init, ...)]"]
  }>;
}

export interface StateContext {
  name: string;                 // PascalCase struct name
  fields: Array<{
    name: string;
    rustType: string;
    description?: string;
    sizeComment?: string;       // "// 8 bytes"
  }>;
}

export interface ErrorsContext {
  enumName: string;             // e.g., "VaultError"
  variants: Array<{ name: string; message: string }>;
}

export interface EventsContext {
  events: Array<{
    name: string;
    fields: Array<{ name: string; rustType: string }>;
  }>;
}

export interface ModContext {
  modules: string[];            // module names to declare
}

export interface CargoTomlContext {
  kebabName: string;            // e.g., "vault-program"
  snakeName: string;            // e.g., "vault_program"
  version: string;              // e.g., "0.1.0"
  usesSpl: boolean;
}
