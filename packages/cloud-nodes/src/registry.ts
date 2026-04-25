import type { CloudNodeDefinition, NodeCategory } from "./types";

export class CloudNodeRegistry {
  private nodes: Map<string, CloudNodeDefinition> = new Map();

  register(node: CloudNodeDefinition): void {
    if (this.nodes.has(node.type)) {
      throw new Error(`Node type "${node.type}" already registered`);
    }
    this.nodes.set(node.type, node);
  }

  get(type: string): CloudNodeDefinition | undefined {
    return this.nodes.get(type);
  }

  getAll(): CloudNodeDefinition[] {
    return Array.from(this.nodes.values());
  }

  getByCategory(category: NodeCategory): CloudNodeDefinition[] {
    return this.getAll().filter((n) => n.category === category);
  }

  getNodeTypes(): Record<string, any> {
    const types: Record<string, any> = {};
    for (const node of this.nodes.values()) {
      types[node.type] = node.component;
    }
    return types;
  }

  has(type: string): boolean {
    return this.nodes.has(type);
  }

  clear(): void {
    this.nodes.clear();
  }
}

export const cloudNodeRegistry = new CloudNodeRegistry();
