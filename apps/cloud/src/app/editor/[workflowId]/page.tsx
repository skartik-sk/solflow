"use client";

// Workflow Editor Page — assembles canvas, palette, properties, toolbar.

import React, { useEffect } from "react";
import type { Edge, Node } from "@xyflow/react";
import { useParams } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { WorkflowCanvas } from "@/components/editor/WorkflowCanvas";
import { CloudNodePalette } from "@/components/editor/CloudNodePalette";
import { CloudPropertiesPanel } from "@/components/editor/CloudPropertiesPanel";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { ExecutionPanel } from "@/components/editor/ExecutionPanel";
import { ErrorBoundary } from "@/components/providers/ErrorBoundary";
import { useWorkflowStore } from "@/store/workflow-store";
import { useEditorUIStore } from "@/store/editor-ui-store";
import { trpc } from "@/lib/trpc/client";
import {
  cloudNodeRegistry,
  registerBuiltinNodes,
  type CloudFlowNodeData,
} from "@solflow/cloud-nodes";

// Register nodes once at module level
registerBuiltinNodes();

type SavedWorkflowDefinition = {
  nodes?: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data?: Record<string, unknown>;
  }>;
  edges?: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
  }>;
};

function hydrateNodes(savedNodes: SavedWorkflowDefinition["nodes"] = []): Node[] {
  return savedNodes.map((node) => {
    const def = cloudNodeRegistry.get(node.type);
    const existingData = node.data ?? {};
    const nodeData: CloudFlowNodeData = def
      ? {
          label: def.label,
          type: def.type,
          category: def.category,
          icon: def.icon,
          color: def.color,
          properties: def.properties,
          inputs: def.inputs,
          outputs: def.outputs,
          data: { ...def.defaultData, ...existingData },
        }
      : {
          label: node.type,
          type: node.type,
          category: "action",
          icon: "AlertCircle",
          color: "#ef4444",
          properties: [],
          inputs: [{ type: "main", label: "input" }],
          outputs: [{ type: "main", label: "output" }],
          data: existingData,
        };

    return {
      id: node.id,
      type: node.type,
      position: node.position,
      data: nodeData as unknown as Record<string, unknown>,
    };
  });
}

function hydrateEdges(savedEdges: SavedWorkflowDefinition["edges"] = []): Edge[] {
  return savedEdges.map((edge) => ({
    ...edge,
    type: "smoothstep",
    animated: true,
    style: { strokeWidth: 2 },
  }));
}

export default function EditorPage() {
  const params = useParams();
  const workflowId = params.workflowId as string;
  const { data: workflow, isLoading, error } = trpc.workflow.get.useQuery({ id: workflowId });

  const paletteOpen = useEditorUIStore((s) => s.paletteOpen);
  const propertiesOpen = useEditorUIStore((s) => s.propertiesOpen);

  // Load workflow data when page mounts
  const setWorkflow = useWorkflowStore((s) => s.setWorkflow);

  useEffect(() => {
    if (!workflow) return;
    const definition = workflow.definition as SavedWorkflowDefinition;
    setWorkflow(
      workflow.id,
      workflow.name,
      hydrateNodes(definition.nodes),
      hydrateEdges(definition.edges),
      workflow.status,
      workflow.settings,
    );
  }, [workflow, setWorkflow]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading workflow...
        </div>
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm rounded-lg border border-red-500/30 bg-card p-5 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <h1 className="text-sm font-semibold">Workflow not found</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {error?.message ?? "This workflow does not exist or you do not have access."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <div className="flex h-screen flex-col bg-background">
      <EditorToolbar />
      <div className="flex flex-1 overflow-hidden">
        {paletteOpen && <CloudNodePalette />}
        <div className="relative flex-1">
          <WorkflowCanvas />
          <ExecutionPanel />
        </div>
        {propertiesOpen && <CloudPropertiesPanel />}
      </div>
    </div>
    </ErrorBoundary>
  );
}
