// flow-preview-inner.tsx — actual React Flow read-only canvas (no SSR)
"use client";

import React from "react";
import {
  ReactFlow,
  Background,
  MiniMap,
  BackgroundVariant,
} from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

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
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <MiniMap
          nodeColor="#4a47a3"
          maskColor="rgba(0,0,0,0.4)"
          style={{ background: "hsl(var(--card))" }}
        />
      </ReactFlow>
    </div>
  );
}
