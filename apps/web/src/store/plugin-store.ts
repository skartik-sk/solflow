"use client";

// Plugin Store — tracks which plugins are enabled/disabled.
// Persisted to localStorage.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clearPluginRules, registerAuditRules, type AuditRule } from "@solflow/audit";
import { pluginRegistry, type PluginRegistry } from "@solflow/plugin-sdk";
import { registerBuiltInPlugins } from "@/lib/plugins/built-ins";

interface PluginStoreState {
  /** IDs of currently enabled plugins */
  enabledPluginIds: string[];

  enablePlugin: (id: string) => void;
  disablePlugin: (id: string) => void;
  togglePlugin: (id: string) => void;
  isEnabled: (id: string) => boolean;
}

export const usePluginStore = create<PluginStoreState>()(
  persist(
    (set, get) => ({
      enabledPluginIds: [],

      enablePlugin: (id) =>
        set((s) =>
          s.enabledPluginIds.includes(id)
            ? s
            : { enabledPluginIds: [...s.enabledPluginIds, id] },
        ),

      disablePlugin: (id) =>
        set((s) => ({
          enabledPluginIds: s.enabledPluginIds.filter((p) => p !== id),
        })),

      togglePlugin: (id) => {
        const enabled = get().enabledPluginIds.includes(id);
        if (enabled) {
          get().disablePlugin(id);
        } else {
          get().enablePlugin(id);
        }
      },

      isEnabled: (id) => get().enabledPluginIds.includes(id),
    }),
    {
      name: "solflow-plugins",
      partialize: (state) => ({
        enabledPluginIds: state.enabledPluginIds,
      }),
    },
  ),
);

/**
 * Make the audit engine's plugin rules match the enabled plugins exactly:
 * rules of disabled plugins are removed, enabled ones are registered.
 */
export function syncPluginAuditRules(
  enabledPluginIds: string[],
  registry: PluginRegistry = pluginRegistry,
): AuditRule[] {
  const rules: AuditRule[] = [];
  for (const plugin of registry.getAllPlugins()) {
    if (enabledPluginIds.includes(plugin.id) && plugin.auditRules?.length) {
      rules.push(...plugin.auditRules);
    }
  }
  clearPluginRules();
  registerAuditRules(rules);
  return rules;
}

/** Register enabled plugins' audit rules now and keep them in sync. Returns a cleanup. */
export function startPluginAuditRuleSync(): () => void {
  registerBuiltInPlugins();
  syncPluginAuditRules(usePluginStore.getState().enabledPluginIds);
  const unsub = usePluginStore.subscribe((state, prev) => {
    if (state.enabledPluginIds !== prev.enabledPluginIds) {
      syncPluginAuditRules(state.enabledPluginIds);
    }
  });
  return () => {
    unsub();
    clearPluginRules();
  };
}
