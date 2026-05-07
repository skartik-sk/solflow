import { router, publicProcedure } from "../trpc";
import { cloudNodeRegistry, registerBuiltinNodes } from "@solflow/cloud-nodes";

registerBuiltinNodes();

export const nodesRouter = router({
  list: publicProcedure.query(() => {
    return cloudNodeRegistry.getAll().map((node) => ({
      type: node.type,
      label: node.label,
      category: node.category,
      description: node.description,
      icon: node.icon,
      color: node.color,
      properties: node.properties,
      inputs: node.inputs,
      outputs: node.outputs,
      defaultData: node.defaultData,
    }));
  }),

  categories: publicProcedure.query(() => {
    const categories: Record<string, { label: string; color: string; nodes: any[] }> = {};
    for (const node of cloudNodeRegistry.getAll()) {
      if (!categories[node.category]) {
        categories[node.category] = {
          label: node.category.charAt(0).toUpperCase() + node.category.slice(1),
          color: node.color,
          nodes: [],
        };
      }
      categories[node.category].nodes.push({
        type: node.type,
        label: node.label,
        description: node.description,
        icon: node.icon,
        color: node.color,
      });
    }
    return categories;
  }),
});
