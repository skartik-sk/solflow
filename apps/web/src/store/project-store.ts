"use client";

// Project Store — project metadata, framework, network, save status.
// Lives alongside flow-store but deals with project-level concerns
// rather than canvas node/edge state.

import { create } from "zustand";
import { useSettingsStore } from "./settings-store";

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

/** Map a network id (incl. the legacy "mainnet-beta") to one resolveRpcUrl and the RPC proxy accept. */
export function normalizeNetwork(network: string): "devnet" | "mainnet" | "localnet" {
  if (network === "mainnet" || network === "mainnet-beta") return "mainnet";
  if (network === "localnet") return "localnet";
  return "devnet";
}

/** Resolve a network ID to an RPC URL. Checks custom endpoints first, then built-ins. */
/** Server limit for project names on save (project.save zod schema). */
export const MAX_PROJECT_NAME_LENGTH = 200;

export function clampProjectName(name: string): string {
  return name.slice(0, MAX_PROJECT_NAME_LENGTH);
}

/** Build the project.save input from the current flow and project state. */
export function buildSaveInput(
  state: Pick<ProjectState, "framework" | "projectName"> & { projectId: string },
  flow: { nodes: unknown[]; edges: unknown[] },
) {
  return {
    id: state.projectId,
    name: clampProjectName(state.projectName) || undefined,
    flowData: { nodes: flow.nodes, edges: flow.edges },
    framework: state.framework.toUpperCase() as "ANCHOR" | "PINOCCHIO" | "QUASAR",
  };
}

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
  /** Bumped on every edit. A save only clears isDirty if no edit landed while it was in flight. */
  dirtyVersion: number;
  isSaving: boolean;
  lastSavedAt: Date | null;
  saveError: string | null;
  /** Why the last saved flow couldn't become a buildable IR (flow saved, IR not). */
  irError: string | null;
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
  /** Clear the dirty flag. Pass the dirtyVersion captured when the save read the state. */
  markSaved: (savedVersion?: number) => void;
  setSaving: (saving: boolean) => void;

  /** Save flow data to the server. Requires the flow store to be set up. */
  save: (opts?: { snapshot?: boolean }) => Promise<void>;
  /** Save only when there are unsaved edits (before actions that read server state). */
  saveIfDirty: () => Promise<void>;
}

const bumpDirty = (s: ProjectState) => ({ isDirty: true, dirtyVersion: s.dirtyVersion + 1 });

export const useProjectStore = create<ProjectState>((set, get) => ({
  projectId: null,
  projectName: "Untitled Program",
  framework: "anchor",
  network: "devnet",
  customEndpoints: [],
  isDirty: false,
  dirtyVersion: 0,
  isSaving: false,
  lastSavedAt: null,
  saveError: null,
  irError: null,
  urgentDirty: false,

  setProject: (project) =>
    set({
      projectId: project.id,
      projectName: project.name,
      framework: (project.framework?.toLowerCase() as Framework) ?? "anchor",
      // The network isn't stored per project: start from the user's default.
      network: useSettingsStore.getState().defaultNetwork,
      isDirty: false,
      urgentDirty: false,
      saveError: null,
      irError: null,
      lastSavedAt: null,
    }),

  setProjectName: (name) => set((s) => ({ projectName: clampProjectName(name), ...bumpDirty(s) })),

  setFramework: (framework) => {
    set((s) => ({ framework, ...bumpDirty(s), urgentDirty: true }));
    // Re-trigger code generation for the new framework.
    // We import lazily to avoid a circular dep at module load time.
    import("./flow-store").then(({ useFlowStore }) => {
      useFlowStore.getState().regenerateCode();
    });
  },

  setNetwork: (network) => set((s) => ({ network, ...bumpDirty(s) })),
  addCustomEndpoint: (endpoint) =>
    set((s) => ({
      customEndpoints: [...s.customEndpoints, endpoint],
      ...bumpDirty(s),
    })),
  removeCustomEndpoint: (id) =>
    set((s) => ({
      customEndpoints: s.customEndpoints.filter((e) => e.id !== id),
      ...bumpDirty(s),
    })),
  markDirty: () => set(bumpDirty),
  markSaved: (savedVersion) =>
    set((s) => {
      // An edit made while the save was in flight is not on the server yet: stay dirty.
      const stillDirty = savedVersion !== undefined && s.dirtyVersion !== savedVersion;
      return {
        isDirty: stillDirty,
        isSaving: false,
        lastSavedAt: new Date(),
        urgentDirty: stillDirty ? s.urgentDirty : false,
      };
    }),
  setSaving: (saving) => set({ isSaving: saving }),

  save: async (opts) => {
    const { projectId } = get();
    if (!projectId) return;

    set({ isSaving: true, saveError: null });

    // Lazy imports to avoid circular deps at module init
    const [{ useFlowStore }, { getVanillaClient }] = await Promise.all([
      import("./flow-store"),
      import("@/lib/trpc/client"),
    ]);
    // Read the flow and the edit counter together, synchronously.
    const { nodes, edges } = useFlowStore.getState();
    const savedVersion = get().dirtyVersion;
    const input = buildSaveInput({ ...get(), projectId }, { nodes, edges });

    const MAX_RETRIES = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await getVanillaClient().project.save.mutate(input);
        set({ irError: (res as { irError?: string | null } | undefined)?.irError ?? null });

        // On manual save (Ctrl+S), also create a version snapshot
        if (opts?.snapshot) {
          await getVanillaClient().snapshot.create.mutate({
            projectId,
          });
        }

        get().markSaved(savedVersion);
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

  saveIfDirty: async () => {
    if (get().isDirty) await get().save();
  },
}));

/**
 * Ask before an action that would throw away unsaved edits.
 * Returns true when there is nothing to lose or the user agreed.
 */
export function confirmDiscardUnsaved(
  message: string,
  confirmFn: (msg: string) => boolean = (msg) => window.confirm(msg),
): boolean {
  if (!useProjectStore.getState().isDirty) return true;
  return confirmFn(message);
}
