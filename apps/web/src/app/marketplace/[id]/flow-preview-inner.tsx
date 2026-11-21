// flow-preview-inner.tsx — actual React Flow read-only canvas (no SSR)
"use client";

import React from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
} from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
// Without the editor's node types React Flow falls back to blank default boxes.
import { editorNodeTypes } from "@/lib/plugins/editor-nodes";

interface FlowPreviewInnerProps {
  nodes: Node[];
  edges: Edge[];
}

export function FlowPreviewInner({ nodes, edges }: FlowPreviewInnerProps) {
  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={editorNodeTypes}
        colorMode="dark"
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="rgba(255,255,255,0.08)" />
      </ReactFlow>
    </div>
  );
}
