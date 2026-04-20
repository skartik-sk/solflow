"use client";

// Project Store — project metadata, framework, network, save status.
// Lives alongside flow-store but deals with project-level concerns
// rather than canvas node/edge state.

import { create } from "zustand";

export type Framework = "anchor" | "pinocchio" | "quasar";
export type Network = "devnet" | "mainnet" | "localnet" | string; // string allows custom network IDs

export interface CustomEndpoint {
  id: string;
  name: string;
  url: string;
}

/** Built-in RPC URLs */
export const BUILTIN_RPC: Record<string, string> = {
  devnet: "https://api.devnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
  localnet: "http://127.0.0.1:8899",
};

/** Resolve a network ID to an RPC URL. Checks custom endpoints first, then built-ins. */
export function resolveRpcUrl(network: Network, customEndpoints: CustomEndpoint[]): string {
  const custom = customEndpoints.find((e) => e.id === network);
  return custom?.url ?? BUILTIN_RPC[network] ?? network; // fallback: treat network as raw URL
}

interface ProjectState {
  // ─── Identity ─────────────────────────────────────────────────
  projectId: string | null;
  projectName: string;

  // ─── Configuration ────────────────────────────────────────────
  framework: Framework;
  network: Network;
  customEndpoints: CustomEndpoint[];

  // ─── Save state ───────────────────────────────────────────────
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;
  saveError: string | null;
  /** Whether the dirty flag came from a framework change (triggers fast auto-save) */
  urgentDirty: boolean;

  // ─── Actions ──────────────────────────────────────────────────
  setProject: (project: {
    id: string;
    name: string;
    framework: string;
  }) => void;
  setProjectName: (name: string) => void;
  setFramework: (framework: Framework) => void;
  setNetwork: (network: Network) => void;
  addCustomEndpoint: (endpoint: CustomEndpoint) => void;
  removeCustomEndpoint: (id: string) => void;
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
  customEndpoints: [],
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,
  saveError: null,
  urgentDirty: false,

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
    set({ framework, isDirty: true, urgentDirty: true });
    // Re-trigger code generation for the new framework.
    // We import lazily to avoid a circular dep at module load time.
    import("./flow-store").then(({ useFlowStore }) => {
      useFlowStore.getState().regenerateCode();
    });
  },

  setNetwork: (network) => set({ network, isDirty: true }),
  addCustomEndpoint: (endpoint) =>
    set((s) => ({
      customEndpoints: [...s.customEndpoints, endpoint],
      isDirty: true,
    })),
  removeCustomEndpoint: (id) =>
    set((s) => ({
      customEndpoints: s.customEndpoints.filter((e) => e.id !== id),
      isDirty: true,
    })),
  markDirty: () => set({ isDirty: true }),
  markSaved: () =>
    set({ isDirty: false, isSaving: false, lastSavedAt: new Date(), urgentDirty: false }),
  setSaving: (saving) => set({ isSaving: saving }),

  save: async (opts) => {
    const { projectId, framework, projectName } = get();
    if (!projectId) return;

    set({ isSaving: true, saveError: null });

    // Lazy imports to avoid circular deps at module init
    const [{ useFlowStore }, { getVanillaClient }] = await Promise.all([
      import("./flow-store"),
      import("@/lib/trpc/client"),
    ]);
    const { nodes, edges } = useFlowStore.getState();

    const MAX_RETRIES = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await getVanillaClient().project.save.mutate({
          id: projectId,
          name: projectName,
          flowData: { nodes, edges },
          framework: framework.toUpperCase() as "ANCHOR" | "PINOCCHIO" | "QUASAR",
        });

        // On manual save (Ctrl+S), also create a version snapshot
        if (opts?.snapshot) {
          await getVanillaClient().snapshot.create.mutate({
            projectId,
          });
        }

        get().markSaved();
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES) {
          // Wait before retrying (exponential backoff: 1s, 2s)
          await new Promise((r) => setTimeout(r, attempt * 1000));
        }
      }
    }

    // All retries failed
    set({ isSaving: false, saveError: lastError?.message ?? "Failed to save project" });
    throw lastError ?? new Error("Failed to save project");
  },
}));
