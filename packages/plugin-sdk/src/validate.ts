// packages/plugin-sdk/src/validate.ts
// Validates a plugin manifest before registration.

import type { PluginTrustPolicy, PluginTrustReport, PluginTrustLevel, SolFlowPlugin } from "./types";

const PLUGIN_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const NODE_TYPE_RE = /^[a-z0-9](?:[a-z0-9-]*)(?::[a-z0-9](?:[a-z0-9-]*))?$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const CRATE_NAME_RE = /^[A-Za-z0-9_-]+$/;

export const DEFAULT_PLUGIN_TRUST_POLICY: Required<PluginTrustPolicy> = {
  allowedTrustLevels: ["first-party", "verified", "community"],
  requireSignature: false,
  requireAuditRules: false,
  firstPartyAuthors: ["SolFlow", "SolFlow Team"],
};

export interface PluginValidationOptions {
  trustPolicy?: PluginTrustPolicy;
}

/**
 * Throws if the plugin manifest is missing required fields.
 */
export function validatePluginManifest(plugin: SolFlowPlugin, options: PluginValidationOptions = {}): void {
  if (!plugin.id || typeof plugin.id !== "string") {
    throw new Error("Plugin manifest must have a non-empty string `id`");
  }
  if (!PLUGIN_ID_RE.test(plugin.id)) {
    throw new Error(`Plugin "${plugin.id}" must use a lowercase kebab-case id`);
  }
  if (!plugin.name || typeof plugin.name !== "string") {
    throw new Error(
      `Plugin "${plugin.id}" must have a non-empty string \`name\``,
    );
  }
  if (!plugin.version || typeof plugin.version !== "string") {
    throw new Error(`Plugin "${plugin.id}" must have a \`version\` string`);
  }
  if (!SEMVER_RE.test(plugin.version)) {
    throw new Error(`Plugin "${plugin.id}" must use a semver \`version\``);
  }
  if (!plugin.description || typeof plugin.description !== "string") {
    throw new Error(`Plugin "${plugin.id}" must have a \`description\` string`);
  }
  if (!plugin.author || typeof plugin.author !== "string") {
    throw new Error(`Plugin "${plugin.id}" must have an \`author\` string`);
  }
  if (plugin.website) {
    const website = parseHttpsUrl(plugin.website);
    if (!website) {
      throw new Error(`Plugin "${plugin.id}" website must be a valid https URL`);
    }
  }
  if (!Array.isArray(plugin.nodes)) {
    throw new Error(`Plugin "${plugin.id}" must have a \`nodes\` array`);
  }
  const nodeTypes = new Set<string>();
  for (const node of plugin.nodes) {
    if (!node.type) {
      throw new Error(`Plugin "${plugin.id}": every node must have a \`type\``);
    }
    if (!NODE_TYPE_RE.test(node.type)) {
      throw new Error(`Plugin "${plugin.id}", node "${node.type}": node type must be kebab-case and optionally namespaced`);
    }
    if (node.type.includes(":") && !node.type.startsWith(`${plugin.id}:`)) {
      throw new Error(`Plugin "${plugin.id}", node "${node.type}": namespaced node types must use the plugin id prefix`);
    }
    if (nodeTypes.has(node.type)) {
      throw new Error(`Plugin "${plugin.id}" has duplicate node type "${node.type}"`);
    }
    nodeTypes.add(node.type);
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
  for (const dependency of plugin.cargoDependencies) {
    if (!CRATE_NAME_RE.test(dependency.name)) {
      throw new Error(`Plugin "${plugin.id}" has an invalid Cargo dependency name "${dependency.name}"`);
    }
    if (typeof dependency.version !== "string" || dependency.version.trim() === "") {
      throw new Error(`Plugin "${plugin.id}" dependency "${dependency.name}" must have a version`);
    }
    if (!["anchor", "pinocchio", "quasar", "both"].includes(dependency.framework)) {
      throw new Error(`Plugin "${plugin.id}" dependency "${dependency.name}" has an invalid framework`);
    }
  }
  if (!Array.isArray(plugin.imports)) {
    throw new Error(`Plugin "${plugin.id}" must have an \`imports\` array`);
  }
  if (typeof plugin.codegen !== "object" || plugin.codegen === null) {
    throw new Error(`Plugin "${plugin.id}" must have a \`codegen\` object`);
  }

  const trustReport = assessPluginTrust(plugin, options.trustPolicy);
  if (!trustReport.accepted) {
    throw new Error(`Plugin "${plugin.id}" is not trusted: ${trustReport.errors.join("; ")}`);
  }
}

export function assessPluginTrust(
  plugin: SolFlowPlugin,
  policy: PluginTrustPolicy = {},
): PluginTrustReport {
  const mergedPolicy: Required<PluginTrustPolicy> = {
    ...DEFAULT_PLUGIN_TRUST_POLICY,
    ...policy,
    allowedTrustLevels: policy.allowedTrustLevels ?? DEFAULT_PLUGIN_TRUST_POLICY.allowedTrustLevels,
    firstPartyAuthors: policy.firstPartyAuthors ?? DEFAULT_PLUGIN_TRUST_POLICY.firstPartyAuthors,
  };
  const trustLevel = resolveTrustLevel(plugin, mergedPolicy.firstPartyAuthors);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!mergedPolicy.allowedTrustLevels.includes(trustLevel)) {
    errors.push(`trust level "${trustLevel}" is not allowed`);
  }
  if (mergedPolicy.requireSignature && !plugin.security?.signature) {
    errors.push("signed plugin provenance is required");
  }
  if (mergedPolicy.requireAuditRules && (!plugin.auditRules || plugin.auditRules.length === 0)) {
    errors.push("at least one audit rule is required");
  }

  if (!plugin.security) {
    warnings.push("plugin has no explicit security metadata");
  } else {
    if (!plugin.security.publisher) {
      warnings.push("plugin security metadata is missing publisher");
    }
    if (plugin.security.trustLevel === "verified" && !plugin.security.verified) {
      warnings.push("verified plugin is missing verified=true");
    }
  }

  return {
    accepted: errors.length === 0,
    trustLevel,
    errors,
    warnings,
  };
}

function resolveTrustLevel(plugin: SolFlowPlugin, firstPartyAuthors: string[]): PluginTrustLevel {
  if (plugin.security?.trustLevel) {
    return plugin.security.trustLevel;
  }
  return firstPartyAuthors.includes(plugin.author) ? "first-party" : "community";
}

function parseHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
