"use client";

// Editor UI Store — panel visibility, palette state, execution panel.

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type BottomPanelTab = "executions" | "simulation" | "logs" | "output";

interface EditorUIState {
  paletteOpen: boolean;
  propertiesOpen: boolean;
  bottomPanelOpen: boolean;
  bottomPanelTab: BottomPanelTab;

  paletteSearch: string;
  paletteCategory: string | null;

  isRunning: boolean;

  togglePalette: () => void;
  toggleProperties: () => void;
  toggleBottomPanel: () => void;
  setBottomPanelTab: (tab: BottomPanelTab) => void;
  openBottomPanelTab: (tab: BottomPanelTab) => void;
  setPaletteSearch: (search: string) => void;
  setPaletteCategory: (category: string | null) => void;
  setIsRunning: (running: boolean) => void;
}

export const useEditorUIStore = create<EditorUIState>()(
  persist(
    (set) => ({
      paletteOpen: true,
      propertiesOpen: true,
      bottomPanelOpen: false,
      bottomPanelTab: "executions",
      paletteSearch: "",
      paletteCategory: null,
      isRunning: false,

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
      setIsRunning: (running) => set({ isRunning: running }),
    }),
    {
      name: "solflow-cloud-editor-ui",
      partialize: (state) => ({
        paletteOpen: state.paletteOpen,
        propertiesOpen: state.propertiesOpen,
      }),
    },
  ),
);
