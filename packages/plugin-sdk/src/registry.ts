// packages/plugin-sdk/src/registry.ts
// Plugin registry — registers plugins and exposes node types for the editor.

import type { ComponentType } from "react";
import type { PluginTrustPolicy, SolFlowPlugin } from "./types";
import { validatePluginManifest } from "./validate";

export interface PluginRegistrationOptions {
  trustPolicy?: PluginTrustPolicy;
}

export class PluginRegistry {
  private plugins: Map<string, SolFlowPlugin> = new Map();

  /**
   * Register a plugin. Throws if the id is already registered or the
   * manifest is invalid.
   */
  register(plugin: SolFlowPlugin, options: PluginRegistrationOptions = {}): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin "${plugin.id}" is already registered`);
    }
    validatePluginManifest(plugin, { trustPolicy: options.trustPolicy });
    this.plugins.set(plugin.id, plugin);
  }

  /** Retrieve a plugin by id. */
  getPlugin(id: string): SolFlowPlugin | undefined {
    return this.plugins.get(id);
  }

  /** All registered plugins. */
  getAllPlugins(): SolFlowPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Returns a map of namespaced node type id → React component suitable for
   * passing as the `nodeTypes` prop of React Flow.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getNodeTypes(): Record<string, ComponentType<any>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const types: Record<string, ComponentType<any>> = {};
    for (const plugin of this.plugins.values()) {
      for (const node of plugin.nodes) {
        // Namespace the type: "pluginId:nodeType"
        const key = node.type.includes(":")
          ? node.type
          : `${plugin.id}:${node.type}`;
        types[key] = node.component;
      }
    }
    return types;
  }

  /**
   * Unregister a plugin (useful for hot-reload in dev or disabling).
   */
  unregister(id: string): boolean {
    return this.plugins.delete(id);
  }

  /** Whether a plugin with the given id is registered. */
  isRegistered(id: string): boolean {
    return this.plugins.has(id);
  }
}

/** Singleton registry — shared across the entire app. */
export const pluginRegistry = new PluginRegistry();
