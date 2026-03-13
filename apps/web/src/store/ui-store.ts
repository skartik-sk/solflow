"use client";

// UI Store — panel visibility, palette state, theme.
// Persisted to localStorage so preferences survive page reloads.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FlowDiff } from "@solflow/versioning";

export type BottomPanelTab =
  | "code"
  | "console"
  | "errors"
  | "tests"
  | "audit"
  | "history"
  | "sdk"
  | "plugins"
  | "inspector"
  | "txbuilder";
export type Theme = "light" | "dark" | "system";

interface UIState {
  // ─── Panel visibility ──────────────────────────────────────────
  paletteOpen: boolean;
  propertiesOpen: boolean;
  bottomPanelOpen: boolean;
  bottomPanelTab: BottomPanelTab;

  // ─── Node palette search / filter ─────────────────────────────
  paletteSearch: string;
  paletteCategory: string | null;

  // ─── Theme ────────────────────────────────────────────────────
  theme: Theme;

  // ─── Diff overlay (version history) ───────────────────────────
  /** When set, FlowCanvas renders color rings on nodes based on diff status. */
  diffOverlay: FlowDiff | null;

  // ─── Actions ──────────────────────────────────────────────────
  togglePalette: () => void;
  toggleProperties: () => void;
  toggleBottomPanel: () => void;
  setBottomPanelTab: (tab: BottomPanelTab) => void;
  openBottomPanelTab: (tab: BottomPanelTab) => void; // open + switch
  setPaletteSearch: (search: string) => void;
  setPaletteCategory: (category: string | null) => void;
  setTheme: (theme: Theme) => void;
  setDiffOverlay: (diff: FlowDiff | null) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      paletteOpen: true,
      propertiesOpen: true,
      bottomPanelOpen: false,
      bottomPanelTab: "code",
      paletteSearch: "",
      paletteCategory: null,
      theme: "dark",
      diffOverlay: null,

      togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
      toggleProperties: () =>
        set((s) => ({ propertiesOpen: !s.propertiesOpen })),
      toggleBottomPanel: () =>
        set((s) => ({ bottomPanelOpen: !s.bottomPanelOpen })),

      setBottomPanelTab: (tab) => set({ bottomPanelTab: tab }),
      openBottomPanelTab: (tab) =>
        set({ bottomPanelOpen: true, bottomPanelTab: tab }),

      setPaletteSearch: (search) => set({ paletteSearch: search }),
      setPaletteCategory: (category) => set({ paletteCategory: category }),
      setTheme: (theme) => set({ theme }),
      setDiffOverlay: (diff) => set({ diffOverlay: diff }),
    }),
    {
      name: "solflow-ui-preferences",
      // Only persist layout + theme preferences, not transient state
      partialize: (state) => ({
        paletteOpen: state.paletteOpen,
        propertiesOpen: state.propertiesOpen,
        theme: state.theme,
        bottomPanelTab: state.bottomPanelTab,
      }),
    },
  ),
);
