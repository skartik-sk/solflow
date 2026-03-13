"use client";

// Plugin Store — tracks which plugins are enabled/disabled.
// Persisted to localStorage.

import { create } from "zustand";
import { persist } from "zustand/middleware";

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
