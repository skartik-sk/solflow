import type { Node } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A controllable project.save: each call waits until the test releases it.
const saved: { nodes: number; name?: string }[] = [];
let releases: (() => void)[] = [];
let nextIrError: string | null = null;
vi.mock("@/lib/trpc/client", () => ({
  getVanillaClient: () => ({
    project: {
      save: {
        mutate: (input: { name?: string; flowData: { nodes: Node[] } }) => {
          saved.push({ nodes: input.flowData.nodes.length, name: input.name });
          const irError = nextIrError;
          return new Promise<{ success: true; irError: string | null }>((r) =>
            releases.push(() => r({ success: true, irError })),
          );
        },
      },
    },
    snapshot: { create: { mutate: async () => ({}) } },
  }),
}));

import { redoFlow, undoFlow, useFlowStore } from "../store/flow-store";
import { confirmDiscardUnsaved, useProjectStore } from "../store/project-store";
import { installUnloadGuard, saveOnUnload, startAutoSave } from "../store/save-guards";
import { useSettingsStore } from "../store/settings-store";
import { createEditorNodeFromType } from "../lib/plugins/editor-nodes";
import { pluginRegistry } from "@solflow/plugin-sdk";

const n = (id: string, x = 0): Node => ({ id, type: "instruction", position: { x, y: 0 }, data: { label: id } });
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));
const releaseAll = () => {
  const r = releases;
  releases = [];
  r.forEach((fn) => fn());
};

beforeEach(() => {
  saved.length = 0;
  releases = [];
  useProjectStore.setState({ projectId: "p1", projectName: "Demo", isDirty: false, isSaving: false, urgentDirty: false });
  useFlowStore.getState().loadFlow([], []);
});

describe("save race", () => {
  it("keeps the project dirty when an edit lands while a save is in flight", async () => {
    useFlowStore.getState().loadFlow([n("a")], []);
    useFlowStore.getState().addNode(n("b"));
    const p = useProjectStore.getState().save();
    await tick();
    useFlowStore.getState().addNode(n("c")); // user keeps editing
    releaseAll();
    await p;
    expect(saved.map((s) => s.nodes)).toEqual([2]);
    expect(useFlowStore.getState().nodes).toHaveLength(3);
    // Node "c" is not on the server yet, so the UI must not say "saved".
    expect(useProjectStore.getState().isDirty).toBe(true);
  });

  it("clears the dirty flag when nothing changed during the save", async () => {
    useFlowStore.getState().addNode(n("a"));
    const p = useProjectStore.getState().save();
    await tick();
    releaseAll();
    await p;
    expect(useProjectStore.getState().isDirty).toBe(false);
  });

  it("auto-save saves again after a save that finished with newer edits", async () => {
    useSettingsStore.setState({ autoSaveIntervalSec: 1 });
    const stop = startAutoSave(() => {});
    try {
      useFlowStore.getState().addNode(n("a"));
      await tick(1100); // first auto-save fires
      expect(saved).toHaveLength(1);
      useFlowStore.getState().addNode(n("b")); // edit during the save
      releaseAll();
      await tick(1100); // second auto-save fires for the pending edit
      expect(saved.map((s) => s.nodes)).toEqual([1, 2]);
      releaseAll();
      await tick();
      expect(useProjectStore.getState().isDirty).toBe(false);
    } finally {
      stop();
      useSettingsStore.setState({ autoSaveIntervalSec: 30 });
    }
  });

  it("auto-save interval 0 turns auto-save off", async () => {
    useSettingsStore.setState({ autoSaveIntervalSec: 0 });
    const stop = startAutoSave(() => {});
    try {
      useFlowStore.getState().addNode(n("a"));
      await tick(50);
      expect(saved).toHaveLength(0);
    } finally {
      stop();
      useSettingsStore.setState({ autoSaveIntervalSec: 30 });
    }
  });

  it("shows the server's irError after a save and clears it on the next clean save", async () => {
    nextIrError = "Program name must be a Rust identifier";
    useFlowStore.getState().addNode(n("a"));
    let p = useProjectStore.getState().save();
    await tick();
    releaseAll();
    await p;
    expect(useProjectStore.getState().irError).toBe("Program name must be a Rust identifier");

    nextIrError = null;
    useFlowStore.getState().addNode(n("b"));
    p = useProjectStore.getState().save();
    await tick();
    releaseAll();
    await p;
    expect(useProjectStore.getState().irError).toBeNull();
  });

  it("clamps long project names so flow saves are not rejected (server max 200)", async () => {
    useProjectStore.getState().setProjectName("x".repeat(300));
    expect(useProjectStore.getState().projectName).toHaveLength(200);
    useProjectStore.setState({ projectName: "y".repeat(250) }); // e.g. a legacy name
    const p = useProjectStore.getState().save();
    await tick();
    releaseAll();
    await p;
    expect(saved[0].name).toHaveLength(200);
  });
});

describe("unload guard", () => {
  function fakeWindow() {
    const handlers: ((e: Event) => void)[] = [];
    return {
      target: {
        addEventListener: (_: string, h: EventListener) => handlers.push(h as (e: Event) => void),
        removeEventListener: () => {},
      } as unknown as Window,
      fire: () => {
        const e = { preventDefault: vi.fn(), returnValue: undefined as unknown };
        handlers.forEach((h) => h(e as unknown as Event));
        return e;
      },
    };
  }

  it("warns and sends a keepalive save when leaving with unsaved edits", () => {
    const fetchFn = vi.fn(async () => new Response("{}"));
    const w = fakeWindow();
    installUnloadGuard(w.target, fetchFn as unknown as typeof fetch);
    useFlowStore.getState().addNode(n("a"));
    const e = w.fire();
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.returnValue).toBe("");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/trpc/project.save");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body as string).json.flowData.nodes).toHaveLength(1);
  });

  it("does nothing when the project is clean", () => {
    const fetchFn = vi.fn();
    const w = fakeWindow();
    installUnloadGuard(w.target, fetchFn as unknown as typeof fetch);
    const e = w.fire();
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(saveOnUnload(fetchFn as unknown as typeof fetch)).toBe(false);
  });

  it("asks before discarding unsaved edits (version restore)", () => {
    const confirmFn = vi.fn(() => false);
    expect(confirmDiscardUnsaved("discard?", confirmFn)).toBe(true); // clean: no prompt
    expect(confirmFn).not.toHaveBeenCalled();
    useProjectStore.getState().markDirty();
    expect(confirmDiscardUnsaved("discard?", confirmFn)).toBe(false);
    expect(confirmFn).toHaveBeenCalledWith("discard?");
  });
});

describe("undo history", () => {
  afterEach(() => useFlowStore.temporal.getState().resume());

  it("undo right after loading a project does not empty the canvas", () => {
    useFlowStore.getState().loadFlow([n("a"), n("b")], []);
    expect(useFlowStore.temporal.getState().pastStates).toHaveLength(0);
    expect(undoFlow()).toBe(false);
    expect(useFlowStore.getState().nodes).toHaveLength(2);
  });

  it("undo and redo mark the project dirty", () => {
    useFlowStore.getState().loadFlow([n("a")], []);
    useFlowStore.getState().addNode(n("c"));
    useProjectStore.setState({ isDirty: false }); // pretend auto-save ran
    expect(undoFlow()).toBe(true);
    expect(useFlowStore.getState().nodes).toHaveLength(1);
    expect(useProjectStore.getState().isDirty).toBe(true);

    useProjectStore.setState({ isDirty: false });
    expect(redoFlow()).toBe(true);
    expect(useFlowStore.getState().nodes).toHaveLength(2);
    expect(useProjectStore.getState().isDirty).toBe(true);
  });

  it("undo clears a selection that points at a removed node", () => {
    useFlowStore.getState().loadFlow([n("a")], []);
    useFlowStore.getState().addNode(n("c"));
    useFlowStore.getState().setSelectedNode("c");
    undoFlow();
    expect(useFlowStore.getState().selectedNodeId).toBeNull();
  });

  it("a 30-frame drag is a single undo entry", () => {
    useFlowStore.getState().loadFlow([n("a")], []);
    for (let i = 1; i <= 30; i++) {
      useFlowStore.getState().onNodesChange([{ type: "position", id: "a", position: { x: i, y: 0 }, dragging: true }]);
    }
    useFlowStore.getState().onNodesChange([{ type: "position", id: "a", position: { x: 31, y: 0 }, dragging: false }]);
    expect(useFlowStore.temporal.getState().pastStates).toHaveLength(1);
    expect(useFlowStore.getState().nodes[0].position.x).toBe(31);
    undoFlow();
    expect(useFlowStore.getState().nodes[0].position.x).toBe(0);
  });

  it("records edits again after a drag ends", () => {
    useFlowStore.getState().loadFlow([n("a")], []);
    useFlowStore.getState().onNodesChange([{ type: "position", id: "a", position: { x: 5, y: 0 }, dragging: true }]);
    useFlowStore.getState().onNodesChange([{ type: "position", id: "a", position: { x: 6, y: 0 }, dragging: false }]);
    useFlowStore.getState().addNode(n("b"));
    expect(useFlowStore.temporal.getState().pastStates).toHaveLength(2);
  });
});

describe("node ids after reload", () => {
  it("a new node never takes the id of a node already in the saved project", () => {
    // Saved project from an earlier session.
    useFlowStore.getState().loadFlow(
      [
        { id: "program-1", type: "program", position: { x: 0, y: 0 }, data: { name: "p" } },
        { id: "instruction-2", type: "instruction", position: { x: 0, y: 0 }, data: { name: "a" } },
      ],
      [],
    );
    // A new session's node factory hands out a colliding id.
    useFlowStore.getState().addNode({ id: "instruction-2", type: "instruction", position: { x: 0, y: 0 }, data: { name: "b" } });
    const ids = useFlowStore.getState().nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);

    // Editing / deleting the old node no longer touches the new one.
    useFlowStore.getState().updateNodeData("instruction-2", { name: "renamed" });
    expect(useFlowStore.getState().nodes.filter((node) => (node.data as { name: string }).name === "renamed")).toHaveLength(1);
    useFlowStore.getState().removeNode("instruction-2");
    expect(useFlowStore.getState().nodes).toHaveLength(2);
  });

  it("plugin nodes get random ids, not a per-session counter", () => {
    const plugin = pluginRegistry.getAllPlugins().find((p) => p.nodes.length > 0)!;
    const node = plugin.nodes[0];
    const type = node.type.includes(":") ? node.type : `${plugin.id}:${node.type}`;
    const a = createEditorNodeFromType(type, { x: 0, y: 0 })!;
    const b = createEditorNodeFromType(type, { x: 0, y: 0 })!;
    expect(a.id).not.toBe(b.id);
    expect(a.id).not.toBe(`${type}-1`);
    expect(a.id.startsWith(`${type}-`)).toBe(true);
  });
});
