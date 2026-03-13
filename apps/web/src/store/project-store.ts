"use client";

// Project Store — project metadata, framework, network, save status.
// Lives alongside flow-store but deals with project-level concerns
// rather than canvas node/edge state.

import { create } from "zustand";

export type Framework = "anchor" | "pinocchio";
export type Network = "devnet" | "mainnet" | "localnet";

interface ProjectState {
  // ─── Identity ─────────────────────────────────────────────────
  projectId: string | null;
  projectName: string;

  // ─── Configuration ────────────────────────────────────────────
  framework: Framework;
  network: Network;

  // ─── Save state ───────────────────────────────────────────────
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;

  // ─── Actions ──────────────────────────────────────────────────
  setProject: (project: {
    id: string;
    name: string;
    framework: string;
  }) => void;
  setProjectName: (name: string) => void;
  setFramework: (framework: Framework) => void;
  setNetwork: (network: Network) => void;
  markDirty: () => void;
  markSaved: () => void;
  setSaving: (saving: boolean) => void;

  /** Save flow data to the server. Requires the flow store to be set up. */
  save: (opts?: { snapshot?: boolean }) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projectId: null,
  projectName: "Untitled Program",
  framework: "anchor",
  network: "devnet",
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,

  setProject: (project) =>
    set({
      projectId: project.id,
      projectName: project.name,
      framework: (project.framework?.toLowerCase() as Framework) ?? "anchor",
      isDirty: false,
      lastSavedAt: null,
    }),

  setProjectName: (name) => set({ projectName: name, isDirty: true }),

  setFramework: (framework) => {
    set({ framework, isDirty: true });
    // Re-trigger code generation for the new framework.
    // We import lazily to avoid a circular dep at module load time.
    import("./flow-store").then(({ useFlowStore }) => {
      useFlowStore.getState().regenerateCode();
    });
  },

  setNetwork: (network) => set({ network }),
  markDirty: () => set({ isDirty: true }),
  markSaved: () =>
    set({ isDirty: false, isSaving: false, lastSavedAt: new Date() }),
  setSaving: (saving) => set({ isSaving: saving }),

  save: async (opts) => {
    const { projectId } = get();
    if (!projectId) return;

    set({ isSaving: true });

    // Lazy imports to avoid circular deps at module init
    const [{ useFlowStore }, { getVanillaClient }] = await Promise.all([
      import("./flow-store"),
      import("@/lib/trpc/client"),
    ]);
    const { nodes, edges } = useFlowStore.getState();

    try {
      await getVanillaClient().project.save.mutate({
        id: projectId,
        flowData: { nodes, edges },
      });

      // On manual save (Ctrl+S), also create a version snapshot
      if (opts?.snapshot) {
        await getVanillaClient().snapshot.create.mutate({
          projectId,
        });
      }

      get().markSaved();
    } catch {
      set({ isSaving: false });
      throw new Error("Failed to save project");
    }
  },
}));
