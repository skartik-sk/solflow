"use client";

import { create } from "zustand";

interface FloatingBrowserState {
  isOpen: boolean;
  url: string;
  title: string;
  isMinimized: boolean;

  openUrl: (url: string, title?: string) => void;
  close: () => void;
  minimize: () => void;
  restore: () => void;
}

export const useFloatingBrowserStore = create<FloatingBrowserState>((set) => ({
  isOpen: false,
  url: "",
  title: "",
  isMinimized: false,

  openUrl: (url, title) =>
    set({ isOpen: true, url, title: title ?? new URL(url).hostname, isMinimized: false }),

  close: () => set({ isOpen: false, isMinimized: false }),

  minimize: () => set({ isMinimized: true }),

  restore: () => set({ isMinimized: false }),
}));

/** Call from anywhere to open the floating browser. */
export function openFloatingBrowser(url: string, title?: string) {
  useFloatingBrowserStore.getState().openUrl(url, title);
}
