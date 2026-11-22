"use client";

// Save guards for the editor: debounced auto-save and the unload warning.
// Kept outside the React tree so they can be unit-tested with fake timers.

import superjson from "superjson";
import { useFlowStore } from "./flow-store";
import { buildSaveInput, useProjectStore } from "./project-store";
import { useSettingsStore } from "./settings-store";

/** Browsers cap keepalive request bodies at 64 KiB. */
const KEEPALIVE_MAX_BYTES = 64 * 1024;
const URGENT_SAVE_MS = 3_000;

/** Auto-save delay in ms for the current settings, or null when auto-save is off. */
export function autoSaveDelayMs(urgent: boolean): number | null {
  const intervalSec = useSettingsStore.getState().autoSaveIntervalSec;
  if (intervalSec <= 0) return null;
  return urgent ? Math.min(URGENT_SAVE_MS, intervalSec * 1000) : intervalSec * 1000;
}

/**
 * Schedule a save whenever the project becomes dirty, and again when a save
 * finishes but edits made during it are still unsaved. Returns a cleanup.
 */
export function startAutoSave(onError: (err: unknown) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (urgent: boolean) => {
    const delay = autoSaveDelayMs(urgent);
    if (delay === null) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const state = useProjectStore.getState();
      if (!state.isDirty) return;
      if (state.isSaving) {
        // The in-flight save will re-trigger us when it finishes.
        return;
      }
      state.save().catch(onError);
    }, delay);
  };

  const unsub = useProjectStore.subscribe((state, prev) => {
    if (!state.isDirty) return;
    const becameDirty = !prev.isDirty;
    const saveFinishedStillDirty = prev.isSaving && !state.isSaving;
    const becameUrgent = state.urgentDirty && !prev.urgentDirty;
    if (becameDirty || saveFinishedStillDirty || becameUrgent) {
      schedule(state.urgentDirty);
    }
  });

  return () => {
    unsub();
    if (timer) clearTimeout(timer);
  };
}

/**
 * Best-effort save while the page unloads: a keepalive fetch to the tRPC
 * project.save endpoint. Returns false when skipped (clean, no project, too big).
 */
export function saveOnUnload(fetchFn: typeof fetch = fetch): boolean {
  const project = useProjectStore.getState();
  if (!project.isDirty || !project.projectId) return false;
  const { nodes, edges } = useFlowStore.getState();
  const input = buildSaveInput({ ...project, projectId: project.projectId }, { nodes, edges });
  const body = JSON.stringify(superjson.serialize(input));
  if (new TextEncoder().encode(body).length > KEEPALIVE_MAX_BYTES) return false;
  void fetchFn("/api/trpc/project.save", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => {});
  return true;
}

type UnloadTarget = Pick<Window, "addEventListener" | "removeEventListener">;

/** Warn before leaving with unsaved edits, and fire a keepalive save. Returns a cleanup. */
export function installUnloadGuard(
  target: UnloadTarget = window,
  fetchFn?: typeof fetch,
): () => void {
  const handler = (e: BeforeUnloadEvent) => {
    if (!useProjectStore.getState().isDirty) return;
    saveOnUnload(fetchFn);
    e.preventDefault();
    // Legacy browsers need returnValue set to show the prompt.
    e.returnValue = "";
  };
  target.addEventListener("beforeunload", handler as EventListener);
  return () => target.removeEventListener("beforeunload", handler as EventListener);
}
