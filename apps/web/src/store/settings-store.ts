"use client";

// Settings Store — user preferences persisted to localStorage.
// Can be synced to server via tRPC when a settings DB field is added.

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DefaultFramework = "anchor" | "pinocchio" | "quasar";
export type DefaultNetwork = "devnet" | "mainnet" | "localnet";

interface SettingsState {
  // ─── Editor ─────────────────────────────────────────────────────
  fontSize: number;
  fontFamily: string;
  showLineNumbers: boolean;
  minimapEnabled: boolean;
  wordWrap: boolean;

  // ─── Project defaults ──────────────────────────────────────────
  defaultFramework: DefaultFramework;
  defaultNetwork: DefaultNetwork;
  autoSaveIntervalSec: number; // 0 = disabled, 3-300

  // ─── Build ─────────────────────────────────────────────────────
  autoBuildOnCodeChange: boolean;
  showBuildNotifications: boolean;

  // ─── Actions ───────────────────────────────────────────────────
  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;
  setShowLineNumbers: (show: boolean) => void;
  setMinimapEnabled: (enabled: boolean) => void;
  setWordWrap: (wrap: boolean) => void;
  setDefaultFramework: (fw: DefaultFramework) => void;
  setDefaultNetwork: (net: DefaultNetwork) => void;
  setAutoSaveIntervalSec: (sec: number) => void;
  setAutoBuildOnCodeChange: (auto: boolean) => void;
  setShowBuildNotifications: (show: boolean) => void;
  resetToDefaults: () => void;
}

const DEFAULTS: Omit<SettingsState, `set${string}` | "resetToDefaults"> = {
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  showLineNumbers: true,
  minimapEnabled: false,
  wordWrap: false,
  defaultFramework: "anchor",
  defaultNetwork: "devnet",
  autoSaveIntervalSec: 30,
  autoBuildOnCodeChange: false,
  showBuildNotifications: true,
};

/** Monaco options for the read-only code views, from the user's editor settings. */
export function codeViewOptions(
  s: Pick<SettingsState, "fontSize" | "wordWrap" | "showLineNumbers" | "minimapEnabled">,
) {
  return {
    fontSize: s.fontSize,
    wordWrap: s.wordWrap ? ("on" as const) : ("off" as const),
    lineNumbers: s.showLineNumbers ? ("on" as const) : ("off" as const),
    minimap: { enabled: s.minimapEnabled },
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setFontSize: (size) => set({ fontSize: Math.max(10, Math.min(24, size)) }),
      setFontFamily: (family) => set({ fontFamily: family }),
      setShowLineNumbers: (show) => set({ showLineNumbers: show }),
      setMinimapEnabled: (enabled) => set({ minimapEnabled: enabled }),
      setWordWrap: (wrap) => set({ wordWrap: wrap }),
      setDefaultFramework: (fw) => set({ defaultFramework: fw }),
      setDefaultNetwork: (net) => set({ defaultNetwork: net }),
      setAutoSaveIntervalSec: (sec) => set({ autoSaveIntervalSec: Math.max(0, Math.min(300, sec)) }),
      setAutoBuildOnCodeChange: (auto) => set({ autoBuildOnCodeChange: auto }),
      setShowBuildNotifications: (show) => set({ showBuildNotifications: show }),
      resetToDefaults: () => set(DEFAULTS),
    }),
    { name: "solflow-user-settings" },
  ),
);

/** Code-view Monaco options that follow the Settings dialog. */
export function useCodeViewOptions() {
  const fontSize = useSettingsStore((s) => s.fontSize);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const showLineNumbers = useSettingsStore((s) => s.showLineNumbers);
  const minimapEnabled = useSettingsStore((s) => s.minimapEnabled);
  return useMemo(
    () => codeViewOptions({ fontSize, wordWrap, showLineNumbers, minimapEnabled }),
    [fontSize, wordWrap, showLineNumbers, minimapEnabled],
  );
}
