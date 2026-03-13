// packages/plugin-sdk/src/validate.ts
// Validates a plugin manifest before registration.

import type { SolFlowPlugin } from "./types";

/**
 * Throws if the plugin manifest is missing required fields.
 */
export function validatePluginManifest(plugin: SolFlowPlugin): void {
  if (!plugin.id || typeof plugin.id !== "string") {
    throw new Error("Plugin manifest must have a non-empty string `id`");
  }
  if (!plugin.name || typeof plugin.name !== "string") {
    throw new Error(
      `Plugin "${plugin.id}" must have a non-empty string \`name\``,
    );
  }
  if (!plugin.version || typeof plugin.version !== "string") {
    throw new Error(`Plugin "${plugin.id}" must have a \`version\` string`);
  }
  if (!plugin.description || typeof plugin.description !== "string") {
    throw new Error(`Plugin "${plugin.id}" must have a \`description\` string`);
  }
  if (!plugin.author || typeof plugin.author !== "string") {
    throw new Error(`Plugin "${plugin.id}" must have an \`author\` string`);
  }
  if (!Array.isArray(plugin.nodes)) {
    throw new Error(`Plugin "${plugin.id}" must have a \`nodes\` array`);
  }
  for (const node of plugin.nodes) {
    if (!node.type) {
      throw new Error(`Plugin "${plugin.id}": every node must have a \`type\``);
    }
    if (!node.component) {
      throw new Error(
        `Plugin "${plugin.id}", node "${node.type}": missing \`component\``,
      );
    }
  }
  if (!Array.isArray(plugin.cargoDependencies)) {
    throw new Error(
      `Plugin "${plugin.id}" must have a \`cargoDependencies\` array`,
    );
  }
  if (!Array.isArray(plugin.imports)) {
    throw new Error(`Plugin "${plugin.id}" must have an \`imports\` array`);
  }
  if (typeof plugin.codegen !== "object" || plugin.codegen === null) {
    throw new Error(`Plugin "${plugin.id}" must have a \`codegen\` object`);
  }
}
