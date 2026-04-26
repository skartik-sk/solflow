"use client";

// Workflow Editor Page — assembles canvas, palette, properties, toolbar.

import React, { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { WorkflowCanvas } from "@/components/editor/WorkflowCanvas";
import { CloudNodePalette } from "@/components/editor/CloudNodePalette";
import { CloudPropertiesPanel } from "@/components/editor/CloudPropertiesPanel";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { ExecutionPanel } from "@/components/editor/ExecutionPanel";
import { ErrorBoundary } from "@/components/providers/ErrorBoundary";
import { useWorkflowStore } from "@/store/workflow-store";
import { useEditorUIStore } from "@/store/editor-ui-store";
import { registerBuiltinNodes } from "@solflow/cloud-nodes";

// Register nodes once at module level
registerBuiltinNodes();

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = params.workflowId as string;

  const paletteOpen = useEditorUIStore((s) => s.paletteOpen);
  const propertiesOpen = useEditorUIStore((s) => s.propertiesOpen);

  // Load workflow data when page mounts
  const setWorkflow = useWorkflowStore((s) => s.setWorkflow);

  useEffect(() => {
    // For now, create a blank workflow canvas
    // TODO: Fetch from tRPC API
    setWorkflow(workflowId, "My Workflow", [], []);
  }, [workflowId, setWorkflow]);

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
