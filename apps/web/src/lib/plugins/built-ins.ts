import { metaplexPlugin } from "@solflow/plugin-metaplex";
import { pluginRegistry, type PluginRegistry } from "@solflow/plugin-sdk";
import { pythPlugin } from "@solflow/plugin-pyth";
import { splTokenPlugin } from "@solflow/plugin-spl-token";

export const BUILT_IN_PLUGIN_IDS = ["spl-token", "metaplex", "pyth"] as const;

const BUILT_IN_PLUGINS = [splTokenPlugin, metaplexPlugin, pythPlugin] as const;

export function registerBuiltInPlugins(
  registry: PluginRegistry = pluginRegistry,
): PluginRegistry {
  for (const plugin of BUILT_IN_PLUGINS) {
    if (!registry.isRegistered(plugin.id)) {
      registry.register(plugin);
    }
  }

  return registry;
}
