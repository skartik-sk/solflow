import type { Node, NodeTypes } from "@xyflow/react";
import {
  createNodeFromType,
  nodeTypes,
  type NodeTypeName,
} from "@solflow/flow-nodes";
import { pluginRegistry } from "@solflow/plugin-sdk";
import { registerBuiltInPlugins } from "./built-ins";

registerBuiltInPlugins();

export const editorNodeTypes: NodeTypes = {
  ...nodeTypes,
  ...pluginRegistry.getNodeTypes(),
};

let pluginNodeCounter = 1;

function isBuiltInNodeType(type: string): type is NodeTypeName {
  return Object.prototype.hasOwnProperty.call(nodeTypes, type);
}

function resolvePluginNode(type: string) {
  for (const plugin of pluginRegistry.getAllPlugins()) {
    for (const node of plugin.nodes) {
      const nodeType = node.type.includes(":")
        ? node.type
        : `${plugin.id}:${node.type}`;
      if (nodeType === type) {
        const integrationId = node.type.includes(":")
          ? node.type.slice(node.type.indexOf(":") + 1)
          : node.type;
        return { plugin, node, integrationId };
      }
    }
  }

  return null;
}

export function isPluginNodeType(type: string | undefined): boolean {
  return typeof type === "string" && resolvePluginNode(type) !== null;
}

export function normalizeEditorNodeType(type: string | undefined): string {
  if (!type) return "";
  return isPluginNodeType(type) ? "integration" : type;
}

export function createEditorNodeFromType(
  type: string,
  position: { x: number; y: number },
): Node | null {
  if (isBuiltInNodeType(type)) {
    return createNodeFromType(type, position);
  }

  const pluginNode = resolvePluginNode(type);
  if (!pluginNode) return null;

  const { plugin, node, integrationId } = pluginNode;
  const defaultData = { ...(node.defaultData ?? {}) };

  return {
    id: `${type}-${pluginNodeCounter++}`,
    type,
    position,
    data: {
      ...defaultData,
      label: node.label,
      name: node.label,
      description: node.description,
      pluginId: plugin.id,
      integrationId,
      config: defaultData,
    },
  };
}
