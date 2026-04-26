import { describe, expect, it } from "vitest";
import { assessPluginTrust, pluginRegistry, validatePluginManifest } from "@solflow/plugin-sdk";
import { splTokenPlugin } from "@solflow/plugin-spl-token";
import {
  BUILT_IN_PLUGIN_IDS,
  registerBuiltInPlugins,
} from "../lib/plugins/built-ins";
import {
  createEditorNodeFromType,
  editorNodeTypes,
  normalizeEditorNodeType,
} from "../lib/plugins/editor-nodes";

describe("built-in plugin registration", () => {
  it("registers first-party plugins once", () => {
    for (const pluginId of BUILT_IN_PLUGIN_IDS) {
      pluginRegistry.unregister(pluginId);
    }

    registerBuiltInPlugins();
    registerBuiltInPlugins();

    const plugins = pluginRegistry.getAllPlugins();
    const ids = plugins.map((plugin) => plugin.id);

    expect(ids).toEqual(expect.arrayContaining([...BUILT_IN_PLUGIN_IDS]));
    expect(plugins.filter((plugin) => plugin.id === "spl-token")).toHaveLength(
      1,
    );
    expect(pluginRegistry.getNodeTypes()).toMatchObject({
      "spl-token:create-mint": expect.any(Function),
      "metaplex:mint-nft": expect.any(Function),
      "pyth:read-price": expect.any(Function),
    });
  });

  it("creates renderable editor nodes for plugin node types", () => {
    registerBuiltInPlugins();

    const node = createEditorNodeFromType("spl-token:create-mint", {
      x: 10,
      y: 20,
    });

    expect(node).toMatchObject({
      type: "spl-token:create-mint",
      position: { x: 10, y: 20 },
      data: {
        label: "Create Mint",
        pluginId: "spl-token",
        integrationId: "create-mint",
        decimals: 9,
        config: { decimals: 9, mintAuthority: "", freezeAuthority: "" },
      },
    });
    expect(editorNodeTypes["spl-token:create-mint"]).toEqual(
      expect.any(Function),
    );
    expect(normalizeEditorNodeType("spl-token:create-mint")).toBe(
      "integration",
    );
  });

  it("marks first-party marketplace plugins as trusted", () => {
    registerBuiltInPlugins();

    for (const pluginId of BUILT_IN_PLUGIN_IDS) {
      const plugin = pluginRegistry.getPlugin(pluginId)!;
      const report = assessPluginTrust(plugin, { requireSignature: false });
      expect(report.accepted).toBe(true);
      expect(report.trustLevel).toBe("first-party");
      expect(report.errors).toHaveLength(0);
    }
  });

  it("rejects plugin nodes that escape their namespace", () => {
    const unsafePlugin = {
      ...splTokenPlugin,
      id: "unsafe-spl",
      nodes: [{ ...splTokenPlugin.nodes[0], type: "other:create-mint" }],
    };

    expect(() => validatePluginManifest(unsafePlugin)).toThrow(
      "namespaced node types must use the plugin id prefix",
    );
  });
});
